---
north-star:
  服务用户: GA（成长顾问，审批企业联邦知识）+ FDE（标记知识可共享）——联邦知识写入后能被后续请求读到，而不是"写了但蒸发、还返回 201 成功"的假性成功
  服务场景: FDE 调 `POST /api/admin/knowledge/:id/mark-shareable` 标记可共享 → 201 成功；GA 随后调 `GET /api/admin/knowledge/federated/pending` 却永远读到空列表——写入进了"当次请求的临时实例"，响应后销毁。本模块把每请求新实例改为惰性单例，写后读回可见
  模块终态: federated 知识端到端可用——mark-shareable 写入 → federated/pending 读回可见（写后读回断言），不再 201 假成功；D309 方案偏离获得文档授权（dev doc + brief 回填）
  对齐北星: PRODUCT-BRIEF.md §四「知识管理（经验怎么沉淀？）专家」+ D241/D244 知识审批/联邦知识既有功能线——铁律 5「后端能力 ≠ 用户可用功能」的活实例：API 返回 201 但数据蒸发，比 503 更具欺骗性
  完成标准: 入口 `POST /api/admin/knowledge/:id/mark-shareable` → 处理 惰性单例写入 + 201 → 结果 随后 `GET /api/admin/knowledge/federated/pending` 读回该条目（写后读回断言绿）+ dev doc 含 D309 偏离授权说明
  当前进度: getPipeline()（admin-knowledge.ts:54-56）每请求 `new FederatedPipeline()`（内存 Map），生产无 setFederatedPipeline 调用方 → 每次 handler 新实例 → 写入蒸发 201 假成功；T6b 测试把该缺陷写成规格（K3 D391 审计 P1-1 物理证明）
---

<!--
  SYNOVA-IMPL-DSH-D402: D391 审计 P1 修复 — federated 兜底写入即蒸发（惰性单例）+ 补 dev doc/brief（D309 偏离授权）
  状态: dev doc | 2026-08-16 | 优先级 P1（K3 D391 审计 CONDITIONAL PASS 转 PASS 条件）
  权威文档: K3 D391 审计报告 2026-08-16-D391.md（P1-1 功能性 / P1-2 流程性 + 转 PASS 条件）+ AGENTS.md 铁律 5/11/24/31/47/48
  依赖: 无（D391 已实现 admin-knowledge L1→L4 修复；本任务修其 P1 残留）
  并行: 无（独占 src/routes/admin-knowledge.ts + tests/routes/admin-knowledge.test.ts；与 D396/D394/D395 写集零重叠，见 §3.3）
-->

# SYNOVA-IMPL-DSH-D402: D391 审计 P1 修复（federated 兜底写入即蒸发 + 补文档授权）

> 一句话问题: `getPipeline()` 每请求 `new FederatedPipeline()`（[admin-knowledge.ts L54-56](src/routes/admin-knowledge.ts:54)），而 `FederatedPipeline` 状态存于**实例内内存 Map**（[federated-pipeline.ts L53](src/services/federated-pipeline.ts:53)），生产环境 `setFederatedPipeline` **零调用方**（模块级 `federatedPipeline` 恒 null）→ 每次 handler 都 new 新实例 → `POST mark-shareable` 写入实例 A（响应后销毁）→ 201 成功；随后 `GET federated/pending` 读全新实例 B → 恒空。**恒 503 被换成了恒空——且返回成功，比 503 更具欺骗性**（K3 D391 P1-1）。P1-2：D391 无 dev doc/brief，偏离 D309 方案零文档授权——本 spec 即补写。

## 1. 权威文档引用

**来源**: [K3 D391 审计报告](docs/synova/audit-reports/2026-08-16-D391.md)（P1-1 / P1-2 + 转 PASS 条件）

> P1-1 federated 兜底 = 写入即蒸发，201 假性成功……`getPipeline()` 每请求新实例 → `POST mark-shareable` 写入实例 A（响应后销毁）→ 201 Created；随后 `GET federated/pending` 读全新实例 B → 永远空列表。**T6b 测试把该缺陷写成规格**："不注入 → 200 空列表"被断言为正确行为。修复一行：`federatedPipeline ??= new FederatedPipeline()`（惰性单例），并加"写后读回"跨请求持久性断言。getStore 同款建议（P2-2）。

> P1-2 无 dev doc / 无 task brief / 偏离 D309 无授权。转 PASS 条件 #1：getPipeline()/getStore() 改惰性单例（??=）+ 新增"写后读回"持久性断言（mark-shareable → federated/pending 可见）；#2：补 D391 dev doc（回填方案变更理由：为何弃 D309 最小接口、改桥接+兜底）。

**来源**: [AGENTS.md 铁律](AGENTS.md)（5 后端能力≠用户可用功能 / 11 静默降级禁止 / 24 异常处理 / 31 降级信号传播 / 47 契约优先 / 48 测试非空壳）

> 铁律 5: 后端能力 ≠ 用户可用的功能——201 返回但数据蒸发 = 能力未真正可用。铁律 11: 假性成功比显式失败更危险。

## 2. 代码审计——现状（2026-08-16 grep/read 实测）

### 2.1 缺陷 A（P1-1，功能性）: getPipeline 每请求新实例 → 写入蒸发

[admin-knowledge.ts L54-56](src/routes/admin-knowledge.ts:54)：

```ts
function getPipeline(): FederatedPipeline {
  return federatedPipeline ?? new FederatedPipeline();   // 每请求 new 新实例
}
```

[federated-pipeline.ts L52-59](src/services/federated-pipeline.ts:52)：`FederatedPipeline` 状态在**实例内内存 Map**：

```ts
export class FederatedPipeline {
  private store: Map<string, FederatedKnowledge> = new Map();   // L53: 实例内存态
  // ...
  constructor(anonymizer?: Anonymizer) { this.anonymizer = anonymizer || new Anonymizer(); }
}
```

`setFederatedPipeline` 生产零调用方（grep 实测全 src/ 仅 [admin-knowledge.ts L32-34](src/routes/admin-knowledge.ts:32) 定义处）→ 模块级 `federatedPipeline` 恒 null → 每次 handler 都走 `new FederatedPipeline()`。链路：[mark-shareable L119](src/routes/admin-knowledge.ts:119) 写实例 A → 响应销毁 → [federated/pending L134](src/routes/admin-knowledge.ts:134) 读实例 B → 恒空。

### 2.2 缺陷 B（P1-1 连带）: T6b 测试把缺陷写成规格

[admin-knowledge.test.ts L203-204](tests/routes/admin-knowledge.test.ts:203)：`T6b GET federated/pending 不注入 → new FederatedPipeline() 内存态 → 200 空列表`——把"写入蒸发"断言为正确行为（K3 点名）。

### 2.3 缺陷 C（P2-2 连带）: getStore 同款每请求 new

[admin-knowledge.ts L43-45](src/routes/admin-knowledge.ts:43)：`getStore()` 每请求 `new KnowledgeStore(getDatabase())` + initSchema DDL 重跑——功能正确但有开销（P2-2），建议同款 `??=`。

### 2.4 接线现状（真实调用方，grep 实测）

| 调用方 | 位置 | 说明 |
|--------|------|------|
| setFederatedPipeline 生产调用方 | 全 src/ 仅 L32 定义处 | 零注入 → 恒 null（K3 D391 已证） |
| getPipeline 调用方 | mark-shareable L119 / federated/pending L134 / federated/:id/approve L154 / degraded L173 / ga-weight-drop L193 | 5 个 handler 调用 |
| server.ts 挂载 | server.ts:60 import + :347 app.use | 路由挂载不变 |

## 3. 实现方案

### 3.1 写集 (2 修改)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| [src/routes/admin-knowledge.ts](src/routes/admin-knowledge.ts) | 修改 | P1-1：`getPipeline()` 改 `federatedPipeline ??= new FederatedPipeline()`；P2-2：`getStore()` 改 `knowledgeStore ??= new KnowledgeStore(getDatabase())` |
| [tests/routes/admin-knowledge.test.ts](tests/routes/admin-knowledge.test.ts) | 修改 | ①修 T6b（不再断言"200 空列表"为正确）；②新增"写后读回"持久性断言（mark-shareable → federated/pending 可见） |

### 3.2 修复模式

**惰性单例（??=，替换 L54-56 与 L43-45）**:

```ts
// 修复前: return federatedPipeline ?? new FederatedPipeline();  // 每请求新实例 → 写入蒸发
// 修复后:
function getPipeline(): FederatedPipeline {
  return federatedPipeline ??= new FederatedPipeline();   // 惰性单例: 首次 new 后缓存, 后续复用同实例
}

// getStore 同款 (P2-2): knowledgeStore ??= new KnowledgeStore(getDatabase());
// 注: getDatabase() 首次 throw → ??= 不完成赋值 → knowledgeStore 保持 null → 下次请求重试
//     (与 T5 兜底测试语义一致: DB 未初始化时 500 degraded, 初始化后自动缓存)
```

**写后读回断言（T6b 改写，从"把缺陷当规格"改为"防缺陷回归"）**:

```ts
// 修复后 T6b: 不注入 → 惰性单例 → 写后读回可见（不再断言空列表）
it('T6b federated 写后读回: mark-shareable → federated/pending 可见 (惰性单例)', async () => {
  const mod = await loadMod();  // 不调 setFederatedPipeline → 走惰性单例
  const post = findHandler(mod.default, '/api/admin/knowledge/:id/mark-shareable', 'post');
  const get = findHandler(mod.default, '/api/admin/knowledge/federated/pending', 'get');
  await post(req({ body: { text: 'hello', orgId: 'org1' }, params: { id: 'k1' } }), res, next);
  expect(post 响应 201);
  await get(req({}), res, next);
  expect(res.json 的 data 含 sourceChunkId='k1' 的条目).not.toBe(空);  // 写后读回
});
```

### 3.3 不做的事 + D309 偏离授权（P1-2）

**D309 偏离授权（K3 D391 #12 三项偏离，本 spec 回填授权）**：

| 偏离 | D309 方案 | D391 实际 | 授权理由 |
|------|----------|----------|---------|
| 接口形态 | §3.2 "本地最小接口 KnowledgeAdminStore" | L2 桥接 + 兜底实例化 | 桥接（knowledge-bridge-service.ts）与 knowledge.ts:11-12 先例逐字同款，消除 L1→L4 跨层（D391 核心目标） |
| DS4 守卫 | "未 set 时仍守卫降级" | 9 处守卫全删，改兜底实例化 | 兜底实例化让 7 handler 在未注入时也能工作（不再恒 503），是 D391"消除恒 503"的必然选择 |
| §3.3 接线 | "接线 setKnowledgeStore 是独立任务不做" | 以兜底实例化改变生产行为 | 兜底实例化比显式 set 更健壮（生产从不 set 也能跑），是修复"恒 503"的根治手段 |

**不做的事**：

| 不做 | 文件 | 归属 |
|------|------|------|
| federated 知识**跨进程 DB 持久化**（真"重启不丢"） | `src/services/federated-pipeline.ts` | D244 federated store 自设计起就是内存态（无 DB 表），K3 转 PASS 条件 #1 只要求惰性单例 + 写后读回，不要求 DB 落库——DB 持久化是 D244 独立演进项，本任务不做 |
| 改 FederatedPipeline 类本体（Map/方法/状态机） | `src/services/federated-pipeline.ts` | 缺陷根因在 getPipeline 实例化，不在类内部 |
| 改 knowledge 审批三端点（pending/approve/reject） | `src/routes/admin-knowledge.ts` | 走 DB，不受缺陷影响（K3 已证），只改 getStore 缓存（P2-2） |
| 改 server.ts 路由挂载 | `src/server.ts` | 挂载不变（Win Claude 领地，本任务不碰） |

> **转 PASS 条件 #3（编排依赖，非本任务实现范围）**：K3 D391 转 PASS 条件 #3 = "D392 合并或本分支 rebase，使 CI 整 run 转绿"。CI 的 npm audit 红是**预存**（D392 豁免分支未合 main，创始人已决策豁免），非 D402 引入——需 CTO 协调 D392 合并顺序，本任务代码不触及 CI 配置。

## 4. 测试要求（测试优先 — 铁律 0-2/48，red→green）

**第一步（red）**: 修改 `tests/routes/admin-knowledge.test.ts`，新增用例在实现前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| **写后读回**：不注入 → mark-shareable 201 → federated/pending 读回该条目 | 读回恒空（新实例） | 读回可见 |
| 惰性单例：连续 2 次 getPipeline 返回**同实例**（`===`） | 2 次不同实例 | 同实例 |
| T6b 改写：不再断言"200 空列表"为正确 | 旧断言（把缺陷当规格） | 新断言（写后读回） |
| 注入路径不回归：setFederatedPipeline mock → 用注入实例（不走 ??=） | — | 注入优先 |
| getStore 惰性单例：连续 2 次 getStore 返回同实例（DB 可用时） | 2 次 new | 同实例 |
| getStore 降级：DB 未初始化（getDatabase throw）→ ??= 不缓存 → 下次重试 + 500 degraded | — | 500 degraded 不缓存 |
| 边界：mark-shareable 缺 text/orgId → 400 VALIDATION_ERROR（校验不回归） | — | 400 |
| 回归：T3/T4/T5/T6a/T6c/T6d/T6e 既有用例不回归 | — | 全绿 |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | ≥8 | 上述 8 用例（正常/降级/边界/写后读回/回归） |
| L2a | 接线 | 1 | getPipeline/getStore ??= 被 5+3 handler 真实调用 |

## 4.5 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| 修复方式 | A 生产注入 setFederatedPipeline（启动时 set 一次）/ B 惰性单例 ??= | K3 转 PASS 条件原文"改惰性单例（??=）" + DeepSeek（最少机制：一行改，不加启动接线） | **B**——??= 惰性单例 |
| getStore 是否连带 | A 只改 getPipeline / B getPipeline + getStore 同款 ??= | K3 转 PASS 条件 #1 明列"getPipeline()/getStore()" + 第一性原理（同型缺陷同修，不留半套） | **B**——两者同修 |
| 持久化深度 | A 惰性单例（进程内）/ B 联邦知识落 DB（跨进程不丢） | K3 转 PASS 条件 #1 只要求"写后读回"（进程内）；D244 设计即内存态无 DB 表 | **A**——惰性单例，DB 持久化是 D244 独立演进项（§3.3 显式排除） |
| T6b 处置 | A 保留旧断言 / B 改写为"写后读回"断言 | K3 点名"T6b 把缺陷写成规格" + 铁律 48（测试须 cover 真实行为，非错误规格） | **B**——改写 |

> 收敛检查：四决策点两参考系指向同一答案（??= 单例 + getStore 连带 + 进程内持久 + 改写 T6b），无分歧。**参考：K3 + Anthropic + 第一性原理**。

## 5. Wiring Verification（接线要求）

| 变更 | 验证 |
|------|------|
| getPipeline 惰性单例 | `grep -n "federatedPipeline ??=" src/routes/admin-knowledge.ts` 命中 |
| getStore 惰性单例 | `grep -n "knowledgeStore ??=" src/routes/admin-knowledge.ts` 命中 |
| 无残留每请求 new | `grep -n "?? new FederatedPipeline()\|?? new KnowledgeStore()" src/routes/admin-knowledge.ts` 零命中（已全部改 ??=） |
| 写后读回断言 | `grep -n "写后读回\|federated/pending 可见" tests/routes/admin-knowledge.test.ts` 命中 |
| 生产调用点（5 handler） | `grep -c "getPipeline()" src/routes/admin-knowledge.ts` ≥ 5（mark-shareable/pending/approve/degraded/ga-weight-drop） |
| 无跨层回归 | `grep -rn "from '\.\./l4" src/routes/admin-knowledge.ts` 零命中（D391 已修，本任务不回归） |

## 6. 完成标准（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

1. DS1: `tests/routes/admin-knowledge.test.ts` 全过（≥8 用例含写后读回；red 已证）
2. DS2: `getPipeline()` 改 `federatedPipeline ??= new FederatedPipeline()`（grep 命中，无 `?? new` 残留）
3. DS3: `getStore()` 改 `knowledgeStore ??= new KnowledgeStore(getDatabase())`（P2-2，grep 命中）
4. DS4: 写后读回断言绿——不注入 → mark-shareable 201 → federated/pending 读回该条目（非空列表）
5. DS5: T6b 改写——不再把"200 空列表"断言为正确行为（K3 点名项闭合）
6. DS6: 注入路径不回归——setFederatedPipeline mock 优先于 ??=（`federatedPipeline ??=` 语义：已注入不 new）
7. DS7: 无跨层回归——`grep -rn "from '\.\./l4" src/routes/admin-knowledge.ts` 零命中（D391 成果保持）
8. DS8: P1-2 闭合——本 dev doc（§1/§3.3 含 D309 偏离授权三表）+ task brief（.claude/task-briefs/D402-audit-fix-p1.md）已入库
9. DS9: 全量审计基线一致 + 无 `--no-verify` + `git diff --name-only` 与写集（§3.1）一致
10. DS10: 完成报告须含**决策记录**（§4.5 四决策点的参考系与结论，S-12）——K3 可核

> 交付声明必须覆盖以上 DS1-DS10 全部并标注状态（✅/⏸/❌+理由）；**禁止重编号/跳号/静默缺项**（S-10，D331 审计教训）。

## 7. 自检清单

- [x] K3 D391 审计 P1-1/P1-2 + 转 PASS 条件核实（报告 L54-67 + §六 #1/#2）
- [x] getPipeline 每请求 new 现场核实（admin-knowledge.ts:54-56 + federated-pipeline.ts:53 实例内存 Map）
- [x] setFederatedPipeline 零生产调用方核实（grep 实测仅定义处）
- [x] T6b 把缺陷写成规格核实（admin-knowledge.test.ts:203-204）
- [x] D309 偏离三项核实（D391 报告 #12：接口形态/DS4 守卫/§3.3 接线）
- [x] 决策参考已记录（§4.5，S-12）：四决策点均走双参考系且收敛
- [x] DS 与 dev doc 一一对应（DS1-DS10，S-10）；写集表标题紧跟表头（D381 格式契约）
- [x] DB 持久化显式排除（§3.3，K3 转 PASS 条件只要求写后读回）
- [x] 不是凭记忆
- [x] 不用 --no-verify

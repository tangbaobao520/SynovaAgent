---
north-star:
  服务用户: 企业主（通过 strategy 专家视角看到组织路径依赖风险）+ FDE（部署后哨兵全量注册无报错）
  服务场景: 哨兵定时巡检时，path-dependency 哨兵（检测组织对特定技术栈/流程/合作模式的锁定风险）能真正注册并运行——从"有 manifest 无实现、注册报错"变成"45/45 全量注册 + 越阈告警"
  模块终态: path-dependency 哨兵端到端可用——manifest（契约冻结）指向的实现文件就位，loader 扫描 45/45 全注册，依赖评分越阈产出 warning/critical finding（产品线 07 持续监测验收点 7-2 转绿）
  对齐北星: PRODUCT-BRIEF.md §三.2「哨兵定时巡检」+ §四「无限扩展：加新哨兵=创建文件自动注册」+ §五「7 维度 D2 组织能力」
  完成标准: 入口 registerLoadedSentinels() 扫描 → 处理 path-dependency 动态 import detect.ts 成功 → 结果 45/45 注册无 entryPoint 报错 + detectPathDependency 三态正确
  当前进度: path-dependency 仅 manifest.json（entryPoint 指向不存在的 computes/detect.ts），registerLoadedSentinels 报错，45 活跃哨兵实际注册 44/45（D378 审计核实 + D379 派活 commit 8bcaa5ae）
---

<!--
  SYNOVA-IMPL-DSH-D379: path-dependency 哨兵空壳补实现
  状态: dev doc | 2026-08-16 | 优先级 P2（D378 审计核实：strategy 专家下唯一空壳，44/45 注册）
  权威文档: AUDIT-FINDINGS-LEDGER L153（D378 空壳登记）+ D379 派活 brief + AGENTS.md 铁律 37/47/48
  依赖: 无（manifest 契约冻结；loader 自动扫描，无需改）
  并行: 无（独占 extensions/sentinels/path-dependency/；与 D356 写集不重叠）
-->

# SYNOVA-IMPL-DSH-D379: path-dependency 哨兵空壳补实现

> 一句话问题: `extensions/sentinels/path-dependency/` 只有 `manifest.json`，其 `entryPoint: "./computes/detect.ts"` 指向的 `computes/detect.ts` **不存在** → `registerLoadedSentinels()` 动态 import 时报「entryPoint 不存在」→ 45 个活跃哨兵实际只注册 **44/45**。path-dependency 是 strategy 专家下唯一空壳（D378 审计核实），补实现即可让哨兵体系全量注册、且用户获得「路径依赖/锁定风险」这一监测维度。

## 1. 权威文档引用

**来源**: [AUDIT-FINDINGS-LEDGER.md L153](docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md)（D378 哨兵口径核实）

> ② **path-dependency 哨兵空壳**（manifest entryPoint 指向不存在的 computes/detect.ts，registerLoadedSentinels 将报错，实际可注册 44/45）……**遗留：path-dependency 空壳补实现（归属 DSH 哨兵切片）**

**来源**: [D379 派活 brief](.claude/task-briefs/D379-path-dependency.md)（spec 归 dev-doc 线）

> 规格归属：本任务 spec（SYNOVA-IMPL dev doc）由 📋 synova-devdoc 线产出，编码线拿到 dev doc 后实现。

**来源**: [SYNOVA-AUDIT-compute函数存在性验证-20260706.md](docs/plans/codex/implementation/SYNOVA-AUDIT-compute函数存在性验证-20260706.md)（历史 export 名不匹配教训）

> P1：V2 后缀和 manifest 名称过短——explore-exploit-balance / path-dependency 哨兵无法工作

**来源**: [AGENTS.md 铁律](AGENTS.md)（37 dead code 禁止 / 47 契约优先 / 48 测试非空壳 / 0-2 接线验收）

> 铁律 37: dead code 入仓库即违规；铁律 0-2: 新 export 必须有生产调用方。

## 2. 代码审计——现状（2026-08-16 grep/read 实测）

### 2.1 缺陷 A: entryPoint 指向不存在的实现文件（空壳根因）

[manifest.json L20-21](extensions/sentinels/path-dependency/manifest.json:20) 契约冻结：

```json
"entryPoint": "./computes/detect.ts",
"exportKey": "pathDependencySentinel",
"computes": ["detect-path-dependency"],
"thresholds": { "dependency_score": { "warning": 0.4, "critical": 0.7 } }
```

但 [computes/ 目录不存在](extensions/sentinels/path-dependency/)（只有 manifest.json）→ [sentinel-loader.ts L129-133](src/sentinel/sentinel-loader.ts:129) `existsSync(entryPath)` 失败 → `errors.push('哨兵 path-dependency entryPoint 不存在')` → `continue`（该哨兵不注册）。

### 2.2 缺陷 B: 历史实现接口需适配（旧 Promise → 新同步）

历史参考 [docs/archive/sentinels/path-dependency/computes/detect.ts](docs/archive/sentinels/path-dependency/computes/detect.ts)（`detectPathDependency(store, orgId)` 算法，HHI 入度集中度 60% + 单一来源依赖 40%），但用的是**旧 Promise 接口**：

```ts
const nodes = await store.queryNodes().catch(() => []);  // 旧：无参 + Promise
const edges = await store.queryEdges().catch(() => []);
```

新接口（grep 实测 [graph-traversal.ts L13-15](src/l4/graph-traversal.ts:13)）是**同步**：

```ts
queryNodes(type: string, filters?, graph?): Array<{ id, type, props }>
queryEdges(type?, from?, to?, graph?): Array<{ id, type, from, to, weight, props }>
```

### 2.3 缺陷 C: check 签名约定（文件驱动哨兵 ≠ Sentinel 接口）

loader 调用文件驱动哨兵的签名是 `(store, teamId, traversal)`（[sentinel-loader.ts L205](src/sentinel/sentinel-loader.ts:205) `sentinelObj.check(store, teamId, traversal)`），**不是** `Sentinel` 接口的 `check(context: SentinelContext)`（[types.ts](src/sentinel/types.ts) 的 `(context)` 由 loader 包装层 L187-208 适配）。写错签名 → 运行时参数错位。

### 2.4 接线现状（真实调用方，grep 实测）

`registerLoadedSentinels()` 全仓调用方（grep 实测）：

| 调用方 | 位置 | 说明 |
|--------|------|------|
| file-driven-loaders.ts | L73 | 文件驱动加载入口 |
| deploy/bootstrap.ts | L376 | 部署引导入口 |

## 3. 实现方案

### 3.1 写集 (0 修改 + 2 新建)
| 文件 | 操作 | 说明 |
|------|:---:|------|
| [extensions/sentinels/path-dependency/computes/detect.ts](extensions/sentinels/path-dependency/computes/detect.ts) | 新建 | 唯一入口：export `detectPathDependency`（compute）+ `pathDependencySentinel`（哨兵对象） |
| [tests/sentinel/path-dependency-sentinel.test.ts](tests/sentinel/path-dependency-sentinel.test.ts) | 新建 | 三路径测试（≥10 用例，见 §4） |

### 3.2 修复模式

**detect.ts（唯一入口，一个文件两个 export）**:

```ts
// 1. compute 函数（复用历史 HHI 算法，适配同步 queryEdges/queryNodes）
export async function detectPathDependency(
  store: GraphStoreReader, teamId: string, traversal?: GraphTraversal,
): Promise<{ value: number; degraded: boolean; evidence: string[] }> {
  // 入度集中度 HHI（60%）+ 单一来源依赖占比（40%）→ dependency_score 0-1
  // 空图（0 节点或 0 边）→ { value: 0, degraded: true, evidence: [] }
  // 单节点零边 → 归一化不除零（HHI 分母 guard）
}

// 2. 哨兵对象（exportKey = pathDependencySentinel，check 签名与 loader L205 一致）
export const pathDependencySentinel = {
  async check(store, teamId, traversal?): Promise<SentinelFinding[]> {
    const r = await detectPathDependency(store, teamId, traversal);
    if (r.degraded) return [];  // 数据不足 → 不误报 critical（铁律 31）
    // value >= 0.7 → critical；0.4 <= value < 0.7 → warning；< 0.4 → 无 finding
    // 阈值读 manifest.thresholds.dependency_score（0.4/0.7），非历史算法内部 0.3/0.6
  },
};
```

**命名对齐（历史教训）**: manifest `computes:["detect-path-dependency"]`（kebab）是**文档性声明**（loader 不消费，消费方是 expert-router/prompt-assembler），`entryPoint`/`exportKey` 才是 loader 注册依据。实现 export `pathDependencySentinel`（exportKey 命中）+ `detectPathDependency`（compute，历史 camelCase 沿用），**不得**只 export kebab 名而缺 exportKey（历史「export 名不匹配」教训）。

### 3.3 不做的事

| 不做 | 文件 | 归属 |
|------|------|------|
| manifest 契约 | `extensions/sentinels/path-dependency/manifest.json` | 冻结 |
| aggregate.ts（entryPoint 不指向它 → dead code） | `extensions/sentinels/path-dependency/aggregate.ts` | **不建**（铁律 37） |
| loader 改动 | `src/sentinel/sentinel-loader.ts` | 自动扫描，无需改 |
| 其他哨兵 | `extensions/sentinels/*` | 不动 |

## 4. 测试要求（测试优先 — 铁律 0-2/48，red→green）

**第一步（red）**: 新建 `tests/sentinel/path-dependency-sentinel.test.ts`，用例在修复前必须失败：

| 用例 | 修复前（red） | 修复后（green） |
|------|------|------|
| `detect.ts` 存在且 export `pathDependencySentinel` | 文件不存在 → 报 entryPoint 错 | 存在 + export 命中 |
| `registerLoadedSentinels` 注册 45/45（无 path-dependency 报错） | 44/45 + entryPoint 报错 | 45/45 |
| `detectPathDependency` 空图（0 节点/0 边）→ `degraded: true` | 无实现 | degraded: true |
| `detectPathDependency` 有边 → `value` 在 0-1 区间 | 无实现 | value ∈ [0,1] |
| `detectPathDependency` 单节点零边 → 归一化不除零（HHI 分母 guard） | 无实现 | 不抛 NaN/Infinity |
| `pathDependencySentinel.check` value=0.8 → critical | 无实现 | critical finding |
| `check` value=0.5 → warning | 无实现 | warning |
| `check` value=0.2 → 无 finding | 无实现 | `[]` |
| `check` degraded → 不产出 critical（铁律 31） | 无实现 | `[]` |
| 边界：value 恰好 = 0.4 → warning（阈值边界） | 无实现 | warning |

**第二步（green）**: 实现后全绿。

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | vitest 单元 | ≥10 | 上述 10 用例（正常/降级/边界/命名对齐/注册） |

## 4.5 决策参考（S-12，本任务决策点）

| 决策点 | 选项 | 参考系 | 结论 |
|--------|------|--------|------|
| 文件结构 | A 只建 detect.ts（entryPoint 指向）/ B 照抄其他哨兵建 aggregate.ts | 第一性原理（entryPoint 决定入口）+ 铁律 37（dead code 禁止） | **A**——aggregate.ts 不被 entryPoint 引用即 dead code |
| check 签名 | A `(store, teamId, traversal?)` / B Sentinel 接口 `(context)` | grep 实测 loader L205 调 `(store, teamId, traversal)` | **A**——与调用方一致 |
| 阈值来源 | A manifest 0.4/0.7 / B 历史算法内部 0.3/0.6 | 第一性原理（manifest 是契约冻结，阈值唯一权威） | **A**——读 manifest，历史算法内部阈值弃用 |
| compute 命名 | A 沿用 camelCase `detectPathDependency` / B kebab `detect-path-dependency` | loader 只认 entryPoint/exportKey，computes 是文档性 | **A**——exportKey `pathDependencySentinel` 必须命中，compute 名沿用历史 |

> 收敛检查：四决策点参考系指向同一答案，无分歧。**参考：第一性原理 + Anthropic（契约冻结/最小机制）**。

## 5. Wiring Verification（接线要求）

| 变更 | 验证 |
|------|------|
| entryPoint 文件就位 | `test -f extensions/sentinels/path-dependency/computes/detect.ts` exit 0 |
| exportKey 命中 | `grep -n "pathDependencySentinel" extensions/sentinels/path-dependency/computes/detect.ts` 命中 export |
| 生产调用点 | `grep -rn "registerLoadedSentinels" src/ --include="*.ts" | grep -v "\.test\."` 命中 2 处（file-driven-loaders.ts:73 + bootstrap.ts:376） |
| manifest 未改 | `git diff --exit-code extensions/sentinels/path-dependency/manifest.json` exit 0 |

## 6. 完成标准（DS 与 dev doc 一一对应，禁重编号，缺项显式 descope——S-10）

1. DS1: `detect.ts` 存在且 export `pathDependencySentinel`（check 方法）——`test -f` + `grep pathDependencySentinel`
2. DS2: `detectPathDependency` 三态正确——空图 `degraded:true` / 有边 `value∈[0,1]` / 单节点不除零
3. DS3: `pathDependencySentinel.check` 阈值正确——0.8 critical / 0.5 warning / 0.2 无 / degraded `[]`
4. DS4: 45/45 注册——`registerLoadedSentinels` 无 path-dependency entryPoint 报错（grep 断言）
5. DS5: manifest 未改（契约冻结）——`git diff --exit-code manifest.json`
6. DS6: 测试全绿——`vitest run tests/sentinel/path-dependency-sentinel.test.ts`（≥10 用例；red 已证）
7. DS7: 接线——`registerLoadedSentinels` 真实调用方 2 处 grep 命中，非测试调用
8. DS8: `as any` = 0（铁律 38）+ `tsc --noEmit` 零新增错误
9. DS9: 全量审计基线一致 + 无 `--no-verify` + `git diff --name-only` 与写集（§3.1）一致
10. DS10: 推送 + CI 验证——`git log origin/<branch>..HEAD` 为空 + CI 任务相关 job 逐 job 绿
11. DS11: 完成报告含**决策记录**（§4.5 四决策点参考系与结论，S-12）——K3 可核

> 交付声明必须覆盖 DS1-DS11 全部并标注状态（✅/⏸/❌+理由）；**禁止重编号/跳号/静默缺项**（S-10）。

## 7. 自检清单

- [x] D378 审计空壳现场核实（computes/ 目录不存在，entryPoint 指向空）
- [x] 数据接口核实（GraphStoreReader.queryEdges/queryNodes 同步签名，graph-traversal.ts:13-15）
- [x] check 签名核实（loader L205 调 `(store, teamId, traversal)`，非 Sentinel `(context)`）
- [x] 历史教训核实（export 名不匹配 + V2 后缀过短，SYNOVA-AUDIT-compute函数存在性验证）
- [x] 真实调用方枚举（2 处：file-driven-loaders.ts:73 + bootstrap.ts:376）
- [x] 测试优先：10 用例 red 设计（含命名对齐 + 45/45 注册 + 阈值边界）
- [x] 决策参考已记录（§4.5，S-12）：四决策点收敛
- [x] DS 与 dev doc 一一对应（DS1-DS11，S-10）；无 phantom 声称（S-11）
- [x] 写集表 `### 3.1 写集 (0 修改 + 2 新建)` 标题紧跟表头（无空行，对齐 devdoc_writeset.py 契约）
- [x] 不是凭记忆（grep/read 实测）；不用 --no-verify

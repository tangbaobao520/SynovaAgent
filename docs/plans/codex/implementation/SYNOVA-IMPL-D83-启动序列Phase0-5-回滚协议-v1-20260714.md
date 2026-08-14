# SynovaAgent — D83 启动序列Phase0-5+回滚协议 实施方案 v1.0

> 2026-07-14 | 第14份权威文档（系统集成与实施路线图）第一章
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。不依赖任何其他文档或口头记忆。**

---

## 执行约束（每次提交前必须回答的 5 问）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38）
4. 测试覆盖: 测试有 expect() 断言？（铁律 48）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

---

## 当前状态（2026-07-14 审计确认）

- 现有 `src/server.ts`: 顺序初始化 → `app.listen()`。无Phase概念，无失败回滚
- 现有各Loader: SentinelLoader(D15a)/SkillLoader(D65)/PlaybookLoader(D67) — 各自独立加载，无统一顺序
- 现有健康检查: D49 healthz 6项检查
- 权威文档14 §1.1: 启动序列6个Phase + 子顺序依赖 + 失败回滚 + 数据预置
- 权威文档14 §1.3: 运行中热重载协议

---

## 做了什么

### 1. src/deploy/bootstrap.ts — 启动序列编排器（新建）

```typescript
export interface BootstrapPhase {
  name: string;
  order: number;
  dependsOn: string[];
  execute(): Promise<BootstrapResult>;
  rollback?(): Promise<void>;  // 失败回滚
  timeoutMs: number;
}

export interface BootstrapResult {
  phase: string;
  success: boolean;
  modules: { name: string; status: 'ok'|'degraded'|'failed'; error?: string }[];
  durationMs: number;
}

// Phase序列定义（权威文档§1.1）:
// Phase 0: 基础设施 — SQLite, Logger, ConfigLoader, EnvValidator
// Phase 1: 存储层 — GraphStore建表+索引+Schema迁移+数据预置
// Phase 2: 核心引擎 — SentinelLoader(2a)→SkillLoader(2b)→PlaybookLoader(2c)→CausalChainLoader(2d)
// Phase 3: 本体计算 — 42边transfer_function注册, compute加载, ToolRegistry
// Phase 4: 专家与安全 — ExpertPromptLoader, PolicyEngine初始化
// Phase 5: 交互层 — HTTP, MCP, TUI, CronScheduler
```

**子顺序依赖（Phase 2内部）**:
- 2b SkillLoader **依赖** 2a SentinelLoader（Skill的 `dependencies.sentinels` 需引用已注册哨兵ID）
- 2c PlaybookLoader **依赖** 2b SkillLoader（Playbook的 `steps[].tool` 需引用已注册Tool ID）
- 2a 和 2d 相互独立，可并行

**失败策略**:
- Phase 0任何模块失败 → 终止启动，error code 1
- Phase 1 Schema迁移失败 → 回滚到迁移前快照 + 终止启动
- Phase 2-4模块失败 → 标记degraded + 记录L4事件流 + 不阻塞Phase（继续后续Phase）
- Phase 5 中TUI失败不影响HTTP/MCP

### 2. src/server.ts — 接入Bootstrap（修改）

替换现有顺序初始化:
```typescript
// 旧: app.listen(config.port, () => { ... })
// 新:
const bootstrap = new Bootstrap();
const result = await bootstrap.run();
if (!result.success) process.exit(1);
app.listen(config.port, () => { ... });
```

### 3. 热重载协议（权威文档§1.3）

不实现（D83只做启动序列）。D83在bootstrap.ts中预留 `reload(sentinelId)` 接口签名，MVS阶段后实现。

### 4. 测试文件

---

## 不做什么

- 不修改各Loader的核心逻辑（SentinelLoader/SkillLoader/PlaybookLoader不改）
- 不实现热重载（MVS阶段后）
- 不实现数据预置加载器（D85 MVS黄金数据集处理）
- 不修改 D49 healthz（只消费其检查结果）

---

## 架构层

L1（交互层: server.ts）+ L4（部署基础设施: bootstrap.ts）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | bootstrap.ts Phase定义 | 2h | src/deploy/bootstrap.ts |
| 2 | Phase执行引擎+回滚 | 2h | 同上 |
| 3 | server.ts接入 | 1h | src/server.ts |
| 4 | 测试文件 | 1h | tests/deploy/bootstrap.test.ts |

**总工时: 6h（1天）**

---

## 完成标准

```
[ ] bootstrap.ts: 6个Phase定义(Phase0-5) + 子顺序依赖(2a→2b→2c)
[ ] bootstrap.ts: 每个Phase独立try-catch，失败不崩溃整个系统
[ ] bootstrap.ts: Phase 0失败 → process.exit(1)（基础设施不可降级）
[ ] bootstrap.ts: Phase 2-4模块失败 → 标记degraded，继续后续Phase
[ ] bootstrap.ts: 每个Phase记录执行时间+结果到日志
[ ] server.ts: app.listen前调用bootstrap.run()
[ ] server.ts: bootstrap失败时app.listen不执行
[ ] 不修改各Loader核心代码
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=8测试: bootstrap 6(全部成功/Phase0失败退出/Phase2 degraded继续/Phase1回滚/顺序依赖验证/超时处理) + server 2(集成/beforeAll)
```

---

## 权威文档引用

- 第14份权威文档: 系统集成与实施路线图 第一章（系统启动序列与热重载协议）
  - §1.1: 启动阶段定义 Phase 0-5 + 子顺序依赖
  - §1.2: 失败回滚协议 — 每Phase独立
  - §1.3: 运行中热重载协议（D83不实现，预留接口）
  - §1.4: 数据预置阶段（D85 MVS处理）
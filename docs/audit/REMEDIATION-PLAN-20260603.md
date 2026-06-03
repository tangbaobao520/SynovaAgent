# Synova 修复计划 — 架构解耦优先，功能增强随后

> 基于 AUDIT-CORE-ARCH-2026-02（33项，7C+12H+9M+5L）| 2026-06-03

---

## 总策略

**第一阶段：架构解耦（根基）→ 第二阶段：核心竞争力（功能）→ 第三阶段：engine-core（另一仓库）**

架构不解耦就加功能 = 在裂缝上盖楼。先切断三条致命耦合链。

---

## 第一阶段：五层架构解耦（P0，先于所有功能）

### 1.1 L2↔engine-core 接口抽象 — 切断 vendor 硬路径依赖

**当前状态**：
```
diagnosis-launcher.ts
  → await import('../../../../server/vendor/@synova/engine-core/src/pipeline/diagnosis/diagnosis-orchestrator')
  → 硬编码 6 级相对路径，换 engine-core 版本即炸
```

**目标状态**：
```
diagnosis-launcher.ts
  → DiagnosisEngine (interface, 定义在 synova-agent 内)
     → EngineCoreVendorAdapter (唯一知道 vendor 路径的类)
        → await import('...engine-core...')
```

**具体步骤**：
1. 创建 `src/l2-interfaces/diagnosis-engine.ts` — 定义 `DiagnosisEngine` 接口
   ```typescript
   interface DiagnosisEngine {
     runConsultation(teamId: string, initiator: {...}): Promise<ConsultationResult>;
   }
   ```
2. 创建 `src/adapters/engine-core-adapter.ts` — `EngineCoreVendorAdapter implements DiagnosisEngine`
   - 封装动态 import，隔离 vendor 路径
   - 构造函数注入 LLM provider 和 tool executor
3. `diagnosis-launcher.ts` → 依赖注入 `DiagnosisEngine`，不再知道 vendor 路径
4. `server.ts` 启动时创建 `EngineCoreVendorAdapter` 实例注入

**验收**：`grep -rn "server/vendor" src/agent/ src/l2-interfaces/` → 零结果（只有 adapters/ 知道路径）

**工时**: 4h

### 1.2 L4 GraphStore 类型统一 — 消除双重声明

**当前状态**：
```
graph-bridge.ts:25  →  export interface GraphStore { 14 methods... }  ← synova-agent 声明
graph-store.ts:27   →  export interface GraphStore { 14 methods... }  ← engine-core 声明
两份独立维护，engine-core 改接口 synova-agent 编译期零感知
```

**目标状态**：
```
graph-bridge.ts  →  import type { GraphStore } from '@synova/engine-core/graph-store'
                      // 或通过 EngineCoreVendorAdapter 暴露
                   →  编译期类型检查自动发现不一致
```

**具体步骤**：
1. 添加 `@synova/engine-core` 类型别名到 `tsconfig.json`（指向 vendor 目录）
2. `graph-bridge.ts` 改为 `import type { GraphStore } from '@synova/engine-core/graph-store'`
3. 删除本地声明的 GraphStore 接口（14 方法）
4. 更新 `engine-context.ts`、`diagnosis-graph-query.ts`、`community-reports.ts` 等所有使用方
5. 保留 `graphstore-compatibility.test.ts` 作为回归哨兵

**风险**：engine-core 在 vendor，tsconfig paths 需正确配置。如果 engine-core 类型定义有缺失，先用 `Pick<>` 选择子集。

**工时**: 3h

### 1.3 SubAgentCoordinator 分层 — 分离编排与专家逻辑

**当前状态**：
```
src/orchestrator/subagent-coordinator.ts (L2 目录)
  → import ExpertAutonomyEngine (L3)
  → 包含 6 个专家的完整 Prompt 构建 (L3 逻辑)
  → 包含 DataAccessPolicy 行级安全过滤 (L3 逻辑)
  → 包含 QualityFirewall 后处理 (L3 逻辑)
```

**目标状态**：
```
src/orchestrator/subagent-coordinator.ts (L2)
  → 只做流程编排：并发调度、事件发射、结果聚合
  
src/l3/expert-dispatcher.ts (新建, L3)
  → ExpertAutonomyEngine 调用、Prompt 构建、DataAccessPolicy、QualityFirewall
  → 通过接口被 L2 的 SubAgentCoordinator 调用
```

**具体步骤**：
1. 提取 `src/l3/expert-dispatcher.ts`：
   - `class ExpertDispatcher` — 接收 LLM + QueryAPI + policies → 产出 SubAgentReport[]
   - 包含所有当前 subagent-coordinator 中的 L3 逻辑
2. 精简 `src/orchestrator/subagent-coordinator.ts`：
   - 只保留 `runAll()` 并发调度 + 事件发射 + 结果聚合
   - 通过 `ExpertDispatcher` 接口调用 L3
3. 更新 `diagnosis-launcher.ts` → 通过 SubAgentCoordinator(L2) → ExpertDispatcher(L3) 链

**验收**：`grep -rn "ExpertAutonomy\|QualityFirewall\|DataAccessPolicy" src/orchestrator/` → 零结果

**工时**: 4h

### 1.4 模块边界强化 — 编译期 + 运行时双重门禁

**当前已有机础**：
- `check-architecture.sh` pre-commit 检测 L2→L4 跨层 import
- `graphstore-compatibility.test.ts` 编译时类型哨兵

**新增**：
1. **barrel export 限制**：每个 `l*/` 目录只通过 `index.ts` 暴露公共 API
   - L4 的 `index.ts` 只能 export 接口类型（不能 export 实现类）
   - L3 不能 import L5 的任何符号
2. **tsconfig 路径映射**：用 TypeScript `paths` 限制跨层引用
   ```json
   // 编译期阻止 L2 import L4：
   // L2 文件中 import '../../l4/...' → tsc 报错
   ```
3. **循环依赖检测**：pre-commit 添加 `madge` 或自定义脚本检测 import 环

**工时**: 2h

---

## 第二阶段：核心竞争力修复（P1，架构解耦完成后）

> 注：以下功能必须在第一阶段完成后方可开始。否则功能代码会加深耦合。

### 2.1 CV-001: 交叉验证引擎增强 (4h)
- CorroborationEngine 加 LLM 语义验证
- minSources=3 硬门禁
- 证据链溯源

### 2.2 FED-001: 联邦进化接线 (6h)
- 通过 `EngineCoreVendorAdapter` 暴露 FederalReporter（不再直接 import）
- server.ts 启动初始化 + diagnosis-launcher 完成钩子

### 2.3 TPL-001/002/004: 专家生态完善 (5h)
- Expert 贡献 Map→SQLite
- TemplateValidator 接线
- PatternEngine 连接 mode_library

### 2.4 CV-003: crossValidateTool 去 HTTP 自调用 (1h)

---

## 第三阶段：engine-core 修复（P2，另一仓库）

| 审计ID | 问题 | 工时 |
|--------|------|------|
| SOG-001 | deleteNode 物理删除 → UPDATE valid_to | 2h |
| MODULE-001 | 772 文件拆分为 5 包 | 16h |
| MODULE-002 | 相对路径 → @synova/* 包引用 | 8h |
| SOG-002 | queryNodes graph 改为 required | 2h |
| 其余 11 项 | ARCH-VIOL-003~004, CV-002, EXP-001~003, TPL-003 等 | 24h |

---

## 执行顺序（不可调换）

```
第一阶段 (架构解耦, 13h)：
  Step 1: L2↔engine-core 接口抽象 (4h) ← 最先做，其他都依赖它
  Step 2: L4 GraphStore 类型统一 (3h) ← 依赖 Step 1 的类型导出
  Step 3: SubAgentCoordinator 分层 (4h) ← 依赖 Step 1 的接口模式
  Step 4: 模块边界强化 (2h)

第二阶段 (功能, 16h)：
  CV-001 + FED-001 + TPL-001/002/004 + CV-003

第三阶段 (engine-core, 52h)：
  另一仓库处理
```

---

## 验收标准

第一阶段完成时：
- [ ] synova-agent 没有任何文件包含 `server/vendor` 字符串（except `src/adapters/`）
- [ ] L4 GraphStore 类型声明只存在于 engine-core
- [ ] `src/orchestrator/` 不 import 任何 L3 类
- [ ] `check-architecture.sh` 零硬阻断
- [ ] 436 tests 通过，零回归

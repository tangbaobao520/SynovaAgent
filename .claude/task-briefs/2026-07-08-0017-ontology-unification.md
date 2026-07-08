# Task Brief: 本体层单轨重建 — 旧SOG枚举统一到新JSON Schema @synova/ontology

> 生成: 2026-07-08 00:17:53 | 分支: feat/prompt-architecture | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
能文件化的必须文件化。不能文件化的必须有明确的扩展点。

### 三层解耦体系

**纵向解耦：五层物理隔离**
代码按 L1-L5 架构分层，每层只与相邻层通信。L1 交互层不知道 L4 用什么数据库，L3 洞察层不知道 L5 数据存在哪。换底层存储，上层零改动。pre-commit 物理阻断跨层 import——L2→L4 的代码提交不进去。

**横向解耦：11 个独立 Monorepo 包**
五层内部拆为独立包：@synova/sog-core（本体图类型）、@synova/sentinel-engine（哨兵调度）、@synova/expert-platform（专家加载）、@synova/connector-registry（数据连接器）。每个包接口边界明确，拆卸一个不影响其余 19 个。核心包已落地运行；已存在的功能规划从 src/ 迁移到独立包；未来新增须遵循此结构。

**扩展解耦：文件驱动，不改代码**
新增能力靠文件，不靠改代码：
- 新 AI 专家 = 新建目录 + 10 个 Markdown 文件 → 自动注册到 ExpertDispatcher
- 新诊断哨兵 = 加 xxx-sentinel.ts → builtins 自动扫描加载
- 新行业 = 加行业目录（基准数据+阈值+案例库）→ 1-2 天上线，零 TypeScript 改动
- 新本体实体类型 = 加 JSON Schema 文件

流程约束: V4.4.2 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

数据流: L5 存储 → L4 本体 → L3 洞察(哨兵定时+诊断按需) → L2 编排 → L1 交互
        反馈闭环: GA评审/客户反馈 → 记忆层 → 数据层
        Sentinel Finding[] → 诊断引擎 Phase 2 → 8 位文件驱动专家解读

L1 入口: POST /api/diagnosis/consult (GA诊断) / Cron→Sentinel.check() (哨兵) / GET /chat (Web) / MCP
五层架构 (只能向下依赖相邻层):
  L1 交互: routes/ tui/ mcp/
  L2 编排: agent/ orchestrator/
  L3 洞察: l3/ sentinel/ expert-platform/ expert/ (8位文件驱动专家: strategy org finance tech marketing action business_model knowledge)
  L4 本体: l4/ evidence/ 企业事实层: AgentMemoryStore (enterprise_fact, 版本化+superseded_by链)
  L5 存储: store/ cron/
三层粒度: 专家→哨兵→计算。哨兵=可独立告警的最小子领域。compute=纯数学函数。
L0 进化: evolution/ 两路反馈→候选池→确认/执行验证→写入知识库
文件化扩展: expert/ knowledge/shared/ theory/ skills/ — 新增=加文件,不改代码
数据安全: L0公开摘要→L1聚合信号→L2脱敏证据→L3原始数据(仅客户内Agent可见,GA不可见)
引擎: packages/engine-core/ (Novis遗产,逐步迁移)。禁止src/新增engine-core引用(铁律46)。
安全: security/ (PIIScrubber, DataBoundary)
LLM: providers/ (DeepSeek, OpenAI, Gateway)

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] **纵向**（改 L4 本体层 — 替换旧 SOG 枚举为 JSON Schema 派生的字符串常量）
- [x] **横向**（创建新 `@synova/ontology` 包）
- [ ] 扩展

**系统**: L4 本体层基础设施重构。
**现有模块**: L4 包含 `graph-bridge.ts`, `entity-resolver.ts`, `ontology-loader.ts`, `community-reports.ts`, `engine-graph-store.ts` 等。
**动作**: 替换（以新 `NodeType`/`EdgeType` 字符串常量替换旧 `SOGNodeType`/`SOGEdgeType` 枚举）。不改变架构逻辑，只改变类型标识。

### b) 文件审计
grep 结果 (counts):
- `extensions/ontology/` — 29 节点 + 16 边 JSON Schema → 复用（新类型定义源）
- `extensions/sentinels/` — 62 哨兵 manifest 缺 `id` 字段 → 扩展（补 id）
- `packages/sog-core/` — `SOGNodeType`/`SOGEdgeType` 枚举定义 → 替换（将删除枚举导出）
- `src/` 下 17 文件引用 `SOGNodeType`, 8 文件引用 `SOGEdgeType` → 替换
- `packages/` 下 29 文件引用旧枚举 → **本次不做**（engine-core 域）

### c) 决策
无冲突。旧枚举替换为新字符串常量。扩展目录已有完整 JSON Schema — 直接复用为 `@synova/ontology` 的唯一数据源。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行，每一步完成后才能进入下一步：
  ① SPEC / Done 标准 — 已定义于本 brief
  ② 测试 — 类型迁移不涉及新行为，验证通过 tsc + lint + grep
  ③ 实现 — 刚好满足以下全部条件：
     - Done 标准中列出的所有完成项
     - 旧枚举零引用（grep 验证）
     - 新包已接线（grep 非零）
     - tsc + vitest 零失败
  ④ 接线 — 新 @synova/ontology 被至少一个 src/ 文件 import
  ⑤ 验证 — 9 条验证命令全部通过

引用依据：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 46: 禁止桥接文件/re-export 壳 — @synova/diagnosis-engine 42行纯 re-export 教训
  - 铁律 4: 交付不完整=写了代码没接线 — 新包必须有生产代码引用
  - memory/ engine-core-split-fraud — 桥接文件伪装迁移，grep 骗不过
  - memory/ audit-full-parallel-pattern — 壳包通过 packages/ 绕过 src/ 扫描

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）

1. rule: "旧 SOG 枚举替换后 grep 零引用"
   verify: "rg 'SOGNodeType\\.' --type ts src/ | wc -l"

2. rule: "新 @synova/ontology 包必须被至少一个 src/ 生产文件引用"
   verify: "rg \"from '@synova/ontology'\" --type ts src/ | wc -l"

3. rule: "迁移后 tsc + vitest 必须通过"
   verify: "npm run lint && npm run test 2>&1 | tail -5"

## Q2: 范围 — 正确的最简方案是什么？

**做什么**:
1. 修复 task-start.sh 编码损坏（当前乱码导致 exit 2）
2. 创建 packages/ontology/ 包（NodeType/EdgeType 字符串常量，as const）
3. 编写迁移脚本 scripts/migrate-ontology.ts 替换 src/ 下旧枚举
4. 迁移 src/ 下 17 个使用 SOGNodeType 的文件 + 8 个使用 SOGEdgeType 的文件
5. 修复 62 个哨兵 manifest.json（补充 id: sentinel-{目录名}）
6. 修复 16 个边 JSON 的 consumed_by_sentinels 字段
7. 更新 extensions/ontology/manifest.json 节点计数（17→29）
8. 添加 pre-commit 门禁：禁止旧 SOG 枚举引用

**不做什么**:
- ❌ 不迁移 packages/engine-core/（322+处，Novis遗产，后续清理）
- ❌ 不迁移 packages/connector-registry/ packages/test-kit/ 
- ❌ 不删除 packages/sog-core/（保留归档，只删其枚举导出）
- ❌ 不处理 v2.4 规范缺失边（Phase 5 再做）
- ❌ 不改 SQLite 数据（queryNodes 双格式兼容）
- ❌ 不做 props 接口迁移（Phase 5）

## Q3: 验收 — 入口 → 交互 → 结果

入口：无用户可见入口 — 基础设施重构。
处理：创建新包 → 迁移 src/ 引用 → 修复哨兵 manifest → 门禁验证
结果：通过 9 条验证命令证明完成。

## 本任务在哪一层
L4（本体层 + 横向新的 @synova/ontology 包）

## Done 标准
- [验证:1] rg "SOGNodeType\." --type ts src/ → 零结果
- [验证:2] rg "SOGEdgeType\." --type ts src/ → 零结果
- [验证:3] rg "from '@synova/sog-core'" --type ts src/ → 零结果
- [验证:4] rg "from '@synova/ontology'" --type ts src/ → 非零
- [验证:5] npm run test → 零失败
- [验证:6] npm run lint → tsc --noEmit 通过
- [验证:7] 62 哨兵 manifest 全部有 id 字段
- [验证:8] 16 边 JSON consumed_by_sentinels 指向真实哨兵 ID
- [验证:9] pre-commit 组 6 包含旧 SOG 枚举引用硬阻断
- [验证:10] task-start.sh 正常运行 exit 0

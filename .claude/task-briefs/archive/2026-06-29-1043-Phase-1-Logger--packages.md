# Task Brief: Phase 1: Logger做实 — 迁入packages/logger + 替换179个import

> 生成: 2026-06-29 10:43:06 | 分支: feat/prompt-architecture | as any: 0

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

**横向解耦：20 个独立 Monorepo 包**
五层内部拆为独立包：@synova/sog-core（本体图类型）、@synova/sentinel-engine（哨兵调度）、@synova/expert-platform（专家加载）、@synova/connector-registry（数据连接器）。每个包接口边界明确，拆卸一个不影响其余 19 个。核心包已落地运行；已存在的功能规划从 src/ 迁移到独立包；未来新增须遵循此结构。

**扩展解耦：文件驱动，不改代码**
新增能力靠文件，不靠改代码：
- 新 AI 专家 = 新建目录 + 10 个 Markdown 文件 → 自动注册到 ExpertDispatcher
- 新诊断哨兵 = 加 xxx-sentinel.ts → builtins 自动扫描加载
- 新行业 = 加行业目录（基准数据+阈值+案例库）→ 1-2 天上线，零 TypeScript 改动
- 新本体实体类型 = 加 JSON Schema 文件

流程约束: V4.2.8 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

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
- [ ] 纵向（改 L1-L5 代码/架构）
- [x] 横向（迁移到独立包 / 新建包）
- [ ] 扩展（文件驱动，不改 TypeScript）

本任务属于基础设施（Logger）。packages/logger 当前是 21 行空壳（无脱敏逻辑），src/logger.ts 是 116 行真实实现（含 P0-5.2 PII 脱敏）。本任务将真实实现迁入 packages/logger，所有 src/ + extensions/ 的 import 改为 @synova/logger。

package.json 已存在，tsconfig paths 已有映射，不需要新建目录。

### b) 文件审计
- packages/logger/src/index.ts — 当前 21 行空壳，缺 REDACT_FIELDS/REDACT_VALUE_PATTERNS/redactValues
- src/logger.ts — 116 行真实实现，被 179 个文件引用
- src/ + extensions/ — 全部 logger import 是相对路径

关系：扩展（packages/logger 从空壳变实心）+ 迁移（src/logger.ts 删除后 import 路径重写）

### c) 决策
复用（把 src/logger.ts 内容完整迁入 packages/logger，不改逻辑）。
不准建转发层（铁律 46：packages/logger/src/index.ts 不能出现 'from "../logger"' 或 'from "../../src/logger"'）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① 将 src/logger.ts 完整内容复制到 packages/logger/src/index.ts
② 逐目录替换 src/ 下 logger import（from '../logger' → from '@synova/logger'）
③ 替换 extensions/ 下的 imports
④ 删除 src/logger.ts
⑤ 验收门禁（tsc + grep 残留 + pre-commit 永久检查）
⑥ 一次 commit（不拆分——这是纯 import 替换，无中间态）

引用依据：
  - memory/engine-core-bridge-files.md: 转发层伪装成拆分的模式，本次不准重复
  - 铁律 46: packages/ 内也不准建 import 转发

### b) 本任务执行约束
  - rule: "packages/logger/src/index.ts 不能 import 外部文件（必须是自包含实现）"
    verify: "grep -rn \"from '\" packages/logger/src/ | grep -vE \"pino|node:"
  - rule: "src/logger.ts 删除后所有 logger 调用必须来自 @synova/logger"
    verify: "grep -rn \"from ['\\\"]\\.\\.\\/logger['\\\"]\" src/ --include=\"*.ts\" && echo FAIL || echo PASS"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
  1. src/logger.ts 内容复制到 packages/logger/src/index.ts
  2. 替换 src/ 下全部 logger import（from '../logger' / '../../logger' → '@synova/logger'）
  3. 替换 extensions/ 下全部 logger import（from '../../../src/logger' → '@synova/logger'）
  4. 删除 src/logger.ts
  5. 加永久 pre-commit 检查（组 9：包边界完整性）

不做什么：
  - 不改 logger 逻辑（仅迁移，zero diff on behavior）
  - 不改其他包（error-types / sog-core / sentinel-engine 不动）
  - 不改 tsconfig.json（paths 已存在）

## Q3: 验收 — 不可证伪就算没做完

入口：tsc --noEmit 编译全项目
处理：import 路径解析到 @synova/logger → packages/logger/src/index.ts
结果：所有日志功能不变（含 PII 脱敏）

可证伪验证：
  1. src/logger.ts 不存在（真删了，不是改名留存）
  2. src/ 下零个从相对路径 import logger 的文件（动态 import 也要查）
  3. extensions/ 下零个从 ../../../src/logger import 的文件
  4. packages/logger/src/index.ts 包含 REDACT_FIELDS（不是空壳）
  5. tsc --noEmit 零错误（排除 4 个预存文件）

## 本任务在哪一层
基础设置（横向：packages/logger 从空壳变实心）
## Done 标准
- [ ] 门禁 1: test ! -f src/logger.ts
- [ ] 门禁 2: grep -rn "from ['\"]\.\.\/logger['\"]" src/ --include="*.ts" → 空
- [ ] 门禁 3: grep -rn "from ['\"]\.\.\/\.\.\/\.\.\/src\/logger['\"]" extensions/ --include="*.ts" → 空
- [ ] 门禁 4: grep "REDACT_FIELDS" packages/logger/src/index.ts → 非空
- [ ] 门禁 5: npx tsc --noEmit 零新错

## Done 标准
- [ ] 入口可触达:
- [ ] 链路走通:
- [ ] 结果可见:

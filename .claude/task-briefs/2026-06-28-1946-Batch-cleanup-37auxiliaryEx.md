# Task Brief: Batch cleanup: 补全37哨兵auxiliaryExperts + capital-turnover修复

> 生成: 2026-06-28 19:46:07 | 分支: feat/prompt-architecture | as any: 0

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
- [ ] 横向（迁移到独立包 / 新建包）
- [x] 扩展（文件驱动，不改 TypeScript）

本任务属于哨兵系统。触及 L3 洞察层（extensions/sentinels/）。现有 51 个哨兵目录，37 个缺失 auxiliaryExperts 字段。本任务是扩展已有文件驱动配置（补全 manifest.json 可选字段），不改一行 TypeScript。

### b) 文件审计
grep "auxiliaryExperts" extensions/sentinels/*/manifest.json → 14/51 已有该字段。37 个缺失。
本任务覆盖全部 51 个目录。关系: 扩展（补全已有文件驱动配置）。

### c) 决策
已有 manifest.json 文件驱动 → 补全字段。不新建文件。不修改 TypeScript。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行，每一步完成后才能进入下一步：
  ① SPEC — 定义 auxiliaryExperts 映射规则（按六层模型 + 专家归属确定辅助专家）
  ② 实现 — 批量修改 manifest.json 文件
  ③ 验证 — 每个 manifest 的 JSON 语法正确 + 字段值合法

引用依据：
  - 铁律 35: 自动化优先（批量编辑使用脚本生成）
  - 资料: memory/engine-core-bridge-files.md — 批量文件修改需要验证

### b) 本任务执行约束
  - rule: "每个 manifest.json 必须是合法 JSON"
    verify: "python3 -c \"import json; json.load(open(path))\""
  - rule: "auxiliaryExperts 不能是空数组"
    verify: "grep -c auxiliaryExperts manifest.json && 数组中至少有一个字符串"
  - rule: "auxiliaryExperts 值必须是合法专家名（8位之一）"
    verify: "grep -oP '\\\"auxiliaryExperts\\\"\\s*:\\s*\\[[^\\]]+\\]' manifest.json | grep -oP '\\\"[a-z_]+\\\"' | grep -vE 'strategy|org|finance|tech|marketing|action|business_model|knowledge'"

## Q2: 范围 — 正确的最简方案是什么？

做什么：
  1. 为 37 个缺失 auxiliaryExperts 的哨兵 manifest.json 补全该字段
  2. 替换 T4-T9 的 copy-paste stub compute 为真实算法（6个文件）
  3. 扩展 13 个低于15行阈值的 compute 文件加JSDoc（非stub）
  4. 修复 capital-turnover/receivable-turnover.ts（14→18行）

不做什么：
  - 不改 sentinel-loader.ts, types.ts (src/ TypeScript)
  - 不改 THEORY.md, RULES.md, KNOWLEDGE.md (expert/ 文件)
  - 不新建哨兵目录 (extensions/sentinels/ 下不建新目录)

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：pre-commit check 组 5（manifest schema 验证）/ checker-review 检查 manifest 完整性
处理（中间经过哪些步骤）：sentinel-loader.ts 读取 manifest → 解析 auxiliaryExperts → 注册到专家路由表
结果（最终展示在哪）：哨兵触发时路由到主专家 + 辅助专家。辅助专家参与信号交叉验证。

## 本任务在哪一层
L3（扩展解耦 — 文件驱动配置补全）

## Done 标准
- [ ] 入口可触达: grep "auxiliaryExperts" extensions/sentinels/*/manifest.json — 50/50 哨兵有此字段
- [ ] 链路走通: node -e "JSON.parse(fs.readFileSync('path'))" 通过所有 manifest + all compute files >= 15 lines (白名单除外)
- [ ] 结果可见: grep -oP '"auxiliaryExperts"\s*:\s*\[[^\]]+\]' extensions/sentinels/*/manifest.json — 全部非空
- [ ] 算法真实: T4-T9 六个哨兵各自有独立的不同算法（非 copy-paste）
- [ ] tsc --noEmit 零新错（已知4个预存文件排除）

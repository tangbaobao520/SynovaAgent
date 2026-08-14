# Agent 基础设施审计最终判定报告

> **审计员**: K3（Kimi Code CLI，独立会话，零上下文，只读）
> **审计日期**: 2026-08-14
> **审计对象**: `AGENT-INFRASTRUCTURE-SCAN-20260814.md`（Claude Code 物理扫描报告，git 暂存区，499 行）
> **任务书**: `docs/synova/coordination/AGENT-INFRASTRUCTURE-SCAN-TASK.md`
> **方法**: 不信任扫描者自我报告，8 项能力的关键数字/行号/DB 实测全部独立重执行复核
> **运行环境**: Windows 11 + Git Bash（bash 5.x）；python 3.11.15（`/d/hermes/hermes-agent/venv/Scripts/python`）；sqlite3 CLI 未安装（K3 独立复现确认）

---

## 〇、审计材料确认表

| # | 材料 | 状态 |
|---|------|:---:|
| 1 | 扫描报告（暂存区唯一文件，未提交） | ✓ `git diff --cached --stat` 确认：暂存区仅此 1 文件，+499 行 |
| 2 | 任务书（AGENT-INFRASTRUCTURE-SCAN-TASK.md） | ✓ 已读，8 项命令 + 判定标准 + 交接约定 |
| 3 | K3 前序报告（AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md） | ✓ 已读，交叉验证基准 |
| 4 | AGENTS.md（铁律判案依据） | ✓ 会话启动已加载 |
| 5 | 代码仓库 + 运行库 `data/synova.db` | ✓ 只读复核（`mode=ro` 打开） |

---

## 一、总体结论

**CONDITIONAL PASS** —— 两层含义分别判定：

1. **对扫描报告本身：PASS（可信）**。8/8 项能力的关键证据（grep 计数、行号、文件清单、DB 行数）经 K3 独立重执行**全部复现一致**；3 处命令适配（sqlite3 缺失 / `find --include` 非法 / 能力 7 目录假设错误）经复核**全部属实且处理诚实**；与 K3 20260813 报告的交叉引用（baselines=580、tickets=0、死代码互证）**全部吻合**。
2. **对基础设施能力：5/8 真实、3/8 部分、0 空壳的判定成立，维持**。无新增 P0，但有 P1/P2 缺口（§四），故非全量 PASS。

**回答任务书的核心问题**：这 8 项能力**没有一项是文档虚构**——全部有真实代码。但"真实代码存在"与"能力在生产中真实运转"之间的鸿沟在 3 项 PARTIAL 上物理可见：LLM 无运行时 failover、MCP 非官方协议、执行跟踪闭环从未流转过一条数据。

---

## 二、逐项复核判定（扫描声称 vs K3 物理复测）

| # | 能力 | 扫描判定 | K3 复核结果 | 结论 |
|---|------|:---:|:---|:---:|
| 1 | 存在与身份 | PASS | 288/267 grep 计数**精确复现**；DB 实测含 org_id 列表 = agent_memory/agent_sessions/audit_log/delivery_queue/knowledge_chunks，**恰好 5 表一致** | 维持 PASS |
| 2 | 上下文状态机 | PASS | `conversation-engine.ts:258` 类存在 ✅；turn/session 506 处 ✅；TODO/FIXME=0 ✅；`:8` 状态机注释（Phase 0→1-5）✅ | 维持 PASS |
| 3 | 状态持久化 | PASS | session-store.ts = **314 行**（与声称一致）；DDL :69/:81/:102、FTS 触发器 :115/:118、INSERT :129/:199、UPDATE :146/:218 全部复现；DB 52 表 ✅、agent_memory=0 ✅、sentinel_baselines=580 ✅ | 维持 PASS，补 1 项新数据（见 §三-a） |
| 4 | LLM 网关 | PARTIAL | 12 个 .ts 文件 ✅；ProviderType 10 成员联合类型 ✅；`fallback` 全目录仅 1 处命中且为注释（`llm-provider-loader.ts:4`）✅；detect.ts 启动时按环境变量切换（:10-27）✅；运行时 catch→切 provider 代码不存在 ✅ | 维持 PARTIAL，表述精确化（见 §三-b） |
| 5 | MCP 协议 | PARTIAL | `src/mcp/` 恰 5 文件 ✅；`ModelContextProtocol` 字面量 **0 命中** ✅；bootstrap.ts:1239-1244 接线 ✅ | 维持 PARTIAL，1 处措辞修正（见 §三-c） |
| 6 | Skill 动态加载 | PASS | 动态加载 29 处 / 静态 2 处 ✅；`extensions/skills/builtin/` = 41、`manifest.json` = 42 ✅ | 维持 PASS |
| 7 | GA 6 阶段 | PASS（有保留） | orchestrator/ 目录 `runGA\|runDiagnosis\|runAdvisor\|orchestrate` **0 命中** ✅（目录假设错误属实）；`diagnosis-launcher.ts:47` 类存在 ✅；Phase 1/3/4/5 接线注释 :75/:81/:79/:83 复现 ✅ | 维持 PASS（保留意见成立） |
| 8 | 执行跟踪闭环 | PARTIAL | tickets INSERT `:423` / UPDATE `:457` ✅；生产库实测：sentinel_tickets=**0 行**、actions=**no such table**、feedback_log=**no such table**、sentinel_baselines=580——**四项全部复现**；feedback_log DDL 仅存在于 `feedback-collector.ts:104`（惰性建表，从未执行）✅ | 维持 PARTIAL |

**复核覆盖率**：扫描报告 8 项能力的全部量化声称（计数/行号/表名/行数）100% 重执行，无一偏差。

## 三、审计补充发现（K3 在扫描基础上的增量）

- **a. `agent_sessions` 仅 1 行**（扫描注明"本次未查行数"，K3 补查）。含义：跨会话持久化表结构真实（PASS 不变），但生产库只流转过 1 个会话；叠加 `agent_memory=0` 行——**"跨会话记忆"能力在生产中从未被真实使用**。与能力 8 的"闭环从未运转"同一病型：代码真实 ≠ 能力激活。
- **b. "10 provider" 口径精确化**：`src/providers/` 内置具体适配器为 **4 个**（deepseek/openai/gateway/ernie，`index.ts:10-13`）；"10"来自 ProviderType 联合类型（`index.ts:22`）+ `extensions/llm-providers/` 下 10 个文件驱动 manifest 目录（11 个 manifest.json 含根目录 1 个）。扫描表述未做此区分，不影响 PARTIAL 判定（关键缺口是无运行时 failover，物理确认）。
- **c. "MCPToolRegistry" 措辞修正**：bootstrap.ts:1240 实际是从 `../agent/tools` import 通用 `ToolRegistry` 并起别名 `MCPToolRegistry`——**不存在 MCP 专用 registry 类**。接线真实，但命名制造了"有专用 MCP 注册中心"的印象，与能力 5 的"自研桥接冒称标准协议"同型，记录不升级。

## 四、分级汇总

### P0（阻断交付）

无新增。能力 8"闭环从未运转"与 K3 20260813 报告在册的 P0-1（哨兵阈值告警死代码）/ P0-2（L4 契约断裂致空图）**同源**——tickets 0 行是这两个 P0 的下游表征，证据加深但不重复立案。

### P1（建议修复，记录跟进）

| # | 发现 | 证据 |
|---|------|------|
| P1-1 | **LLM 网关无运行时 failover**：主 provider 失败后 catch→切换备用 provider 的代码物理不存在（`fallback` 仅注释 1 处），无 circuit breaker。"DeepSeek 挂了自动切 OpenAI"当前不成立——切换只发生在启动时按环境变量检测（detect.ts） | `grep -rn "fallback" src/providers/` 1 命中（注释）；detect.ts:10-27 |
| P1-2 | **执行跟踪 schema 缺失**：`actions` 表、`feedback_log` 表在生产库根本不存在（仅有代码内惰性 DDL，从未执行）；叠加 tickets 0 行——"建议→跟踪→回流"链路在 schema 层就未建成 | DB 实测：no such table ×2；feedback-collector.ts:104 |
| P1-3 | **跨会话记忆生产未激活**：agent_memory 0 行 + agent_sessions 仅 1 行。表结构真实但写入路径在生产数据中无证据 | DB 实测（K3 补查） |

### P2（可选改进）

| # | 发现 | 证据 |
|---|------|------|
| P2-1 | MCP 命名与实质不符：自研 JSON-RPC 桥接使用 "MCP" 目录名/别名，官方协议字面量 0 命中，存在"标准化"误导 | §二-5、§三-c |
| P2-2 | "10 provider" 文档口径：4 个内置适配器 vs 10 个 manifest 定义未区分 | §三-b |
| P2-3 | 任务书命令健壮性：全部 `sqlite3 ... 2>/dev/null` 在无 sqlite3 的环境**静默失败**（exit=127 被吞）；`find --include` 非法选项。若执行者不诚实，将产出"假空结果"冒充证据 | 扫描报告命令适配说明 + K3 复现 `which sqlite3` 失败 |

## 五、测试验证记录（T1/T2/T3 适用性）

| 步骤 | 适用性 | 说明 |
|------|--------|------|
| T1（干净快照） | 不适用 | 审计对象是当前工作树 + 生产库现状的能力存在性，非某个 commit 的测试套件 |
| T2（当前工作树） | **已执行** | 本报告全部 grep/DB 实测均在当前工作树与 `data/synova.db`（只读）上完成 |
| T3（故障注入） | 未执行，无触发条件 | 本次扫描未声明任何 fail-open/降级逻辑需要注入验证（对比：D328 的 fail-open 是门禁脚本场景）。P1-1 恰好是反向案例——failover 路径**不存在**，故无可注入对象；修复 P1-1 时**必须**附带故障注入测试（见 §六发现 1） |

## 六、L4 防线缺口收割

> "本次发现的问题，控制塔哪一道防线本该拦住？为什么没拦住？缺什么？"

### 发现 1：LLM 运行时 failover 缺失，但"Provider 降级"长期作为能力叙述存在（P1-1）

**本该拦住的防线**: 铁律 5（后端能力 ≠ 用户可用功能）+ 铁律 0-2 接线验收 + 铁律 48（降级路径测试）
**为什么没拦住**: failover 是**运行时行为路径**（主 provider 抛错 → catch → 切换重试），不是 export/import 接线——静态 WIRE CHECK 全过也无法发现；铁律 48 要求"降级路径测试"，但现有测试只测成功路径与错误分类，没有任何"主 provider 注入故障 → 断言发生切换"的测试。
**缺什么**: 降级能力的**故障注入测试契约**——凡声称"可降级/可切换"的模块，验收测试必须包含一次真实故障注入（mock 主 provider 抛错），断言备用路径被接管；无此测试，"降级"二字不得进入能力文档。

### 发现 2：执行跟踪闭环在 schema 层未建成 + 记忆能力零数据流转（P1-2/P1-3）

**本该拦住的防线**: 铁律 1（垂直切片交付：入口→交互→结果）+ 铁律 7（Done 标准：结果可见）
**为什么没拦住**: 现有门禁验证"代码存在"（表 DDL 在代码里 ✅、INSERT 语句在代码里 ✅），不验证"**数据流转过**"。actions/feedback_log 的 DDL 以 `CREATE TABLE IF NOT EXISTS` 惰性存在，通过了一切静态检查，但生产库证明建表语句从未执行——代码真实与能力激活之间没有防线。
**缺什么**: 能力声称的**数据流证据验收**——闭环类能力（跟踪/记忆/回流）的 Done 标准增加一条："生产库或测试库中至少有 1 条端到端流转记录"（首跑证据）；或部署后 checkpoint（checkpoint-deploy.sh）增加关键表存在性 + 行数断言。

### 发现 3：任务书命令在无 sqlite3 环境静默失败（P2-3）

**本该拦住的防线**: 任务书模板自身的命令设计规范
**为什么没拦住**: 任务书 8 项命令中 3 项含 `sqlite3 ... 2>/dev/null`——stderr 被吞后，命令不存在与查询结果为空**输出不可区分**（与 K3 20260813 报告 P0-3"fail-open 同态"完全同型的病，发生在审计基础设施自身）。本次靠执行者诚实记录 + K3 独立复现兜底，但机制上没有防线。
**缺什么**: 任务书模板禁用裸 `2>/dev/null`；改为前置 `command -v sqlite3 || echo "MISSING: sqlite3"` 显式分支。审计类任务书命令的退出码必须作为证据的一部分输出。

---

## 七、交接与可复核入口

- 本报告输出至 `docs/synova/audit-reports/AGENT-INFRASTRUCTURE-AUDIT-20260814.md`（**未 git add**——按任务书交接约定，提交动作留给后续批次与扫描报告一并处理）。
- K3 本次复核命令（全部可重放）：
  - `grep -rn "tenantId\|enterpriseId\|orgId\|workspaceId" src/agent/ src/routes/ src/store/ --include="*.ts" | wc -l` → 288
  - `grep -rn "fallback" src/providers/ --include="*.ts"` → 仅 `llm-provider-loader.ts:4`（注释）
  - `grep -rn "ModelContextProtocol" src/ --include="*.ts" | wc -l` → 0
  - `python`（3.11，只读模式打开 `data/synova.db`）：52 表；org_id 表 5 个；agent_sessions=1、agent_memory=0、sentinel_baselines=580、sentinel_tickets=0；actions/feedback_log = no such table
  - `which sqlite3` → 不存在（扫描报告的命令适配声明属实）

*报告完。K3 独立审计，全部结论以可 grep/可执行的物理事实为依据。*

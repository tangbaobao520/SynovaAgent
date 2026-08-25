# Task Brief: AGENT-INFRASTRUCTURE-SCAN — 8 项 Agent 基础能力物理扫描（只读）

> 生成: 2026-08-15 | 分支: feat/agent-infra-scan | 角色: Claude Code (Win)

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统（组织数字孪生诊断 + 持续增长导航系统）。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于**审计/文档**类——不写产品代码，只读扫描 + 输出报告。
执行依据: docs/synova/coordination/AGENT-INFRASTRUCTURE-SCAN-TASK.md（创始人下达的 8 项扫描清单）。
产出: docs/synova/audit-reports/AGENT-INFRASTRUCTURE-SCAN-20260814.md（任务指定文件名，含 20260814 日期）。

### b) 文件审计
- 8 项扫描全部是 grep/sqlite 只读查询，零代码修改
- 输出文件 docs/synova/audit-reports/ 目录已存在（同目录已有 D328-D366 各审计报告，命名惯例一致）
- 任务指定输出文件名 AGENT-INFRASTRUCTURE-SCAN-20260814.md，此前不存在（本次首次生成）
- sqlite3 CLI 在本机不可用 → 用 Python 标准库 sqlite3 只读模式完成等价 schema 查询（报告注明）

### c) 决策
按任务文件逐字执行 8 项命令；sqlite3 CLI 缺失时以 Python stdlib 等价替代并记录原因（不静默省略，失败必留痕）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC: 任务文件给出命令 + 模板 + 验收标准（8 项全执行、PASS/PARTIAL/FAIL 判定、原始输出保留）
② 测试: 本任务无测试环节（只读扫描，无代码产出）
③ 实现: 执行命令 → 记录输出 → 按模板填写判定
④ 接线: 报告落位 docs/synova/audit-reports/ + 通知 K3
⑤ 验证: 输出文件存在 + 8 行汇总表齐全 + 原始 grep 结果粘贴

引用依据:
  - 铁律 47: 契约优先——本任务契约 = 任务文件的 4 条验收标准
  - memory: 2026-08-06-D316-dev-doc-verification（"实测"声称必须可复核——原始输出全保留，不做主观过滤）
  - skill: windows-compat（模式 3: UTF-8 强制；模式 2: PATH 差异——sqlite3 CLI 不在 PATH 属已知环境差异，以 Python 等价替代并注明）
  - 任务文件自身: docs/synova/coordination/AGENT-INFRASTRUCTURE-SCAN-TASK.md

### b) 本任务执行约束
  - rule: "只读扫描——不修改任何 src/ scripts/ 代码"
    verify: "git diff --name-only 仅含 docs/synova/audit-reports/ 新文件"
  - rule: "sqlite3 失败必须记录原因，不得静默省略"
    verify: "grep -c 'sqlite3 不在 PATH' docs/synova/audit-reports/AGENT-INFRASTRUCTURE-SCAN-20260814.md"

### c) 决策参考系（记录要求：参考系 + 结论）
决策点 1: sqlite3 CLI 缺失时的等价查询方案。
参考：第一性原理（扫描目的是验证 schema 物理事实，不是验证 CLI 存在）+ Anthropic（机器可验契约——Python stdlib sqlite3 只读模式产出同等可复核证据）。
结论：Python sqlite3 只读查询 + 报告注明替代原因。

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- docs/synova/audit-reports/AGENT-INFRASTRUCTURE-SCAN-20260814.md — 新建。8 项扫描结果 + 汇总表 + 总体判定 + 交叉引用

不做什么：
- 不修改 src/ 与 scripts/ 下任何代码文件（只读扫描）
- 不修改 scripts/audit/ 下任何文件（审计红线，K3 专属）
- 不修改 docs/synova/coordination/AGENT-INFRASTRUCTURE-SCAN-TASK.md（任务文件本身）
- 不执行 K3 的最终判定环节（交接给 K3 输出 AGENT-INFRASTRUCTURE-AUDIT-20260814.md）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：docs/synova/coordination/AGENT-INFRASTRUCTURE-SCAN-TASK.md 下达
处理（中间经过哪些步骤）：8 项 Bash grep/sqlite 扫描 → 原始输出收集 → 按模板逐项判定 PASS/PARTIAL/FAIL
结果（最终展示在哪）：docs/synova/audit-reports/AGENT-INFRASTRUCTURE-SCAN-20260814.md（8 行汇总表 + 原始输出 + 总体判定 + 与诊断链路审计交叉引用）→ 通知 K3 读取

## 文档引用
- docs/synova/coordination/AGENT-INFRASTRUCTURE-SCAN-TASK.md — 任务全文（命令清单 + 判定标准 + 模板）
- docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md — 交叉引用对象（诊断链路审计）
- docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md — 铁律 0-3 PR 工作流（报告提交走分支+PR）

## 接口审计（从代码 grep，非凭记忆）
- src/agent/conversation-engine.ts:258 — class ConversationEngine（能力 2 判定依据）
- src/providers/detect.ts:22 — provider 检测优先级链（能力 4 判定依据）
- src/agent/diagnosis-launcher.ts:78 — phaseLabels 六阶段事件（能力 7 判定依据）
- src/store/session-store.ts — session 持久化（能力 3 判定依据）

## 架构层: L5 存储 + L1 交互（扫描对象覆盖 L1-L5；本任务本身为文档层）
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [ ] DS1: 8 项命令全部执行，原始输出粘贴进报告（含 sqlite3 失败原因记录）
- [ ] DS2: 汇总表 8 行全部有 PASS/PARTIAL/FAIL 判定
- [ ] DS3: 输出文件 docs/synova/audit-reports/AGENT-INFRASTRUCTURE-SCAN-20260814.md 存在且按模板结构
- [ ] DS4: 独立分支 feat/agent-infra-scan 提交 + 推送 + 通知 K3

# TRIAGE-CLASSIFICATION-20260820.md — 未定性文档分类台账（任务 B）

> 执行：DSH | 2026-08-20 | 依据：doc-triage UNK 50 份 + 全仓库引用检查（grep）
> 结论：**50 份中 48 份保留（均有实际引用），2 份归档**——"未定性"多数是启发式误报，
> 不是死文档；引用证据见下。

---

## 一、归档（2 份，已移入 docs/archive/）

| 文件 | 原位置 | 为什么归档 |
|---|---|---|
| 08-代码审计报告-20260603.md | docs/ | 2026-06-03 一次性审计报告（45 项问题 P0-P3）；已被 docs/synova/audit-reports/（2026-08 起）体系取代；无消费方（仅旧 INDEX/DOCUMENT-INVENTORY 提及） |
| REMEDIATION-PLAN-20260603.md | docs/audit/ | 2026-06-03 整改计划；已被后续审计闭环取代；无消费方（仅 DOCUMENT-INVENTORY 提及） |

## 二、保留-哨兵 spec 体系（23 份）

SENTINEL-PANORAMA.md、SENTINEL-GAP-D1-D4-D5.md、SPEC-sentinel-adapters.md、
docs/specs/sentinels/ 19 份（api-accessibility/cash-flow/cpc/customer-dynamics/data-readiness/data-silos/
eob/gap-dynamics/hacd/hona/htm/integration-health/key-person-risk/path-dependency/protocol-coverage/
revenue-decomposition/self-awareness/seven-powers/token-economics）
→ 证据：各 spec 互相引用（"详见 SENTINEL-PANORAMA.md"）+ 旧 docs/INDEX.md 收录；哨兵体系设计基线

## 三、保留-D# 开发文档（17 份，docs/plans/codex/implementation/）

SYNOVA-IMPL-*（11）：上层适配迁移/本体层重建/NCI技术开发文档/NCI非共识检测/对标补全/桌面应用/
紧急修复P0P1/进化体系升级/JTBD哨兵工程实施方案/审计修复50aggregate
SYNOVA-AUDIT-*（6）：compute函数存在性验证/inline计算逻辑审计/JTBD增量gap分析/kv-aggregates/
L3双轨并行审计/traversal-aggregates
→ 证据：K3 审计协议（AUDIT-PROTOCOL/KIMI-AUDIT-INSTRUCTION）、协调文档（ROLES/DSH-DEVDOC-MODE/
PARALLEL-DISCIPLINE）、VERIFY-PROTOCOL、DASHBOARD 均引用 docs/plans/codex/implementation/ 的 D# 文档；
此为 dev-line 工作区与任务账本，不得移动

## 四、保留-被引用散件（8 份）

| 文件 | 引用证据 |
|---|---|
| docs/workflow/ANTHROPIC-WORKFLOW.md | AGENTS.md L247 + CLAUDE.md L631（"详细设计"引用） |
| docs/07-TEST-STRATEGY-20260605.md | packages/test-kit/README.md（"对应文档"引用） |
| docs/CODEX-WORKFLOW.md / CODEX-TASKS-20260611.md | WORKLOG-20260611 + 旧 INDEX 收录；Codex 工作流档案 |
| docs/PACKAGES.md | 旧 docs/INDEX.md（monorepo 包结构） |
| docs/LOOP-ENGINEERING-SYSTEM.md | memory/session-2026-06-17（待更新遗留清单） |
| docs/research/AI-CODING-QUALITY-CONTROL-20260614.md | 旧 docs/INDEX.md（外部专家评审用） |
| docs/research/HANDBOOK-TO-CODING-AGENT.md | 旧 docs/INDEX.md |
| docs/specs/fix-layer-violations-sentinel-health.md | 旧 docs/INDEX.md（哨兵健康修复） |

---

*执行后：重跑 doc-triage → UNK 由 50 降至 48（2 份转 ARCH）；本台账为任务 B 交付物。*

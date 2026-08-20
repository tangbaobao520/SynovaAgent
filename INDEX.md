# INDEX.md — Synova 文档导航总图

> 本文件是文档体系的"地图"：从哪开始读、每类材料在哪、谁负责维护。
> 最后更新：2026-08-19 | 维护：DSH（架构线） | 状态：draft v1（待创始人确认）
> ⚠️ **历史档案库（三代）**：`D:\novis-backup-20260526\`（E 盘原始目录已不存在，这是唯一幸存副本）

---

## 0. 阅读入口（按顺序）

| 顺序 | 文档 | 谁读 | 回答什么问题 |
|---|---|---|---|
| 1 | `START-HERE.md` | 新伙伴（人/Agent） | 我该先读什么 |
| 2 | `CHRONICLE.md` | 所有人 | 我们怎么走到这里的（三代史） |
| 3 | `docs/authority/PRD.md` | 所有人 | 我们在做什么、为谁、为什么 |
| 4 | `docs/authority/ARCHITECTURE.md` | 所有人 | 系统现在怎么运转（人话版） |
| 5 | `docs/authority/STATUS.md` | 创始人/管理者 | 现在做到哪了 |

## 1. 权威层（现状文档 = 机器验证；历史文档 = 诚实带时间戳）

| 文档 | 位置 | 类型 |
|---|---|---|
| 导航总图 | `INDEX.md`（本文件） | 入口 |
| 入职路径 | `START-HERE.md` | 入口 |
| 项目编年史 | `CHRONICLE.md` | 史记主线 |
| 产品需求（当前） | `docs/authority/PRD.md` | 现状 |
| 系统说明（人话版） | `docs/authority/ARCHITECTURE.md` | 现状 |
| 当前状态 | `docs/authority/STATUS.md` | 现状 |
| 文档台账 | `docs/authority/DOCS-REGISTRY.yaml` | 元数据 |
| 治理机制设计 | `docs/authority/GOVERNANCE.md` | 元数据 |

**纪律**：描述"现状"的文档只能住这一层（被机器验证）；其余一律是历史，必须带日期与状态，永不冒充现状。

## 2. 九类沉淀（虚拟分类 → 物理位置）

> 物理目录尽量不动（避免断链），分类靠"类型标签 + 台账"实现。新增文档先查 `DOCS-REGISTRY.yaml`。

| 类 | 内容 | 现有物理位置 |
|---|---|---|
| 1. prd-archive | 历史 PRD | `docs/SYNOVA-TECH-PLAN-PRD-v1.6.md`（过时）；`D:\novis-backup-20260526\Novis\OpenClaw+X-全览\ClawOrg-BOX-PRD-v2.0-Final.md` |
| 2. research | 研究文档 | `docs/synova/research/`（权威文档 01-18、A/B/C 线审计）；`docs/research/`；`D:\novis-backup-20260526\Novis\docs\02-Strategy-战略策略\` |
| 3. knowledge | 可复用知识 | `memory/project-state-*.md`；`knowledge/shared/`；`D:\novis-backup-20260526\Novis\📖 知识库\` |
| 4. pitfalls | 踩坑档案 | `memory/*.md`（20 份教训卡）；`docs/lessons/`；`D:\novis-backup-20260526\Novis\docs\07-Lessons-踩坑录\`；`claude-backup-20260525\projects\E--ClawOrg-BOX\memory\pitfalls-log.md` |
| 5. retrospectives | 复盘/审计 | `docs/synova/audit-reports/`（13+ 份）；`docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md`；`D:\novis-backup-20260526\Novis\docs\10-AuditAndEvolution-审计演化\` |
| 6. decisions | 决策记录 | `docs/DECISION-*.md`；`docs/synova/coordination/DECISION-REFERENCE.md`；`D:\novis-backup-20260526\Novis\docs\03-DesignDecisions-决策记录\`（30 份） |
| 7. dev-docs | 开发文档 | `AGENTS.md` / `CLAUDE.md` / `LOOP.md`（技术权威）；`docs/specs/`；`D:\novis-backup-20260526\Synova-Engine\dev-docs\` |
| 8. drafts | 草稿（未启动） | `docs/plans/` 未实施部分；`D:\novis-backup-20260526\Novis\OpenClaw+X-全览\V1.5-规划\` |
| 9. diary | 日记/工作日志 | `WORKLOG-*.md`；`memory/session-*.md`；`D:\novis-backup-20260526\Novis\work-records\`；`claude-backup-20260525\projects\E--ClawOrg-BOX\memory\work-session-*` |

> **机器版九类索引**：`bash scripts/doc-system/doc-categories.sh`（603 文件自动归位，2026-08-19 实测）

## 3. 三代历史档案库（材料索引）

| 时代 | 位置 | 说明 |
|---|---|---|
| 三代 | `D:\novis-backup-20260526\` | **唯一幸存的历史档案库** |
| ClawOrg | `Novis\全局规划\`、`Novis\OpenClaw+X-全览\`、`Novis\work-records\`、`claude-backup-20260525\projects\E--ClawOrg-BOX\memory\` | 定位/白皮书/工作记录/会话记忆 |
| Novis | `Novis\docs\`（12 类 + Archive 433+）、`Synova-Engine\`、`Novis\box\` | 文档体系/引擎/桌面端 |
| Synova | 当前工作区 `synova-agent\`、`synova-session-01~04`、各 `synova-wt-*` | 现役 |
| 旁证 | `D:\Git项目研究\`（claw-code-main / openclaw-main 等）、`D:\EasyClaw` | 理解 ClawOrg 时代技术底座 |

## 4. 旧索引与 Agent 文档（保留引用，不更新）

- `docs/INDEX.md` — 2026-06-14 旧索引（agent 时代）
- `AGENTS.md` / `CLAUDE.md` / `LOOP.md` — Agent 操作手册（技术权威，机器门禁保护）
- `docs/synova/DASHBOARD-CN.md` — 任务看板（`scripts/control-tower/gen-task-board.py` 自动生成）

## 5. 治理机制状态

| 机制 | 状态 |
|---|---|
| 登记门禁（新文档进台账） | ✅ 已实施 v1 + **已接线 pre-commit**（untracked + staged 检查） |
| 真相验证（check-doc-truth.sh） | ✅ 已实施 v1 + **已接线 pre-commit**（全绿） |
| 过期标记（doc-staleness.sh） | ✅ 已实施 v1（`scripts/doc-system/`） |
| 月报生成（generate-chronicle-monthly.sh） | ✅ 已实施 v1（`scripts/doc-system/`，首跑暴露 8 月日记断更） |
| 一次性清理（doc-triage.sh） | ✅ 已实施 v1（537 文件 1.4s 盘点：KEEP 15/ARCH 24/NEW 448/UNK 50；分流待创始人审阅） |
| 入职路径（START-HERE.md） | ✅ 已完成 |

---

*本文件为文档体系的地图，随体系演进更新。*

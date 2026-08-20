# SYSTEM-HEALTH.md — 文档体系健康快照

> 生成：2026-08-19 | 维护：DSH 架构线 | 状态：draft v1（随体系演进更新）
> 目的：一眼看清文档体系"建了什么、跑得怎样、还剩什么"。

---

## 一、体系组件（入口 3 + 权威层 6 + 机制 6 + 测试 5）

| 层 | 组件 | 状态 |
|---|---|---|
| 入口 | `CHRONICLE.md`（三代史） / `INDEX.md`（地图） / `START-HERE.md`（入职） | ✅ |
| 权威层 | `docs/authority/` PRD / ARCHITECTURE / STATUS / DOCS-REGISTRY / GOVERNANCE / DRIFT-LEDGER / SYSTEM-HEALTH | ✅（PRD/ARCHITECTURE/STATUS 为 draft，待创始人确认） |
| 机制 1 登记门禁 | `scripts/doc-system/doc-registry-gate.sh` | ✅ 已实施 + **已接线 pre-commit**（untracked + staged 检查，测试 8/8） |
| 机制 2 真相验证 | `scripts/doc-system/check-doc-truth.sh` | ✅ 已实施 + **已接线 pre-commit**（全绿；仅文档变更触发） |
| 机制 3 过期标记 | `scripts/doc-system/doc-staleness.sh` | ✅ 已实施 |
| 机制 4 月报生成 | `scripts/doc-system/generate-chronicle-monthly.sh` | ✅ 已实施，6/7/8 月草稿已生成 |
| 机制 5 一次性清理 | `scripts/doc-system/doc-triage.sh` | ✅ 已实施，537 文件盘点完成 |
| 九类沉淀索引 | `scripts/doc-system/doc-categories.sh` | ✅ 已实施，603 文件自动归位 |
| 月报定时包装 | `scripts/doc-system/chronicle-monthly-wrapper.sh` + `install-chronicle-schedule.sh` | ✅ 已实施（2026-08-20；安装器 dry-run 验证） |
| 机制 6 入职路径 | `START-HERE.md` | ✅ |
| 手册指引 | AGENTS.md / CLAUDE.md「文档体系」章节 | ✅ 已补（2026-08-20——所有 agent 一开始就知道规则） |
| 测试 | `tests/doc-system/*.test.sh` ×6 | ✅ 全过（真相 5 / 月报 9 / 清理 8 / 门禁 9 / 过期 4 / 分类 14 = 49 断言） |

## 二、真实仓库验收（2026-08-19）

| 检查 | 结果 |
|---|---|
| 真相验证 C1 专家数 | ✅ 全绿（AGENTS/CLAUDE/README = 7，registry = 7） |
| 真相验证 C2/C3 | ❌ 3 处漂移（CLAUDE.md 8 组、LOOP.md 8 组、LOOP.md V4.4.5）→ DRIFT-LEDGER 跟踪 |
| 登记门禁 | ✅ 11 个新文档全部已登记（实战拦截 K3 审计标准 v2 未登记项 → 已补登记） |
| 过期标记 | ✅ 权威层 9 份全部新鲜 |
| 月报生成 | ✅ 2026-06（7 月 516 commits / 8 月 369 commits / 任务至 D457） |
| 一次性清理 | 546 md / 6.1MB：KEEP 23 / ARCH 27 / NEW 448 / UNK 48 / DEL 0（2026-08-20 任务 B：2 份归档，见 TRIAGE-CLASSIFICATION） |
| 九类沉淀索引 | 603 文件：devdoc 262 / research 162 / draft 37 / archive 24 / pitfall 18 / retrospective 16 / knowledge 15 / governance 12 / diary 11 / decision 1 / unclassified 45 |

## 三、历史档案（三代，只读）

- 唯一档案库：`D:\novis-backup-20260526\`（E 盘原始目录已消失）
- ClawOrg：`Novis\全局规划\`、`Novis\OpenClaw+X-全览\`、`Novis\work-records\`、`claude-backup-20260525\projects\E--ClawOrg-BOX\memory\`
- Novis：`Novis\docs\`（12 类 + Archive 433+）、`Synova-Engine\`
- Synova：当前工作区（git 1684 commits）

## 四、待创始人事项

1. ~~4 个编年史问题~~ ✅ **已答（2026-08-20 口述）**，已补录 CHRONICLE 与 PRD
2. ~~任务 A/B/C~~ ✅ **全部完成**（漂移同步/UNK 定性/门禁接线）
3. ~~手册指引~~ ✅ AGENTS.md/CLAUDE.md 已补「文档体系」章节（所有 agent 必读）
4. ~~半自动闭环~~ ✅ 月报定时包装 + 安装器已建；stale 规则已入手册
5. **交付执行（剩余实质项）**：按 `COMMIT-PLAN-20260820.md` 分批提交进 git（含 K3 审计门禁改动）——**未提交 = 未交付**
6. **收尾决策**：权威层 draft 转 active；6/7/8 月草稿审阅并入 CHRONICLE；月报定时器实际安装（`install-chronicle-schedule.sh --install`）
7. 剩余 2 个编年史小问题（04-27/28 密集定位背景、06-03 独立仓库决策背景）——不阻塞，可随时补

## 五、日常维护（创始人零负担）

- 月报：每月 1 号跑 `bash scripts/doc-system/generate-chronicle-monthly.sh YYYY-MM` → 审阅草稿 → 追加 CHRONICLE（可委托）
- 真相验证：`bash scripts/doc-system/check-doc-truth.sh`（提交前跑，或未来接线 pre-commit）
- 其余机制自动/按需

---

*本快照随体系演进更新；组件清单与状态变更时同步。*

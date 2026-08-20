# GOVERNANCE.md — 文档体系治理机制（设计稿）

> 状态：设计 v1（2026-08-19）| 实施：待创始人确认后开发（脚本归 DSH 架构线，K3 独立审计）
> 原则：**硬阻断 100% 有效，软机制 0% 有效**——文档规范必须机器化，不能靠自觉。

---

## 六个机制（契约）

| # | 机制 | 契约（输入 → 动作 → 输出） | 状态 |
|---|---|---|---|
| 1 | **登记门禁** doc-registry-gate | 新文档必须登记进 `DOCS-REGISTRY.yaml`（type/status/owner 合法，type ∈ 枚举）→ 缺失或非法 → **pre-commit 硬阻断** | ✅ 已实施 v1 + **已接线 pre-commit**（2026-08-20：`scripts/pre-commit-check.sh` 附加门禁块，untracked + staged 新增均检查；测试 8/8） |
| 2 | **真相验证** check-doc-truth.sh | 权威层文档中的可验证声明（版本号/组数/专家数/文件路径）vs 代码与脚本实际 → 不一致 → **硬阻断** | ✅ 已实施 v1 + **已接线 pre-commit**（2026-08-20；首跑 5 处漂移全部修复，真相验证全绿；仅文档变更时触发） |
| 3 | **过期标记** doc-staleness.sh | 史记层文档超期未更新（如 90 天）→ 自动标记 `stale` → agent 注入时不再当"现状"引用 | ✅ 已实施 v1（`scripts/doc-system/doc-staleness.sh`，2026-08-19；真实仓库全部新鲜） |
| 4 | **月报生成** generate-chronicle-monthly.sh | 每月聚合 WORKLOG/memory/git commit/审计报告 → 生成月度史记草稿 → 人工审阅后追加 CHRONICLE.md | ✅ 已实施 v1（`scripts/doc-system/generate-chronicle-monthly.sh`，2026-08-19；首跑 2026-08 草稿：369 commits / D457 / 暴露 8 月日记断更） |
| 5 | **一次性清理** doc-triage.sh | 盘点全部文档（docs/ 532 份 + 根目录 + memory/）→ 三档分流（保留/归档/删除）→ 死文档进 `docs/archive/` 并立墓碑 | ✅ 已实施 v1（`scripts/doc-system/doc-triage.sh`，2026-08-19；537 文件 1.4s 盘点：KEEP 15 / ARCH 24 / NEW 448 / UNK 50；分流执行待创始人审阅） |
| 6 | **入职路径** START-HERE.md | 新人固定阅读顺序（人/Agent 两版） | ✅ 已完成 |

## 优先级（实施顺序）

- **P0**：机制 2 真相验证——先解决"信不过"（当前最高频伤害）→ **已实施 v1 + 已接线 pre-commit**（2026-08-20；首跑检出 5 处真实漂移全部修复，全绿）
- **P1**：机制 1 登记门禁 + 机制 5 一次性清理——解决"混乱"与"膨胀"→ **均已完成 + 登记门禁已接线 pre-commit**（triage 盘点完成 + 任务 B 归档执行）
- **P2**：机制 3 过期标记 + 机制 4 月报生成——解决"史记断更"→ **均已完成 v1**
- ~~**待决策**：门禁接线~~ ✅ **已完成（2026-08-20 创始人批准任务 C）**——真相验证 + 登记门禁已挂进 pre-commit 附加门禁块，文档漂移/未登记在提交时自动硬阻断

## 文档分类（type 枚举，登记门禁用）

```
navigation | onboarding | chronicle | prd | architecture | status | registry | governance |
research | knowledge | pitfall | retrospective | decision | devdoc | draft | diary | archive
```

## 归属与审计

- 脚本实现：DSH（架构线）
- 脚本审计：Kimi K3（独立审计线，不碰开发）
- 每类文档 owner：见 `DOCS-REGISTRY.yaml`（默认 DSH；PRD 需创始人确认）

## 与本项目既有机制的衔接

- 复用既有 pre-commit 管线（13 组之外新增组，或并入现有组）
- 复用既有文件驱动哲学（manifest/台账/门禁——本项目已验证"物理阻断"有效）
- 复用既有审计线（K3）与 claim-verifier skill（声明必须物理可证）

---

*本设计稿待创始人确认后进入实施。*

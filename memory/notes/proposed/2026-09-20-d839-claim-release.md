---
状态: proposed
日期: 2026-09-20
决策: 认领制引入**「完成即释放」**——认领 brief 所属任务一旦完结，该 brief 对文件的占位即失效；释放证据存**仓库内 git 跟踪的权威状态**（`task-state/<D#>.json` 的显式 `status` ∈ {impl_done, audited}，或 `task-state/claim-releases.json` 显式释放台账，或 session 已归档），**不存 brief 文本、不存 gitignore 掉的本地 registry**。判定收敛到单一事实源 `scripts/control-tower/claim_release.py`；`resolve-commit-brief.sh` 在**候选池入口**剔除已释放 brief（源头），`staging_guard.py` 保留一层防御（降 warn + 打印释放理由，不再 block）。
理由: 认领制的候选池只看 brief 里 Q2 的**字面路径**，不看该 brief 所属任务是否已完成 → 任何历史 brief 提及过的文件对后续所有任务**永久锁死**。实证：2026-09-19 D838 登记两条新线时被**已完成并合入**的 D806 brief 阻断（`staging_guard.py` 输出 `status=block`、`owner_session=2026-09-18-D806-台账修复…`）；2026-09-20 实测全仓 167 份已完结任务的 brief 仍在认领文件，其中 `docs/synova/product-lines/` 与 `docs/synova/project/` 两族 **16 份**（`product-lines.yaml` 被 4 份同时认领）。D806 那次按创始人裁定的「改 brief 文本释放」（ASCII `/` → 全角 `∕` U+2215，PR #653）是**一次性文本操作**：只解一份，且任何把文本改回 ASCII 的正常动作都会让认领复活。故改为状态层释放。
理由补充（**实测否决的口径，留证防重犯**）: 直接用 `gen-cto-health.py` 的 D393 全量派生口径（`git log --all` 含 `(D#)` 即 impl_done）判释放，两族失效认领从 16 涨到 **24**，多出的 7 个含 **D711 / D819（均 `status=claimed`，进行中）**——按该口径释放 = 真实破坏并发保护（违反「进行中仍必须拦」）。故释放判定**只认显式 status 声明**，拿不到证据一律不释放（fail-closed）。这与 `staging_guard` 既有的 fail-open（registry 缺失 → degraded pass）方向相反，两类降级必须在代码里显式区分。
---

## 落地

- **单一事实源**: 新建 `scripts/control-tower/claim_release.py` —— `is_released()`（判定 + `basis` 依据字段）、`scan`（批量扫描失效认领）、`release` / `release-stale`（批量释放，原子写台账）。契约（铁律 47）写在文件头：退出码 0/1/2 三态；降级 = task-state 不可读/无 status/JSON 损坏 → 不作为释放证据 + `degraded: true`（铁律 24/31）。
- **源头剔除（6 消费者共享）**: `scripts/workflow/resolve-commit-brief.sh` 在认领计数前剔除已释放 brief，并向 stderr 发 `SYNO-RELEASED-CLAIM\t<brief>\t<D#>\t<basis>\t<detail>`。该 resolver 有 6 个生产消费者（G12 Task Scope / commit-msg-check / check-verifiable-done / check-plan-integrity / check-brief-vs-code / staging_guard），任一拿到「已完成任务的 brief」都会按错任务校验——故改在源头而非逐处补救。无暂存文件时（CI 干净检出）行为与修复前逐字节一致。
- **防御纵深 + 可执行文案**: `scripts/control-tower/staging_guard.py` 认领制段加释放维度（已释放 → `status=warn` + `released_claims` + `release_reason`，不再 block）；block 时附 `release_cmd` 字段。`scripts/control-tower/synova-commit` 的 block 文案由「请先与对应 session 协调」改为三条**可执行**出路（释放 / 让出 / 移出暂存），warn 时打印释放理由（谁被释放 + 依据）。
- **持久化**: 释放状态写 `task-state/claim-releases.json`（git 跟踪 → 跨 worktree / 跨机生效；`.codex/control-tower/session-registry.json` 被 `.gitignore:58` 忽略，不能作为唯一载体）。因状态不在 brief 文本里，`declare-write-set.sh` 重跑（只重写「## 写集（机器生成，禁手改）」块）不可能复活认领——场景 C 夹具实测：显式释放 + status 漂移回 `claimed` + brief 路径改回 ASCII + `declare-write-set.sh` 重跑 → 认领**不复活**。
- **批量清账**: 本仓两族 16 份已释放（`D404 D408 D410 D430 D572 D576 D589 D590 D592 D593 D712 D713 D714 D795 D809 D817`）。
- **红线自证**: `scripts/audit/**` 0 触碰；判定源不含本机路径；沙箱夹具含「不越界写入真实仓库」指纹断言（自测期曾把 167 条误写进工作树台账，已修夹具并加围栏）。

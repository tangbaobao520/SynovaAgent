# 决策 Note — 小队行为纪律技能化（synova-dsh persona 精简）

- 状态: proposed（待 K3 审 + 创始人确认后 git mv 到 implemented/）
- 责任方: synova-cto
- 触发: 创始人 2026-09-23——「编码 session（纪律模式）现在似乎也名存实亡，有哪些可取的、和控制塔不冲突的可以保留，给到小队，也可以变成 skill，你自行决定」

## 决策

**保留能力、去掉抄本**：原 `synova-dsh` persona 128 行中，约**七成**是硬门禁已在执行的条款（as any / 架构边界 / 桥接 / 契约 / 空壳测试 / 分支命名 / vitest 全绿 / pre-commit 组数）。
- 这些**删**：软抄本 = 噪音 + 数字漂移（M7）；V3.9 教训「硬阻断 100% 有效，软机制 0% 有效」。
- **7 类门禁抓不到的保留**，收进新 skill `squad-discipline`（6 节 17 条）：① 锚定三问与停线（防跑偏）② 声称↔证据逐条对应（防自欺）③ 自检 5 问（语义项）④ 技术自决 D333 四步（不甩创始人）⑤ 审计免疫与"同类第二次升级" ⑥ 隔离工作树/禁 stash/取号必走分配器 ⑦ 上限与串行（成员 ≤4 / 自验独立 / PR ≤12）。
- persona 精简为 45 行：身份（小队执行内核）+ 12 步 SOP + 指向脚本/CI 为单一事实源 + 技能路由（16 技能按场景）。
- 队长预设（`synova-squad-lead`）追加「队内行为纪律」段并接线两个 skill（`squad-discipline` / `dev-doc-spec`）。

## 依据（可核）

- 原 persona 副本：`docs/synova/coordination/dsh-preset-draft/persona.md`（精简前 128 行，git 历史可查）
- 门禁单一事实源：`scripts/pre-commit-check.sh`（13 组）/ `.github/workflows/ci.yml` / `scripts/pre-push-check.sh`
- 与 D922 的分工：D922 管"谁写规格"（dev-doc 退役技能化），本件管"执行者守什么"（纪律技能化）

## 风险

- persona 精简后，若某 session 未加载 `squad-discipline`，则失去那 7 类自持纪律 → **接线要求**：派单件必须写「按 squad-discipline 执行」，队长在开工时确认全队加载（已写入队长预设）。
- persona 是安装源（`persona-block.yml`）→ 与 `persona.md` 必须逐字一致（已双写；预设安装测试 T1/T2 覆盖）。

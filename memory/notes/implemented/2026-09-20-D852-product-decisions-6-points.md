---
状态: implemented
日期: 2026-09-20
决策: 把创始人裁定表 §6-5 四项产品决定落成 6 个**可证伪**验收点（线 3 +1 / 线 4 +1 / 线 8 +2 / 线 25 +2，只加验收点、**不新增线**、28 线不变），并把 live/restart 清单成文 + 起草 V1 轻量变更单（分母 128 → 134）。四项决定一律按 **M1 复用口径**落：与 DSH 已有能力重叠的三项（spill / settings live-restart / time-context）写成「接入/配置/约束 DSH 的 <能力>并验证」；DSH **无**出站能力的 webhook 出站点显式标注「M1 不适用（自建）」。全部判定式一律为**行为/不变量断言**，**禁止以 grep 命中作为通过判据**（总纲 §5 + 研究院撤回清单 #3）。
理由: ① 四项决定是**产品定义**而非技术实现，落成验收点时必须写实到可证伪（判定式 + verify/证据类型 + fail_when + 依赖），否则重演"批十四样板污染"（空话式验收点）。② 每条的归线依据来自 `产品完成度定义与推进总纲-20260918.md` §2.1 的「11 项 DSH 缺口归线不新开」——**施工图四色清单未覆盖这四项**（实测：施工图对 webhook 仅 1 处命中且指客户配置包，对 spill/settings/时间上下文零命中），故不虚构施工图依据。③ 实测到两个必须记录的**版本/口径陷阱**：DSH 在本机有**两个不同版本安装**（桌面端 `0.1.6-alpha.2` 有 `dsh-webhook`；nvm 全局 `0.1.0-rc.8` **无** `dsh-webhook` 且同名文件行号偏移 1~17 行）——不锚定版本会让 K3 复核出现**假红**（M6 版本锚点断裂）；且 DSH spill 是**单阈值 + UTF-8 字节**，我方裁定是**双阈值 + 字符**，8,000–32,000 之间档位语义原裁定**未定义**，必须交创始人裁定而非自行推定。④ 分母出现**有意中间态漂移**：`gen-project-board.py` 的 backlog = yaml `points_total` − 冻结件解析出的 `v1_total`，故本批 6 条在创始人确认前会被计为 backlog（46 → 52），确认并增补冻结件附录 A 后自动回落 46。
---

## 落地件

- `docs/synova/product-lines/product-lines.yaml`：+6 验收点（3-9 / 4-9 / 8-7 / 8-8 / 25-8 / 25-9），30 插入 / **0 删除**，`points_total` 174 → 180，**线数仍 28**
- `docs/synova/product-lines/preconditions.yaml`：新增 `not_applicable: NA-D852`（**四项决定不引入前提条目**，逐项按总纲 §2.2 两条判据给理由——禁沉默）+ `cross_line_contracts: CLC-1/CLC-2`（统一时间窗口径 / spill 阈值单一来源：**是跨线口径不是前提**，登记防 M7 漂移）
- `docs/synova/coordination/D852-live-restart-清单-20260920.md`：四类归属 + 判定边界（判据 = 值是否参与已建连/驻留状态）+ 7 类逐条可复现核验方式
- `docs/synova/coordination/D852-V1-轻量变更单-20260920.md`：逐条来源 + 分母 128+6=134 + M1–M5 口径自查 + 附录 A 五列格式 + 5 项待创始人裁定
- `docs/synova/coordination/D852-派单回执-20260920.md`：§〇c 写前核实 6 项 + 写后自检 8 项 + 仓库外 **9 项撤回清单逐条对照** + **§D DSH 版本锚点表**
- `task-state/D852.json`、`.claude/task-briefs/D852.md`

## 实测基线（供后续复现）

- `product-lines.yaml`：`lines:` :57 ｜ 线3 :158 ｜ 线4 :210 ｜ 线8 :403 ｜ 线25 :1101（任务卡 11 处基线**全部命中**）
- 冻结件 `26线-V1验收标准-v0.2-20260917.md`：附录 A 线3表 :169 / 线4 :183 / 线8 :241 / 线25 :496；§五签字 sha256 前 8 位 `c11841e6`（口径「不含本签字块」）
- `scripts/project/gen-project-board.py`：`FROZEN_V1_TOTAL = 128`（:105，**仅告警不覆盖实测**）｜ `backlog_points = pl_total_points - v1_total`（:645）｜ `v1_total` 由**冻结件解析**得出（:500）
- DSH 引用基准 = 桌面端安装 `@deepseek-ai/* 0.1.6-alpha.2`：`dsh-spill-policy/lib/index.js:102-103`（`maxInlineBytes` 读取）/ `:104-105` throw / `:106` no-op / `:107-150` warn+保留 inline；`dsh-settings/lib/types/index.d.ts:21` `SettingsApplies = 'live' | 'restart'`、`lib/index.js:288` 缺省 live；`dsh-webhook/lib/index.js:245` `dispatch(delivery)`（纯入站）、`:90` `createWebhookSession`；`dsh-time-context/lib/index.js:161-162` `config.timeZone`/`config.refreshIntervalMs`

## 待创始人裁定（本任务不自行推定）

1. 分母 128 → 134 + 6 条条文批准
2. **§6-5 签署状态回写**（仓库内仍标「待签」且四项 ☐ 未勾选；本任务按「内容 = 表内建议选项逐字一致」落地）
3. 4-9 口径差：DSH 单阈值/字节 vs 我方双阈值/字符；**8,000–32,000 之间档位语义未定义**
4. 3-9 是否为 D828 的**硬前置**（D828 未接线前 3-9 不得判通过）
5. 线 25 分类判据（本任务起草「是否参与已建连/驻留状态」，创始人原文只给四类归属）

## 相关 D#

- D852（本任务）；口径锚点 D838（V1 标准变更单，同型）；D828（趋势接线，**引用 3-9 的时间窗口径**）；D850（离散健康计数，同批）
- 依据基线: origin/main `dae40d96`

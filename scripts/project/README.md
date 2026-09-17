# scripts/project/ — 项目账本派生器

`gen-project-board.py` 把 git 真相（task-state 卡片 + product-lines 定义 + 证据记录）
派生为 `docs/synova/project/ledger.json`（schema `project-ledger/1`），供 DSH「项目总览」
面板渲染。**派生物，禁手工编辑**；真相永远在 git。

## timeline 口径边界（D805，2026-09-17 创始人派单）

| 字段 | 口径 | 未接入时的行为 |
|---|---|---|
| `first_commit` | 该线 modules 在 **bulk 界 2026-08-16**（PHASE0/26 线计划定稿日，**界日当天含界前**）之后的最早提交日 | 界后无提交 → `null` + `degraded_sources` 逐线登记（**禁静默改口径**）；无任何历史 → `null` + 另行登记 |
| `dispatched` | 最早一份**提到**该线（线N/lineN 词边界）的派单文档（`docs/synova/coordination/*派单*`）的文件名日期 | 从未派单 → `null`（事实，非故障，不登记） |
| `merged` | 双源取最早：① 线→D#→squash 提交 subject 规整格式 `type(D#..): ..(#PR)` ② subject 直连线N；ref 优先 `origin/main` | 无关联 → `null` |
| `audited` | 双源取最早：① K3 报告头部（前 12 行）声明线N ② 线→D#→报告文件名 `YYYY-MM-DD-D#` | 无裁定 → `null` |
| `milestone` / `planned_week` | 创始人《里程碑表》**未到位** → 恒 `null` | `timeline_meta.milestone_source="not_available"` 显式标注（到位后接入） |

### bulk 界为什么是 2026-08-16

仓库初始 bulk import（2026-06-03，54 个提交）让每条线 modules 的"最早提交"都等于仓库
生日——无信息量的假数据（面板曾渲染 26 行 `2026-06-03`）。26 线体系 2026-08-16 定稿
（PHASE0），界前的 modules 提交发生在"线不存在"的语境。口径经 D333 四步收敛
（fail-closed + 机器可验 + monorepo epoch 惯例），`--bulk-boundary` 为测试注入缝。

### 当前实测：线19 / 线21 = 未接入

两线的 modules 仅有界前历史 → `first_commit=null` + `degraded_sources` 显式登记
`timeline: 线19/线21 first_commit 未接入——modules 仅有 bulk import 界前历史（≤2026-08-16）`。
面板展示为「未接入：first_commit」而非假日期——这是**数据缺失的诚实呈现**，两线产生
界后提交后自动转真值，无需改代码。

### 派单文档写法约定（影响 dispatched/merged/audited 的 D# 链路）

线→D# 映射采用**宁缺勿造**两条规则：① 标题含线N + 标题 D# ② 一行恰一个线号 + 行内 D#
（多线行跳过）。新增派单文档请保持「**一行一卡一归属**」写法，跨线的汇总行不会建立归属。

## 运行

```bash
python3 scripts/project/gen-project-board.py [--today YYYY-MM-DD] [--bulk-boundary YYYY-MM-DD]
         [--out PATH] [--strict] [--quiet]
bash tests/project/gen-project-board.test.sh   # 密封测试（86 断言）
```

注意：改 `task-state/*.json` 后须**重跑本派生器**刷新 ledger.json——派生物陈旧 =
面板数字陈旧（K3-B6-01「卡片状态机断链」同型教训）。

## 红线

不改 `scripts/product-lines/calc-progress.py`（判分口径零提交）；不写回
`docs/synova/product-lines/product-lines.yaml`；不碰 `scripts/audit/**`（K3 红线）。

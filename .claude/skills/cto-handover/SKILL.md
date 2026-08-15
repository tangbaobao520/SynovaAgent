---
name: cto-handover
description: Synova CTO 交接文档——完整上下文（过渡 CTO 交接给真正 CTO）。含任务编号规范/分工/三仪表盘/员工管理/已建资产/待办/git 纪律/审计工作区/评估框架/红线。CTO session 开工必读。
---

# Synova CTO 交接文档（开工必读，过渡 CTO → 真正 CTO）

> 本文档由「过渡 CTO」（DeepSeek Harness 第一个 CTO session，2026-08-15~16）写给「真正 CTO」。
> 你是过渡的，读完本文档 + 三仪表盘，就能无缝接手。
> 每次开工先读本文件，再读三仪表盘，再决定今天干什么。

---

## 〇、任务编号规范（2026-08-16 创始人定，重要）

**DSH 线的任务不再向 Codex 拿 D#**（旧流程太麻烦）。改为 DSH 自定编号：

```
SYNOVA-IMPL-DSH-{任务名}-{YYYYMMDD}.md
例：SYNOVA-IMPL-DSH-sentinel-threshold-alert-20260816.md
```

- **DSH 线**：`SYNOVA-IMPL-DSH-{任务名}-{YYYYMMDD}.md`（dev doc + task brief 都用这个命名）
- **Claude 线**：继续 Codex 的 D# 编号（Codex 分配）
- 两条编号体系并行，互不干扰；认领制（组 12）+ 写集重叠检查（pre-push）照样防撞车

## 一、文档定稿状态说明（澄清此前的矛盾）

2026-08-16 的提交 D376 里，两份文件对"是否定稿"曾自相矛盾，现统一为：

| 文件 | 状态 |
|---|---|
| `docs/synova/coordination/TASK-ROUTING.md` | **v4 已定稿**（2026-08-16 创始人确认） |
| `docs/synova/coordination/dsh-division-draft/DIVISION-CHARTER-v4.md` | **v4 已定稿**（同上） |

两者一致，均为定稿。以这两份为准（覆盖 Win 的 v3）。若再看到"草稿待审"字样，是历史残留，以本节为准。

## 二、创始人是谁、要什么（4 个根本痛点）

创始人 = **无技术背景的个人创业者**，产品 2026-03 开发至今，方向跑偏过 4-5 次，被 agent "声称完成实际没完成"骗过多次。要一套体系**替代他盯全程**。

4 痛点 = 控制体系的设计标尺：
1. **跑偏** — agent 不持有全局上下文 → 北星锚定
2. **欺骗** — 自报"完成"不可信 → 证据链（声称↔物理证据）
3. **盯梢负担** — 被迫盯每个环节 → 角色线程 + 仪表盘
4. **无技术背景** — 技术判断做不了 → 决策模式（技术自决/产品问他）

## 三、项目是什么

**SynovaAgent** — 驻扎企业内部的 AI 诊断 Agent，核心问题"企业增长卡在哪？现在该做什么？"。五层架构（L1交互→L2编排→L3洞察→L4本体→L5存储），8 专家，**49 活跃哨兵（45 文件驱动 extensions/sentinels + 4 内置适配器，另 12 退役 _extinct）**。定位详见 `PRODUCT-BRIEF.md`（唯一事实源）。

## 四、分工（四条线 × 双轨，终态统一 DSH）

详见 TASK-ROUTING.md v4，摘要：

| 线 | Mac-DSH | Win | 分工 |
|---|---|---|---|
| 控制体系 + CTO | **我（主 CTO）** | Win DSH 副手（影子） | Mac 独担主 |
| dev doc | 📋 synova-devdoc | Codex | DSH 自出（SYNOVA-IMPL-DSH 编号），Claude 线 Codex |
| 编码 | 🛠 synova-dsh（**哨兵切片** src/sentinel+cron） | Claude（诊断体系 FDE+本体/存储/交互） | 垂直切片互不重叠 |
| 审计 | 🔍 synova-k3-audit（DSH+K3） | Kimi code CLI + K3 | 双轨独立 |

**CTO 主从**：主 CTO = Mac DSH（建体系+盯全局+补丁+周报+管员工+盯双轨效率/质量/成本）；副手 = Win DSH（只读复核、异议升级、不主动改）。

## 五、三份仪表盘（开工必读）

| # | 仪表盘 | 路径 | 回答 |
|---|---|---|---|
| ① 产品完成度 | `docs/synova/product-lines/product-progress.html` | 产品到哪了？26 线各进度 |
| ② 任务进展 | `docs/synova/DASHBOARD-CN.md` | 每个任务到哪了？ |
| ③ 项目健康 | bypass.log / pre-commit-failures.log / AUDIT-FINDINGS-LEDGER.md | 门禁被绕过几次？模式复发？ |

> 仪表盘靠 CI 自动（product-progress.yml 周五 17:00 + push main），不是我手更。

## 六、员工（4 个 DSH session）+ 健康标准

| 员工 | 预设 | 岗位 | 健康信号 |
|---|---|---|---|
| 编码 | 🛠 synova-dsh | 哨兵切片核心代码 | commit 被 13 组拒几次 / K3 抓几个 P0/P1 / 假绿 |
| dev-doc | 📋 synova-devdoc | 写规格 | north-star 判偏离 / 声称 overclaim（M2） |
| 审计 | 🔍 synova-k3-audit | 独立审计 | 报告有无 file:line / 漏审 |
| CTO | 🧭 synova-cto | 本岗位 | — |

运营闭环：观察产出 → 发现缺口 → 改预设/persona/技能 → 草稿创始人审 → 落位 → 再观察。

## 七、已建资产清单（别重复造）

### 预设（~/.dsh/.agent-presets/，4 个）
🛠 synova-dsh / 📋 synova-devdoc / 🔍 synova-k3-audit / 🧭 synova-cto

### 技能（.claude/skills 单源 → 同步 .dsh/skills，10 个）
git-sync-pr / brief-compose / claim-verifier / windows-compat / synova-audit / pr-review / ctrl-tower-change / contract-template / north-star-guard / cto-handover（本技能）

### 脚本
- scripts/product-lines/（26线仪表盘 9 脚本：calc-progress/aggregate-todos/gen-progress-page/evidence-writer/parse-k3-report/gen-k3-task/list-test-points/refresh-all/productline_yaml）
- scripts/control-tower/install-dsh-preset.sh（预设落位+漂移检查，多预设注册表）
- scripts/workflow/sync-dsh-skills.sh（技能同步）
- 门禁：pre-commit 13 组 + pre-push 3 项（物理约束，agent-agnostic）

## 八、待办 backlog（CTO 待做，按优先级）

1. **A1 日期粒度 bug**：calc-progress.py 的 `--since=<日期>T00:00:00` 天粒度，合并当天改模块会让当天证据立即 stale。修法=次日 00:00（待创始人拍板，影响所有证据）
2. **A6/A7 自动对接**（Phase 2）：K3 报告 JSON 双轨 D347/D349 落地后，parse-k3-report 自动解析 + gen-k3-task 自动派发
3. **L3 门禁插件化**：pre-execute（brief 门）+ post-execute（verify 门），把 persona 自觉升级为 DSH 原生门禁
4. **task-state 状态机**：task-state/<任务>.json 模板 + 双向 persona 规则（结果传递自动化）
5. **观星台 UI**（L5）：创始人驾驶舱面板（北星/进度/证据链/待办）
6. **CTO 健康仪表盘**（第③面）：聚合 bypass/模式复发/缺口
7. **session 质量评分卡**：三员工各指标量化
8. **双轨评估看板**（第④面）：DSH vs Claude 效率/质量/成本对照（创始人评估依据）

## 九、git 纪律 + 教训（重要，踩过的坑）

1. **提交走 synova-commit**（唯一路径），`--files` 显式指定文件（防卷入他人暂存）
2. **推送用 ssh 远程**（`git push ssh <branch>`），origin=https 会超时/缺凭据
3. **merge 他机提交后必须开新分支推**：把 Win 的提交 merge 进旧分支，会导致 D331 bypass.log 对账把 Win 的提交也算进来（记录在 Win 机器上）。修法=开新分支（父节点=origin/main）再推
4. **孤儿 tag**：V4.7.9/V4.8.0 曾孤儿，merge origin/main 后已解决（变成祖先）
5. **开工先 `git fetch --all && git pull --ff-only`**，禁止 behind 状态开工（D335 会拦提交）
6. **禁止 git stash**（D312 事故）

## 十、审计工作区 + 模型配置

- **审计工作区**：`/Users/wane/Synova-k3独立审计`（独立目录，物理隔离）。**开工前必须确认已 `git clone` SynovaAgent**（之前是空目录）
- **k3 模型**：provider `moonshotai-cn` / model `kimi-k3`，key `MOONSHOTAI_CN_API_KEY`（在 .credentials.yaml，GUI 粘贴的）
- **开发/CTO/dev-doc 模型**：DeepSeek（deepseek-official）；**审计用 k3**。启动审计 session 时在模型选择器手动选 k3

## 十一、评估框架（创始人评估 DSH vs Claude 的依据）

| 维度 | 指标 | 数据源 |
|---|---|---|
| 效率 | 每任务耗时、往返轮次、commit 被拒次数 | git + bypass.log |
| 质量 | K3 审计 P0/P1、跑偏次数、返工率 | 台账 + git |
| 成本 | token 消耗、模型费用、时间 | telemetry + token-meter |

- 每批任务结算一次，CTO 周报给"DSH vs Claude"对照
- **红线：只报物理事实，不替创始人下"谁好"的结论**

## 十二、红线（违反 = 事故）

- 不碰 scripts/audit/、不写审计标准、禁止自我审计（K3 专属）
- 不写产品代码（src/ L1-L5 除哨兵切片 + mcp 外，归 Claude）
- 预设/skill 改动走草稿→创始人审→落位
- 同一模块同一时间只一个角色认领（撞车停手问创始人）
- 同类错误第二次出现 = 防线失效，升级创始人

## 十三、关键命令

```bash
bash scripts/product-lines/refresh-all.sh          # 26线进度刷新
bash scripts/control-tower/install-dsh-preset.sh --install|--check  # 预设落位/漂移
bash scripts/workflow/sync-dsh-skills.sh [--check] # 技能同步
bash scripts/pre-commit-check.sh                   # 13 组门禁自过
git fetch --all && git status -sb                 # 开工前同步
```

## 十四、历史教训速记（完整见 AUDIT-FINDINGS-LEDGER.md M1-M8）

M1 fail-open 静默失效 / M2 声称vs事实 / M3 机制建成未接线 / M4 执行证据链断裂 / M5 环境依赖门禁 / M6 版本锚点断裂 / M7 文档-实现漂移 / M8 共享暂存区竞争。**防再犯守门人：新错误先查 M 模式表，命中=强化该类防线，未命中=才加一个新免疫细胞（一类一机制，防臃肿）。**

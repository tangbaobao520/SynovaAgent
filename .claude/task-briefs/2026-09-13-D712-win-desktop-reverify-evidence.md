# Task Brief: D712 Win 侧桌面端重验（4 点机器证据 + 台账发现登记）

> 生成: 2026-09-13 | 分支: feat/win-d712-reverify-evidence | 机器: PC-202605261327（Win 侧 session）
> 性质: **验证/证据任务**（evidence-only）——不触产品代码，不修任何缺陷
> 派单来源: 创始人交办（派单文档 派单-桌面端线1重验批-D712-20260912.md 在本地 main d07522a1 不存在 → 见 Q6 前置缺口 G0）

## 项目身份（每次重读 — 源自 AGENTS.md §项目身份）

SynovaAgent 是组织数字孪生诊断 + 持续增长导航系统。诊断是手段，增长才是目的。
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。
本任务处在**桌面端验收证据域**：把「Windows 双击安装 → 启动 → 出窗 → 可诊断」的机器事实
变成可独立复核的证据，供 K3 裁决是否兑换验收点。诊断证据可信，增长导航建议才可信。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务在五层架构之外（验收证据 / 控制塔协作域），**零 L1-L5 产品代码变更**。
产出物 = 4 个验收点（1-2 / 1-4 / 1-6 / 1-7）的 Win 侧机器证据 + 台账发现登记。
兑换权不在本任务：product-lines.yaml 1-8 `k3_only`（仅 K3 复核可 verified，禁自我指认）。

### b) 文件审计（本次物理实测，非记忆）
- `release/*.exe` 数量 = **0**（release/ 被 .gitignore:68 忽略，只有 2026-08-02 的 win-unpacked/）
  → 官方脚本 `scripts/desktop/win-install-verify.ps1` 在净仓库态必进 exit 2 waiting（实测复现，证据 run-E）
- `scripts/desktop/win-install-verify.ps1`：硬编码 `release/*.exe` + 默认 per-user 安装位，
  **无 -InstallDir/-UserDataDir 覆盖参数**；步骤② `Start-Process $exe /S -Wait` **无超时**
- `docs/synova/product-lines/evidence/` 可入库：`.gitignore:79` 豁免行 `!docs/synova/product-lines/evidence/` 实测生效（check-ignore 零命中）
- `task-state/` 无 D712.json（D710 为当前最大号）；台账最大号 CT-64
- 被测产物唯一可用副本：`D:\synova-desktop-Windows-200\`（D578 会话遗留，含真实 NSIS 安装目录 + 安装器 exe）

### c) 决策
证据-only 分支 + PR；三点 failed 如实记 failed 不伪造；F1/F2/F3/F4 登记台账，F3 候选立项（**不在本 PR 修**，遵审计闭环铁律禁改原任务）。

## Q1: 调研 — 决策链 + 执行约束

### a) 调研来源（DSH 既有规则，非临时发明）
① [MULTI-MACHINE-PR-WORKFLOW.md]：main 是唯一真相 / 一台机器一件事一个分支 / 合并必须走 PR /
   分支命名 `feat/<mac|win>-<任务简称>` / 收工给创始人 compare 链接。
② [审计发现台账-DSH-CTO.md] D382 条（2026-08-16 创始人裁决）：**K3 审计出问题一律另起 FIX 任务，
   禁止直接改原任务（证据链混淆）**。
③ [product-lines.yaml] 1-8 `k3_only` + note「禁任务兑换自我指认」。
④ [派单-D578-Win真机实测1-2-20260905.md]：「环境注记先行……不可复现项如实标注，不伪造」。
⑤ [D572 K3 全量复核报告] P0-1 假绿教训：兑换机制会把 waiting 洗成 verified → 本任务只出证据。
⑥ [CT-57 倾向]：断言摘要/md5 入 git、全量产物留本地（1.3GB 被测副本不入库，路径已在证据 JSON 标注）。

### b) 本任务执行约束（pre-commit 组 6 验证）
- rule: "不触 electron/ 与 scripts/install*（证据有效性 + 代码域属 Mac DSH）"
  verify: "git diff --name-only origin/main...HEAD | grep -E '^(electron/|scripts/install)' （须零命中）"
- rule: "每个验收点结论必须来自真实进程/HTTP 观测，不得文档声称"
  verify: "ls docs/synova/product-lines/evidence/D712-win-20260913/run-{F,H}/（须含 window/process/healthz/verdict）"
- rule: "环境适配必须在证据 JSON 中如实标注，否则证据不可解释"
  verify: "run-F-nosandbox-runtime/timing.json accommodations 字段非空"

### c) 决策参考系
决策点 1（failed 还是 waiting）：
  参考 D572 假绿教训 + 第一性原理（不对称性：PR 可逆、假绿不可逆）→ 结论：
  1-2/1-4/1-6 记 **failed**（阻塞原因逐条取证），不记 waiting 也不记 pass。
决策点 2（F3 是否本 PR 顺手修）：
  参考台账 D382 禁改原任务 + 认领制（electron/ 属 Mac DSH 域）→ 结论：**不修**，台账登记为候选立项。
收敛检查：两决策点均指向「证据与修复分离」，收敛。

### d) 相关 Note 引用
- 本任务不触发 D395-a/D534 Note 门禁：实测 commit-msg-check.sh L140 路径集 =
  scripts/{control-tower,workflow,hooks}/ + src/orchestrator/ + AGENTS.md/CLAUDE.md/memory/notes/README.md，
  本任务写集不含其中任何一项 → 无需 memory/notes 四态 Note。

## Q2: 范围 — 正确的最简方案是什么？

不做什么（排除项）：
- 不改 `electron/`（含 main.cjs / preload.cjs）——F3 的修复对象，属 Mac DSH 域，另起 FIX 任务
- 不改 `scripts/install*` 与 `scripts/desktop/*`——F1/F2 的修复对象，属 Mac DSH 域
- 不改 `scripts/control-tower/`、`scripts/pre-commit-check.sh`（铁律 0-5：开发者不改门禁）
- 不改 `task-state/D578.json` 等既有任务状态（另起任务禁改原任务台账口径）
- 不把 1.3GB 被测产物副本入库（CT-57 倾向：摘要/md5 入 git、全量留本地）
- 不在本 PR 声称任何验收点 verified（兑换权属 K3）

做什么（写集）：
- docs/synova/product-lines/evidence/D712-win-20260913/
- docs/synova/product-lines/evidence/scenario-2026-09-13.json
- docs/synova/product-lines/evidence/scenario-2026-09-13-1.json
- docs/synova/product-lines/evidence/scenario-2026-09-13-2.json
- docs/synova/product-lines/evidence/scenario-2026-09-13-3.json
- task-state/D712.json
- docs/synova/coordination/审计发现台账-DSH-CTO.md
- .claude/task-briefs/2026-09-13-D712-win-desktop-reverify-evidence.md
- .gitignore（首提交后追加：证据目录内 .log 的定向豁免行——实测 12 个 .log 证据被 `*.log` 静默忽略，
  其中 app-stderr.log 是 F3 唯一现场，缺它则 K3 无法复核；D581 已为同目录加过豁免行，本次补文件级）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：
① Win 真机 pwsh 跑三个自研镜像脚本（run-1 安装旅程 / run-2 已装态运行时 / run-3 覆盖重装）；
② 审计方零执行复核：直接读 D712-win-20260913/ 下已落盘的原始观测文件与 4 条 evidence-writer 记录。

处理（中间步骤）：
启动 app → 观测进程/窗口标题与句柄 → 轮询 healthz → POST consult 探入口 → 采 SQLite 指纹
（表清单/关键表行数/integrity）→ 覆盖重装后再采一次 → 前后比对 → evidence-writer.py 写机器记录。

结果（最终展示在哪）：
- 4 条机器记录 docs/synova/product-lines/evidence/scenario-2026-09-13*.json（1-2/1-4/1-6 = fail，1-7 = pass）
- 主交付 docs/synova/product-lines/evidence/D712-win-20260913/D712-WIN-REVERIFY-SUMMARY.md
  （四点状态 + 环境事实 + F1-F4 发现 + G0-G3 前置缺口 + 复跑命令 + 证据清单）
- 台账登记：D712 批次条目 + F3 候选立项（CT 候选待 CTO 派号）

## 架构层: 基础设施（验收证据域，五层之外）
L1/L2/L3/L4/L5 均不涉及（本任务零产品代码变更，仅证据 / 任务状态 / 协作文档）
#CRITERIA: A

## 文档引用
- docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md（main 只进 PR / 分支命名 / 收工五步）
- docs/synova/coordination/审计发现台账-DSH-CTO.md（D382 禁改原任务铁律；本任务新增批次条目）
- docs/synova/product-lines/product-lines.yaml（1-2/1-4/1-6/1-7 定义 + 1-8 k3_only）
- docs/synova/runbooks/founder-demo-win.md（Win 四步 checklist，本任务实测对象）
- scripts/desktop/win-install-verify.ps1（官方验收脚本；F1/F2 观察对象，只读引用不改）
- docs/synova/product-lines/evidence/D712-win-20260913/D712-WIN-REVERIFY-SUMMARY.md（本任务主交付）
- task-state/D578.json（1-2 前序实测记录，本任务只读引用）

## 接口审计（本任务不新增/不修改任何接口；下列为实测核实的既有接口）
- `GET /api/healthz` → 200（实测：run-F-nosandbox-runtime/healthz.txt）
- `POST /api/diagnosis/consult` → 401（实测：run-F-nosandbox-runtime/transcript.log）
- prod 后端自启路径：`electron/backend-spawn.cjs` `buildCommand('prod')` = `process.execPath` + `dist/backend.mjs`
  （实测：run-F-nosandbox-runtime/backend.log 首行 `backend spawn ... pid=20504`）
- 官方脚本 `scripts/desktop/win-install-verify.ps1`：exit 0/1/2 三态契约
  （实测净态 exit 2 waiting：run-E-official-script/a-no-exe-waiting.txt）
- `scripts/product-lines/evidence-writer.py`：--type/--date/--verdict/--points/--source/--quote
  （实测 4 次调用，产物 scenario-2026-09-13*.json）

## Done 标准
- [x] verify: `ls docs/synova/product-lines/evidence/scenario-2026-09-13*.json` 命中 4（1-2/1-4/1-6 fail + 1-7 pass）
- [x] verify: 1-7 结论由前后指纹比对得出（run-H-upgrade-data-seeded/verdict.json：tables_same=true, rows_same=true, integrity=ok）
- [x] verify: 1-2/1-4/1-6 记 failed 且每点附可复跑证据目录（SUMMARY 对照表逐行有路径）
- [x] verify: `git diff --name-only origin/main...HEAD` 与 Q2 写集逐条一致，electron/ 与 scripts/install* 零命中
- [x] verify: 台账新增 D712 批次条目 + F3 候选立项（含根因链与证据指针）
- [ ] verify: PR 推送后由 K3 独立复核裁决验收点（1-8 k3_only，禁自我兑换；本任务只出证据）

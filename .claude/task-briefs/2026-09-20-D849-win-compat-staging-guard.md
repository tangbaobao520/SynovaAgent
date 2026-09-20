# Task Brief — D849 Windows 兼容 FIX（`staging_guard.test.sh` 12 断言红）

> 卡源：队长派单 `task-5` ｜ 分支 `gate/d839-win-b` ｜ worktree `.synova-wt-gates-b`
> 来源 = **CI 实证**（非推测）：PR #657 的必需检查 `Control Tower Gate Tests (windows-latest)` 红，
> main 同 job 全绿 → D839 引入。`.github/workflows/ci.yml:266-267` 已把本夹具接入双平台矩阵（D520）。

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
治理层（控制塔门禁夹具），不触产品代码。本夹具锁死 `staging_guard` 认领/释放四条行为
（完成即释放 / 反向仍拦 / 持久化不复活 / 降级 fail-closed）。它是 slice A（D846/D847）PR
**必需检查**的组成部分：本文件不转绿，A 的 PR 永远过不了必需检查。

### b) 文件审计
- 夹具本体（本卡写集）：`tests/control-tower/staging_guard.test.sh`（D839 新增，7 场景 31 断言）
- 被测实现（**只读，零改动**）：`scripts/control-tower/staging_guard.py`、
  `scripts/workflow/resolve-commit-brief.sh`、`scripts/control-tower/claim_release.py`、`brief_parser.py`
- K3 已点名缺陷：`staging_guard.test.sh:185` 调未定义 `set_state`（K3 D841 报告 P2-2）
- 同类先例（本仓既有 Windows 模式）：`tests/control-tower/tag-bypass-wiring.test.sh:313`（`cygpath -w`
  跨 native 边界）、`scripts/hooks/hook-git-detect.sh:37`（`SYNO_PYTHON` 显式注入，D564）、
  `.dsh/skills/windows-compat`（模式 1：python→bash 子链必须自包含）

### c) 决策
夹具缺陷 → 修夹具；**若判断必须改被测实现 → 停下回报队长**（不在本卡授权内）。
禁止用"跳过断言/放宽断言"变绿（= 降低门禁强度）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- **memory 历史教训（同类根因，本仓实打实踩过）**：D564（`memory/notes/implemented/2026-08-30-d564-win-bash-python-injection.md`）
  —— python→bash 子链里 `python3`/依赖不可达 → 静默 fail-open；D316（windows-compat 模式 1）
  —— 只解析 bash 路径不够，依赖链（bash + cat/grep + python3 + **git**）都要显式可达。
- **Anthropic 决策链**：先证现状（macOS 原始输出）→ 定位真根因 → 最小改法 → 复跑对照 → CI 权威验收。
- **决策参考系（D333）**：第一性原理——门禁夹具的价值 = "坏了能抓到"；若夹具在 Windows 上
  **静默 fail-open**（链路瞎了 → 报成"不拦"），则夹具本身变成假绿源。故优先级：
  ① 让链路断裂**可见**（前置断言 + DIAG）② 修跨平台缺陷 ③ 只增不减断言。
- 铁律 35（自动化优先）：能量化的（哈希工具缺失、底座缺失）一律变成显式红灯，不靠人记得。

## Q2: 范围 — 正确的最简方案
> ⚠ Q2 路径行**禁反引号**：`brief_parser.parse_q2` 只剥动词前缀/`:`/` — `/括号，**不剥反引号** →
> 带反引号的路径认领计数恒为 0（本轮实测：resolver 因此改选 D839 的 brief → D328 拦提交）。
做什么：
- tests/control-tower/staging_guard.test.sh — 7 处修复（见 Done 标准逐条）
- tests/control-tower/claim_release.test.sh — **Windows 可移植化（只做可移植化，不改判定语义）**：
  `shasum -a 256`（Windows Git Bash 无 shasum → 组 14 围栏 5 断言红）→ 新增 `sha256_of()`
  （`shasum` → `sha256sum` → `python3 hashlib`），`:41` / `:139` 两处调用点改用它。
  **归属理由（队长 2026-09-20 裁决）**：D849 的目标是"#657 的 Windows 必需检查转绿"，
  该文件的 `shasum` 红就在这个目标内（同一 job、同一 PR 必需检查）；原「本文件归编码 A（D846）」的
  约束**作废**——A 的重写版会覆盖此最小改，合并冲突由 A 解决（已通知 A）。
  背景证据：CTO 工作树实测两条门禁对该文件给出**互斥归属**（声明 D849 → D328 报归属 D839；
  声明 D839 → D311 报属 session D849），CTO 无法提交 → 交本任务连贯 session 处理（另开卡登记）。
- task-state/D849.json — 卡务登记
- .claude/task-briefs/2026-09-20-D849-win-compat-staging-guard.md — 本 brief
- memory/notes/proposed/2026-09-20-d849-win-compat-staging-guard.md — 决策沉淀

不做什么（含文件路径）：
- 不改 `scripts/control-tower/staging_guard.py`（被测实现；改了 = 自审自改）
- 不改 `scripts/workflow/resolve-commit-brief.sh`、`scripts/control-tower/brief_parser.py`
- 不改 `tests/control-tower/claim_release.test.sh` 的**判定语义**（只做 sha256 可移植化；A 的重写版为准）
- 不改 `.github/workflows/ci.yml`（slice B/D848 写集）
- 不碰 `scripts/audit/**`、不写审计标准、不碰主工作区与其他 worktree（含 `gate/claim-release-a`）

## Q3: 验收 — 入口 → 交互 → 结果
入口：`bash tests/control-tower/staging_guard.test.sh`（本地）与 CI job
`Control Tower Gate Tests (windows-latest | ubuntu-latest)`（`.github/workflows/ci.yml:202-280`）。
处理：夹具建 mktemp 沙箱（真实脚本副本 + 最小 git 仓库）→ 造 brief/卡/台账 → 驱动
`staging_guard.py` 与 `resolve-commit-brief.sh` → 断言 exit/status/理由。
结果：7 场景全 PASS、`FAIL=0`、exit 0；Windows 侧经 `::error` 注解复核。

## 架构层
治理层（`tests/control-tower/**` 门禁夹具），不触 L1–L5。

## Done 标准
- [ ] ① 现象→根因→改法→file:line：python→bash 子链依赖不自包含（`staging_guard.py:153` 裸
      `subprocess.run(["bash", ...])`）→ `resolve-commit-brief.sh:31` 的 `git rev-parse --show-toplevel || pwd`
      落 MSYS 专有路径 → resolver 内嵌 native python 读不到沙箱 → 认领判定静默 fail-open。
      改法：夹具内显式把 git/python/bash 目录并入 PATH（windows-compat 模式 1）。
- [ ] ② 沙箱路径双命名空间（`cygpath -m`：bash 可 glob、native python 可 open），并把
      `git init/add/commit` + `rev-parse` 底座由"静默"改成**断言存在**（失败 exit 2 带原因）。
- [ ] ③ `mk_state()` 提交卡（`:154-157`）——D846 新语义只认 `git show HEAD:`，未提交的卡不是释放证据；
      同时 K3 P2-2 点名的 `:185` 未定义 `set_state` 改 `mk_state`。
- [ ] ④ 可移植 sha256（`sha256sum`→`shasum`→`python3 hashlib`）+ 场景 F 围栏**非假绿**：
      无哈希工具时判红（旧写法在 Windows 上 `shasum: command not found` → 两边空串 → "空==空"恒绿）。
- [ ] ⑤ `/tmp/d839-res.err`（跨运行共享）→ 沙箱内私有文件。
- [ ] ⑥ 新增 2 条**认领链前置断言**（复刻 `staging_guard.py:153-156` 的 native python→bash 调用链），
      并让失败时末尾输出 DIAG 行（CI 注解只带 tail -8，Windows 侧唯一定位通道）。
- [ ] ⑦ macOS 复跑：场景 A–G 全 PASS、`FAIL=0`；断言数 31→33（只增不减，无跳过/无放宽）。
- [ ] ⑧ 交叉验：以 D846 新语义（`claim_release.py` task-state 只认 `git show HEAD:`）替换后 A–G 全 PASS。
- [ ] ⑨ CI `Control Tower Gate Tests (windows-latest)` 与 `(ubuntu-latest)` 双绿（Windows 未验 → 等 CI）。

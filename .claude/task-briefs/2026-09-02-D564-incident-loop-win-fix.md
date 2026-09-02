# D564 — incident-loop.test.sh Windows 兼容修复（canary 首测双失败）

> 派单: CTO | 2026-08-29 | 执行线: 编码 session | 来源: canary 首次纳入实测（PR #305，Windows runner）
> 类型: FIX；完成后需 K3 复审
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
L0 控制塔测试。D561 修复 incident-loop 4b（_find_bash POSIX fallback）后 macOS 8/8；canary 首纳入 → Windows runner 实测 6 通过 2 失败（该测试从未在 Win 跑过——「macOS 绿」是单平台口径）。失败证据: PR #305 Windows gate 日志（run 3323...，FAIL: tests/control-tower/incident-loop.test.sh）。

### b) 文件审计
- tests/control-tower/incident-loop.test.sh：Win 失败 2 断言（实现方从 CI log 定位具体断言）
- scripts/control-tower/incident-loop.py：_find_bash / _bash_env POSIX 分支（D561 改动区）

### c) 决策
修复 Win 语义（8/8 双平台）→ 修复后回 canary（26→27）。

## Q1: 调研
D520 跨平台先例（PATH 差异/Git Bash）；windows-compat 模式库；失败证据 = CI job 级日志（非本地推测）。

### Q1c 实测定位 + 决策参考系（D333）
**失败断言定位（无 gh 凭据，经 GitHub API check-run annotations 物理证据 + 排除法）**：
失败 run 33257792825（head 15d6f64e）windows check-run 99114428263 annotations 捕获
incident-loop tail：「结果: 6 通过, 2 失败」+ 断言 5（幂等）通过。8 断言排除法：record/
suggest/幂等依赖会话内 python3（6/8 证明可用）+ known-error-patterns.json 为 git 跟踪文件
→ 全过；唯一依赖子进程 hook 环境的断言 6（verify closed）+ 4b（受限 PATH verify closed）
= 双失败。
**根因**：hook-git-detect.sh L33 依赖 `python3`；_bash_env（D316）拼接 PATH 中 WindowsApps
python3 = Store 占位 stub（9009）且先于原 PATH → hook 静默 exit 0（fail-open）→ 输出无
「禁止」→ verify open。
参考：第一性原理（调用方已知确定可用解释器 sys.executable——显式传递优于 PATH 重序赌博）+
Anthropic 工程基线（fail-open 保持、契约显式）+ 结论：工具侧注入 SYNO_PYTHON + hook 优先
消费、未注入回落 PATH python3（D312 原行为零变化）。S-5 先红 = 4c 新断言在未修 hook 下
实测红（8 通过 1 失败）→ 修复后 9 通过 0 失败。
**返工记录（2026-08-30 CTO 验收退回）**：G12 brief 日期窗口过期 → git mv 至 2026-08-31
文件名（无代码变更；task-state 引用同步）。
**返工·第3轮**：brief Q2 排除项补文件路径（CTO 指引，后于第 4 轮自认有误删除）+ merge
main（#315 fastlane 阈值修复）。
**返工·第4轮（真 Win CI 实证 7/9，4b/4c 仍红）**：① 删矛盾排除项行（include/exclude
冲突，CTO 自认第 3 轮指引有误）；② 4b 平台适配——真 Win 下原硬编码受限 PATH 会命中
System32 WSL bash → 按平台构造（win: Git usr/bin；mac: 原值，D561 语义零变化），断言
目标不变；③ 4b/4c 加失败诊断输出（CI annotation 可捕获，供下轮真 Win 定位）。
**返工·第7轮（2026-09-02，CTO 授权「全修三件」——第6轮 FAIL_NAMES 注解揭示真失败对）**：
真 Win 失败断言实为 **6（verify closed）+ 4b**（非第4轮假设的 4b/4c——4c 一直是绿的）。
**真根因（cp1252 解码）**：verify() 的 subprocess text=True 在 Windows 用 locale 编码
（cp1252）解码 hook 的 UTF-8「禁止」输出——0x81 在 cp1252 未定义（本地机制证明）→
UnicodeDecodeError → except → degraded → 无 "closed"。断言 6/4b 均经工具 verify 故双红；
4c 直调 hook 不经 subprocess 故绿。SYNO_PYTHON（第2轮）修的是 hook 内 python 解析，
与解码层是两个独立故障——PR #305 原始 6/8 即此因（叠加 stub 问题）。修法：subprocess.run
显式 encoding="utf-8", errors="replace"（macOS/Linux locale 本就 UTF-8，零行为变化）。
另修：① brief 日期窗口再过期（08-31<09-02）→ 改名 2026-09-02；② platform-checklist.test.sh
存量三联缺陷（探针绝对路径不匹配 ^scripts/ 相对锚定 + L54 rm 先于 strict 复用 + 点名断言
被 ✅ 头行空洞满足；main 巧合掩盖，本地复现 13/14）→ 修复后 14/14。

## Q2: 范围
做什么：
- 修改 tests/control-tower/incident-loop.test.sh：新增 4c 回归断言（SYNO_PYTHON 注入契约，PATH 无 python3 双平台确定性）+ L68-70 陈旧注释如实化（K3 P2②）
- 修改 scripts/control-tower/incident-loop.py：根因在工具侧——_bash_env 注入 SYNO_PYTHON=sys.executable（确定可用解释器）；第7轮：verify() subprocess 显式 encoding="utf-8"（cp1252 解码根因）
- 修改 scripts/hooks/hook-git-detect.sh：消费 SYNO_PYTHON（优先），未注入回落 PATH python3（行为向后兼容）
- 修改 .github/workflows/ci.yml：incident-loop 重新入 canary（26→27，位置=18ae1b80 原位）
- 修改 tests/control-tower/platform-checklist.test.sh：第7轮 CTO 授权——存量三联缺陷修（相对名注入/探针时序/点名断言非空洞化；不修则 canary 恒红）
- task-state/D564.json：回填

不做什么：
- 不改 scripts/audit/（审计红线）

## Q3: 验收
入口：CI Windows gate job（双平台真实验收——本任务唯一有效验收通道）
处理：本地 macOS 8/8 + Win 语义分析 → PR → CI
结果：CT Gate Tests windows+ubuntu 全绿 + canary 27

## 架构层:

L0 控制塔（tests/control-tower/ + scripts/control-tower/）

## Done 标准
- [x] macOS 9/9（原 8 断言零变化 + 4c 新增）保持 verify: bash tests/control-tower/incident-loop.test.sh 2>&1 | grep "9 通过"
- [x] canary 回列 verify: grep -c "incident-loop" .github/workflows/ci.yml | xargs test 1 -ge
- [x] Win CI 绿 verify: CTO 合并前查 check-runs job 级（windows-latest success）
- [x] 回填 verify: python3 -c "import json; d=json.load(open('task-state/D564.json')); assert d['status']=='impl_done'"

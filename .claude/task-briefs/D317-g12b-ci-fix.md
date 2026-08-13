# D317 — G12b/brief 解析 CI 红修复（resolver 回退过滤 + PYBIN 跨平台）

任务 ID: D317 | Agent: claude-code | 会话: 2026-08-05-D313-D314 | 2026-08-07

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
D316 push 后 CI Iron Laws 红（run 31067628720，gh 未认证无法独立核实但机制性复现）。缺陷 A 已用 worktree 模拟 CI 干净检出**完整复现**：current-brief=D83 陈旧忽略 → resolver 无认领 → 最终回退按文件名日期前缀选最新 = 2026-08-02-D286（已提交旧格式，criteria=null）→ G12b 硬阻断 → pre-commit exit 1。

### b) 文件审计
- resolve-commit-brief.sh：L49 硬编码 python3 + L117-124 最终回退无过滤（两处改动点）
- check-brief-parseable.sh：7 处 python3（L45/49/56/62/68/75/76）——本机 `command -v python3` 可用（WindowsApps shim），dev doc 声称"本机 python3 为空"**不实**，但 PYBIN 回退作为防御性增强仍合理（防无 python3 机器）
- 281 个已提交日期前缀 brief 可解析性：抽查 D286 criteria=null 确认；dev doc 声称"可解析 0 个"抽样支持

### c) 决策
缺陷 A 属实 → 修复。缺陷 B 环境依赖 → 防御性修复。测试先行（新建 resolver 测试 4 用例 red→green）。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 测试先行 — tests/control-tower/resolve-commit-brief.test.sh 新建（临时 repo 隔离：mktemp + git init）
② 实现 — resolver：PYBIN 解析 + 回退改可解析性过滤（criteria A-D 判据，最新→最早，全不可解析 exit 1 fail-open）
③ 实现 — check-brief-parseable：PYBIN 回退（python3→python→py，全无 fail-open skip）
④ 版本 — VERSION.md V4.6.2 + version.log（运行时产物）
#CRITERIA: A

### b) 执行约束
- 铁律 0-2: spec（dev doc 已批准）→ test → impl → wire → review
- 铁律 35: 自动化优先 — 回退过滤写成脚本逻辑 + 测试断言
- 铁律 48: 新测试 ≥4 用例 × ≥3 断言（正常/降级/边界）
- claim-verifier 结论: 缺陷 A 属实（worktree 复现证据）；缺陷 B 本机不实（python3 shim 可用）——修复按防御性增强执行，不声称"本机复现"
- 认知: resolver exit 1 → pre-commit BRIEF 空 → check-brief-parseable 空参数 → 递归 resolver（也 exit 1）→ fail-open skip exit 0（机制已验）

## Q2: 范围 — 正确的最简方案是什么？

做什么（严格按 dev doc 写集 + 核实修正）：
- scripts/workflow/resolve-commit-brief.sh：顶部 PYBIN 解析（python3→python→py）+ L49 认领块换 "$PYBIN" + L117-124 最终回退改"最新日期→最早逐个 brief_parser 验证 criteria A-D，选第一个可解析；全不可解析或 PYBIN 空 → exit 1（fail-open，绝不静默返回坏 brief）
- scripts/workflow/check-brief-parseable.sh：顶部 PYBIN 解析（全无 → fail-open skip + degraded 记录）+ 7 处 python3 换 "$PYBIN"
- tests/control-tower/resolve-commit-brief.test.sh：新建（≥4 用例：仅 legacy 不可解析 → exit 1 / 可解析+不可解析混存 → 返回可解析 / 仅可解析 → 返回 / 过期 current-brief 忽略；临时 repo mktemp + git init 隔离）
- tests/control-tower/brief-parseable.test.sh：增补（D286 legacy brief 仅报 #CRITERIA 缺失 + PYBIN 解析非空断言）
- .codex/control-tower/VERSION.md：追加 V4.6.2 条目（门禁行为变化，PATCH）
- docs/plans/codex/implementation/SYNOVA-IMPL-D317-G12b-CI-Fix-20260807.md：写集表按实际修正
- .claude/task-briefs/D317-g12b-ci-fix.md：本 brief

不做什么（含文件路径）：
- 不改 .github/workflows/ci.yml（ubuntu 自带 python3，非缺陷）
- 不改 scripts/control-tower/brief_parser.py（解析语义正确）
- 不批量移动/删除 281 个旧格式 brief（历史文档红线，修复后回退不再选中即可）
- 不取消 git 跟踪 .claude/current-brief（D308 backlog）
- 不改 src/server.ts（及 src/ 下其他——D309/D310 独立任务）

## Q3: 验收 — 入口 → 交互 → 结果

入口：CI 干净检出模拟（git worktree add /tmp/ci-sim HEAD）跑 `bash scripts/pre-commit-check.sh`
处理：resolver 无认领 → 回退过滤 → 不可解析 brief 全部跳过 → exit 1 → G12b fail-open skip
结果：worktree 模拟 pre-commit exit 0（G12b 通过）；真实提交环境 12 组全过

## 架构层: 基础设施
控制塔（scripts/workflow/ + tests/control-tower/ + .codex/control-tower/）。不触产品架构层代码。

## Done 标准
- [ ] tests/control-tower/resolve-commit-brief.test.sh 全过（≥4 用例；修复前 red → 修复后 green 已证）
- [ ] git worktree add /tmp/ci-sim HEAD 后跑 `bash scripts/pre-commit-check.sh` → exit 0（G12b 不再选中 legacy brief）
- [ ] grep -n 'NEWEST_DATE' scripts/workflow/resolve-commit-brief.sh 零结果（旧回退逻辑已替换）
- [ ] VERSION.md 含 V4.6.2 条目（与代码同 commit）
- [ ] audit-check.py --full 基线 439 FAIL 不变；as any=0
- [ ] 推送后 origin/feat/prompt-architecture..HEAD 为空

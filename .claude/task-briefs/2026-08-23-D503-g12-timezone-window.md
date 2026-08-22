# Task Brief: D503 G12 时区容差修复（brief 认领窗口 ±1 天）

> 生成: 2026-08-23 | 任务: D503 | 认领: DeepSeek Harness（CTO）
> 性质: 门禁 bug 修复（减负，非加固）——D502 PR #117 在 CI 上 G12 误报 7 处的根因

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔 pre-commit-check.sh 组12 G12（Task Scope 一致性）。认领候选 brief 按文件名日期前缀过滤"今日"。
### b) 文件审计
- scripts/pre-commit-check.sh:978-1005 — today_files_by_prefix/suffix 用本地 `date +%Y-%m-%d` 单日过滤
- .claude/task-briefs/ — brief 按 Mac(UTC+8) 本地日期命名；CI runner 是 UTC，Mac 16:00-24:00 建的 brief 对 CI 是"明天"
- 实证：D502 brief 命名 2026-08-23，CI（UTC 08-22）认领集合为空 → 7 个已声明文件全报"不在 Q2 范围"；本地 13 组全过
### c) 决策
认领窗口扩 ±1 天（昨日/今日/明日三个 glob 前缀），一次 python3 计算（G12 本就依赖 python3，无新增环境要求；python 不可用回退单日本地行为）。brief 前缀与 dev doc 后缀两处对称修（防傍晚提 dev doc 再踩同型）。

## Q1: 调研 — 根因 + 历史教训
根因：时区错位（Mac UTC+8 vs GitHub runner UTC），非逻辑错误——D366 用日期前缀替代 mtime 是对的，但单日窗口没考虑跨时区。D501 昨晚（PR #115）能过纯因未跨 UTC 午夜，属侥幸。
历史教训：D501 分步改 CI 留中间态 → 本次一次性改对 + 本地模拟 CI 条件（无 current-brief + TZ=UTC + base...HEAD diff）验证后才推。
参考：第一性原理（认领制意图=找到声明该文件的任务，日期只是辅助过滤，窗口宁宽勿漏）+ Anthropic（环境差异是 bug 不是使用者的错）。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/pre-commit-check.sh — DAY_WINDOW_DAYS/DAY_WINDOW_COMPACT ±1 天 glob，两处 case 模式替换
- task-state/D503.json — 状态回填
不做什么：
- 不改 scripts/audit/ 目录任何 .py 脚本（K3 红线）
- 不改 scripts/workflow/resolve-commit-brief.sh（resolver 已有认领计数+回退，未受影响——本地 TZ=UTC 实测选对 brief）
- pre-commit-check.sh 内 G12 段的认领/排除匹配语义零变更（仅扩日期窗口，正则与匹配规则不动）

## Q3: 验收 — 入口 → 交互 → 结果
入口：CI 的 pre-commit-check.sh G12（TypeScript + Lint + Iron Laws job）
处理：brief 认领窗口 ±1 天，Mac 傍晚建的 brief 在 UTC CI 上可被认领
结果：D502 PR #117 的 7 处 G12 误报消失、CI 转绿；本地行为不变（13 组全过）

## 架构层:
scripts（控制塔，非产品五层 L1-L5）

## Done 标准
- [x] verify: bash -n scripts/pre-commit-check.sh 零错误
- [x] verify: 模拟 CI 条件（TZ=UTC + 无 current-brief + SYNO_DIFF_BASE=origin/main）pre-commit-check.sh 13 组全过（G12 由红转绿）
- [x] verify: PR #117 CI 的 TypeScript + Lint + Iron Laws 转绿

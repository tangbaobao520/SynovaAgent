# Task Brief: D661 grep-oP-portable-family-fix

> 生成: 2026-09-10 | 任务: D661 | 认领: DeepSeek Harness
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔脚本层（scripts/workflow/ + scripts/control-tower/）。macOS BSD grep 无 `-P`（PCRE），
`grep -oP`/`-qP`/`-rohP` 直接报错 exit 2 → `|| true` 吞掉 → 检查静默失效。
家族第 4 次复发（D421→post-commit.sh，D660→resolve-commit-brief.sh:60）。
### b) 文件审计
`grep -rnE 'grep[[:space:]]+-[a-zA-Z]*P' scripts/workflow/ scripts/control-tower/` 实测：
- scripts/workflow/：9 处 `grep -oP`（check-dataflow-alignment:27、resolve-commit-brief:60、
  check-test-first:29、verify-incremental:173/230、hook-check-task-scope:62、hook-block-write:261/302/326）
- scripts/control-tower/：external-auditor 6 处 `-oP`+1 处 `-qP`（195/197/204/212/214/220/222）、
  dev-doc-gatekeeper 2 处 `-oP`+2 处 `-rohP`（70/79/80/109）
- 空数组崩溃：external-auditor.sh `"${FINDINGS[@]}"` 10 处（98/116/227/255/265/275/315/355/375/393）
  bash 3.2 下 `set -u` + 空数组 = `unbound variable`（本机实测 exit 1）
### c) 决策
全清两个目录（创始人/CTO 拍板）：换 POSIX ERE，`\d→[0-9]`、`\s→[[:space:]]`、
`\w→[a-zA-Z0-9_]`、`\b→显式边界`、`\K→sed/awk 捕获`。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 第一性原理：BSD grep 不认 PCRE（`\d\s\b\w\S\K`）是 POSIX 事实，最简机制 = 换 ERE 等价。
- Anthropic 工程基线：fail-closed（检查降级须三态 exit 2，不静默 `|| true` 吞崩溃）；
  跨平台脚本用 POSIX ERE，不用 GNU/PCRE 扩展。
- memory 历史：D421（post-commit.sh 同款 `-oP`）、D660（resolve-commit-brief.sh:60 实证失效）、
  D313 M5（UTF-8 头块）、D328（三态退出码 + 探测后试运行）。
- 铁律：0-2（测试先行）、9（grep 全仓库传播）、24（catch 有 log）、31/32（降级信号+错误分类）、35（自动化优先）。
参考：第一性原理 + Anthropic fail-closed + D421/D660 历史 + 结论=全清两目录换 POSIX ERE

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/workflow/resolve-commit-brief.sh — `\d{4}-\d{2}-\d{2}` → `[0-9]{4}-[0-9]{2}-[0-9]{2}`
- scripts/workflow/check-dataflow-alignment.sh — `-oP` → `-oE`（纯字符类，无 PCRE 构造）
- scripts/workflow/check-test-first.sh — `\K\w+` → `grep -oE` + `awk '{print $NF}'`
- scripts/workflow/verify-incremental.sh — 同 `\K\w+` 两处（173/230）
- scripts/workflow/hook-check-task-scope.sh — `\d{4}-\d{2}-\d{2}` → `[0-9]{4}-[0-9]{2}-[0-9]{2}`
- scripts/workflow/hook-block-write.sh — `\S\s\w`/`\K`/`L[1-5]` 三处（261/302/326）
- scripts/control-tower/dev-doc-gatekeeper.sh — `E-\d{2}`/`\b`/`\s` 四处（70/79/80/109）
- scripts/control-tower/external-auditor.sh — `\d`/`\b`/`\s` 七处（195/197/204/212/214/220/222）+ 空数组 10 处
- tests/control-tower/resolve-commit-brief.test.sh — 补陈旧 current-brief 文件存在场景（D660 red→green）
- tests/control-tower/grep-oP-regression.test.sh — 新增回归网（grep -P 两目录 0 命中）
- tests/control-tower/external-auditor.test.sh — 空 FINDINGS 不崩 + 检测语义（as any/空 catch/TODO）
- tests/control-tower/dev-doc-gatekeeper.test.sh — C1/C2 提取回归（U7/CT-40 配对）
- tests/control-tower/check-dataflow-alignment.test.sh — 关键词提取回归（U7/CT-40 配对）
- tests/control-tower/check-test-first.test.sh — export 名提取回归（U7/CT-40 配对）
- tests/control-tower/hook-check-task-scope.test.sh — 日期提取回归（U7/CT-40 配对）
- tests/control-tower/verify-incremental.test.sh — export 名提取回归（U7/CT-40 配对）
不做什么（排除项）：
- 不改 scripts/audit/（K3 红线，永不触碰）
- 不改 scripts/pre-commit-check.sh（顶层 grep -oP 残留，独立后续任务）
- 不改 scripts/hooks/（grep -oP 残留属独立后续任务）
- 不改 scripts/checks/（grep -oP 残留属独立后续任务）
- 不改 scripts/checker-review.sh（顶层 grep -oP 残留，独立后续任务）
- 不改 scripts/check-file-driven.sh（顶层 grep -oP 残留，独立后续任务）
- 不改 scripts/check-brief-vs-code.sh（顶层 grep -oP 残留，独立后续任务）
- 不改 scripts/check-tech-debt.sh（顶层 grep -oP 残留，独立后续任务）
- 不改 scripts/check-integrity-startup.sh（顶层 grep -oP 残留，独立后续任务）
- 不改 scripts/pre-doc-audit.sh（顶层 grep -oP 残留，独立后续任务）

## Q3: 验收 — 入口 → 交互 → 结果
入口：`bash scripts/workflow/verify-incremental.sh` / `bash tests/control-tower/*.test.sh` /
`bash scripts/pre-commit-check.sh`
处理：每处 `grep -P` 换 POSIX ERE；每处 macOS BSD grep + Linux GNU grep 双端等价；
空数组加 `:-` 防御
结果：`grep -rnE 'grep[[:space:]]+-[a-zA-Z]*P' scripts/workflow/ scripts/control-tower/ --include='*.sh'` = 0；
external-auditor 空 findings 不崩、计数 0、正常输出

## 架构层: 基础设施
基础设施（控制塔脚本跨平台，scripts/workflow + scripts/control-tower，非 L1-L5 业务层）

## Done 标准
- [ ] verify: `grep -rnE 'grep[[:space:]]+-[a-zA-Z]*P' scripts/workflow/ scripts/control-tower/ --include='*.sh'` 返回空（0 命中）
- [ ] verify: `bash -n` 全部 8 个改动脚本 exit 0（语法）
- [ ] verify: `bash tests/control-tower/resolve-commit-brief.test.sh` exit 0（含陈旧 brief 场景）
- [ ] verify: `bash tests/control-tower/grep-oP-regression.test.sh` exit 0
- [ ] verify: `bash tests/control-tower/external-auditor.test.sh` exit 0
- [ ] verify: `SYNO_CI=1 SYNO_DIFF_BASE=origin/main bash scripts/pre-commit-check.sh` exit 0
- [ ] verify: `bash scripts/control-tower/simulate-ci.sh` exit 0

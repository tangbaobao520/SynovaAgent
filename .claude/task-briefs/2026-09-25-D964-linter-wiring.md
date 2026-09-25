# Task Brief — D964 linter 真接线

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。本任务属门禁基建域：把 oxlint 真正装入并接线（D962 ② linter 化由本卡吸收为真接线，CTO A 案）。
### b) 文件审计
verify-incremental.sh 原有执行体（npx oxlint + which 探测）但未安装致效果不在 + :95 `|| true` fail-open（CTO 更正：非"纯注释漂移"）。仓库零 oxlint 依赖。
### c) 决策
参考：Anthropic/DeepSeek/第一性原理 + 结论 = 本地 .bin 单轨 + 棘轮 deny（改动文件 as any 即时转错，存量 warning）+ SOG 钉子 no-restricted-imports。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
DSH 同构（D962-dsh-mapping §一）：oxlint 快速本地 + CI 权威。教训：fail-open=没有门禁（V3.9）；声明≠执行体（D964 CTO 更正——能力定性必须逐行读码）。

## Q2: 范围 — 正确的最简方案
做什么（写集）：
- package.json（devDependency oxlint ^1.85.0 + script lint:rules + package-lock.json 联动）
- package-lock.json
- .oxlintrc.json（新）
- scripts/workflow/verify-incremental.sh（L1 本地 .bin 单轨 + 灭全部 `|| true` 为显式空默认/显式降级 + 轻量通道同三态）
- tests/control-tower/d964-linter-wiring.test.sh（新，判据五条）
- memory/notes/proposed/2026-09-25-d964-linter-wiring.md
- .claude/task-briefs/2026-09-25-D964-linter-wiring.md

不做什么（含文件路径）：
- 不改 .github/workflows/ci.yml（判据④ CI 接线暂缓，与 D956 串行，归后续卡）
- 不改 src/**（存量 33 处 as any 棘轮 warning，触碰时由 --deny 转错，存量清理另卡）
- 不碰 scripts/audit/**、pre-commit-check.sh（A 单写者）

已知边界（上报）：#3 硬编码业务数据字面量表在 oxlint 1.85 无 no-restricted-syntax（三插件名实测 not found），判据③以 as any + SOG 钉子双样例覆盖；check-hardcoded.sh 暂不退役（原计划"linter 化后退役"不可达）。

## Q3: 验收 — 入口 → 交互 → 结果
入口：npm run lint:rules / verify-incremental.sh L1 / d964-linter-wiring.test.sh
处理：devDep 安装 → 规则配置 → L1 接线 → fail-open 灭绝
结果：判据①②③⑤测试全过（④占位），CTO 五条判据原始输出可核

## 架构层: 门禁基建域（非产品五层）
## Done 标准:
- node_modules/.bin/oxlint --version = 1.85.0
- node_modules/.bin/oxlint --config .oxlintrc.json . → rc=0
- as any 样例 + @synova/sog-core 样例 → error + exit 1（原始输出）
- grep -c '|| true' scripts/workflow/verify-incremental.sh = 0
- bash tests/control-tower/d964-linter-wiring.test.sh 全绿

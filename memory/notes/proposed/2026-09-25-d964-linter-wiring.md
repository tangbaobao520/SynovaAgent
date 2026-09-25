---
状态: proposed
日期: 2026-09-25
决策: D964 linter 体系真接线——oxlint 1.85 装入 + 棘轮 deny 语义 + verify-incremental fail-open 灭绝
理由: D962 ② linter 化前提原不成立（仓库零依赖）；CTO 认错前提选 A 案并由 D964 吸收为真接线
class: D964_LINTER_WIRING
constraint: "棘轮语义=改动文件 as any 即时 error、存量 33 处 warning 不阻断; 探测失败显式降级 exit 2 禁 fail-open"
expected: 判据五条测试全绿; grep -c '|| true' verify-incremental.sh = 0
severity: warn
occurrences: 1
first_seen: 2026-09-25
description: |
  关键取舍：
  1. no-explicit-any 配置级 warn（全量 rc=0 棘轮）+ verify-incremental L1 --deny 转错
     （改动文件即时拦截；被触碰文件须清零该文件存量）——避免一次性 33 处存量全红压垮编码线
  2. no-restricted-imports 钉 @synova/sog-core（plan §五 #26-28）；prototypes/** 存量 3 处
     研究档案命中 → ignorePatterns 豁免（非生产代码）
  3. 灭 || true 16 处 → 显式空默认（X=$(...) || X=""）或显式降级 exit 2；L2 baseline-check
     rc=2 显式可见。不做 || : 换皮
  4. 已知边界: oxlint 1.85 无 no-restricted-syntax（eslint/oxc/typescript 三插件名实测
     not found）→ #3 硬编码业务数据字面量表不可 linter 化，check-hardcoded.sh 暂不退役
  教训: D962-dsh-mapping 对 DSH B#3 的引用有夸大（DSH no-restricted-properties 是属性访问
  禁令非字面量表）——已在交付说明更正；能力定性必须逐行读码（CTO 同判）
---

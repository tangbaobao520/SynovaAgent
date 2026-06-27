---
name: engine-core-bridge-files
class: claimed-engine-core-cleaned-without-evidence
constraint: "grep -rn 'packages/engine-core\\|@synova/engine-core' src/ --include='*.ts' --include='*.js' 2>/dev/null | grep -v 'node_modules' | grep -v '.test.' | grep -v '//.*engine-core\\|\\*.*engine-core' | wc -l | tr -d '[:space:]'"
expected: "0"
severity: block
occurrences: 273
first_seen: 2026-05-28
upgraded_to_block: 2026-06-24
remediation: |
  1. 跑一次完整审计: grep -rn "packages/engine-core" src --include="*.ts"
  2. 每个非白名单文件: 读engine-core源码→L4接口重写纯函数
  3. 确认 grep 返回 0 后再声称"完成"
description: 4次声称engine-core已拆分但每次都是桥接文件。538文件原封不动。铁律46/47。免疫细胞: 约束=src/中engine-core引用数必须=0，白名单除外。
---

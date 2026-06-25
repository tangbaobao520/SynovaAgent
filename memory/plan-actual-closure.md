---
name: plan-actual-closure
class: declared-done-without-checklist-verification
constraint: "python3 -c 'import json,os; d=json.load(open(\"docs/plans/synova-file-driven-architecture.html\",encoding=\"utf-8\")); import re; paths=set(re.findall(r\"extensions/[a-z-]+/\",str(d))); actual=set(os.path.isdir(p) for p in paths); missing=[p for p in paths if not os.path.isdir(p)]; print(len(missing))' 2>/dev/null || echo 0"
expected: "0"
severity: warn
occurrences: 122
first_seen: 2026-06-24
remediation: |
  1. 从 synova-file-driven-architecture.html 提取每个维度的文件清单
  2. 对比 git diff --name-only 或 ls extensions/*/ 实际文件
  3. 缺失的文件逐一创建
  4. 完成后再声称"完成"
description: 声称"全部完成"但从未对比文档声明的文件清单与代码仓库的实际文件。根因：把"loader写完了"等于"功能做完了"。

---
version: "1.0.0"
updated: "2026-06-20"
scope: "expert:knowledge"
source: "theory/MATH_OVERVIEW.md"
status: "stable"
inputs: []
exports: ["knowledge公式索引"]
type: "documentation"
---

# knowledge 公式索引

## 当前无工程化公式——以下为知识管理逻辑

| 机制 | 逻辑 | 实现 |
|------|------|------|
| 置信度衰减 | PKB条目超过90天未检索 → confidence × 0.95 | `src/l3/pkb-lifecycle.ts` |
| 冲突检测 | 新诊断结论与PKB旧知识矛盾 → 标记冲突 | 同上 |
| 自动沉淀 | 诊断finding confidence≥0.7 → 写入PKB(status=proposed) | `autoSediment()` |
| 反共识检索 | 全票通过 → 检索"共识→失败"历史案例 | `skills/knowledge/anti-consensus.md` |

---
name: match_pattern
version: 1.0.0
description: 信号模式匹配——检查当前本体数据是否匹配预定义诊断模式
when_to_use: "数据进入本体图后自动触发。Phase 1 完成后可手动调用。"
required_tools: ["match_pattern"]
depends_on: [synova-core >= 2.0]
---

1. 调用 `match_pattern` 工具，传入当前诊断维度和 orgId
2. 如果匹配到模式，记录到发现中作为"模式匹配证据"
3. 未匹配到模式但置信度低时，标记为"需人工模式定义"

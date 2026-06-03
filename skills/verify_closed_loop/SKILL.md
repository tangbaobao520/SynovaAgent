---
name: verify_closed_loop
version: 1.0.0
description: 闭环验证——新诊断开始时自动对比上次行动项与当前指标变化
when_to_use: "每次新诊断开始时自动执行。"
required_tools: ["verify_closure"]
depends_on: [synova-core >= 2.0]
---

1. 调用 `verify_closure` 工具，传入当前 orgId
2. 如返回 hasHistory: true，将上次行动项效果注入诊断上下文
3. 如返回 hasHistory: false，标注"首次诊断——无历史对比"

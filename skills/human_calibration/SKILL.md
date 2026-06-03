---
name: human_calibration
version: 1.0.0
description: 人机协同校准——低置信度发现或不一致信号时请求行业诊断师介入
when_to_use: "置信度<0.5 时触发。用户主动请求时触发。"
required_tools: ["request_human"]
depends_on: [synova-core >= 2.0]
---

1. 检测到 confidence < 0.5 的发现时自动调用 `request_human`
2. 提交审核请求（包含 findingId、reason、priority）
3. 审核结果返回后，更新发现置信度

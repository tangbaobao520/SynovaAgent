---
version: "1.0.0"
updated: "2026-06-19"
scope: "expert:tech"
source: "SYNOVA-THEORY-v2-20260618.html §9.3"
status: "stable"
inputs: ["synthesis/CROSS_VALIDATION.md"]
exports: ["tech跨专家协同规则", "技术可行性红绿灯"]
type: "prompt"
---

# tech 跨专家协同协议

## ← org (D4硅基侧)
D4（治理结构）的硅基侧需要 tech 提供 Agent 审计能力——能否读取 Agent 配置、护栏、日志。

## → strategy / business_model
每当这两个专家提出需要"速度"或"AI驱动"的建议 → tech 必须给出技术可行性红绿灯（🟢/🟡/🔴）。

## → action
如果技术可行性是 🔴 → 建议降级为"远期方向"，不进入当前行动周期。

# Task Brief: D430 — A2 机器验证入库接线（测试→证据→完成度）

> 2026-08-18 | CTO (DeepSeek Harness) | 产品线仪表盘

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
创始人需求（2026-08-17）：之前任务 K3 完全没参与 → 完成度 0；需要一个不调 K3 大模型的机器审计体系补完成度。K3 的 U1-U8 是门禁（防新任务错），缺"证据回填"环节。README v1.4 §5.3 A2 设计了 evidence-writer 但未接线到本地测试运行。

### b) 文件审计
- scripts/product-lines/run-machine-evidence.sh（新，A2 接线脚本）
- scripts/product-lines/refresh-all.sh（集成 A2 环节）
- docs/synova/product-lines/evidence/test-2026-08-18.json（生成物，18 验收点 pass）

### c) 决策
只跑 test: 绑定的验收点对应套件（纯机器可验证，无 LLM）；全绿写 pass，挂写 fail（诚实）；机器绿→pending_k3 待 K3 终审。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- calc-progress 诚实规则：机器证据绿→pending_k3（🟡），不直接 verified
- CI 已有 A2（product-progress.yml vitest 全绿→ci 证据），本地缺——本脚本补本地
- vitest 全量 523 文件 fork 池不稳（88 挂），套件子集 12 文件 91 测试全绿

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/product-lines/run-machine-evidence.sh
- scripts/product-lines/refresh-all.sh
- docs/synova/product-lines/evidence/test-2026-08-18.json
- docs/synova/product-lines/product-progress.html（刷新产物）
- .claude/task-briefs/2026-08-17-D430-a2-evidence-wiring.md
- task-state/D430.json
- memory/notes/implemented/2026-08-18-d430-a2-evidence-wiring.md

不做什么：
- scripts/product-lines/calc-progress.py（诚实规则不改：机器绿≠verified，待 K3）
- tests/expert-quality/layer2-judge.test.ts（需 LLM，不跑不写证据）
- scripts/audit/（K3 专属）

## Q3: 验收 — 入口 → 交互 → 结果

入口：refresh-all.sh（本地）
处理：跑 test 绑定套件 → 全绿写证据 → calc-progress 消费
结果：17 验收点 uncommitted→pending_k3（有证据），K3 复核后转绿

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] run-machine-evidence.sh 跑通（12 文件 91 测试全绿）
- [ ] evidence/test-*.json 生成（18 验收点 pass）
- [ ] 17 验收点 uncommitted→pending_k3
- [ ] 提交经 synova-commit + 推送 + 入 main

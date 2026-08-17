---
status: implemented
date: 2026-08-18
task: D430
tags: [product-lines, a2, evidence, machine-audit]
---

# D430 — A2 机器验证入库接线

## 决策
创始人（2026-08-17）：不调 K3 大模型、机器补完成度。K3 U1-U8 管新任务门禁，缺旧任务证据回填。

本任务补 A2 缺口：`run-machine-evidence.sh` 跑 product-lines.yaml 里 test: 绑定的验收点对应测试套件（12 文件 91 测试全绿）→ evidence-writer.py 写证据 → calc-progress 消费 → 17 个验收点 uncommitted→pending_k3。

## 关键选择
1. 只跑 test: 绑定套件，不跑全量（523 文件 fork 池不稳 + LLM 测试挂）
2. CI=1 口径排除需 LLM 的测试
3. 机器绿→pending_k3（🟡 待裁判），不直接 verified——诚实规则不变，K3 终审仍需要

## 验证
- 套件 12 文件 91 测试全绿
- evidence/test-2026-08-18.json 写入（18 验收点 pass）
- 状态分布：uncommitted 132 → pending_k3 17（有证据）、verified 7、rejected 4、failed 3

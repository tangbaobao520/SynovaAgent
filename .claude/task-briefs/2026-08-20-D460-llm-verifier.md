# Task Brief: D460 — LLM-as-a-Verifier 部署 + synova-verify skill

> 2026-08-20 | CTO | A2 语义预筛

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
创始人批准：接入 A2 语义预筛（LLM 细粒度打分过滤交付质量，降 K3 成本）。部署斯坦福 LLM-as-a-Verifier + 写 synova-verify skill，手动触发。

### b) 文件审计
- .claude/skills/synova-verify/SKILL.md（skill 源，双轨同步到 .dsh）
- .gitignore（加 .venv-llmverifier/）
- .venv-llmverifier/（本地部署，不入 git）
- task-state/D460.json

### c) 决策
本地 venv 部署 + DeepSeek 后端 + 手动触发。红线：不替代 K3 终审/机器物理验证；key 不入库。

## Q1: 调研 — 业界最佳实践 / memory 历史教训

- 斯坦福 LLM-as-a-Verifier（arXiv 2607.05391，MIT）
- V3.6 教训：机器机制 > 自律；key 不入库（Secrets 门禁）

## Q2: 范围 — 正确的最简方案

做什么：
- .claude/skills/synova-verify/SKILL.md
- .dsh/skills/synova-verify/SKILL.md（同步产物）
- .gitignore
- task-state/D460.json
- memory/notes/implemented/2026-08-20-d460-llm-verifier.md
- .claude/task-briefs/2026-08-20-D460-llm-verifier.md
- .claude/current-brief

不做什么：
- .venv-llmverifier/（本地部署产物，不入 git）
- ~/.dsh/.credentials.yaml（key 不入库）
- scripts/audit/（K3 专属）

## Q3: 验收 — 入口 → 交互 → 结果

入口：创始人/CTO 调用 synova-verify skill
处理：llm-verifier 对交付声明打分（deepseek-v4-flash）
结果：0-1 连续分，区分真实交付 vs 空泛声称

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] llm-verifier 0.2.0 部署到 .venv-llmverifier/
- [ ] DeepSeek 后端连通（select/compare 测通）
- [ ] synova-verify skill 双轨落位
- [ ] 真实任务验证（D456 真实 1.0 vs 空泛 0.0）
- [ ] 提交经 synova-commit + 推送 + 入 main

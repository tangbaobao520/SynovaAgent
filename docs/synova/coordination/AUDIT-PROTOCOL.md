# 独立审计协议（KIMI K3）— v1.0

> 2026-08-11 定 | 对齐 [ROLES.md](ROLES.md)：Codex 写 dev doc + 自审计；Claude Code 执行；**KIMI K3 独立交付审计**。
> 本协议在 KIMI K3 原始方案基础上，补入本项目 8 轮审计（D316-D329）沉淀的 11 条修正 + 三层审计模型。

## 0. 审计定位（三层模型）

| 层 | 审计什么 | 材料 | 判定 |
|---|---------|------|------|
| L1 代码审计 | 代码本身（接口/架构/数据流/测试/降级） | 7 项材料 | 15 项清单 |
| L2 偏离审计 | 开发是否照着 dev doc 做（写集/方案/DS/自检） | dev doc + git diff + brief | 声称 vs 证据（file:line） |
| L3 执行审计 | 控制塔门禁是否真实执行 | CI job 级 + 执行证据包 | 机器证据优先 |
| L4 缺口收割 | 每任务末尾："本该拦住它的防线是什么？为什么没拦住？" | L1-L3 发现 | 输出防线缺口清单 |

> L4 不单独跑——每次任务审计末尾固定回答，每 5-8 次汇总为一次**控制塔健康审计**（见 §7）。

## 1. 审计材料（K3 自收集）

> 2026-08-12 更新：KIMI K3 已配置自收集 skill，**Codex 不再打包材料**——只需发任务 ID（D#），K3 自行收集以下 7 项：

| # | 材料 | 说明 |
|---|------|------|
| 1 | **任务提交集**（不是单提交） | dev doc 写集 → `git log --all -- <文件>` 映射（D320 劫持教训：单提交必漏审） |
| 2 | Git diff（提交集） | `git show <hash> --stat` + `git diff <hash>^..<hash>` |
| 3 | Dev doc | `docs/plans/codex/implementation/SYNOVA-IMPL-DXXX-*.md` |
| 4 | Task brief | `.claude/task-briefs/` 对应文件 |
| 5 | AGENTS.md | 项目根 |
| 6 | **审计基线** | `audit-check.py --full` 当前值（439 FAIL / as any 0 / arch 56） |
| 7 | **执行证据** | 该提交 CI job 级结论、bypass 记录、pre-commit 记录、推送状态 |

## 2. 输入隔离（白名单破例）

**KIMI K3 只读**：
- 上述 7 项材料
- 审计脚本输出（`external-auditor.sh --dispatch`、`audit-check.py --full`）
- **grep/只读检索全仓库**（接线/接口验证必须——输入隔离 ≠ 禁止检索，5 项材料是结论依据，grep 是验证手段）

**绝不读**：`.claude/` 下记忆/讨论/临时文件（task-briefs/ 除外）、`node_modules/`、`dist/`、未在材料中声明的文件。

## 3. 任务审计流程（7 步，修正后）

```
步骤 1: Codex 发任务 ID（D#）→ KIMI K3 按 §1 自行收集 7 项材料
步骤 2: KIMI 跑 D202 外部审计（--dispatch）→ 定位为"基线扫描"（D202 对 Python/shell 有已知盲区，主审计在步骤 3）
步骤 3: KIMI 逐项执行 15 项语义审计（§4）
步骤 4: 输出报告 → docs/synova/audit-reports/YYYY-MM-DD-DXXX.md（git 跟踪，可追溯）
步骤 5: 分级确认：P0 阻断 / P1 建议 / P2 可选
步骤 6: 修复后复审（只审变更部分）
步骤 7: 归档 + 防线缺口收割（§5）入控制塔待办
```

## 4. 语义审计清单（11 项 → 15 项）

**原 11 项**（保留）：接口真实性 / 文件路径 / Edge ID / 架构边界 / 数据流 / 接线深度 / 降级诚实性 / 测试契约 / 测试覆盖 / 文件驱动 / 自我报告交叉对比。

**新增 3 项**：

| # | 项 | 判定 |
|---|-----|------|
| 12 | **dev doc 偏离审计** | 写集表 vs 实际提交文件；§3.2 方案 vs 最终实现；每条 DS 必须 file:line 证据（无据 = 声称无据）；自检清单勾选 vs 可复现证据 |
| 13 | **控制塔执行审计** | 该提交 CI 各 job 结论（**job 级，禁整体 run 结论**——D320 生成器假红教训）；bypass 记录；pre-commit 通过记录；npm audit/Architecture 预存单独标注 |
| 14 | **版本编排合规** | VERSION.md / version.log / git tag 三处同步；批次归属正确（D319→V4.7.0、D329→V4.7.1）；未授权任务不碰 VERSION.md |
| 15 | **并行合规**（CT-14, 2026-08-12 拉锯事件） | 任务执行时 registry 活跃 session 数；是否 worktree 隔离；parallel-conflicts.log 有无竞争记录；依赖任务是否被并行派发 |

## 5. 防线缺口收割（L4，每任务必答）

报告末尾固定一节：

> **"本次发现的问题（若有），控制塔哪一道防线本该拦住？为什么没拦住？缺什么？"**

示例：D320 劫持 → 答案是 G12/commit-msg 无声明-内容一致性（→D328）+ staging-guard 自动采用身份（→D329）。

Codex 将收割结果记入仪表盘"控制塔待补"区，凑够一批后触发控制塔健康审计。

## 6. 分级与闭环（P0 到人）

| 级别 | 定义 | 处理 |
|:---:|------|------|
| P0 | 阻断交付 / 安全事故 / 门禁形同虚设 | **必须修**：Codex 写 FIX dev doc → Claude Code 修复 → KIMI 复审（对齐 ROLES.md） |
| P1 | 建议修复 / 数据不实 | 记录跟进，排入队列 |
| P2 | 可选改进 | 采纳/忽略 |

## 7. 控制塔健康审计（双模式，触发式）

**模式 A：任务审计**（每次交付，§3 流程）
**模式 B：控制塔健康审计**（每 5-8 次任务审计后，或事故触发）：
- 材料：控制塔组件源码（scripts/control-tower/、scripts/hooks/、pre-commit-check.sh）+ 设计文档 + 事故历史（收割清单）
- 清单：门禁真实性（hook 是否可绕过/静默失效）/ 跨 session 机制（registry/认领制/guard 实测）/ CI 否决权 / 基线豁免 / 性能（pre-commit 运行时）/ UTF-8 合规
- 产出：CT-1..CT-n 补丁清单 → Codex 排 D#

## 8. 报告规范

- 位置：`docs/synova/audit-reports/YYYY-MM-DD-DXXX.md`（**git 跟踪**——历史教训：.codex/audit 无产物导致"外部审计全 0 无法核验"）
- 必含：结论（PASS/CONDITIONAL PASS/FAIL）、DS 逐条表、证据 file:line、**运行环境注记**（Windows/Mac/CI/Git Bash——D316"D318 6/7 vs 7/7"、D317"python3 有无"均为环境依赖误判）、防线缺口节
- 审计报告由 KIMI K3 提交，Codex 登记仪表盘

## 9. 任务触发与自动化

- **Codex 职责**：只发任务 ID（D#）——K3 自收集材料、自审计、自出报告
- **首实验：D328**（单提交、小、聚焦）已完成首审；D329 按同流程
- 远期可选：GitHub Actions 触发（repo 私密 + 预存 CI 噪音需先清理，D309/D310 后）

## 10. 修订记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-08-11 | 首版：KIMI 原始方案 + 11 条修正 + 三层模型 + 14 项清单 + 双模式 |
| v1.1 | 2026-08-12 | +第 15 项"并行合规"（CT-14，D330/D331 拉锯事件）；材料/流程不变 |

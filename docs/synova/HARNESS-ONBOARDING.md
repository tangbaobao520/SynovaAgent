# Synova 项目导读（DeepSeek Harness 入门必读）

> 生成于 2026-08-14 | 面向新加入的 DeepSeek Harness（或任何新成员）
> 目的：用最短路径建立项目全貌认知。按优先级从上到下读，每份文档都附"为什么必读"。
> 配套：[DOCUMENT-INVENTORY.md](DOCUMENT-INVENTORY.md) 全量索引（845 文件）

---

## 一、产品定位与市场（先搞懂"我们做什么"）

1. **[AGENTS.md](../../AGENTS.md)** — 项目宪法。产品身份、数据流总览、五层架构、铁律速览（0-48 条）。
   **为什么必读**：这是唯一入口，所有任务、门禁、架构规则都从这里出发。不理解 AGENTS.md 就动不了代码。
2. **[README.md](../../README.md)** — 项目概览与启动方式。
   **为什么必读**：快速知道系统怎么跑起来（`npm run dev`）。
3. **[INTERFACES-STRATEGY.md](coordination/INTERFACES-STRATEGY.md)** — 接口面策略（创始人 2026-08-12 定）。
   **为什么必读**：明确了产品对外形态——Electron 桌面端 + MCP 是 P0，Web/API/Docker 延后，TUI/CLI 退役。别在已退役的形态上投入。

## 二、当前架构现状与理想架构（再搞懂"系统长什么样"）

1. **[AGENTS.md](../../AGENTS.md) 的五层架构段** — L1 交互 → L2 编排 → L3 洞察 → L4 本体 → L5 存储。
   **为什么必读**：架构边界是铁律 39，跨层违规会被 pre-commit 硬阻断。
2. **[权威文档 01 本体层因果体系](../research/权威文档01-本体层因果体系权威规范-20260714/)** — 本体层电子病历 + 42 边 + 因果体系。
   **为什么必读**：这是诊断能力的理论根基，所有测量器/哨兵都建立在本体层之上。
3. **[AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md](audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md)** — 全链路审计（K3，2026-08-14）。
   **为什么必读**：揭示了当前架构的**真实断裂**——L5 无连接器、L4 类型/属性契约失配、P0 哨兵 manifest 死代码、查询层静默 fail-open。读它比读任何理想架构文档都更接近真相。

## 三、最新路线图 / 在办任务（知道"现在在做什么"）

1. **[DASHBOARD-CN.md](DASHBOARD-CN.md)** — 项目仪表盘（任务看板）。
   **为什么必读**：全部 D# 任务的交付状态、待办队列、K3 审计结论、创始人待裁决项都在这里。开工前先看它。
2. **[控制塔 V4.6 设计稿](../plans/codex/strategy/SYNOVA-DESIGN-控制塔V4.6-独立化-20260802.md)** — 控制塔独立化设计。
   **为什么必读**：控制塔是开发流程的中枢，也是 Synova 产品的一部分（D314 起独立化）。
3. **[DOC-SYNC-GUIDE.md](coordination/DOC-SYNC-GUIDE.md)** — 文档拉平指引（D337，当前在办）。
   **为什么必读**：这是你正在参与的任务。理解"先提交 → 拉平 → 合流"的三步铁律。

## 四、重大决策与事故教训（最值钱的部分——别重复犯错）

1. **[AUTHORITY-DEVIATION-REGISTRY-v2.md](../research/AUTHORITY-DEVIATION-REGISTRY-v2.md)** — 权威偏差登记册。
   **为什么必读**：P0/P1 全清单（N13 进化闭环断裂、placeholder 假成功、铁律 38 packages 盲区、N14 去重键不稳定），是"文档声称 vs 代码现实"的对照总账。
2. **[AUDIT-FINDINGS-LEDGER.md](coordination/AUDIT-FINDINGS-LEDGER.md)** — 审计发现台账。
   **为什么必读**：K3 全部审计发现 + 模式归纳（M1-M8）+ 控制塔改进队列（CT-1~CT-28）。是"改进控制塔 + 改进 dev doc skill"的素材库。
3. **[MULTI-MACHINE-PR-WORKFLOW.md](coordination/MULTI-MACHINE-PR-WORKFLOW.md)** — 多机协作 PR 工作流（D334）。
   **为什么必读**：解决了 Mac/Win 双机互相覆盖的事故（Mac 4 天不知道 Win 推了 11 个 commit）。核心原则：main 是唯一真相、一人一事一分支、合并走 PR。
4. **[memory/](../../memory/)** — 教训库（20 份）。
   **为什么必读**：从 2026-05 至今的全部实际错误沉淀（stash 事故、跨 session 污染、MSYS 路径坑等）。铁律就是从这里提炼的。
5. **[DECISION-REFERENCE.md](coordination/DECISION-REFERENCE.md)** — 决策双参考系。
   **为什么必读**：难决策时走四步——第一性原理（DeepSeek/梁文峰）+ Anthropic 工程基线 + DeepSeek 开源实证 + 收敛检查。这是创始人的决策哲学。

## 五、控制塔体系说明（搞懂"我们的开发流程怎么管"）

1. **[ROLES.md](coordination/ROLES.md)** — 三权分立角色。
   **为什么必读**：规划（Codex）/ 编码（Claude）/ 独立审计（K3）的分工边界。你是 Harness，要先知道自己接哪个角色。
2. **[AUDIT-PROTOCOL.md](coordination/AUDIT-PROTOCOL.md)** — 审计协议。
   **为什么必读**：交付审计的 7 步流程、11 项语义清单、P0/P1/P2 分级。所有交付都要过这道关。

---

## 快速上手建议（按角色）

- **如果你要写代码**：先读 AGENTS.md 铁律 → 看 DASHBOARD 找任务 → 走 synova-commit（12 组门禁）。
- **如果你要审计**：先读 AUDIT-PROTOCOL → 用 synova-audit skill → 对照 AUTHORITY-DEVIATION-REGISTRY。
- **如果你要规划/写 dev doc**：先读 ROLES.md + DECISION-REFERENCE → 用 synova-dev-doc skill。
- **如果你只是了解项目**：按本文档一到五节顺序读即可。

> 完整文档清单见 [DOCUMENT-INVENTORY.md](DOCUMENT-INVENTORY.md)。

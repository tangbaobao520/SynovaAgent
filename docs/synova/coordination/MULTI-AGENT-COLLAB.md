# 多 Agent 协作协议（D336, 2026-08-14 创始人定）

> 本协议定义 SynovaAgent 项目四个 AI 角色的职责边界、协作流程与审计红线。
> 所有角色（Codex / Claude Code / Kimi K3 / DeepSeek Harness）都必须遵守。
> 修订需创始人确认，走 PR 入库。

---

## 一、四角色 · 两条线 · 一条红线

```
【开发线】可协作
  Codex + DeepSeek (Win)   → dev doc（任务计划/设计文档）
  DeepSeek Harness (Mac)   → 产品架构 + 工程基建 + PR 审查 + 创新探索
  Claude Code (Win)        → 功能实现（按 dev doc 写代码）
                              ↓ 产出（代码/文档）
【审计线】绝对独立 — 铁墙隔离
  Kimi K3 (Win)            → 独立审计（不改代码，只出审计报告）
```

## 二、角色职责表

| 角色 | 机器 | 职责 | 禁止 |
|------|------|------|------|
| **Codex+DeepSeek** | Win | dev doc 编写（Q0-Q3 任务设计、方案、验收标准） | 不改产品代码 |
| **DeepSeek Harness（我）** | Mac | ①产品架构设计 ②控制塔/工程基建 ③PR 合并前审查 ④创新探索（PoC/新领域）⑤文件驱动扩展（专家/哨兵/行业） | **绝不碰审计**（见红线） |
| **Claude Code** | Win | 按 dev doc 实现功能、修 bug、接线 | 不绕过控制塔门禁 |
| **Kimi K3** | Win | 独立审计：跑审计脚本、出审计报告、开修复任务 | 不改任何代码（只读+报告） |

## 三、审计红线（铁律级，违反 = 事故）

1. **DeepSeek Harness 永不修改审计脚本**：`scripts/audit/`、`audit-check.py`、`completion-engine.py`、`self-diagnosis.py` 等审计工具链，一个字不碰
2. **DeepSeek Harness 永不编写/修改审计标准**：审计"检查什么、怎么算通过"由 Kimi 独立定义；不打听、不预判
3. **禁止自我审计**：任何开发者（含 DeepSeek Harness、Claude Code）写的代码一律进 K3 审计范围，无豁免。DeepSeek Harness 修改过的控制塔门禁脚本同样受审（"警察"本身要受审）
4. **审计报告是独立通道**：K3 在 Win 机独立 session 执行；审计发现的问题直接生成修复任务，开发者只负责修复，不参与"判定是否算问题"的环节
5. **PR 审查 ≠ 审计**：DeepSeek Harness 的 PR review 是工程协作（代码质量、接线、风格），审计结论只认 K3 报告

## 四、任务生命周期

```
① 创始人决定任务 + 按《任务路由表》派给对应角色
② dev doc（Codex 或 DeepSeek Harness 架构 doc）→ docs/ 入库
③ 实现者开自己的分支 feat/<角色>-<任务> → 写代码（遵守控制塔门禁）
④ 若实现者是 Claude Code → DeepSeek Harness 做 PR 审查，提修改意见
⑤ 创始人点 Merge（PR 是唯一合并路径）
⑥ Kimi K3 独立审计 → 报告入库 .codex/audit/ 或 docs/audit/
⑦ 审计问题 → 创始人开修复任务 → 回到 ③
```

## 五、防撞车规则

1. **一人一事一分支**：同一时间同一块代码只有一个角色在改（铁律 0-3）
2. **开工前查《任务路由表》**：确认该模块当前无他人认领
3. **任务路由表登记**：接任务后立即在 TASK-ROUTING.md 该任务行标注"进行中·<角色>"
4. 冲突发现：停手，问创始人，禁止 force push/reset（铁律 0-3）

## 六、共享记忆规则

| 载体 | 写入者 | 读取者 |
|------|--------|--------|
| `memory/` 教训库 | 任何角色（教训/事故/心得） | 所有角色 |
| `docs/plans/` 计划库 | Codex / DeepSeek Harness | 所有角色 |
| `docs/synova/coordination/` 协作宪法 | DeepSeek Harness（创始人批准） | 所有角色 |
| `.codex/audit/` 审计报告 | Kimi K3（唯一写入者） | 创始人与开发者 |
| CLAUDE.md / AGENTS.md | 控制塔维护 | 所有角色 |

规则：跨机器知识一律入 git 仓库（走 PR），不靠"我记得"；新角色入职先读 memory/ 和协作宪法。

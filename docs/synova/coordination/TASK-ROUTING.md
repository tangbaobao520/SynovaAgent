# 任务路由表（D336, 2026-08-14 创始人定）

> 派活前查这张表。同一模块同一时间只允许一个角色认领（防撞车）。
> 状态标注：`进行中·<角色>` → `已完成·<角色·日期>`。

## 按任务类型路由

| 任务类型 | 首选角色 | 备注 |
|---------|---------|------|
| 新功能/新接口/改现有业务代码 | Claude Code (Win) | 按 dev doc 实现，熟悉现有代码 |
| 产品架构设计/跨模块重构方案 | DeepSeek Harness (Mac) | 出架构 doc，实现可交 Claude 或自己做 |
| 控制塔/工程基建（门禁/hooks/协作/备份） | DeepSeek Harness (Mac) | 已验证擅长（D334/D335） |
| PR 合并前审查 | DeepSeek Harness (Mac) | Claude 的 PR 先过我这关 |
| dev doc（任务设计/验收标准） | Codex+DeepSeek (Win) | 架构类 doc 也可由 DeepSeek Harness 出 |
| 独立审计 | Kimi K3 (Win) | 唯一角色，铁墙隔离 |
| 文件驱动扩展（新专家/哨兵/行业/技能） | 任一开发角色 | 加文件不改代码，天然不冲突，先查路由表 |
| 产品创新/新方向 PoC | DeepSeek Harness (Mac) | 快速验证，失败可弃 |

## 当前模块认领状态

| 模块/区域 | 状态 | 备注 |
|-----------|------|------|
| scripts/control-tower/（控制塔） | 进行中·DeepSeek Harness | D334-D336 连续迭代 |
| scripts/backup/（备份） | 已完成·DeepSeek Harness·08-14 | launchd 已装 |
| .claude/skills + .dsh/skills + DSH preset | 已完成·DeepSeek Harness·08-15 | D370 P0-P3（技能同步+组13+预设安装），PR 已合并 |
| src/ 业务代码（L1-L5） | 空闲 | Claude Code 主力 |
| scripts/audit/（审计工具） | Kimi K3 专属 | 红线：其他角色禁碰 |
| docs/synova/coordination/（协作宪法） | DeepSeek Harness | 创始人批准后变更 |
| scripts/product-lines/（产品进度仪表盘） | 已完成·DeepSeek Harness·08-16 | D371 Phase 1（PR #19 已合并）；D372 幂等修复同 PR 收尾 |
| scripts/golden-scenarios/（黄金场景证据引擎） | 进行中·DeepSeek Harness·08-16 | D371 已落目录骨架；GS-01~08 本体 D361-D364（下一任务） |

## 认领/交还流程

1. 接任务 → 在本表对应行标注 `进行中·<角色>·<日期>`
2. 完成任务（PR 已合并）→ 标注 `已完成·<角色>·<日期>`
3. 中途放弃 → 标注 `空闲` 并说明原因
4. 撞车（两人同时认领）→ 停手，问创始人仲裁

# 多 session 并行冲突 — 系统性根治方案（D458）

> 2026-08-18 | CTO | 决策记录（参考：第一性原理 + Anthropic 机器可验 + GIT-SYNC-PLAN 既定决策）
> 状态：待执行（创始人已批准系统性根治方向）

## 一、问题现象（证据）

近 3 天多 session 并行，反复出现合并冲突，涉及：
- D454/D455 撞号（alloc-task-id 无原子性）
- bypass.log 多 PR 冲突（D357/D358/D354）
- current-brief 冲突
- 生成物文件冲突

## 二、根因（第一性原理，证据链完整）

**不是"某个文件冲突"，而是"把运行时状态/生成物当源代码跟踪，用 git 分支合并模型处理它们"。**

证据：
1. GIT-SYNC-PLAN.md（2026-08-14）§4.1 已明确：session-registry.json / health.json / .codex/audit/ 等 = 运行时产物，**不进 git**
2. .gitignore（2026-08-14）已写入这些规则
3. **但 `git rm --cached` 从未执行** —— .gitignore 不影响已跟踪文件，所以 76 个文件仍被跟踪
4. 结果：这些本不该参与合并的文件持续制造冲突

## 三、系统性解法（三类文件，三种正确模型）

| 类别 | 文件 | 正确模型 | 处置 |
|---|---|---|---|
| **append-only 证据** | .claude/bypass.log | 取并集 | 保留跟踪 + merge=union（✅ D457 已做） |
| **运行时状态** | current-brief / session-registry / health / audit-result / gatekeeper 信号 | 每 session 本地 | git rm --cached 去跟踪 |
| **生成物** | founder-console / founder-dashboard / CTO-HEALTH / product-progress / *.html | 可重生成 | git rm --cached 去跟踪 |
| **源码/决策产物（保留）** | task-state/D*.json / audit-reports / spec / scripts/ | 审计证据链 | 保留跟踪 |

## 四、关键风险与规避

1. **bypass.log 不能去跟踪** —— D331 对账依赖 `git show HEAD:.claude/bypass.log` 读 git 版本。所以 bypass.log 用 merge=union（D457），不 rm --cached。
2. **founder-console.html 去跟踪后** —— dashboard-auto.yml CI 仍在生成它，但不再进 git，PR 不再为它冲突。生成物"可重生成"语义成立。
3. **CTO-HEALTH.md 去跟踪后** —— 它是"打开即真相"的仪表盘，去跟踪后每台机器本地生成，不再跨 session 冲突。但要在文档里标明"本地生成，见 gen-cto-health.py"。

## 五、执行步骤

1. `git rm --cached` 移除运行时状态/生成物（保留 bypass.log）
2. 清理 .gitignore 自相矛盾规则（*.html vs !docs/**/*.html vs docs/*.html）
3. 固化版本管理：VERSION.md + 版本检查机制（创始人 2026-08-18 定：补丁=第三位/升级=第二位/改版=第一位）
4. 打 V4.8.1（D451+D456+D457+D458 这批补丁合并）
5. 测试 + 提交 + 推送 + 合并

## 六、版本判断（创始人授权 CTO 自决）

本次 = 修复 bug（执行既定决策 GIT-SYNC-PLAN，非新增功能、非破坏性重设计）→ **补丁 V4.8.1**

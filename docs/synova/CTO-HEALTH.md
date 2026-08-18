# Synova CTO 健康仪表盘（第③面）

> 打开即真相。生成: 2026-08-18 23:12:25 | 数据源指纹: 1e6b5ab3669c

<!-- CTO-HEALTH:AUTO:START -->
## CTO 健康仪表盘（第③面）— 自动区
> 生成: 2026-08-18 23:12:24 | 数据源: bypass.log / pre-commit-failures.log / AUDIT-FINDINGS-LEDGER

**总体判定: 🟡 黄 — 历史有 M 模式复发记录 (见 §三; 多为 D328-D331 已闭环项, 需 CTO 确认无新增)**

### 一、门禁执行（bypass.log 全历史）

| 事件 | 全量 | 24h 内 |
|------|:---:|:---:|
| COMMITTED（正常提交） | 207 | 44 |
| BLOCKED（被门禁拒绝） | 52 | 17 |
| DEGRADED（降级放行） | 42 | 9 |
| TIMEOUT（超时） | 3 | 0 |
| **detected-bypass（真绕过）** | **5** | **0** |

近 7 天事件: 2026-08-11:3 | 2026-08-12:28 | 2026-08-13:8 | 2026-08-14:14 | 2026-08-16:26 | 2026-08-17:127 | 2026-08-18:68

**绕过历史（全部）** — 集中在 07-26~28（旧 marker 时代），此后零绕过：
- `2026-07-26T18:34:35Z` no-precommit-marker
- `2026-07-26T19:11:26Z` no-precommit-marker
- `2026-07-26T19:20:27Z` no-precommit-marker
- `2026-07-27T21:54:30Z` no-precommit-marker
- `2026-07-28T14:59:07Z` no-precommit-marker

### 二、门禁拒绝（pre-commit-failures.log）

- 累计拒绝: **15** 次 | 最近: 2026-08-17
- 阈值: >10 次/24h → 门禁过激警告（健康审计项）

### 三、M 模式复发（AUDIT-FINDINGS-LEDGER §二）

| 模式 | 名称 | 首次 | 再次 |
|------|------|------|------|
| M1 | **fail-open 静默失效**（检查未执行==检查通过） | D328 P1-1 | D329 P2-5（`\|\| true`） |
| M2 | **声称 vs 事实**（doc/报告 overclaim） | D328 P1-2 | D329 P2-1（task_id）、Mac ba653c3（零引用声称） |
| M4 | **执行证据链断裂**（bypass.log） | D328 P1-3 | D329 P1-2（第二次） |
| M5 | **环境依赖门禁**（python3/broken shim） | D328 P1-1 | D329 P2-5 |

> ⚠️ 复发 = 同类错误第二次出现 = 防线系统性失效，按红线升级创始人。

### 四、CT 改进队列（台账 §三）

- ✅ 已完成 3 · 🔄 进行中 31 · ⏳ 未排 7

### 五、任务状态汇总（task-state/，D382）

| 任务 | 状态 | spec | impl | audit | FIX |
|------|------|:---:|:---:|:---:|------|
| D356 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D379 | impl_done | ⚠ | ✅ | — |  |
| D383 | audited | — | ✅ | CONDITIONAL_PASS | D384 |
| D384 | impl_done | — | ✅ | — |  |
| D385 | impl_done | — | ✅ | — |  |
| D386 | impl_done | — | ✅ | — |  |
| D387 | audited | ✅ | ✅ | CONDITIONAL_PASS | CT-P1-1 |
| D389 | impl_done | — | ✅ | — |  |
| D390 | impl_done | — | ✅ | — |  |
| D391 | audited | — | ✅ | CONDITIONAL_PASS | D402 |
| D392 | impl_done | — | ✅ | — |  |
| D393 | audited | — | ✅ | PASS | D399 |
| D394 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D395 | audited | ✅ | ✅ | CONDITIONAL_PASS | D406 |
| D396 | audited | ✅ | ✅ | PASS |  |
| D397 | claimed | — | — | — |  |
| D398 | claimed | — | — | — |  |
| D399 | impl_done | — | ✅ | — |  |
| D400 | impl_done | — | ✅ | — |  |
| D401 | impl_done | — | ✅ | — |  |
| D402 | spec_done | ✅ | — | — |  |
| D403 | impl_done | — | ✅ | — |  |
| D404 | impl_done | — | ✅ | — |  |
| D405 | impl_done | — | ✅ | — |  |
| D406 | impl_done | — | ✅ | — |  |
| D407 | impl_done | — | ✅ | — |  |
| D408 | impl_done | — | ✅ | — |  |
| D409 | impl_done | — | ✅ | — |  |
| D410 | impl_done | — | ✅ | — |  |
| D412 | impl_done | — | ✅ | — |  |
| D413 | impl_done | — | ✅ | — |  |
| D414 | impl_done | — | ✅ | — |  |
| D415 | impl_done | — | ✅ | — |  |
| D416 | impl_done | — | ✅ | — |  |
| D417 | impl_done | — | ✅ | — |  |
| D419 | impl_done | — | ✅ | — |  |
| D428 | impl_done | — | ✅ | — |  |
| D429 | impl_done | — | ✅ | — |  |
| D430 | impl_done | — | ✅ | — |  |
| D439 | impl_done | — | ✅ | — |  |
| D440 | impl_done | — | ✅ | — |  |
| D441 | impl_done | — | ✅ | — |  |
| D442 | impl_done | — | ✅ | — |  |
| D443 | claimed | — | — | — |  |
| D444 | claimed | — | — | — |  |
| D445 | claimed | — | — | — |  |
| D446 | claimed | — | — | — |  |
| D447 | claimed | — | — | — |  |
| D448 | claimed | — | — | — |  |
| D449 | claimed | — | — | — |  |
| D450 | impl_done | — | ✅ | — |  |
| D451 | impl_done | — | ✅ | — |  |
| D452 | impl_done | — | ✅ | — |  |
| D453 | impl_done | — | ✅ | — |  |
| D454 | impl_done | — | ✅ | — |  |

> 📦 历史任务（已折叠）: **143** 个（git log 全项目派生，非 task-state 登记；8 个有审计报告）
> 这些是 task-state 未登记、但 git 里确有提交的全项目任务（D5~D398 早期 + Win/Codex 侧），状态按 impl 派生。

### 六、CI 状态（CT-41①, GitHub API）

| Run | 结论 | 分支 | 标题 |
|-----|------|------|------|
| — | ⚠ 无法拉取（degraded） | | |

### 七、开放 PR（待合并，CT-41⑥）

- ⚠ 无法拉取（degraded）

### 八、P0 积压（CT-41③，自动派生自 p0-backlog.json）

| ID | 来源 | 问题 | 修复任务 | 状态 | 线 |
|----|------|------|----------|------|-----|
| P0-1 | K3 D391 审计 P1-1（升级 P0 流程事项） | federated 兜底写入即蒸发（201 假成功） | D402 | 已派发 | 产品/数据接入 |

> P0 积压 = 未闭合的 P0 级审计发现，机器可查（不靠 CTO 手写记忆），闭合后从 p0-backlog.json 移出。

> 红线提醒: 不碰 scripts/audit/；不写审计标准；禁止自我审计。
> 同类错误第二次出现 = 防线系统性失效，升级创始人。

<!-- CTO-HEALTH:AUTO:END -->
<!-- CTO-HEALTH:MANUAL:START -->
(CTO 备注区)
<!-- CTO-HEALTH:MANUAL:END -->

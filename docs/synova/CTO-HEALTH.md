# Synova CTO 健康仪表盘（第③面）

> 打开即真相。生成: 2026-08-17 04:50:33 | 数据源指纹: 22d0657aa827

<!-- CTO-HEALTH:AUTO:START -->
## CTO 健康仪表盘（第③面）— 自动区
> 生成: 2026-08-17 04:50:33 | 数据源: bypass.log / pre-commit-failures.log / AUDIT-FINDINGS-LEDGER

**总体判定: 🟡 黄 — 历史有 M 模式复发记录 (见 §三; 多为 D328-D331 已闭环项, 需 CTO 确认无新增)**

### 一、门禁执行（bypass.log 全历史）

| 事件 | 全量 | 24h 内 |
|------|:---:|:---:|
| COMMITTED（正常提交） | 49 | 22 |
| BLOCKED（被门禁拒绝） | 27 | 5 |
| DEGRADED（降级放行） | 31 | 0 |
| TIMEOUT（超时） | 3 | 0 |
| **detected-bypass（真绕过）** | **5** | **0** |

近 7 天事件: 2026-08-10:1 | 2026-08-11:3 | 2026-08-12:28 | 2026-08-13:8 | 2026-08-14:14 | 2026-08-16:26 | 2026-08-17:1

**绕过历史（全部）** — 集中在 07-26~28（旧 marker 时代），此后零绕过：
- `2026-07-26T18:34:35Z` no-precommit-marker
- `2026-07-26T19:11:26Z` no-precommit-marker
- `2026-07-26T19:20:27Z` no-precommit-marker
- `2026-07-27T21:54:30Z` no-precommit-marker
- `2026-07-28T14:59:07Z` no-precommit-marker

### 二、门禁拒绝（pre-commit-failures.log）

- 累计拒绝: **7** 次 | 最近: 2026-08-16
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

- ✅ 已完成 3 · 🔄 进行中 29 · ⏳ 未排 7

### 五、任务状态汇总（task-state/，D382）

| 任务 | 状态 | spec | impl | audit | FIX |
|------|------|:---:|:---:|:---:|------|
| D356 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D379 | impl_done | ✅ | ✅ | — |  |
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
| D394 | claimed | — | — | — |  |
| D395 | claimed | — | — | — |  |
| D396 | claimed | — | — | — |  |
| D397 | claimed | — | — | — |  |
| D398 | claimed | — | — | — |  |
| D399 | impl_done | — | ✅ | — |  |
| D400 | impl_done | — | ✅ | — |  |
| D401 | impl_done | — | ✅ | — |  |
| D402 | claimed | — | — | — |  |
| D403 | impl_done | — | ✅ | — |  |

> 红线提醒: 不碰 scripts/audit/；不写审计标准；禁止自我审计。
> 同类错误第二次出现 = 防线系统性失效，升级创始人。

<!-- CTO-HEALTH:AUTO:END -->
<!-- CTO-HEALTH:MANUAL:START -->
(CTO 备注区)
<!-- CTO-HEALTH:MANUAL:END -->

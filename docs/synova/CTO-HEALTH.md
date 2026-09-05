# Synova CTO 健康仪表盘（第③面）

> 打开即真相。生成: 2026-08-29 23:24:17 | 数据源指纹: 4481b66396ea

<!-- CTO-HEALTH:AUTO:START -->
## CTO 健康仪表盘（第③面）— 自动区
> 生成: 2026-08-29 23:24:10 | 数据源: bypass.log / pre-commit-failures.log / AUDIT-FINDINGS-LEDGER

**总体判定: 🟡 黄 — 历史有 M 模式复发记录 (见 §三; 多为 D328-D331 已闭环项, 需 CTO 确认无新增)**

### 一、门禁执行（bypass.log 全历史）

| 事件 | 全量 | 24h 内 |
|------|:---:|:---:|
| COMMITTED（正常提交） | 654 | 47 |
| BLOCKED（被门禁拒绝） | 129 | 1 |
| DEGRADED（降级放行） | 43 | 0 |
| TIMEOUT（超时） | 3 | 0 |
| **detected-bypass（真绕过）** | **9** | **0** |

近 7 天事件: 2026-08-23:45 | 2026-08-24:40 | 2026-08-25:84 | 2026-08-26:24 | 2026-08-27:44 | 2026-08-28:75 | 2026-08-29:43

**绕过历史（全部）** — 集中在 07-26~28（旧 marker 时代），此后零绕过：
- `2026-07-26T18:34:35Z` no-precommit-marker
- `2026-07-26T19:11:26Z` no-precommit-marker
- `2026-07-26T19:20:27Z` no-precommit-marker
- `2026-07-27T21:54:30Z` no-precommit-marker
- `2026-07-28T14:59:07Z` no-precommit-marker
- `2026-08-22T07:59:08Z` head-mismatch marker=eff66bf8513adb435545cbabd373a5fd14efc409 parent=214ac7f27d0cd00b2f8380f7c60ae720dfe4121c
- `2026-08-24T07:37:00Z` no-precommit-marker
- `2026-08-24T07:54:06Z` no-precommit-marker
- `2026-08-25T12:21:35Z` no-precommit-marker

### 二、门禁拒绝（pre-commit-failures.log）

- 累计拒绝: **0** 次 | 最近: 无
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

- ✅ 已完成 6 · 🔄 进行中 34 · ⏳ 未排 8

### 五、任务状态汇总（task-state/，D382）

| 任务 | 状态 | spec | impl | audit | FIX |
|------|------|:---:|:---:|:---:|------|
| D356 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D379 | impl_done | — | ✅ | — |  |
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
| D402 | impl_done | ✅ | ✅ | — |  |
| D403 | impl_done | — | ✅ | — |  |
| D404 | impl_done | — | ✅ | — |  |
| D405 | impl_done | — | ✅ | — |  |
| D406 | impl_done | — | ✅ | — |  |
| D407 | impl_done | — | ✅ | — |  |
| D408 | impl_done | — | ✅ | — |  |
| D409 | impl_done | — | ✅ | — |  |
| D410 | impl_done | — | ✅ | — |  |
| D411 | impl_done | — | ✅ | — | zombie-cancelled |
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
| D442 | impl_done | — | ✅ | — | D453 |
| D443 | impl_done | — | ✅ | — |  |
| D444 | impl_done | — | ✅ | — |  |
| D445 | impl_done | ⚠ | ✅ | — |  |
| D446 | impl_done | — | ✅ | — |  |
| D447 | claimed | — | — | — |  |
| D448 | claimed | — | — | — |  |
| D449 | claimed | — | — | — |  |
| D450 | impl_done | — | ✅ | — |  |
| D451 | impl_done | — | ✅ | — |  |
| D452 | impl_done | — | ✅ | — |  |
| D453 | impl_done | — | ✅ | — |  |
| D454 | impl_done | — | ✅ | — |  |
| D455 | impl_done | — | ✅ | — |  |
| D456 | impl_done | — | ✅ | — |  |
| D457 | impl_done | — | ✅ | — |  |
| D458 | impl_done | — | ✅ | — |  |
| D459 | impl_done | — | ✅ | — |  |
| D460 | impl_done | — | ✅ | — |  |
| D461 | impl_done | — | ✅ | — |  |
| D462 | impl_done | — | ✅ | — |  |
| D463 | impl_done | — | ✅ | — |  |
| D464 | impl_done | — | ✅ | — |  |
| D465 | impl_done | — | ✅ | — |  |
| D466 | impl_done | — | ✅ | — |  |
| D467 | impl_done | — | ✅ | — |  |
| D468 | impl_done | — | ✅ | — |  |
| D472 | impl_done | ✅ | ✅ | — |  |
| D473 | impl_done | ✅ | ✅ | — |  |
| D474 | impl_done | ✅ | ✅ | — |  |
| D483 | impl_done | ✅ | ✅ | — |  |
| D484 | impl_done | ✅ | ✅ | — |  |
| D486 | impl_done | ✅ | ✅ | — |  |
| D487 | impl_done | ✅ | ✅ | — |  |
| D489 | impl_done | ✅ | ✅ | — |  |
| D500 | impl_done | ✅ | ✅ | — |  |
| D501 | impl_done | ✅ | ✅ | — |  |
| D502 | impl_done | ✅ | ✅ | — |  |
| D503 | impl_done | ✅ | ✅ | — |  |
| D504 | impl_done | — | ✅ | — |  |
| D505 | impl_done | — | ✅ | — |  |
| D507 | impl_done | — | ✅ | — | superseded-by-D539-D540 |
| D508 | impl_done | ✅ | ✅ | — |  |
| D509 | impl_done | — | ✅ | — |  |
| D510 | impl_done | — | ✅ | — | D514 |
| D511 | impl_done | — | ✅ | — | zombie-cancelled |
| D512 | impl_done | — | ✅ | — | zombie-cancelled |
| D513 | impl_done | ✅ | ✅ | — |  |
| D514 | impl_done | — | ✅ | — |  |
| D515 | audited | ✅ | ✅ | FAIL | D516 |
| D516 | impl_done | — | ✅ | — |  |
| D517 | impl_done | ✅ | ✅ | — |  |
| D518 | impl_done | ✅ | ✅ | — |  |
| D519 | impl_done | ✅ | ✅ | — |  |
| D520 | impl_done | ✅ | ✅ | — |  |
| D521 | impl_done | ✅ | ✅ | — |  |
| D522 | impl_done | ✅ | ✅ | — |  |
| D523 | impl_done | ✅ | ✅ | — |  |
| D524 | impl_done | ✅ | ✅ | — | D518 |
| D525 | impl_done | — | ✅ | — |  |
| D526 | claimed | — | — | — |  |
| D527 | impl_done | ✅ | ✅ | — |  |
| D528 | impl_done | ✅ | ✅ | — |  |
| D529 | impl_done | — | ✅ | — | superseded-by-D517 |
| D530 | impl_done | — | ✅ | — |  |
| D531 | impl_done | — | ✅ | — |  |
| D532 | impl_done | — | ✅ | — |  |
| D533 | impl_done | ✅ | ✅ | — |  |
| D534 | impl_done | — | ✅ | — |  |
| D535 | impl_done | — | ✅ | — |  |
| D536 | impl_done | ✅ | ✅ | — |  |
| D537 | impl_done | — | ✅ | — |  |
| D538 | impl_done | — | ✅ | — |  |
| D539 | impl_done | ✅ | ✅ | — |  |
| D540 | impl_done | ✅ | ✅ | — |  |
| D541 | impl_done | — | ✅ | — | FIX-D541 |
| D542 | impl_done | — | ✅ | — |  |
| D543 | impl_done | — | ✅ | — |  |
| D544 | impl_done | — | ✅ | — | FIX-D544 |
| D545 | impl_done | — | ✅ | — | renumber-to-D546 |
| D546 | impl_done | — | ✅ | — |  |
| D547 | impl_done | — | ✅ | — |  |
| D548 | claimed | — | — | — |  |
| D549 | impl_done | — | ✅ | — |  |
| D550 | impl_done | — | ✅ | — |  |
| D551 | impl_done | ✅ | ✅ | — |  |
| D552 | impl_done | — | ✅ | — |  |
| D553 | impl_done | — | ✅ | — |  |
| D554 | impl_done | — | ✅ | — |  |
| D555 | impl_done | — | ✅ | — |  |
| D556 | impl_done | — | ✅ | — |  |
| D557 | impl_done | — | ✅ | — |  |
| D558 | impl_done | — | ✅ | — |  |
| D558 | impl_done | — | ✅ | — |  |
| D560 | impl_done | — | ✅ | — |  |
| D561 | impl_done | — | ✅ | — |  |
| D562 | impl_done | — | ✅ | — |  |
| D563 | claimed | — | — | — |  |
| D564 | claimed | — | — | — |  |

> 📦 历史任务（已折叠）: **158** 个（git log 全项目派生，非 task-state 登记；12 个有审计报告）
> 这些是 task-state 未登记、但 git 里确有提交的全项目任务（D5~D398 早期 + Win/Codex 侧），状态按 impl 派生。

### 六、CI 状态（CT-41①, GitHub API）

| Run | 结论 | 分支 | 标题 |
|-----|------|------|------|
| #2228 | 🟡 action_required | auto/dashboard | chore(D439): 控制台自动更新 |
| #2227 | 🟢 success | main | chore(closeout): 复审回流登记 + canary 补 g12(26) + 清单翻转  |
| #345 | 🟢 success | main | chore(closeout): 复审回流登记 + canary 补 g12(26) + 清单翻转  |
| #136 | 🟢 success | main | chore(closeout): 复审回流登记 + canary 补 g12(26) + 清单翻转  |
| #268 | 🟢 success | main | chore(closeout): 复审回流登记 + canary 补 g12(26) + 清单翻转  |
| #258 | 🔴 failure | main | pages build and deployment |
| #2226 | 🟢 success | chore/reaudit-closeout | chore(closeout): 复审回流登记 + canary 补齐 27 + 清单翻转 + D5 |
| #2225 | 🔴 failure | chore/reaudit-closeout | chore(closeout): 复审回流登记 + canary 补齐 27 + 清单翻转 + D5 |

> CI 红灯监测: main 红 0.6h（<24h 阈值），暂不告警（CT-39）

### 九、worktree 收尾（2026-08-21 必修）

- 🔴 **10 个孤儿 worktree 有待收尾**（独有提交未合并进 main，可能是未收尾的交付）
  - /Users/wane/synova-wt-D508b (分支 refs/heads/fix/d505-wiring, 3 个独有提交)
  - /Users/wane/synova-wt-D510 (分支 refs/heads/feat/d510-audit-remediation, 10 个独有提交)
  - /Users/wane/synova-wt-D511 (分支 refs/heads/feat/d511-version-guard, 8 个独有提交)
  - /Users/wane/synova-wt-D512 (分支 refs/heads/feat/d512-gs-refresh, 12 个独有提交)
  - /Users/wane/synova-wt-D514 (分支 refs/heads/fix/d514-d510-audit-fix, 1 个独有提交)
  - /Users/wane/synova-wt-D516 (分支 refs/heads/fix/d516-ci-strict, 2 个独有提交)
  - /Users/wane/synova-wt-sliceA-specs (分支 refs/heads/docs/slice-a-specs, 3 个独有提交)
  - /Users/wane/SynovaAgent/.wt-d483 (分支 refs/heads/feat/d483-register-auth, 2 个独有提交)
  - /Users/wane/SynovaAgent/.wt-d556 (分支 refs/heads/feat/d556-ga-collab-e2e, 12 个独有提交)
  - /Users/wane/SynovaAgent/.wt-d558 (分支 refs/heads/fix/d561-three-p1-restore, 4 个独有提交)

> 处理: 确认独有提交是否该合并（真交付）→ worktree-manager finish 或 merge 进 main；过时则删除。

> 红线提醒: 不碰 scripts/audit/；不写审计标准；禁止自我审计。
> 同类错误第二次出现 = 防线系统性失效，升级创始人。

<!-- CTO-HEALTH:AUTO:END -->
<!-- CTO-HEALTH:MANUAL:START -->
(CTO 备注区)
<!-- CTO-HEALTH:MANUAL:END -->

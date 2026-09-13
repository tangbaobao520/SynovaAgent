# Synova CTO 健康仪表盘（第③面）

> 打开即真相。生成: 2026-09-14 03:01:17 | 数据源指纹: 761e7ad63e9b

<!-- CTO-HEALTH:AUTO:START -->
## CTO 健康仪表盘（第③面）— 自动区
> 生成: 2026-09-14 03:01:16 | 数据源: bypass.log / pre-commit-failures.log / AUDIT-FINDINGS-LEDGER

**总体判定: 🟡 黄 — 历史有 M 模式复发记录 (见 §三; 多为 D328-D331 已闭环项, 需 CTO 确认无新增)**

### 一、门禁执行（bypass.log 全历史）

| 事件 | 全量 | 24h 内 |
|------|:---:|:---:|
| COMMITTED（正常提交） | 1051 | 59 |
| BLOCKED（被门禁拒绝） | 144 | 0 |
| DEGRADED（降级放行） | 46 | 3 |
| TIMEOUT（超时） | 3 | 0 |
| **detected-bypass（真绕过）** | **15** | **0** |

近 7 天事件: 2026-09-08:56 | 2026-09-09:30 | 2026-09-10:46 | 2026-09-11:16 | 2026-09-12:27 | 2026-09-13:54 | 2026-09-14:14

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
- `2026-08-29T19:33:16Z` head-mismatch marker=020443b663efba3a9052a0650860c10b56b5ad60 parent=9b2e7cff32310e18e89ae3c67580d84a993b6e79
- `2026-09-04T16:01:40Z` head-mismatch marker=14d0d4c3c1f0a75ed5e7c6bfa13b4ac2ab185c85 parent=a352f67893fb454eebccbd768a740553a715673a
- `2026-09-05T19:35:31Z` head-mismatch marker=68e3acdbc5326758f0e064ab017bc45dc9091dcc parent=cf24a250474e156c2d6ec93bf725c51b99a41a24
- `2026-09-08T15:23:41Z` no-precommit-marker
- `2026-09-08T15:20:28Z` head-mismatch marker=a1604eee99a810486c2a521f10b253c5c60bc504 parent=95e1c9fa5b192cb2bae1c35cf505dc8cc353eb2f
- `2026-09-10T02:24:35Z` head-mismatch marker=c30d1b2091f8d18a51fb77033eea29c17dd1c90e parent=b6794022404819dc986bd7a2a2a261f8267943cc

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

- ✅ 已完成 7 · 🔄 进行中 35 · ⏳ 未排 7

### 五、任务状态汇总（task-state/，D382）

| 任务 | 状态 | spec | impl | audit | FIX |
|------|------|:---:|:---:|:---:|------|
| D356 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D379 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D383 | audited | — | ✅ | CONDITIONAL_PASS | D384 |
| D384 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D385 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D386 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D387 | audited | ✅ | ✅ | CONDITIONAL_PASS | CT-P1-1 |
| D389 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D390 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D391 | audited | — | ✅ | CONDITIONAL_PASS | D402 |
| D392 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D393 | audited | — | ✅ | FAIL | D399 |
| D394 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D395 | audited | ✅ | ✅ | CONDITIONAL_PASS | D406 |
| D396 | audited | ✅ | ✅ | PASS |  |
| D397 | audited | — | — | CONDITIONAL_PASS |  |
| D398 | audited | — | — | CONDITIONAL_PASS |  |
| D399 | audited | — | ✅ | FAIL |  |
| D400 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D401 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D402 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D403 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D404 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D405 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D406 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D407 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D408 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D409 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D410 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D411 | impl_done | — | ✅ | — | zombie-cancelled |
| D412 | audited | — | ✅ | PASS |  |
| D413 | audited | — | ✅ | PASS |  |
| D414 | audited | — | ✅ | PASS |  |
| D415 | audited | — | ✅ | PASS |  |
| D416 | impl_done | — | ✅ | — |  |
| D417 | impl_done | — | ✅ | — |  |
| D419 | audited | — | ✅ | PASS |  |
| D428 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D429 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D430 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D439 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D440 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D441 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D442 | audited | — | ✅ | PASS | D453 |
| D443 | audited | — | ✅ | PASS |  |
| D444 | audited | — | ✅ | PASS |  |
| D445 | audited | ✅ | ✅ | PASS |  |
| D446 | audited | — | ✅ | PASS |  |
| D447 | audited | — | — | PASS |  |
| D448 | audited | — | — | PASS |  |
| D449 | audited | — | — | PASS |  |
| D450 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D451 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D452 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D453 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D454 | audited | — | ✅ | PASS |  |
| D455 | audited | — | ✅ | PASS |  |
| D456 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D457 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D458 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D459 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D460 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D461 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D462 | audited | — | ✅ | PASS |  |
| D463 | audited | — | ✅ | PASS |  |
| D464 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D465 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D466 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D467 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D468 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D472 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D473 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D474 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D483 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D484 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D485 | impl_done | ✅ | ✅ | — |  |
| D486 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D487 | audited | ✅ | ✅ | PASS |  |
| D488 | impl_done | ✅ | ✅ | — |  |
| D489 | audited | ✅ | ✅ | FAIL |  |
| D490 | impl_done | ✅ | ✅ | — |  |
| D491 | impl_done | ✅ | ✅ | — |  |
| D492 | impl_done | ✅ | ✅ | — |  |
| D500 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D501 | audited | ✅ | ✅ | FAIL |  |
| D502 | audited | ✅ | ✅ | FAIL |  |
| D503 | audited | ✅ | ✅ | FAIL |  |
| D504 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D505 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D507 | impl_done | — | ✅ | — | superseded-by-D539-D540 |
| D508 | audited | ✅ | ✅ | FAIL |  |
| D509 | audited | — | ✅ | FAIL |  |
| D510 | impl_done | — | ✅ | — | D514 |
| D511 | impl_done | — | ✅ | — | zombie-cancelled |
| D512 | impl_done | — | ✅ | — | zombie-cancelled |
| D513 | audited | ✅ | ✅ | FAIL |  |
| D514 | impl_done | — | ✅ | — |  |
| D515 | audited | ✅ | ✅ | FAIL | D516 |
| D516 | audited | — | ✅ | FAIL |  |
| D517 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D518 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D519 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D520 | audited | ✅ | ✅ | FAIL |  |
| D521 | audited | ✅ | ✅ | FAIL |  |
| D522 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D523 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D524 | audited | ✅ | ✅ | FAIL | D518 |
| D525 | audited | — | ✅ | FAIL |  |
| D526 | audited | — | — | FAIL |  |
| D527 | audited | ✅ | ✅ | PASS |  |
| D528 | audited | ✅ | ✅ | PASS |  |
| D529 | impl_done | — | ✅ | — | superseded-by-D517 |
| D530 | impl_done | — | ✅ | — |  |
| D531 | impl_done | — | ✅ | — |  |
| D532 | impl_done | — | ✅ | — |  |
| D533 | impl_done | ✅ | ✅ | — |  |
| D534 | audited | — | ✅ | FAIL |  |
| D535 | audited | — | ✅ | FAIL |  |
| D536 | impl_done | ✅ | ✅ | — |  |
| D537 | audited | — | ✅ | FAIL |  |
| D538 | audited | — | ✅ | FAIL |  |
| D539 | impl_done | ✅ | ✅ | — |  |
| D540 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D541 | audited | — | ✅ | CONDITIONAL_PASS | FIX-D541 |
| D542 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D543 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D544 | audited | — | ✅ | CONDITIONAL_PASS | FIX-D544 |
| D545 | impl_done | — | ✅ | — | renumber-to-D546 |
| D546 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D547 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D548 | claimed | — | — | — |  |
| D549 | audited | — | ✅ | FAIL |  |
| D550 | audited | — | ✅ | FAIL |  |
| D551 | audited | ✅ | ✅ | PASS |  |
| D552 | impl_done | — | ✅ | — |  |
| D553 | impl_done | — | ✅ | — |  |
| D554 | impl_done | — | ✅ | — |  |
| D555 | impl_done | — | ✅ | — |  |
| D556 | audited | ✅ | ✅ | PASS |  |
| D557 | impl_done | — | ✅ | — |  |
| D558 | audited | — | ✅ | FAIL |  |
| D558 | impl_done | — | ✅ | — |  |
| D560 | audited | — | ✅ | FAIL |  |
| D561 | audited | — | ✅ | FAIL |  |
| D562 | impl_done | — | ✅ | — |  |
| D563 | audited | — | ✅ | FAIL |  |
| D564 | audited | — | ✅ | FAIL |  |
| D565 | impl_done | — | ✅ | — |  |
| D566 | claimed | — | — | — |  |
| D567 | audited | — | ✅ | PASS |  |
| D568 | audited | — | ✅ | PASS |  |
| D569 | audited | — | ✅ | PASS |  |
| D570 | impl_done | — | ✅ | — |  |
| D571 | impl_done | — | ✅ | — |  |
| D572 | audited | — | ✅ | FAIL | D578 |
| D575 | audited | ✅ | ✅ | PASS |  |
| D576 | audited | — | ✅ | PASS |  |
| D577 | audited | ✅ | ✅ | PASS |  |
| D578 | audited | — | ✅ | PASS |  |
| D579 | audited | ✅ | ✅ | PASS |  |
| D580 | audited | ✅ | ✅ | PASS |  |
| D581 | audited | — | ✅ | PASS |  |
| D582 | audited | — | ✅ | PASS |  |
| D583 | impl_done | — | ✅ | — |  |
| D584 | impl_done | — | ✅ | — |  |
| D586 | audited | ✅ | ✅ | PASS |  |
| D587 | audited | ✅ | ✅ | PASS |  |
| D588 | audited | ✅ | ✅ | PASS | D597 |
| D589 | impl_done | — | ✅ | — |  |
| D590 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D591 | audited | ✅ | ✅ | CONDITIONAL_PASS |  |
| D592 | audited | ✅ | ✅ | PASS |  |
| D593 | audited | ✅ | ✅ | CONDITIONAL_PASS | fix/d593-restore |
| D594 | impl_done | ✅ | ✅ | — |  |
| D595 | audited | — | ✅ | FAIL |  |
| D596 | claimed | — | — | — |  |
| D597 | impl_done | — | ✅ | — |  |
| D600 | spec_done | ✅ | — | — |  |
| D601 | claimed | — | — | — |  |
| D602 | audited | — | ✅ | CONDITIONAL_PASS |  |
| D603 | impl_done | — | ✅ | — |  |
| D651 | impl_done | ✅ | ✅ | — |  |
| D660 | impl_done | — | ✅ | — |  |
| D661 | impl_done | — | ✅ | — |  |
| D663 | impl_done | — | ✅ | — |  |
| D664 | audited | — | ✅ | FAIL |  |
| D665 | impl_done | ✅ | ✅ | — |  |
| D705 | impl_done | — | ✅ | — |  |
| D706 | audited | — | ✅ | FAIL |  |
| D707 | audited | — | ✅ | FAIL |  |
| D708 | audited | — | ✅ | FAIL |  |
| D709 | impl_done | — | ✅ | — |  |
| D710 | impl_done | — | ✅ | — |  |
| D711 | impl_done | — | ✅ | — |  |
| D712 | impl_done | — | ✅ | — |  |
| D713 | impl_done | — | ✅ | — |  |
| D714 | impl_done | — | ✅ | — |  |
| D715 | audited | — | ✅ | FAIL |  |
| D716 | impl_done | ✅ | ✅ | — |  |
| D717 | impl_done | — | ✅ | — |  |
| D718 | impl_done | — | ✅ | — |  |
| D719 | impl_done | — | ✅ | — |  |
| D720 | impl_done | — | ✅ | — |  |
| D721 | impl_done | — | ✅ | — |  |
| D725 | impl_done | ✅ | ✅ | — |  |
| D740 | impl_done | — | ✅ | — |  |
| D741 | impl_done | — | ✅ | — |  |
| D744 | claimed | — | — | — |  |
| CT-64 | claimed | — | — | — |  |

> 📦 历史任务（已折叠）: **177** 个（git log 全项目派生，非 task-state 登记；12 个有审计报告）
> 这些是 task-state 未登记、但 git 里确有提交的全项目任务（D5~D398 早期 + Win/Codex 侧），状态按 impl 派生。

### 六、CI 状态（CT-41①, GitHub API）

| Run | 结论 | 分支 | 标题 |
|-----|------|------|------|
| #3357 | 🟡 action_required | auto/product-progress | chore(D371): 产品进度自动更新 |
| #3356 | 🟡 action_required | auto/dashboard | chore(D439): 控制台自动更新 |
| #350 | 🟢 success | main | docs(D740/D741): L1 交互层未闭合项取证 + 真相源写入链路缺口定位 (#545) |
| #560 | 🟢 success | main | docs(D740/D741): L1 交互层未闭合项取证 + 真相源写入链路缺口定位 (#545) |
| #3355 | 🔴 failure | main | docs(D740/D741): L1 交互层未闭合项取证 + 真相源写入链路缺口定位 (#545) |
| #481 | 🟢 success | main | docs(D740/D741): L1 交互层未闭合项取证 + 真相源写入链路缺口定位 (#545) |
| #471 | 🟢 success | main | pages build and deployment |
| #3354 | 🟢 success | docs/d740-d741-l1-forensi | docs(D740/D741): L1 交互层未闭合项取证 + 真相源写入链路缺口定位 |

> CI 红灯监测: main 红 0.4h（<24h 阈值），暂不告警（CT-39）

### 九、worktree 收尾（2026-08-21 必修）

- 🔴 **3 个孤儿 worktree 有待收尾**（独有提交未合并进 main，可能是未收尾的交付）
  - /Users/wane/SynovaAgent/.sessions/d733/wt735 (分支 refs/heads/feat/mac-d735-bypass-out, 2 个独有提交)
  - /Users/wane/SynovaAgent/.sessions/d733/wt737 (分支 refs/heads/feat/mac-d737-tag-bypass-test-drift, 2 个独有提交)
  - /Users/wane/SynovaAgent/.sessions/d733/wt738 (分支 refs/heads/feat/mac-d738-locale-var-check, 2 个独有提交)

> 处理: 确认独有提交是否该合并（真交付）→ worktree-manager finish 或 merge 进 main；过时则删除。

> 红线提醒: 不碰 scripts/audit/；不写审计标准；禁止自我审计。
> 同类错误第二次出现 = 防线系统性失效，升级创始人。

<!-- CTO-HEALTH:AUTO:END -->
<!-- CTO-HEALTH:MANUAL:START -->
(CTO 备注区)
<!-- CTO-HEALTH:MANUAL:END -->

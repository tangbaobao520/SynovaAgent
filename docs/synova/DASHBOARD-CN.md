---
title: "Synova 项目仪表盘"
status: "由 scripts/control-tower/gen-task-board.py 生成 — 自动区为 git 派生事实"
---

# Synova 项目仪表盘

> 本文件由 `scripts/control-tower/gen-task-board.py` 生成。
> **自动区**（AUTO marker 内）为 git/文件事实派生，禁止手写；
> **手动区**（MANUAL marker 内）人工维护，生成器原样保留。
> 人工修改任务事实 → 编辑 `docs/synova/coverage/board-override.yaml` 或手动区。
<!-- AUTO:START -->
## 任务状态（git 派生）
> 数据源: git log 全历史 D# + dev docs 头 + task briefs + board-override.yaml。逐项缺失 → degraded 标注。
| D# | 任务 | 状态 | 提交 | 作者 | 日期 | 推送 | CI | 审计 |
|----|-----|------|------|------|------|:---:|:---:|:---:|
| D352 | resolver硬化 | dev doc（P0） | — | — | 2026-08-13 | 未知 | — | — |
| D333 | decision-reference-framework | ✅ 已提交 | d869560 | Synova-Win | 2026-08-13 | ✅ | ❌ | — |
| D332 | 控制塔并行协调补丁 | dev doc（P0） | — | — | 2026-08-12 | 未知 | — | — |
| D331 | D329审计P1修复 | dev doc（P1） | 7ace35e | Synova-Win | 2026-08-12 | ✅ | — | — |
| D330 | D328审计P1修复 | dev doc（P1） | 407ff1f | Synova-Win | 2026-08-12 | ✅ | — | — |
| D329 | session身份与暂存归属根治 | dev doc（P0） | dc369fd | Synova-Win | 2026-08-11 | ✅ | — | — |
| D328 | commit声明内容一致性门禁 | dev doc（P0） | ea1cb71 | Synova-Win | 2026-08-10 | ✅ | — | — |
| D321 | git notes 读取独立任务 (D320 dev doc §依赖 — 生成器已留 hook… | ✅ 已提交 | 46b9271 | Synova-Mac | 2026-08-11 | ✅ | ❌ | — |
| D320 | 仪表盘git化生成器 | dev doc（P1） | 8b1fdab | Synova-Win | 2026-08-09 | ✅ | — | — |
| D319 | git-tag自动化 | dev doc（P1） | 300660e | Synova-Win | 2026-08-09 | ✅ | ❌ | — |
| D318 | 双机身份与hooks可移植 | dev doc（P0） | 86871ac | Synova-Win | 2026-08-10 | ✅ | ❌ | — |
| D317 | G12b-CI-Fix | dev doc（P0） | ba653c3 | Synova-Mac | 2026-08-09 | ✅ | ❌ | — |
| D316 | CT-V4.6.0-Fix | dev doc（P1） | fdad612 | Synova | 2026-08-06 | ✅ | — | — |
| D315 | utf8-batch-closeout | ✅ 已提交 | 6a5eb01 | Synova | 2026-08-05 | ✅ | — | — |
| D314 | feat(D314): M4 基线豁免 + 独立化底座 — tsc 豁免/日志五件套/atta… | ✅ 已提交 | c5d8d15 | Synova | 2026-08-05 | ✅ | — | — |
| D313 | control-tower-finalize | ✅ 已提交 | 624281f | Synova | 2026-08-05 | ✅ | — | — |
| D312 | baseline-tools | ✅ 已提交 | e9b7e1c | Synova | 2026-08-03 | ✅ | — | — |
| D311 | multi-session-coordination | ✅ 已提交 | 9096993 | Synova | 2026-08-03 | ✅ | — | — |
| D309 | AdminKnowledge-L1L4 | dev doc（P0） | — | — | 2026-08-06 | 未知 | — | — |
| D307 | session级worktree隔离 | dev doc（P0） | — | — | 2026-08-12 | 未知 | — | — |
| D300 | GoldenCase-Gate | dev doc（P1） | 02500e7 | Synova | 2026-08-02 | ✅ | — | — |
| D296 | ControlTower-Truthfulness | dev doc（P0） | 4c664c7 | Synova | 2026-08-02 | ✅ | — | — |
| D292 | L2L4-CrossLayer | ✅ 已提交 | 6a485b3 | Synova | 2026-08-02 | ✅ | — | — |
| D291 | Empty-Catches | ✅ 已提交 | ee694bf | Synova | 2026-08-01 | ✅ | — | — |
| D290 | 2026-08-01-D290-audit-check-python-native | ✅ 已提交 | 6aff260 | Synova | 2026-08-01 | ✅ | — | — |
| D286 | GraphStore-Deprecation | ✅ 已提交 | 89d043f | Synova | 2026-08-02 | ✅ | — | — |
| D285 | Role-Push | ✅ 已提交 | 4602e0f | Synova | 2026-07-30 | ✅ | — | — |
| D284 | CrossDept-Signals | ✅ 已提交 | 0625f31 | Synova | 2026-07-31 | ✅ | — | — |
| D283 | Setup-Guide | ✅ 已提交 | 2fb7f13 | Synova | 2026-07-30 | ✅ | — | — |
| D282 | Expert-Migration | ✅ 已提交 | e049aa5 | Synova | 2026-07-30 | ✅ | — | — |
| D281 | GA-Expiry-UI | ✅ 已提交 | 50f50fc | Synova | 2026-07-31 | ✅ | — | — |
| D273 | GA-Correction-Feedback | ✅ 已提交 | 137243e | Synova | 2026-07-30 | ✅ | — | — |
| D272 | ProactivePush-Wiring | ✅ 已提交 | 6ea3ae4 | Synova | 2026-07-30 | ✅ | — | — |
| D271 | V3-P2-Views45 | ✅ 已提交 | 7d6f6a5 | Synova | 2026-07-30 | ✅ | — | — |
| D270 | audit-crosscheck-report | ✅ 已提交 | ff32449 | Synova | 2026-07-30 | ✅ | — | — |
| D269 | expert-pyramid-format | ✅ 已提交 | 12fb099 | Synova | 2026-07-30 | ✅ | — | — |
| D268 | product-health-cli | ✅ 已提交 | d973688 | Synova | 2026-07-30 | ✅ | — | — |
| D267 | FIX-PathReachable-BFS-v1-0 | ✅ 已提交 | 0d8aefc | Synova | 2026-07-30 | ✅ | — | — |
| D266 | Pipeline-Monitor-v1-0 | ✅ 已提交 | 2a5a4d2 | Synova | 2026-07-29 | ✅ | — | — |
| D265 | Resource-Monitor-v1-0 | ✅ 已提交 | 3d13f65 | Synova | 2026-07-29 | ✅ | — | — |
| D264 | DiagnosisQualityScore-v1-0 | ✅ 已提交 | 18a4995 | Synova | 2026-07-29 | ✅ | — | — |
| D263 | DiagnosisGraphQuery-v1-0 | ✅ 已提交 | 124c480 | Synova | 2026-07-29 | ✅ | — | — |
| D262 | GA-Feedback-Wiring-v1-0 | ✅ 已提交 | d7f3fb0 | Synova | 2026-07-29 | ✅ | — | — |
| D261 | V3-P1-PM-Dashboard-v1-0 | ✅ 已提交 | 4de1d78 | Synova | 2026-07-29 | ✅ | — | — |
| D260 | V3-P0-Pipeline-Health-v1-0 | ✅ 已提交 | 518de93 | Synova | 2026-07-29 | ✅ | — | — |
| D258 | Script-Cleanup-v1-0 | ✅ 已提交 | f29cb6a | Synova | 2026-07-29 | ✅ | — | — |
| D257 | Contract-Gate-v1-0 | ✅ 已提交 | fd9880b | Synova | 2026-07-29 | ✅ | — | — |
| D256 | Auditor-Entry-v1-0 | ✅ 已提交 | 02eadd6 | Synova | 2026-07-29 | ✅ | — | — |
| D255 | Electron-Packaging-v1-0 | ✅ 已提交 | dd47004 | Synova | 2026-07-29 | ✅ | — | — |
| D254 | Action-Effect-Verification-v2-0 | ✅ 已提交 | d0c15cb | Synova | 2026-07-28 | ✅ | — | — |
| D253 | GA-Dashboard-v1-0 | ✅ 已提交 | ad90761 | Synova | 2026-07-30 | ✅ | — | — |
| D252 | SSE-Streaming-Chat-v2-0 | ✅ 已提交 | 3dde657 | Synova | 2026-07-28 | ✅ | — | — |
| D251 | Thread-List-UI-v1-0 | ✅ 已提交 | 34c7ff7 | Synova | 2026-07-28 | ✅ | — | — |
| D250 | Thread-Rename-API-v1-0 | ✅ 已提交 | 77c6b71 | Synova | 2026-07-28 | ✅ | — | — |
| D249 | ProactivePush-Wiring-v1-0 | ✅ 已提交 | c268f90 | Synova | 2026-07-27 | ✅ | — | — |
| D248 | Phone-WeChat-Register-v1-0 | ✅ 已提交 | 6b6c411 | Synova | 2026-07-27 | ✅ | — | — |
| D247 | E2E-Customer-Flow-v1-0 | ✅ 已提交 | fa13e39 | Synova | 2026-07-27 | ✅ | — | — |
| D246 | Onboarding-Wizard-v1-0 | ✅ 已提交 | fa52079 | Synova | 2026-07-27 | ✅ | — | — |
| D245 | Admin-UI-v1-0 | ✅ 已提交 | 952afc7 | Synova | 2026-07-27 | ✅ | — | — |
| D244 | Federated-Knowledge-v1-0 | ✅ 已提交 | 201f391 | Synova | 2026-07-27 | ✅ | — | — |
| D243 | Anti-Sabotage-v1-0 | ✅ 已提交 | f136b5d | Synova | 2026-07-27 | ✅ | — | — |
| D242 | Permission-Templates-v1-0 | ✅ 已提交 | 0bcea95 | Synova | 2026-07-27 | ✅ | — | — |
| D241 | Knowledge-Approval-v1-0 | ✅ 已提交 | af7eb79 | Synova | 2026-07-27 | ✅ | — | — |
| D240 | Enterprise-Facts-v1-0 | ✅ 已提交 | 062c73c | Synova | 2026-07-27 | ✅ | — | — |
| D239 | GA-Boundary-v1-0 | ✅ 已提交 | 0eb7d2f | Synova | 2026-07-27 | ✅ | — | — |
| D238 | Loop6-Overflow-Monitor-v1-0 | ✅ 已提交 | 483ee47 | Synova | 2026-07-27 | ✅ | — | — |
| D237 | Loop3-GA-Evolution-v1-0 | ✅ 已提交 | 5b0be74 | Synova | 2026-07-27 | ✅ | — | — |
| D236 | Expert-Restructure-v1-0 | ✅ 已提交 | 34850a3 | Synova | 2026-07-27 | ✅ | — | — |
| D235 | DASHBOARD-Update-v2-0 | ✅ 已提交 | e39386c | Synova | 2026-07-27 | ✅ | — | — |
| D234 | Expert-Tools-v1-0 | ✅ 已提交 | 9125ed6 | Synova | 2026-07-27 | ✅ | — | — |
| D233 | Electron-v1-0 | ✅ 已提交 | f657614 | Synova | 2026-07-27 | ✅ | — | — |
| D232 | deployment-guide-v1 | ✅ 已提交 | 8df38ad | Synova | 2026-07-26 | ✅ | — | — |
| D231 | csv-import-page-v1 | ✅ 已提交 | dd6b1b8 | Synova | 2026-07-26 | ✅ | — | — |
| D230 | signal-bootstrap-v1 | ✅ 已提交 | 4f731cf | Synova | 2026-07-26 | ✅ | — | — |
| D229 | windows-agent-start-v1 | ✅ 已提交 | 2f0dc1c | Synova | 2026-07-26 | ✅ | — | — |
| D228 | fix(D228): npm run dev on Windows + generate-da… | ✅ 已提交 | 987ad4a | Synova | 2026-07-26 | ✅ | — | — |
| D227 | knowledge-sentinel-v1 | ✅ 已提交 | 4df3a9d | Synova | 2026-07-26 | ✅ | — | — |
| D226 | goal-lifecycle-e2e-v1 | ✅ 已提交 | 6d5544d | Synova | 2026-07-26 | ✅ | — | — |
| D225 | gate0-gate5-fix-v1 | ✅ 已提交 | 2e73254 | Synova | 2026-07-26 | ✅ | — | — |
| D224 | wiring-integration-v1 | ✅ 已提交 | 36e8805 | Synova | 2026-07-26 | ✅ | — | — |
| D223 | stagnation-detection-v1 | ✅ 已提交 | a33f05c | Synova | 2026-07-25 | ✅ | — | — |
| D222 | direction-monitor-v1 | ✅ 已提交 | 46e9433 | Synova | 2026-07-25 | ✅ | — | — |
| D221 | csv-connector-v1 | ✅ 已提交 | d74c2f7 | Synova | 2026-07-25 | ✅ | — | — |
| D220 | FIX-interaction-v1 | ✅ 已提交 | 95bf30c | Synova | 2026-07-25 | ✅ | — | — |
| D219 | check-gates-v2-v1 | ✅ 已提交 | 706f98a | Synova | 2026-07-26 | ✅ | — | — |
| D218 | write-lock-completion-v1 | ✅ 已提交 | 84e3b17 | Synova | 2026-07-23 | ✅ | — | — |
| D217 | env-completion-v1 | ✅ 已提交 | c860122 | Synova | 2026-07-23 | ✅ | — | — |
| D216 | audit-completion-v1 | ✅ 已提交 | 3d5663c | Synova | 2026-07-23 | ✅ | — | — |
| D215 | contract-store-gate-v1 | ✅ 已提交 | 07d1492 | Synova | 2026-07-23 | ✅ | — | — |
| D214 | shared-signal-emitter-v1 | ✅ 已提交 | d53d092 | Synova | 2026-07-23 | ✅ | — | — |
| D213 | control-tower-dashboard-v1 | ✅ 已提交 | ce16474 | Synova | 2026-07-23 | ✅ | — | — |
| D212 | dev-doc-gatekeeper-python-v1 | ✅ 已提交 | 98d54e2 | Synova | 2026-07-23 | ✅ | — | — |
| D211 | env-validator-v1 | ✅ 已提交 | 23b08be | Synova | 2026-07-23 | ✅ | — | — |
| D210 | external-auditor-wiring-v1 | ✅ 已提交 | f51a234 | Synova | 2026-07-23 | ✅ | — | — |
| D209 | write-lock-v1 | ✅ 已提交 | f747a61 | Synova | 2026-07-23 | ✅ | — | — |
| D208 | contract-archiver-v1 | ✅ 已提交 | af6ab00 | Synova | 2026-07-23 | ✅ | — | — |
| D207 | control-tower-phase1-deploy-v1 | ✅ 已提交 | 4972e4c | Synova | 2026-07-22 | ✅ | — | — |
| D206 | dev-doc-gatekeeper-v1 | ✅ 已提交 | 534d898 | Synova | 2026-07-22 | ✅ | — | — |
| D202 | external-auditor-v1 | ✅ 已提交 | 39a672f | Synova | 2026-07-22 | ✅ | — | — |
| D201 | FIX-install-synova-commit-v1 | ✅ 已提交 | eae77fe | Synova | 2026-07-23 | ✅ | — | — |
| D200 | context-injector-v1 | ✅ 已提交 | d8853b6 | Synova | 2026-07-22 | ✅ | — | — |
| D111 | electron-client-v1 | ✅ 已提交 | c967797 | Synova | 2026-07-26 | ✅ | — | — |
| D110 | ima-cron-sync-v1 | 待办 | — | — | — | 未知 | — | — |
| D109 | FIX-remove-math-random-v1 | ✅ 已提交 | 1b82052 | Synova | 2026-07-22 | ✅ | — | — |
| D108 | admin-workbench-ui-v1 | ✅ 已提交 | d06da0e | Synova | 2026-07-26 | ✅ | — | — |
| D107 | ontology-adapter-v1 | ✅ 已提交 | 19e7250 | Synova | 2026-07-26 | ✅ | — | — |
| D106 | D107-graphstore-user-ontology-v1 | ✅ 已提交 | 99e85b7 | Synova | 2026-07-26 | ✅ | — | — |
| D104 | D105-ima-connector-knowledge-agent-v1 | ✅ 已提交 | 8b54fb5 | Synova | 2026-07-21 | ✅ | — | — |
| D102 | D103-auth-upgrade-enterprise-routes-v1 | ✅ 已提交 | 34eeff0 | Synova | 2026-07-21 | ✅ | — | — |
| D101 | deployment-drill-production-hardening-v1 | ✅ 已提交 | 246aacf | Synova | 2026-07-17 | ✅ | — | — |
| D100 | diagnosis-quality-calibration-v1 | ✅ 已提交 | a008600 | Synova | 2026-07-17 | ✅ | — | — |
| D99 | e2e-full-pipeline-test-v1 | ✅ 已提交 | e652334 | Synova | 2026-07-17 | ✅ | — | — |
| D98 | report-viewer-ui-v1 | ✅ 已提交 | f57c620 | Synova | 2026-07-17 | ✅ | — | — |
| D97 | dashboard-ui-v1 | ✅ 已提交 | e35c36d | Synova | 2026-07-17 | ✅ | — | — |
| D96 | login-auth-ui-v1 | ✅ 已提交 | c3f5164 | Synova | 2026-07-17 | ✅ | — | — |
| D95 | cross-scale-overflow-v1 | ✅ 已提交 | 21a30fc | Synova | 2026-07-17 | ✅ | — | — |
| D94 | cronscheduler-hybrid-trigger-v1 | ✅ 已提交 | 7ee8386 | Synova | 2026-07-17 | ✅ | — | — |
| D93 | feedback-collector-pipeline-v1 | ✅ 已提交 | e4313d1 | Synova | 2026-07-16 | ✅ | — | — |
| D92 | cycle7-middle-evolution-v1 | ✅ 已提交 | 29f84f8 | Synova | 2026-07-17 | ✅ | — | — |
| D91 | multi-scale-trigger-matrix-v1 | ✅ 已提交 | dfb5429 | Synova | 2026-07-17 | ✅ | — | — |
| D90 | overflow-dashboard-advisor-v1 | ✅ 已提交 | 8020c97 | Synova | 2026-07-16 | ✅ | — | — |
| D89 | 溢出计算-OverflowGraphBridge-v1 | ✅ 已提交 | ae61dc5 | Synova | 2026-07-15 | ✅ | — | — |
| D88 | CycleLoader-Phase2e-v1 | ✅ 已提交 | 7be2ccf | Synova | 2026-07-15 | ✅ | — | — |
| D87 | 术语字典-跨层级映射-v1 | ✅ 已提交 | 85122d7 | Synova | 2026-07-15 | ✅ | — | — |
| D86 | 自助诊断-v1 | ✅ 已提交 | 25ed29e | Synova | 2026-07-15 | ✅ | — | — |
| D85 | MVS黄金数据集-回归测试-v1 | ✅ 已提交 | 6d01542 | Synova | 2026-07-15 | ✅ | — | — |
| D84 | 集成测试契约-v1 | ✅ 已提交 | 2852dad | Synova | 2026-07-14 | ✅ | — | — |
| D83 | 启动序列Phase0-5-回滚协议-v1 | ✅ 已提交 | ea7fb6e | Synova | 2026-07-14 | ✅ | — | — |
| D82 | 7条缺失compute-v1 | ✅ 已提交 | 06939b0 | Synova | 2026-07-14 | ✅ | — | — |
| D80 | PlaybookExecutionRecord-持久化-v1 | ✅ 已提交 | bf29b42 | Synova | 2026-07-15 | ✅ | — | — |
| D79 | ContextLoader企业参数合并器-v1 | ✅ 已提交 | 88edccc | Synova | 2026-07-14 | ✅ | — | — |
| D77 | 增长导航系统集成-v1 | ✅ 已提交 | 329178f | Synova | 2026-07-15 | ✅ | — | — |
| D76 | 执行知识PKB回流-v1 | ✅ 已提交 | 5774a06 | Synova | 2026-07-15 | ✅ | — | — |
| D75 | 轻量级再诊断引擎-v1 | ✅ 已提交 | d29c30b | Synova | 2026-07-15 | ✅ | — | — |
| D74 | 工作台数据聚合-v1 | ✅ 已提交 | 8429c4d | Synova | 2026-07-15 | ✅ | — | — |
| D73 | FIX-lifecycle测试补全-v1 | ✅ 已提交 | c6748e8 | Synova | 2026-07-14 | ✅ | — | — |
| D72 | Proposal引擎-三选一确认-v1 | ✅ 已提交 | 662d118 | Synova | 2026-07-14 | ✅ | — | — |
| D71 | FIX-审计修复-v1 | ✅ 已提交 | a32b319 | Synova | 2026-07-14 | ✅ | — | — |
| D70 | IDENTITY-analytical-lens补全-v1 | ✅ 已提交 | 238a9a1 | Synova | 2026-07-15 | ✅ | — | — |
| D69 | expert-prompts降级-文件驱动-v1 | ✅ 已提交 | 5747983 | Synova | 2026-07-14 | ✅ | — | — |
| D68 | 2026-07-13-D68-Tool原子验证-权限模型 | ✅ 已提交 | 96e1836 | Synova | 2026-07-13 | ✅ | — | — |
| D67 | 2026-07-13-D67-Playbook加载器 | ✅ 已提交 | ca8312b | Synova | 2026-07-13 | ✅ | — | — |
| D66 | 2026-07-13-D66-出厂内置Skill清单 | ✅ 已提交 | 4f60157 | Synova | 2026-07-13 | ✅ | — | — |
| D65 | 2026-07-12-D65-Skill-Tool-Registry-Loader | ✅ 已提交 | cc1b2a3 | Synova | 2026-07-13 | ✅ | — | — |
| D64 | expert-knowledge-files-v1 | ✅ 已提交 | 8938268 | Synova | 2026-07-16 | ✅ | — | — |
| D63 | SKILL-pull-mode-v1 | ✅ 已提交 | 40c51b9 | Synova | 2026-07-16 | ✅ | — | — |
| D62 | ME-sentinels-v1 | ✅ 已提交 | 438ae64 | Synova | 2026-07-16 | ✅ | — | — |
| D61 | ME-compute-fix-v1 | ✅ 已提交 | 6c39197 | Synova | 2026-07-16 | ✅ | — | — |
| D60 | ME-compute-new-v1 | ✅ 已提交 | b058b8d | Synova | 2026-07-15 | ✅ | — | — |
| D59 | ME-compute-enhance-v1 | ✅ 已提交 | dc4d6a0 | Synova | 2026-07-15 | ✅ | — | — |
| D58 | manifest-加载器文件化-v1 | ✅ 已提交 | f7ee3e8 | Synova | 2026-07-14 | ✅ | — | — |
| D57 | Tone四源融合-角色一致性-v1 | ✅ 已提交 | 8e0a6c6 | Synova | 2026-07-13 | ✅ | — | — |
| D56 | 2026-07-13-D56-data-conflict-protocol | ✅ 已提交 | 1613acb | Synova | 2026-07-13 | ✅ | — | — |
| D55 | 2026-07-13-D55-reasoning-crossval | ✅ 已提交 | a1121bc | Synova | 2026-07-13 | ✅ | — | — |
| D54 | 2026-07-13-D54-prompt-assembler | ✅ 已提交 | 0caa95e | Synova | 2026-07-13 | ✅ | — | — |
| D53 | 2026-07-12-D53-专家AgentSpec文件化 | ✅ 已提交 | 5683883 | Synova | 2026-07-13 | ✅ | — | — |
| D52 | 规模化运维-行业Skill包-v1 | ✅ 已提交 | 12e8266 | Synova | 2026-07-15 | ✅ | — | — |
| D51 | CI-CD-golden-case-F1-v1 | ✅ 已提交 | 0f7cd8f | Synova | 2026-07-15 | ✅ | — | — |
| D50 | 一键恢复包-备份验证-v1 | ✅ 已提交 | ad49ab2 | Synova | 2026-07-14 | ✅ | — | — |
| D49 | 独立看门狗-三层监控-v1 | ✅ 已提交 | a1c90c0 | Synova | 2026-07-14 | ✅ | — | — |
| D48 | 2026-07-13-D48-静默升级-版本回滚 | ✅ 已提交 | f88a2de | Synova | 2026-07-13 | ✅ | — | — |
| D43 | 2026-07-12-D43-PromptInjectionDetector | ✅ 已提交 | ee545ea | Synova | 2026-07-12 | ✅ | — | — |
| D42 | feat(D42): PreUploadValidator — 知识基座上传播前隐私预检 | ✅ 已提交 | fbc84d6 | Synova | 2026-07-12 | ✅ | — | — |
| D41 | feat(D41): 审计哈希链 + RootHashPublisher — 审计日志防篡改 | ✅ 已提交 | ff32285 | Synova | 2026-07-12 | ✅ | — | — |
| D40 | 2026-07-12-D40-DataExporter-DataPurger | ✅ 已提交 | 1f785ab | Synova | 2026-07-12 | ✅ | — | — |
| D39 | 2026-07-12-D39-TraversalPermissionFilter | ✅ 已提交 | c3124cb | Synova | 2026-07-12 | ✅ | — | — |
| D38 | 2026-07-12-D38-PolicyEngine权限引擎 | ✅ 已提交 | 0a9bf45 | Synova | 2026-07-12 | ✅ | — | — |
| D37 | 2026-07-12-D37-data-conflict-awareness | ✅ 已提交 | 625cf98 | Synova | 2026-07-12 | ✅ | — | — |
| D36 | 2026-07-11-D36-可插拔扩展机制 | ✅ 已提交 | fe8ac17 | Synova | 2026-07-11 | ✅ | — | — |
| D34 | 2026-07-11-D34-PII脱敏接入 | ✅ 已提交 | 3f34fd0 | Synova | 2026-07-11 | ✅ | — | — |
| D33 | 2026-07-12-D33-存储时间语义 | ✅ 已提交 | 594e8a9 | Synova | 2026-07-12 | ✅ | — | — |
| D32 | 2026-07-11-D32-Outcome-JSON字段补全 | ✅ 已提交 | a128df7 | Synova | 2026-07-11 | ✅ | — | — |
| D31 | 2026-07-11-D31-6数据适配器JSON | ✅ 已提交 | dbf0d43 | Synova | 2026-07-11 | ✅ | — | — |
| D30 | 2026-07-12-D30-数据质量门禁 | ✅ 已提交 | a4ed24e | Synova | 2026-07-12 | ✅ | — | — |
| D29 | feat(D29): 数据冲突机制 — GraphStore/data-ingest/Agen… | ✅ 已提交 | 1e0dab3 | Synova | 2026-07-11 | ✅ | — | — |
| D26 | golden-case-extension-v1 | ✅ 已提交 | ee73e23 | Synova | 2026-07-21 | ✅ | — | — |
| D25 | contract-test-completion-v1 | ✅ 已提交 | 6ca97b2 | Synova | 2026-07-20 | ✅ | — | — |
| D21 | action-closed-loop-v1 | ✅ 已提交 | 26b0770 | Synova | 2026-07-22 | ✅ | — | — |
| D20 | loop-interaction-display-v1 | ✅ 已提交 | de23cf6 | Synova | 2026-07-23 | ✅ | — | — |
| D19 | ga-collaboration-v1 | ✅ 已提交 | 714845e | Synova | 2026-07-21 | ✅ | — | — |
| D18 | interactive-card-replies-v1 | ✅ 已提交 | 31f1152 | Synova | 2026-07-21 | ✅ | — | — |
| D17 | proactive-push-v1 | ✅ 已提交 | f57e282 | Synova | 2026-07-20 | ✅ | — | — |
| D15 | 2026-07-12-D15a-哨兵合并废弃 | ✅ 已提交 | 71fbac8 | Synova | 2026-07-12 | ✅ | — | — |
| D14 | 2026-07-11-D14-15概念节点NodeType注册 | ✅ 已提交 | 52b7d2a | Synova | 2026-07-11 | ✅ | — | — |
| D10 | feat(D10): engine-core 包退役 — diagnosis.ts 切换至 S… | ✅ 已提交 | e783c07 | Synova | 2026-07-11 | ✅ | — | — |
| D9 | builtin-loops-v1 | ✅ 已提交 | c4b8f39 | Synova | 2026-07-26 | ✅ | — | — |
| D8 | a-L2-main-agent-v1 | ✅ 已提交 | fff82e3 | Synova | 2026-07-23 | ✅ | — | — |
| D6 | 2026-07-10-D6-推送通知接线 | ✅ 已提交 | d8f0156 | Synova | 2026-07-10 | ✅ | — | — |
| D5 | 2026-07-10-D5-CircuitBreaker接线 | ✅ 已提交 | 81d5f75 | Synova | 2026-07-10 | ✅ | — | — |
| D4 | 2026-07-10-D4-Financial字段统一 | ✅ 已提交 | 7d0f1de | Synova | 2026-07-10 | ✅ | — | — |
| D3 | 2026-07-10-D3-THEORY-METRIC_BINDS修复 | ✅ 已提交 | 31fa5a3 | Synova | 2026-07-01 | ✅ | — | — |
| D2 | feat(I2-3a): 已有compute边引用迁移(12处)+D2死引用删除 | ✅ 已提交 | 0bb2f58 | Synova | 2026-07-10 | ✅ | — | — |
| D1 | 2026-06-18-1653-Phase-0-Week-3-6--D1D3D5- | ✅ 已提交 | 40b9681 | Synova | 2026-06-24 | ✅ | — | — |
> 审计（audit-result.json）: P0 0 / P1 0 / P2 0 @ 2026-07-29T12:08:21Z
## 版本历史
> 数据源: VERSION.md + version.log + git tag（D319 后增强）。
| 版本 | 日期/时间 | 变更 | git tag |
|------|------------|------|:---:|
| V4.7.5 | 2026-08-13 | D333 批次（决策参考四步框架落地：brief 模板 Q1c + 注入器全文注入 + CLAUDE.md 引用） | ✅ |
| V4.7.3 | 2026-08-12 | D331 批次（D329 审计 P1 修复：tag 重指 + 防线补齐 + 接线落地） | ✅ |
| V4.7.2 | 2026-08-12 | D330 批次（D328 审计 P1 修复：python 损坏探测 + 豁免测试补全 + 文档回填） | ✅ |
| V4.7.1 | 2026-08-11 | D328+D329 批次（commit 一致性门禁 + session 身份独立化） | ✅ |
| V4.7.0 | 2026-08-09 | D318+D319+D320 批次（git tag 自动化 + 双机身份 + 仪表盘 git 化） | ✅ |
| V4.6.2 | 2026-08-07 | D317 修复（G12b/brief 解析 CI 红） | ✅ |
| V4.6.1 | 2026-08-05 | D316 修复（incident-loop 跨平台 + version.log 补写） | ✅ |
| V4.6.0 | 2026-08-04 | 控制塔独立化正式首发 | ✅ |
- 4.7.5 2026-08-13T02:11:03+0800: auto-tag V4.7.5
- 4.7.5 2026-08-13T01:55:02+0800: D333 决策参考框架落地
- 4.7.3 2026-08-12T23:39:42+0800: auto-tag V4.7.3
## CI 状态（gh run）
| Run | 工作流 | 状态 | 结论 | 关联 D# |
|:---:|------|:---:|:---:|------|
| 1 | CI �� SynovaAgent | completed | ❌ failure | — |
| 2 | CI �� SynovaAgent | completed | ❌ failure | D333 |
| 3 | CI �� SynovaAgent | completed | ❌ failure | D321 |
| 4 | CI �� SynovaAgent | completed | ❌ failure | D317 |
| 5 | CI �� SynovaAgent | completed | ❌ failure | D318 |
| 6 | CI �� SynovaAgent | completed | ❌ failure | D318 |
| 7 | CI �� SynovaAgent | completed | ❌ failure | D318 |
| 8 | CI �� SynovaAgent | completed | ❌ failure | D319 |
| 9 | CI �� SynovaAgent | completed | ❌ failure | D317 |
| 10 | CI �� SynovaAgent | completed | ❌ failure | D317 |
## 同步健康（D323 预留）
- 未推送提交: 0（origin/<branch>..HEAD）
- 工作区变更: 335 个文件（git status --porcelain）
> D323 填充: 双机同步健康完整视图。
<!-- AUTO:END -->
<!-- MANUAL:START -->
﻿---
title: "Synova 项目仪表盘"
version: "v4.8"
date: "2026-07-29"
status: "17/17 门禁 PASS. CT 20/20. D253 D255 D258 D261 D263 D266 done. 131+ D-tasks (97%)."
purpose: "全局任务追踪。控制塔健康监控。"
---


> ⚠️ **事故恢复区（勿删，2026-08-03 重建，第二次被回滚）**: 本文件两次被并行 session 的 git 操作回滚至 v4.8——① 08-02 D300 stash pop 冲突（完整 v4.9 在 stash@{0}）；② 08-03 并行 session git checkout 清空（D286 报告已记录同类事故）。完整内容（v4.9 + §VII/IX + 队列）在 `git stash@{0}` 及 Codex 会话上下文，恢复时并入以下：
>
> **交付链（D311→D329 + Mac，全部已推送落库）**：
>
> | D# | 任务 | 状态 |
> |----|------|------|
> | D311-D316 | V4.6.0 控制塔独立化 + 修复（含 D313-D316 补推） | ✅ 9096993 → fdad612 |
> | D317(+b) | G12b/brief CI 红修复 + 3 个 Claude skill | ✅ 5b93579 + 078ccba + 6f08432 |
> | D318/D319/D320 | 双机身份 + tag 自动化 + 仪表盘 git 化（V4.7.0 批次） | ✅ c576e2b/86871ac + 300660e + 8b1fdab |
> | D328/D329 | 声明-内容一致性门禁 + session 身份根治（V4.7.1 批次） | ⚠️ ea1cb71 + dc369fd（**均未推送，待 D330/D331 批次补推**） |
> | Mac | engine-core 退役清理（基线 439→434）+ pre-push Mac 兼容 | ✅ ba653c3 + 46b9271（origin） |
>
> **后续待办**：
>
> | D# | 任务 | 优先级 | 状态 |
> |----|------|:---:|------|
> | **D307** | **session 级 worktree 隔离（并行根治：独立 index/暂存区/current-brief，worktree-manager 生命周期；V4.8.0）** | **P0** | ✅ dev doc 就绪（20260812）— 依赖 D332 后派发 |
> | D308 | current-brief 独立化 + 共享配置文件（ci.yml/pre-push/task-briefs）纳入写锁/认领强制 | P2 | ❌ 需排期 |
> | D309 | admin-knowledge.ts L1→L4 修复（CI Architecture 转绿） | P0 | ❌ 需写 dev doc |
> | D310 | _extinct 25 个 tsc 错误（tsconfig 排除 extensions/sentinels/_extinct/） | P1 | ❌ 需写 dev doc |
> | D307 备注 | D307 为并行根治；D330-D332 为软加固（减害），两者都派发后 M8 才闭环 | — | — |
> | 决策 | npm audit electron CVE（升级 vs 豁免） | P0 | ⏸ 待创始人 |
> | **KIMI K3 首审（D328, 2026-08-12）** | **CONDITIONAL PASS — P1×3**（python 损坏静默漏拦 / DS4 过度声称 / bypass 空窗）。P2×6。报告: docs/synova/audit-reports/2026-08-12-D328.md | — | 📝 D330 ✅ dev doc 就绪 |
> | **KIMI K3 二审（D329, 2026-08-12）** | **CONDITIONAL PASS — P1×2**（tag 孤儿 / bypass 再现）。P2×8。L4×3。报告: docs/synova/audit-reports/2026-08-12-D329.md | — | 📝 D331 ✅ dev doc 就绪 |
> | **D330** | **D328 审计 P1 修复**（broken-python 探测 + GENUINE 三态 + 豁免测试补全 + 文档回填，V4.7.2） | P1 | ✅ **已交付 6c00e46/407ff1f + K3 CONDITIONAL PASS**；未推送待 D331 批次补推 |
> | **K3 D330 复审（2026-08-12）** | **CONDITIONAL PASS**：P1-1/P1-2 独立复验通过；**bypass.log 连续 3 任务无记录 → 升级 P0（需物理执行体）**；技术事实——resolver 无探测，D330 只"不静默"非"仍拦截"（折入 D331）；P2×5（DS8 基线 439 修正、V4.7.3 幻影待 D331 核对等） | — | 🔄 D331 折入 + bypass P0 |
> | **D331** | **D329 审计 P1 修复**（tag 重指 + tag-祖先校验 + bypass 对账 + synova-commit PYBIN + --session 生产接线 + task_id 实现，V4.7.3；**含推送+CI 验证 DS12 + D328/D329 补推**） | P1 | ✅ dev doc 就绪（20260812）— 待派发 |
> | **D332** | **控制塔并行协调补丁**（staging-guard 被拒指引 + attach 强制 register + wait_manager 竞争检测 + parallel-conflicts 事件记录，V4.7.4；基线 434） | **P0** | ✅ dev doc 就绪（20260812）— 依赖 D330+D331 后派发 |
> | **CT-28** | **verify-parallel --scan-today 语义缺陷**（verify-parallel.sh L135-146 只按当天 mtime 圈 dev doc 两两比对，不理解「依赖/接力顺序」——D332/D307 与 D331 写集重叠被误判并行冲突；自愈=离开当天即放行；K3 审计仅验「门禁 5 存在+接线」未覆盖语义） | P1 | 🔧 建议并入 D332 写集（加依赖/顺序语义或改 diff-base 比对） |
> | **K3 权威偏差审计（A线复核, 2026-08-12）** | 报告: docs/synova/research/AUTHORITY-DEVIATION-REGISTRY-v1.md；P0×1 + P1×5 + 文档×2；已闭环×4 防重定案；G6 改判已修复；残留观察（快照 08-01 需刷新） | — | 📝 修复队列 D333-D339 见下 |
> | **D333** | **N13 进化闭环 + 循环执行体真实化**（v2 根因加深 P0-A1 + P1-C2 吸收 D335）：middle-evolution 接入 loop-3/5 + **loop-2/3/4/5/6 placeholder 假成功替换为真实执行体**（loop-handlers.ts 自承"D9 未兑现"）+ **修 main-agent.ts:182-199 伪造 'completed' 记录** + D5 文档连带（C线 S5-3/T-2 证据修正） | **P0** | ❌ 需写 dev doc（v2 加深） |
> | **D334** | **direction-monitor 接线**（完整实现+测试但生产零调用，P1-A1）— 接入 loop 调度触发链（信号→触发 <24h） | P1 | ❌ 需写 dev doc |
> | ~~D335~~ | **loop-4 专属处理器** → **被 P1-C2 吸收并入 D333**（placeholder 假成功是共同根因，v2 定案） | — | 🔄 并入 D333 |
> | **D336** | **GA 验证闭环接线**（ga-collaboration.ts 仅 type import，P1-A3）— 报告确认流程接入 GAFeedbackHandler 运行时实例 | P1 | ❌ 需写 dev doc |
> | **D337** | **静默升级/回滚**（electron-updater 仅依赖声明、main.cjs 零使用，P1-A4）— 接线 electron-updater + 回滚策略；或文档降级"版本提示+手动升级"（与 Electron P0 一体化协同） | P1 | ❌ 需写 dev doc |
> | **D338** | **orgId 单实例内逐表全覆盖审计**（P1-A5）— 逐表核对 DB 查询 orgId 过滤 + 补 GA 中国墙 | P1 | ❌ 需写 dev doc |
> | **D339** | **⚠️ 编号冲突：实际提交为「Mac 中文文件名门禁修复」（247ceae5，08-14 已提交）**；台账计划名「文档口径同步」未按计划落地——其中**哨兵口径部分已由 D378 完成（2026-08-16 CTO 审计后更新：20→45 扩展+4 内置=49 活跃，12 退役）**；N14 已裁决 A（文档改 5min，先修 key 归 D354）；C线红线3 话术 + D5 证据修正仍待办 | P2 | ✅ quotepath 已提交；哨兵口径 D378 承接 |
> | **K3 权威偏差审计 v1.1（2026-08-12）** | 新增 P1-B1~B5（控制塔/铁律）+ 铁律覆盖总表（38/39/Secrets ✅；36/37/9 ❌）+ D-G2 改判"引擎已修复，数据链路未担保"+ 组11 修正（并入组4，计数口径→D3）+ 文档 D3/D4 | — | 📝 D340-D342 + D339 扩 |
> | **D340** | **控制塔 V5 视图动态化**（agent_health.py:21-28 硬编码旧 6 专家 → 从 expert-registry.yaml 动态读 7 专家 + 全仓旧专家 ID 清理；P1-B1 铁律 9 违规实例） | P1 | ❌ 需写 dev doc |
> | **D341** | **控制塔信号完整性**（gate-status.json 缺失根因 + 自检升级"部分缺失→黄/红" + 演示前回填 checklist；P1-B2，若演示含控制塔面板升 P0） | P1 | ❌ 需写 dev doc |
> | **D342** | **铁律 36/37/9 门禁补全**（全量 vitest 强制点 / dead-code 周期扫描（direction-monitor 存活 11 天实证）/ 关键变更传播检查） | P1 | ❌ 需写 dev doc |
> | **D341 含 D-G2 数据链路动作** | 回填信号（gate-status 等）+ 刷新完成度快照（08-01 停 11 天）+ 验证新鲜度红灯——演示前必须 | — | 🔄 并入 D341 写集 |
> | **P2 结转（3 份审计连续 carried）** | ①测试无 runner 接线（D328/D329/D330 三连 carried）；②D330 用例 10 标题与断言矛盾；③brief 引用不存在 memory 文件；④genuine except 无 degraded 记录 | P2 | ⏳ 控制塔健康审计批次（明确归属，禁再 carried） |
> | 决策 | **P0-8（boss 角色）**、**N14（去重窗口 5 vs 30）** | — | ⏳ 待创始人（定案后落 D#） |
> | 观察 | D-G2 快照停在 08-01（11 天）— 部署/演示前刷新；v2 待续（跨文档 v3 未决 + C线 33 项演示前实测） | — | ⏳ 观察 |
> | **L4 缺口收割 ×3** | ①fail-open 三态（D330 局部 + 完整版 CT-1）；②DS verify 覆盖映射（S-4 已入 skill）；③bypass 对账（D331 折入 CT-3） | — | 🔄 D330/D331 折入 + 控制塔健康审计队列 |
> | **Mac 双提交（2026-08-09/11）** | ba653c3（engine-core 退役清理，352 文件/78K 删除，审计基线 439→**434**）+ 46b9271（D321 pre-push Mac 兼容）；CI 任务相关 job 全绿；**run-e2e-pipeline.cjs 残留 3 处引用未清**；admin-knowledge D309 仍在；与本地 D328/D329 分支分歧待合并 | — | ⏳ 合并后推送 D328/D329；残留 cjs 待小 chore |
> | P2-1 | hook-git-detect 测试隔离硬化（EXIT trap 清窗 + 失败输出测试名）——D312 审计发现偶发 | P2 | ❌ 并入 D314/小修 |
> | 恢复/首发 | v4.9 恢复 + 控制塔 V4.6.0 正式首发 | — | ✅ 已完成（2026-08-12 确认） |
>
> **已完成记录**：U4（pre-commit 分母 /12）✅、U5（pre-push 8→12 组）✅、铁律 0-3 禁 stash ✅、VERSION.md 建立（V4.6.0-WIP）✅、baseline/tsc-errors.json（28 条 seed）✅。
>
> **参照**：[V4.6.0 设计稿 v1.4](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\strategy\SYNOVA-DESIGN-控制塔V4.6-独立化-20260802.md) | [DeepSeek 哲学 note](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\DeepSeek哲学-控制塔借鉴-20260802.md)
> **接口面策略（2026-08-12 创始人定）**：Electron 桌面端 + MCP = **P0**（本地部署、非开发者用户、接入企业现有 agent）；Web/API/Docker 延后；TUI/CLI/mvp 退役。详见 [INTERFACES-STRATEGY.md](coordination/INTERFACES-STRATEGY.md)
> **权威文档 18 审计体系（2026-08-12，两周冲刺）**：[研究方案 + 6 章 + 附录](../research/权威文档18-Synova审计体系权威规范-20260812/)——三权分立（规划 Codex/编码 Claude/独立审计 K3）+ 四层审计模型 + `<claim>` 机器标签 + Anthropic 对齐（脚本 80%/LLM 20%）。**研究方案原 D331-337 与仪表盘冲突，重编号 D343+**。
>
> **审计体系冲刺（权威方案 7 任务 → 重编号 D343-D349）**：
>
> | D# | 任务 | 优先级 | 代码现状 |
> |----|------|:---:|------|
> | **D343** | **bypass.log A+B 双轨修复**（A：synova-commit 强制签名写入防新增空窗；B：bypass-log-reconcile.sh 定期对账补历史；验收 #1） | **P0** | bypass-log-reconcile.sh 缺失；D331 已有对账雏形 |
> | **D344** | **审计报告 git 跟踪（P0）+ dispatcher 集成（P1）**（3 份现有报告落库 + pre-push 自动检测未审计任务，验收 #2/#3；方案 D332 一个任务） | **P0** | 报告未 git 跟踪；dispatcher 已存在且 P0 阻断逻辑已实现 |
> | **D345** | **doc-audit 脚本填充**（`<claim>` 解析 + evidence 验证 + JSON 输出，验收 #4；依赖 CLAIM-TAG-SPEC 已有） | P1 | doc-audit-interface.sh 已存在（Phase 0），doc-audit.sh 缺失 |
> | **D346** | **pre-commit 组 13**（文档契约验证：改权威文档自动跑 doc-audit，错误阻断；验收 #5；依赖 D345） | P1 | 无文档组 |
> | **D347** | **审计报告 JSON 输出规范**（Markdown+JSON 双轨，机器可 diff；验收 #6） | P1 | 无 |
> | **D348** | **核心旧文档 CLAIM 标签化**（Sprint 2：按 §5.5+验收 #7——只标 01/03/13/14/17 的 IMPLEMENTED 声明 ≥80%，其余走注册表；**注：方案 §五"迁移"与 §5.5"不迁移"矛盾，以 5.5+验收 #7 为准**） | P1 | 17 份纯 Markdown |
> | **D349** | **审计报告 JSON 生成器**（Sprint 2：Markdown+JSON 双轨输出） | P1 | 无 |
>
> 批次依赖（方案 §八）：第一批并行 D343（A/B）+ D344（dispatcher 部分）→ 第二批 D345 → 第三批 D346；D347/D348/D349 按 Sprint 排。
> | **D351** | **ENT 补 boss 角色**（P0-8 裁决 A：六角色对齐权威 08——企业主最高权限：创建/删除企业、管理管理员；需先核 ENT 当前角色实现） | P1 | ❌ 需写 dev doc |
> | **D352** | **resolver 硬化交付**（K3 D331 P1-1：DS13 补做——resolve-commit-brief.sh PYBIN 可用性探测 + 退出码 0/1/2 语义化；当前零交付，broken-python 门禁仍不拦截） | **P0** | ❌ 需写 dev doc |
> | **D353** | **铁律 38 packages as any 盲区**（v2 P1-C1：组 1 只扫 src/，packages/ 36 文件含 as any 无门禁——"零存在"声称不实；修复：组 1 扩至 packages/ + 存量清理，或声称降级"src/ 零存在"） | P1 | ❌ 需写 dev doc |
> | **D354** | **N14 去重键稳定性**（v2 关键发现：runner.ts/signal-aggregator.ts 的 finding.id 含时间戳——同问题每轮新 id，5/30 分钟窗口都不生效；修复：稳定 id 生成 → 窗口按裁决 5min → 文档同步） | P1 | ❌ 需写 dev doc |
> | **K3 D331 复审（2026-08-13）** | **CONDITIONAL PASS**：D329 P1/P2 全部落地（tag-祖先/bypass 对账 live exit 0/guard 三态/--session/task_id/tag ON_BRANCH，24/24+回归全绿，bypass 证据链首次完整）；**P1-1 DS13 resolver 零交付（→D352）**；P2×4（计数失真/brief 未入仓/memory 声称不实/测试无 runner）；L4 DS 对账机制 → S-10 已入 skill。报告: docs/synova/audit-reports/2026-08-13-D331.md | — | 🔄 D352 补做 |
> | **K3 全链路审计（2026-08-14）** | **FAIL（0/3 贯通）**：客户/资本/人才三循环端到端全断——L5 无 CRM/财务/HR 连接器 + L4 类型契约断裂（Market≠Client、People≠Person、Event/Tool 零写入方）+ 属性契约断裂（cashBalance≠cash）+ P0 哨兵 manifest 死代码 + 查询层静默 fail-open。**活运行证明 L3 计算能力本身是真的，断裂在数据进出两端**。P0×3 / P1×5 / P2×6。报告: docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md | — | 🔄 D355-D360 |
> | **K3 D366 审计（2026-08-15）** | **CONDITIONAL PASS（无 P0，P1×3/P2×5）**：DS1-DS8 八项物理一致、自报偏离 a-i 全部诚实（近期自我报告质量最好）；**T3 注入发现 2 个边缘回归**——P1-1 git commit --amend 必触发 detected-bypass head-mismatch 误报（一次 amend=当日提交死锁）、P1-2 D 前缀 brief 被"今日集合"物理排除（G12 阻断并行 session）、P1-3 dev doc 从未进实现分支树。项 13 CI pending DEGRADED。报告: docs/synova/audit-reports/2026-08-15-D366.md | — | 🔄 D373 修复 |
> | **D373** | **D366 审计 P1 修复**（P1-1 amend 误报：marker head 对账增加 amend 识别/reflog 动作判定；P1-2 D 前缀 brief 排除：today_files_by_prefix 兼容 DXXX-* 命名；P1-3 dev doc 进实现分支树；含 CT-31 git 操作矩阵测试 + CT-32 新旧过滤器等价集对账 DS） | P1 | ❌ 需写 dev doc |
> | **D355** | **L4 数据契约收敛 + 查询层 fail-open 修复**（P0-2 L4 + P0-3）：类型统一 Market→Client、People→Person、**FINANCIAL（大写）vs Financial 大小写分裂**（cash-flow-sentinel 裸 SQL + org-adapter.ts:434）、Event/Tool 补写入方、新旧两套类型体系收敛；属性名 cashBalance↔cash 等 snake/camel 对齐；compute-cash-runway-months.ts:60 filter bug；schema 迁移 + queryNodes 显式 degraded（禁静默 fail-open） | **P0** | ❌ 需写 dev doc |
> | **D356** | **P0 哨兵阈值告警接线 + 降级误报修复**（P0-1 + P1-1 + P1-3）：sentinel-loader 注册挂 manifest（禁 this.manifest 门控空转）；aggregate 拦截 degraded（不误报 critical"现金流危急"）；capital-health 缺字段不默认为 0 | **P0** | 📝 **已派发（2026-08-16）·dev-doc 线认领写 dev doc**（哨兵切片归 DSH；spec 已推送，见 task-state/D356.json） |
> | **D357** | **L5 连接器落地**（P0-2 L5）：CRM（Salesforce/HubSpot/钉钉）+ 财务（用友/金蝶/银行）+ HR（北森/钉钉）连接器；管线已通（connector-pipeline + POST /api/connector/sync）缺连接器实现 | P1 | ❌ 需写 dev doc |
> | **D358** | **合并哨兵去 _extinct 桥接**（P1-2）：margin-health / capital-health 重写真实 compute，不再动态 import ../_extinct/ 退役代码；props 契约对齐 erp-standard | P1 | ❌ 需写 dev doc |
> | **D359** | **文档口径同步 + 权威03 落地**（P1-4 + P1-5）：架构文档 61/50/11/4 更新为实际 47/44/1/已修复；N1-N10 哨兵落地 + computeMarginalCost/LearningCurve/CSFProfile 补全 + 42 边旧标签迁移 + **正向信号放大未实现**（grep excellence/positive 零命中） | P1 | ❌ 需写 dev doc |
> | **D360** | **P2 批次清理**（checkedAt 1970 时间戳 / 阈值硬编码不读 manifest / findings 持久化分裂（tickets 表不读）/ DEPLOYS deprecated 门控 / 规范外哨兵 **3 个**（path-dependency / sentinel-forecast-accuracy / sentinel-pricing-strategy；**path-dependency 空壳缺实现**——D378 审计核实）/ err:any / **三重注册入口冗余**（builtins+file-driven+runner 去重无害化但冗余）） | P2 | ❌ 需写 dev doc |
>
> 开发文档: [implementation/](../plans/codex/implementation/) | 权威文档: [research/](research/)
> 协调文档: [ROLES.md](coordination/ROLES.md) | [AUDIT-PROTOCOL.md](coordination/AUDIT-PROTOCOL.md) | [审计发现台账](coordination/AUDIT-FINDINGS-LEDGER.md)（K3 审计发现 + CT/S 改进队列）| [DECISION-REFERENCE.md](coordination/DECISION-REFERENCE.md)（决策双参考系）| [**TASK-ROUTING.md 分工看板**](coordination/TASK-ROUTING.md)（**派活前必查**）
>
> **🧭 分工看板（唯一权威 = TASK-ROUTING.md v3，撞车时查它）**：
> | 模块 | 所有者 |
> |------|--------|
> | scripts/control-tower/ + 门禁脚本 + coordination 文档 | Mac DSH |
> | golden-scenarios/product-lines/.github/src\/mcp/electron | Mac DSH |
> | src/（除 mcp）+ extensions/ + packages/ + synova_worker | Win Claude |
> | docs/计划库 + 双仪表盘 | **Codex（本机）** |
> | scripts/audit/ + 审计执行 | Kimi K3 |
> **Codex 职责边界**：只写 Claude Code 的 dev doc（src/ 业务）+ 维护双仪表盘；**不碰控制塔/门禁脚本实现，不写 DSH 的 dev doc**。
>
> **📊 产品完成度（完成标准，给创始人看）**：产品 = 26 条能力线，每条线"到 100%"由验收点清单定义，只有 K3 复核/创始人演示核验的验收点才计绿。**当前总进度 3%**。入口: [product-progress.html](product-lines/product-progress.html) + [product-lines.yaml](product-lines/product-lines.yaml)。
> **本表 = 过程仪表盘（待办来源④）**：每个 D# 任务标注「服务线」编号，供产品完成度聚合"还差哪些待办"——D# 完成 ≠ 产品线绿，验收点经证据验证才算。
>
> **🗺️ D# → 产品线映射（待办 → 完成标准，源自设计文档 §2.3 K3 P0/P1→线权威映射）**：
> | D# | 服务线 |
> |----|--------|
> | D333 | 17 进化闭环（N13 + placeholder 假成功） |
> | D334 | 19 方向监测（direction-monitor 接线） |
> | D336 | 17 进化闭环（GA 验证闭环） |
> | D337 | 01 桌面端（静默升级/回滚） |
> | D338 | 24 安全与信任（orgId 单实例） |
> | D351 | 23 权限治理（ENT boss 角色） |
> | D354 | 08 告警推送（N14 去重键） |
> | D355 | 05 本体层收敛 + 09/10/11 三循环（契约收敛 + fail-open） |
> | D356 | 07 持续监测 + 08 告警推送（manifest 死代码 + 降级误报） |
> | D357 | 04 数据接入（L5 连接器） |
> | D358 | 07 持续监测（合并哨兵去 _extinct） |
> | D359 | 07 持续监测 + 15 专家体系（权威03 落地 + 哨兵口径） |
> | D360 | 07/08（P2 清理） |
> | D363 | 20 Agent 运行底座 + 21 模型底座（LLM failover） |
> | D364 | 16 目标导航 + 18 记忆体系（跟踪闭环 + 跨会话记忆） |
> | 流程类 | D307/308/310/330-332/340-342/343-349/352/353/365/373（控制塔/门禁/审计基建，**非产品线**，不直接推进任何线的验收点） |
> **创始人待裁决区（2026-08-13 建立——⏳ 项由 Codex 主动提出，不埋在队列）**：N14 ✅A（文档改 5 分钟，已落实）｜P0-8 ✅A（ENT 补 boss → D351）｜npm audit ⏳ 待裁（建议豁免并入 D309/D310 批次）
> 最后更新: 2026-08-12 | 派发链 D330(4.7.2)→D331(4.7.3)→D332(4.7.4)→D307(4.8.0) | CT 20/20 | 门禁 12 组 | 审计基线 434
> English: [DASHBOARD.md](DASHBOARD.md)

> 📡 **飞书 ↔ Codex 对话桥 (2026-08-07 登记)**: 官方 @larksuite/cli 接入，用户在飞书里直接与 Codex 对话。
> 代码: [scripts/feishu-bridge/](../scripts/feishu-bridge/)（feishu_bridge.py v2.0 + README + .env）。
> 架构: `lark-cli event consume im.message.receive_v1`（长连接，无需公网 URL）→ `codex exec/resume` → `lark-cli im +messages-reply` 回复原消息；每 chat 一 thread 续接，message_id 去重，日志 bridge.log。
> 当前状态: ✅ **已开通并实测连通**（2026-08-07 验证：事件长连接 + 收发正常，会话续接工作；曾修复 resume --cd 参数错误）。
> 维护: 桥接进程由本机后台运行；凭据在 lark-cli keychain（仓库外备份 `%USERPROFILE%\.config\synova\feishu-bridge.env`）；勿把 FEISHU_APP_ID/SECRET 写回仓库内（触发 Secrets 门禁）。
> 注意: 运行环境必须能访问系统 keychain（凭据管理器）；CLI 凭据已配置（`~/.lark-cli/hermes/config.json`，沙箱外生效）。
> 后续可选: 桥接服务化（开机自启/守护）、多用户白名单策略、D# 任务化沉淀为控制塔产品能力。

---

## 控制塔部署状态 (20/20 在线)

| 组件 | D# | 状态 |
|------|-----|------|
| 上下文注射器 | D200 | 在线 |
| 校验网守 | D201+Phase2 | 在线 (11/11) |
| 外部审计器 | D202+D210 | 在线 (6/6) |
| Synova Commit | D201 | 激活 |
| 文档门禁 | D206+D212 | 在线 |
| 契约存档器 | D208 | 在线 (5/5) |
| 写入锁 | D209 | 在线 (5/5) |
| 审计器接线 | D210 | 在线 |
| 环境验证器 | D211 | 在线 (4/4) |
| 仪表盘 (D213) | D213 | 在线 |
| 共享信号发射器 | D214 | 在线 |
| 契约Store+Gate | D215 | 在线 |
| 审计补全 | D216 | 在线 |
| 写入锁补全 | D218 | 在线 |
| 全局集成 | D219 | 在线 |
| 创始人驾驶舱 | D220+PHASE2/3/4 | 在线 |
| 真实数据连接器 | D221 | 在线 |
| 方向监测 | D222 | 在线 |
| 停滞检测 | D223 | 在线 |

## 一、整体进度

已完成 (100%): I2/D10/D15a/D29-D101/D102-D111/D200-D241
#4 Agent L2: 100% (D8a-D8g+D9+D20)
#5 Agent主动交互: 100% (D17-D21)
#6 测试体系: 100% (D24-D28, 10黄金案例)
#16 企业多用户: 100% (D102-D111)
#17 控制塔: 100% (D200-D232, 20/20)
#18 权限与知识治理: 100% (6/6 done)

## 二、最近完成 (2026-07-28~29)

| # | 任务 | 文件 | CI | 日期 |
|---|------|------|:--:|------|
| D253 | GA 管理界面 (三面板: 企业列表 + 诊断数据 + 联邦审批) | `app/ga.html` + `app/js/ga.js` + CSS + shell.js | ✅ 6/8 | 07-28 |
| D253-fix | package-lock.json 重建修复 CI (10 个 `../packages/` 残留引用) | `package-lock.json` | ✅ 6/8 | 07-28 |
| D255 | Electron 桌面打包 (.exe) — electron-builder + build-synova.cjs 修正 | `package.json` + `build-synova.cjs` + lockfile | ✅ 6/8 | 07-29 |
| D258 | 脚本清理归并 — 删除 22 死文件, 2 组合并, 1 归档 | `scripts/` 清理 | ✅ 6/8 | 07-29 |
| D261 | V3-P1 PM仪表盘 + 完成度 (视图2+3) — views/pm_dashboard + completion + 快照 | 5 新建 + 4 修改 | ✅ 6/8 | 07-29 |
| D263 | GraphStore 增量查询 — `queryNodesCreatedAfter(store, graph, days)` | `src/l4/diagnosis-graph-query.ts` + 5 测试 | ✅ 6/8 | 07-29 |
| D266 | 数据管道监控 — `getPipelineHealth()` 封装 D263 | `src/ingest/data-pipeline-monitor.ts` + 4 测试 | ✅ 6/8 | 07-29 |

### CI 状态详情 (6 个任务一致)

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| TypeScript + Lint + Iron Laws | ✅ 通过 | tsc --noEmit 零新增错误 |
| Vitest (1/2) | ✅ 通过 | 0 新增失败 |
| Vitest (2/2) | ✅ 通过 | 0 新增失败 |
| Integration Contract Check | ✅ 通过 | L1+L2 接线已验证 |
| Checker Review | ✅ 通过 | maker/checker + brief-vs-code |
| Golden Case F1 Gate | ✅ 通过 | F1 阈值达标 |
| Architecture Check | ❌ 失败(预存) | `src/routes/admin-knowledge.ts` L1→L4 — 与本批次任务无关 |
| npm audit | ❌ 失败(预存) | electron 依赖 CVE — 与本批次任务无关 |

## 三、上次完成 (2026-07-24~27)

| # | 任务 | 日期 |
|---|------|------|
| D8g | 推理成本预算 | 07-24 |
| D9 | 内置循环激活 | 07-26 |
| D20 v2 | 循环交互展示 | 07-26 |
| D106-D111 | 企业多用户全部 | 07-26 |
| D213-D219 | 控制塔全子组件 | 07-24~25 |
| D220 | 创始人驾驶舱 | 07-25 |
| D221-D232 | Gate+修复+测试+部署 | 07-25~26 |
| D234 | 专家工具补齐 (8/8) | 07-27 |
| D236 | 专家9->7重构 (39文件) | 07-27 |
| D239 | GA权限边界 (14测试) | 07-27 |
| D240 | 企业事实治理 (9测试) | 07-27 |
| D241 | 知识审批流水线 (6测试) | 07-27 |

## 三、剩余缺口 (来自预期状态模型 v3.1)

| # | 缺口 | 权威文档 | 优先级 | 状态 |
|---|------|---------|:---:|------|
| G1 | GA合同到期日UI (代码存在, 无管理员UI设置) | #18 M1 | P0 | D239已加GAConstraints, contractExpiry未用 |
| G2 | 客户自安装 (无安装引导) | #16 Ch3 | P0 | D232部署指南存在, 无引导安装器 |
| G3 | 诊断从未用真实数据验证 | — | P0 | 零次真实企业测试 |
| G4 | ProactivePush通道空 (emitSignal绕道可用) | #05 M1 | P1 | D249加了emitSignal路径 |
| G5 | 推送去重未实现 | #05 M1 | P2 | 同一告警多次推送 |
| G6 | 按角色推送未实现 | #05 M1 | P2 | 所有人看到相同推送 |
| G7 | 5个旧专家缺金字塔格式 | #05 M6 | P1 | D236重构7专家, 旧目录未清理 |
| G8 | 子Agent可视化 (右侧占位) | #05 Suppl | P2 | index.html L35占位文字 |
| G9 | 数据管道健康未监控 | #17 | P1 | D266 已完成 — `getPipelineHealth()` via `queryNodesCreatedAfter` (D263) |
| G10 | 审计器cross-check+report (2/5子模块缺) | #17 Ch5 | P1 | 3/5已实现 |
| G11 | V3 P2视图4+5 (工作流图+Agent健康) | #17 | P2 | 视图1/2/3已完成(D260/D261) |
| G12 | 运行健康度自检 (product-health.py) | #17 | P1 | D263+D266 已完成 (queryNodesCreatedAfter + getPipelineHealth), D265/D267 待完成 |
| G13 | 组织记忆自动生成 (模式→事实) | #18 M2-3 | P1 | D240文件事实存在, 自动生成缺 |
| G14 | 部门记忆 | #18 M3 | P2 | 未实现 |
| G15 | 联邦知识/多企业共享 | #18 M4 | P2 | D244联邦管线存在, 多企业缺失 |
| G16 | NCI非共识检测 | #02 | P2 | 研究完成, 代码零实现 |
| G17 | 跨部门信号 | #15 | P2 | 销售→研发信号传导未实现 |
| G18 | 知识审批管线 (写入→待审→通过) | #18 M4 | P1 | D241 pkb_status draft, 非完整管线 |
| G19 | 流式SSE前端 (通用聊天) | #05 M2 | P1 | D252诊断SSE, 通用聊天用fetch |
| G20 | GA纠正自动反馈到诊断规则 | #17 | P1 | D262反馈收集, 闭环缺失 |
| G21 | 自诊断Phase 0完成 (D265-D267) | #17 | P1 | D262-D264 done, D265-D267就绪 |

## 四、下一批待办

| # | Task | Auth Doc | Status |
|---|------|----------|------|
| D256 | 审计器统一入口 (CT Graph Phase 1-1) | #17 Ch5 | dev doc ready |
| D257 | 契约门禁接入网守 (CT Graph Phase 1-2) | #17 Ch3 | dev doc ready |
| D260 | V3-P0 流水线健康度 (视图1) | — | DONE |
| D261 | V3-P1 PM仪表盘+完成度 (视图2+3) | — | DONE |
| D265 | 资源监控 (CPU/内存/磁盘) | #17 | dev doc ready |
| D267 | 自诊断CLI (6条件判定) | #17 | dev doc ready |

## 五、关键指标

| 指标 | 数值 | 目标 |
|------|------|------|
| 门禁 | 17/17 PASS | 17/17 |
| 控制塔 | 20/20 在线 | 20/20 |
| 已完成D任务 | 131+ | 97% |
| 哨兵 | 49活跃（45扩展+4内置，另12退役） | 50 |
| 计算总计 | 88 | >=1/edge |
| 专家 | 8工具+15目录 | 7活跃 |
| 前端页面 | 6 HTML | 10/31 |
| API端点 | 54+ | 全部接线 |
| 权威文档 | 19份 | 完整 |
| as any | 0 | 0 |

## 六、风险

| 风险 | 等级 | 状态 |
|------|------|------|
| 企业事实治理空白 | — | D240已修复 |
| GA无限制访问 | — | D239已修复 |
| D239 ws.sensitivity 未激活 | 低 | 被动防御——调用方不传 sensitivity 字段时跳过检查。后续 workspace 加字段后自动激活。跟踪至 D242 |
| D111 Electron无法启动 | — | D233 DONE ✅ |
| 10/31 客户交付 | 低 | 按计划 |
| 跨企业联邦知识 | 低 | D244待定 |
<!-- MANUAL:END -->

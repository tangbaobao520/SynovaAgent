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
| D321 | git notes 读取独立任务 (D320 dev doc §依赖 — 生成器已留 hook… | 待办 | — | — | — | 未知 | — | — |
| D320 | 仪表盘git化生成器 | dev doc（P1） | — | — | 2026-08-08 | 未知 | — | — |
| D319 | git-tag自动化 | dev doc（P1） | 300660e | ClawOrg-Win | 2026-08-09 | ✅ | — | — |
| D318 | 双机身份与hooks可移植 | dev doc（P0） | c576e2b | ClawOrg-Win | 2026-08-09 | ✅ | — | — |
| D317 | G12b-CI-Fix | dev doc（P0） | 078ccba | ClawOrg | 2026-08-08 | ✅ | — | — |
| D316 | CT-V4.6.0-Fix | dev doc（P1） | fdad612 | ClawOrg | 2026-08-06 | ✅ | — | — |
| D315 | utf8-batch-closeout | ✅ 已提交 | 6a5eb01 | ClawOrg | 2026-08-05 | ✅ | — | — |
| D314 | feat(D314): M4 基线豁免 + 独立化底座 — tsc 豁免/日志五件套/atta… | ✅ 已提交 | c5d8d15 | ClawOrg | 2026-08-05 | ✅ | — | — |
| D313 | control-tower-finalize | ✅ 已提交 | 624281f | ClawOrg | 2026-08-05 | ✅ | — | — |
| D312 | baseline-tools | ✅ 已提交 | e9b7e1c | ClawOrg | 2026-08-03 | ✅ | — | — |
| D311 | multi-session-coordination | ✅ 已提交 | 9096993 | ClawOrg | 2026-08-03 | ✅ | — | — |
| D309 | AdminKnowledge-L1L4 | dev doc（P0） | — | — | 2026-08-06 | 未知 | — | — |
| D300 | GoldenCase-Gate | dev doc（P1） | 02500e7 | ClawOrg | 2026-08-02 | ✅ | — | — |
| D296 | ControlTower-Truthfulness | dev doc（P0） | 4c664c7 | ClawOrg | 2026-08-02 | ✅ | — | — |
| D292 | L2L4-CrossLayer | ✅ 已提交 | 6a485b3 | ClawOrg | 2026-08-02 | ✅ | — | — |
| D291 | Empty-Catches | ✅ 已提交 | ee694bf | ClawOrg | 2026-08-01 | ✅ | — | — |
| D290 | 2026-08-01-D290-audit-check-python-native | ✅ 已提交 | 6aff260 | ClawOrg | 2026-08-01 | ✅ | — | — |
| D286 | GraphStore-Deprecation | ✅ 已提交 | 89d043f | ClawOrg | 2026-08-02 | ✅ | — | — |
| D285 | Role-Push | ✅ 已提交 | 4602e0f | ClawOrg | 2026-07-30 | ✅ | — | — |
| D284 | CrossDept-Signals | ✅ 已提交 | 0625f31 | ClawOrg | 2026-07-31 | ✅ | — | — |
| D283 | Setup-Guide | ✅ 已提交 | 2fb7f13 | ClawOrg | 2026-07-30 | ✅ | — | — |
| D282 | Expert-Migration | ✅ 已提交 | e049aa5 | ClawOrg | 2026-07-30 | ✅ | — | — |
| D281 | GA-Expiry-UI | ✅ 已提交 | 50f50fc | ClawOrg | 2026-07-31 | ✅ | — | — |
| D273 | GA-Correction-Feedback | ✅ 已提交 | 137243e | ClawOrg | 2026-07-30 | ✅ | — | — |
| D272 | ProactivePush-Wiring | ✅ 已提交 | 6ea3ae4 | ClawOrg | 2026-07-30 | ✅ | — | — |
| D271 | V3-P2-Views45 | ✅ 已提交 | 7d6f6a5 | ClawOrg | 2026-07-30 | ✅ | — | — |
| D270 | audit-crosscheck-report | ✅ 已提交 | ff32449 | ClawOrg | 2026-07-30 | ✅ | — | — |
| D269 | expert-pyramid-format | ✅ 已提交 | 12fb099 | ClawOrg | 2026-07-30 | ✅ | — | — |
| D268 | product-health-cli | ✅ 已提交 | d973688 | ClawOrg | 2026-07-30 | ✅ | — | — |
| D267 | FIX-PathReachable-BFS-v1-0 | ✅ 已提交 | 0d8aefc | ClawOrg | 2026-07-30 | ✅ | — | — |
| D266 | Pipeline-Monitor-v1-0 | ✅ 已提交 | 2a5a4d2 | ClawOrg | 2026-07-29 | ✅ | — | — |
| D265 | Resource-Monitor-v1-0 | ✅ 已提交 | 3d13f65 | ClawOrg | 2026-07-29 | ✅ | — | — |
| D264 | DiagnosisQualityScore-v1-0 | ✅ 已提交 | 18a4995 | ClawOrg | 2026-07-29 | ✅ | — | — |
| D263 | DiagnosisGraphQuery-v1-0 | ✅ 已提交 | 124c480 | ClawOrg | 2026-07-29 | ✅ | — | — |
| D262 | GA-Feedback-Wiring-v1-0 | ✅ 已提交 | d7f3fb0 | ClawOrg | 2026-07-29 | ✅ | — | — |
| D261 | V3-P1-PM-Dashboard-v1-0 | ✅ 已提交 | 4de1d78 | ClawOrg | 2026-07-29 | ✅ | — | — |
| D260 | V3-P0-Pipeline-Health-v1-0 | ✅ 已提交 | 518de93 | ClawOrg | 2026-07-29 | ✅ | — | — |
| D258 | Script-Cleanup-v1-0 | ✅ 已提交 | f29cb6a | ClawOrg | 2026-07-29 | ✅ | — | — |
| D257 | Contract-Gate-v1-0 | ✅ 已提交 | fd9880b | ClawOrg | 2026-07-29 | ✅ | — | — |
| D256 | Auditor-Entry-v1-0 | ✅ 已提交 | 02eadd6 | ClawOrg | 2026-07-29 | ✅ | — | — |
| D255 | Electron-Packaging-v1-0 | ✅ 已提交 | dd47004 | ClawOrg | 2026-07-29 | ✅ | — | — |
| D254 | Action-Effect-Verification-v2-0 | ✅ 已提交 | d0c15cb | ClawOrg | 2026-07-28 | ✅ | — | — |
| D253 | GA-Dashboard-v1-0 | ✅ 已提交 | ad90761 | ClawOrg | 2026-07-30 | ✅ | — | — |
| D252 | SSE-Streaming-Chat-v2-0 | ✅ 已提交 | 3dde657 | ClawOrg | 2026-07-28 | ✅ | — | — |
| D251 | Thread-List-UI-v1-0 | ✅ 已提交 | 34c7ff7 | ClawOrg | 2026-07-28 | ✅ | — | — |
| D250 | Thread-Rename-API-v1-0 | ✅ 已提交 | 77c6b71 | ClawOrg | 2026-07-28 | ✅ | — | — |
| D249 | ProactivePush-Wiring-v1-0 | ✅ 已提交 | c268f90 | ClawOrg | 2026-07-27 | ✅ | — | — |
| D248 | Phone-WeChat-Register-v1-0 | ✅ 已提交 | 6b6c411 | ClawOrg | 2026-07-27 | ✅ | — | — |
| D247 | E2E-Customer-Flow-v1-0 | ✅ 已提交 | fa13e39 | ClawOrg | 2026-07-27 | ✅ | — | — |
| D246 | Onboarding-Wizard-v1-0 | ✅ 已提交 | fa52079 | ClawOrg | 2026-07-27 | ✅ | — | — |
| D245 | Admin-UI-v1-0 | ✅ 已提交 | 952afc7 | ClawOrg | 2026-07-27 | ✅ | — | — |
| D244 | Federated-Knowledge-v1-0 | ✅ 已提交 | 201f391 | ClawOrg | 2026-07-27 | ✅ | — | — |
| D243 | Anti-Sabotage-v1-0 | ✅ 已提交 | f136b5d | ClawOrg | 2026-07-27 | ✅ | — | — |
| D242 | Permission-Templates-v1-0 | ✅ 已提交 | 0bcea95 | ClawOrg | 2026-07-27 | ✅ | — | — |
| D241 | Knowledge-Approval-v1-0 | ✅ 已提交 | af7eb79 | ClawOrg | 2026-07-27 | ✅ | — | — |
| D240 | Enterprise-Facts-v1-0 | ✅ 已提交 | 062c73c | ClawOrg | 2026-07-27 | ✅ | — | — |
| D239 | GA-Boundary-v1-0 | ✅ 已提交 | 0eb7d2f | ClawOrg | 2026-07-27 | ✅ | — | — |
| D238 | Loop6-Overflow-Monitor-v1-0 | ✅ 已提交 | 483ee47 | ClawOrg | 2026-07-27 | ✅ | — | — |
| D237 | Loop3-GA-Evolution-v1-0 | ✅ 已提交 | 5b0be74 | ClawOrg | 2026-07-27 | ✅ | — | — |
| D236 | Expert-Restructure-v1-0 | ✅ 已提交 | 34850a3 | ClawOrg | 2026-07-27 | ✅ | — | — |
| D235 | DASHBOARD-Update-v2-0 | ✅ 已提交 | e39386c | ClawOrg | 2026-07-27 | ✅ | — | — |
| D234 | Expert-Tools-v1-0 | ✅ 已提交 | 9125ed6 | ClawOrg | 2026-07-27 | ✅ | — | — |
| D233 | Electron-v1-0 | ✅ 已提交 | f657614 | ClawOrg | 2026-07-27 | ✅ | — | — |
| D232 | deployment-guide-v1 | ✅ 已提交 | 8df38ad | ClawOrg | 2026-07-26 | ✅ | — | — |
| D231 | csv-import-page-v1 | ✅ 已提交 | dd6b1b8 | ClawOrg | 2026-07-26 | ✅ | — | — |
| D230 | signal-bootstrap-v1 | ✅ 已提交 | 4f731cf | ClawOrg | 2026-07-26 | ✅ | — | — |
| D229 | windows-agent-start-v1 | ✅ 已提交 | 2f0dc1c | ClawOrg | 2026-07-26 | ✅ | — | — |
| D228 | fix(D228): npm run dev on Windows + generate-da… | ✅ 已提交 | 987ad4a | ClawOrg | 2026-07-26 | ✅ | — | — |
| D227 | knowledge-sentinel-v1 | ✅ 已提交 | 4df3a9d | ClawOrg | 2026-07-26 | ✅ | — | — |
| D226 | goal-lifecycle-e2e-v1 | ✅ 已提交 | 6d5544d | ClawOrg | 2026-07-26 | ✅ | — | — |
| D225 | gate0-gate5-fix-v1 | ✅ 已提交 | 2e73254 | ClawOrg | 2026-07-26 | ✅ | — | — |
| D224 | wiring-integration-v1 | ✅ 已提交 | 36e8805 | ClawOrg | 2026-07-26 | ✅ | — | — |
| D223 | stagnation-detection-v1 | ✅ 已提交 | a33f05c | ClawOrg | 2026-07-25 | ✅ | — | — |
| D222 | direction-monitor-v1 | ✅ 已提交 | 46e9433 | ClawOrg | 2026-07-25 | ✅ | — | — |
| D221 | csv-connector-v1 | ✅ 已提交 | d74c2f7 | ClawOrg | 2026-07-25 | ✅ | — | — |
| D220 | FIX-interaction-v1 | ✅ 已提交 | 95bf30c | ClawOrg | 2026-07-25 | ✅ | — | — |
| D219 | check-gates-v2-v1 | ✅ 已提交 | 706f98a | ClawOrg | 2026-07-26 | ✅ | — | — |
| D218 | write-lock-completion-v1 | ✅ 已提交 | 84e3b17 | ClawOrg | 2026-07-23 | ✅ | — | — |
| D217 | env-completion-v1 | ✅ 已提交 | c860122 | ClawOrg | 2026-07-23 | ✅ | — | — |
| D216 | audit-completion-v1 | ✅ 已提交 | 3d5663c | ClawOrg | 2026-07-23 | ✅ | — | — |
| D215 | contract-store-gate-v1 | ✅ 已提交 | 07d1492 | ClawOrg | 2026-07-23 | ✅ | — | — |
| D214 | shared-signal-emitter-v1 | ✅ 已提交 | d53d092 | ClawOrg | 2026-07-23 | ✅ | — | — |
| D213 | control-tower-dashboard-v1 | ✅ 已提交 | ce16474 | ClawOrg | 2026-07-23 | ✅ | — | — |
| D212 | dev-doc-gatekeeper-python-v1 | ✅ 已提交 | 98d54e2 | ClawOrg | 2026-07-23 | ✅ | — | — |
| D211 | env-validator-v1 | ✅ 已提交 | 23b08be | ClawOrg | 2026-07-23 | ✅ | — | — |
| D210 | external-auditor-wiring-v1 | ✅ 已提交 | f51a234 | ClawOrg | 2026-07-23 | ✅ | — | — |
| D209 | write-lock-v1 | ✅ 已提交 | f747a61 | ClawOrg | 2026-07-23 | ✅ | — | — |
| D208 | contract-archiver-v1 | ✅ 已提交 | af6ab00 | ClawOrg | 2026-07-23 | ✅ | — | — |
| D207 | control-tower-phase1-deploy-v1 | ✅ 已提交 | 4972e4c | ClawOrg | 2026-07-22 | ✅ | — | — |
| D206 | dev-doc-gatekeeper-v1 | ✅ 已提交 | 534d898 | ClawOrg | 2026-07-22 | ✅ | — | — |
| D202 | external-auditor-v1 | ✅ 已提交 | 39a672f | ClawOrg | 2026-07-22 | ✅ | — | — |
| D201 | FIX-install-synova-commit-v1 | ✅ 已提交 | eae77fe | ClawOrg | 2026-07-23 | ✅ | — | — |
| D200 | context-injector-v1 | ✅ 已提交 | d8853b6 | ClawOrg | 2026-07-22 | ✅ | — | — |
| D111 | electron-client-v1 | ✅ 已提交 | c967797 | ClawOrg | 2026-07-26 | ✅ | — | — |
| D110 | ima-cron-sync-v1 | 待办 | — | — | — | 未知 | — | — |
| D109 | FIX-remove-math-random-v1 | ✅ 已提交 | 1b82052 | ClawOrg | 2026-07-22 | ✅ | — | — |
| D108 | admin-workbench-ui-v1 | ✅ 已提交 | d06da0e | ClawOrg | 2026-07-26 | ✅ | — | — |
| D107 | ontology-adapter-v1 | ✅ 已提交 | 19e7250 | ClawOrg | 2026-07-26 | ✅ | — | — |
| D106 | D107-graphstore-user-ontology-v1 | ✅ 已提交 | 99e85b7 | ClawOrg | 2026-07-26 | ✅ | — | — |
| D104 | D105-ima-connector-knowledge-agent-v1 | ✅ 已提交 | 8b54fb5 | ClawOrg | 2026-07-21 | ✅ | — | — |
| D102 | D103-auth-upgrade-enterprise-routes-v1 | ✅ 已提交 | 34eeff0 | ClawOrg | 2026-07-21 | ✅ | — | — |
| D101 | deployment-drill-production-hardening-v1 | ✅ 已提交 | 246aacf | ClawOrg | 2026-07-17 | ✅ | — | — |
| D100 | diagnosis-quality-calibration-v1 | ✅ 已提交 | a008600 | ClawOrg | 2026-07-17 | ✅ | — | — |
| D99 | e2e-full-pipeline-test-v1 | ✅ 已提交 | e652334 | ClawOrg | 2026-07-17 | ✅ | — | — |
| D98 | report-viewer-ui-v1 | ✅ 已提交 | f57c620 | ClawOrg | 2026-07-17 | ✅ | — | — |
| D97 | dashboard-ui-v1 | ✅ 已提交 | e35c36d | ClawOrg | 2026-07-17 | ✅ | — | — |
| D96 | login-auth-ui-v1 | ✅ 已提交 | c3f5164 | ClawOrg | 2026-07-17 | ✅ | — | — |
| D95 | cross-scale-overflow-v1 | ✅ 已提交 | 21a30fc | ClawOrg | 2026-07-17 | ✅ | — | — |
| D94 | cronscheduler-hybrid-trigger-v1 | ✅ 已提交 | 7ee8386 | ClawOrg | 2026-07-17 | ✅ | — | — |
| D93 | feedback-collector-pipeline-v1 | ✅ 已提交 | e4313d1 | ClawOrg | 2026-07-16 | ✅ | — | — |
| D92 | cycle7-middle-evolution-v1 | ✅ 已提交 | 29f84f8 | ClawOrg | 2026-07-17 | ✅ | — | — |
| D91 | multi-scale-trigger-matrix-v1 | ✅ 已提交 | dfb5429 | ClawOrg | 2026-07-17 | ✅ | — | — |
| D90 | overflow-dashboard-advisor-v1 | ✅ 已提交 | 8020c97 | ClawOrg | 2026-07-16 | ✅ | — | — |
| D89 | 溢出计算-OverflowGraphBridge-v1 | ✅ 已提交 | ae61dc5 | ClawOrg | 2026-07-15 | ✅ | — | — |
| D88 | CycleLoader-Phase2e-v1 | ✅ 已提交 | 7be2ccf | ClawOrg | 2026-07-15 | ✅ | — | — |
| D87 | 术语字典-跨层级映射-v1 | ✅ 已提交 | 85122d7 | ClawOrg | 2026-07-15 | ✅ | — | — |
| D86 | 自助诊断-v1 | ✅ 已提交 | 25ed29e | ClawOrg | 2026-07-15 | ✅ | — | — |
| D85 | MVS黄金数据集-回归测试-v1 | ✅ 已提交 | 6d01542 | ClawOrg | 2026-07-15 | ✅ | — | — |
| D84 | 集成测试契约-v1 | ✅ 已提交 | 2852dad | ClawOrg | 2026-07-14 | ✅ | — | — |
| D83 | 启动序列Phase0-5-回滚协议-v1 | ✅ 已提交 | ea7fb6e | ClawOrg | 2026-07-14 | ✅ | — | — |
| D82 | 7条缺失compute-v1 | ✅ 已提交 | 06939b0 | ClawOrg | 2026-07-14 | ✅ | — | — |
| D80 | PlaybookExecutionRecord-持久化-v1 | ✅ 已提交 | bf29b42 | ClawOrg | 2026-07-15 | ✅ | — | — |
| D79 | ContextLoader企业参数合并器-v1 | ✅ 已提交 | 88edccc | ClawOrg | 2026-07-14 | ✅ | — | — |
| D77 | 增长导航系统集成-v1 | ✅ 已提交 | 329178f | ClawOrg | 2026-07-15 | ✅ | — | — |
| D76 | 执行知识PKB回流-v1 | ✅ 已提交 | 5774a06 | ClawOrg | 2026-07-15 | ✅ | — | — |
| D75 | 轻量级再诊断引擎-v1 | ✅ 已提交 | d29c30b | ClawOrg | 2026-07-15 | ✅ | — | — |
| D74 | 工作台数据聚合-v1 | ✅ 已提交 | 8429c4d | ClawOrg | 2026-07-15 | ✅ | — | — |
| D73 | FIX-lifecycle测试补全-v1 | ✅ 已提交 | c6748e8 | ClawOrg | 2026-07-14 | ✅ | — | — |
| D72 | Proposal引擎-三选一确认-v1 | ✅ 已提交 | 662d118 | ClawOrg | 2026-07-14 | ✅ | — | — |
| D71 | FIX-审计修复-v1 | ✅ 已提交 | a32b319 | ClawOrg | 2026-07-14 | ✅ | — | — |
| D70 | IDENTITY-analytical-lens补全-v1 | ✅ 已提交 | 238a9a1 | ClawOrg | 2026-07-15 | ✅ | — | — |
| D69 | expert-prompts降级-文件驱动-v1 | ✅ 已提交 | 5747983 | ClawOrg | 2026-07-14 | ✅ | — | — |
| D68 | 2026-07-13-D68-Tool原子验证-权限模型 | ✅ 已提交 | 96e1836 | ClawOrg | 2026-07-13 | ✅ | — | — |
| D67 | 2026-07-13-D67-Playbook加载器 | ✅ 已提交 | ca8312b | ClawOrg | 2026-07-13 | ✅ | — | — |
| D66 | 2026-07-13-D66-出厂内置Skill清单 | ✅ 已提交 | 4f60157 | ClawOrg | 2026-07-13 | ✅ | — | — |
| D65 | 2026-07-12-D65-Skill-Tool-Registry-Loader | ✅ 已提交 | cc1b2a3 | ClawOrg | 2026-07-13 | ✅ | — | — |
| D64 | expert-knowledge-files-v1 | ✅ 已提交 | 8938268 | ClawOrg | 2026-07-16 | ✅ | — | — |
| D63 | SKILL-pull-mode-v1 | ✅ 已提交 | 40c51b9 | ClawOrg | 2026-07-16 | ✅ | — | — |
| D62 | ME-sentinels-v1 | ✅ 已提交 | 438ae64 | ClawOrg | 2026-07-16 | ✅ | — | — |
| D61 | ME-compute-fix-v1 | ✅ 已提交 | 6c39197 | ClawOrg | 2026-07-16 | ✅ | — | — |
| D60 | ME-compute-new-v1 | ✅ 已提交 | b058b8d | ClawOrg | 2026-07-15 | ✅ | — | — |
| D59 | ME-compute-enhance-v1 | ✅ 已提交 | dc4d6a0 | ClawOrg | 2026-07-15 | ✅ | — | — |
| D58 | manifest-加载器文件化-v1 | ✅ 已提交 | f7ee3e8 | ClawOrg | 2026-07-14 | ✅ | — | — |
| D57 | Tone四源融合-角色一致性-v1 | ✅ 已提交 | 8e0a6c6 | ClawOrg | 2026-07-13 | ✅ | — | — |
| D56 | 2026-07-13-D56-data-conflict-protocol | ✅ 已提交 | 1613acb | ClawOrg | 2026-07-13 | ✅ | — | — |
| D55 | 2026-07-13-D55-reasoning-crossval | ✅ 已提交 | a1121bc | ClawOrg | 2026-07-13 | ✅ | — | — |
| D54 | 2026-07-13-D54-prompt-assembler | ✅ 已提交 | 0caa95e | ClawOrg | 2026-07-13 | ✅ | — | — |
| D53 | 2026-07-12-D53-专家AgentSpec文件化 | ✅ 已提交 | 5683883 | ClawOrg | 2026-07-13 | ✅ | — | — |
| D52 | 规模化运维-行业Skill包-v1 | ✅ 已提交 | 12e8266 | ClawOrg | 2026-07-15 | ✅ | — | — |
| D51 | CI-CD-golden-case-F1-v1 | ✅ 已提交 | 0f7cd8f | ClawOrg | 2026-07-15 | ✅ | — | — |
| D50 | 一键恢复包-备份验证-v1 | ✅ 已提交 | ad49ab2 | ClawOrg | 2026-07-14 | ✅ | — | — |
| D49 | 独立看门狗-三层监控-v1 | ✅ 已提交 | a1c90c0 | ClawOrg | 2026-07-14 | ✅ | — | — |
| D48 | 2026-07-13-D48-静默升级-版本回滚 | ✅ 已提交 | f88a2de | ClawOrg | 2026-07-13 | ✅ | — | — |
| D43 | 2026-07-12-D43-PromptInjectionDetector | ✅ 已提交 | ee545ea | ClawOrg | 2026-07-12 | ✅ | — | — |
| D42 | feat(D42): PreUploadValidator — 知识基座上传播前隐私预检 | ✅ 已提交 | fbc84d6 | ClawOrg | 2026-07-12 | ✅ | — | — |
| D41 | feat(D41): 审计哈希链 + RootHashPublisher — 审计日志防篡改 | ✅ 已提交 | ff32285 | ClawOrg | 2026-07-12 | ✅ | — | — |
| D40 | 2026-07-12-D40-DataExporter-DataPurger | ✅ 已提交 | 1f785ab | ClawOrg | 2026-07-12 | ✅ | — | — |
| D39 | 2026-07-12-D39-TraversalPermissionFilter | ✅ 已提交 | c3124cb | ClawOrg | 2026-07-12 | ✅ | — | — |
| D38 | 2026-07-12-D38-PolicyEngine权限引擎 | ✅ 已提交 | 0a9bf45 | ClawOrg | 2026-07-12 | ✅ | — | — |
| D37 | 2026-07-12-D37-data-conflict-awareness | ✅ 已提交 | 625cf98 | ClawOrg | 2026-07-12 | ✅ | — | — |
| D36 | 2026-07-11-D36-可插拔扩展机制 | ✅ 已提交 | fe8ac17 | ClawOrg | 2026-07-11 | ✅ | — | — |
| D34 | 2026-07-11-D34-PII脱敏接入 | ✅ 已提交 | 3f34fd0 | ClawOrg | 2026-07-11 | ✅ | — | — |
| D33 | 2026-07-12-D33-存储时间语义 | ✅ 已提交 | 594e8a9 | ClawOrg | 2026-07-12 | ✅ | — | — |
| D32 | 2026-07-11-D32-Outcome-JSON字段补全 | ✅ 已提交 | a128df7 | ClawOrg | 2026-07-11 | ✅ | — | — |
| D31 | 2026-07-11-D31-6数据适配器JSON | ✅ 已提交 | dbf0d43 | ClawOrg | 2026-07-11 | ✅ | — | — |
| D30 | 2026-07-12-D30-数据质量门禁 | ✅ 已提交 | a4ed24e | ClawOrg | 2026-07-12 | ✅ | — | — |
| D29 | feat(D29): 数据冲突机制 — GraphStore/data-ingest/Agen… | ✅ 已提交 | 1e0dab3 | ClawOrg | 2026-07-11 | ✅ | — | — |
| D26 | golden-case-extension-v1 | ✅ 已提交 | ee73e23 | ClawOrg | 2026-07-21 | ✅ | — | — |
| D25 | contract-test-completion-v1 | ✅ 已提交 | 6ca97b2 | ClawOrg | 2026-07-20 | ✅ | — | — |
| D21 | action-closed-loop-v1 | ✅ 已提交 | 26b0770 | ClawOrg | 2026-07-22 | ✅ | — | — |
| D20 | loop-interaction-display-v1 | ✅ 已提交 | de23cf6 | ClawOrg | 2026-07-23 | ✅ | — | — |
| D19 | ga-collaboration-v1 | ✅ 已提交 | 714845e | ClawOrg | 2026-07-21 | ✅ | — | — |
| D18 | interactive-card-replies-v1 | ✅ 已提交 | 31f1152 | ClawOrg | 2026-07-21 | ✅ | — | — |
| D17 | proactive-push-v1 | ✅ 已提交 | f57e282 | ClawOrg | 2026-07-20 | ✅ | — | — |
| D15 | 2026-07-12-D15a-哨兵合并废弃 | ✅ 已提交 | 71fbac8 | ClawOrg | 2026-07-12 | ✅ | — | — |
| D14 | 2026-07-11-D14-15概念节点NodeType注册 | ✅ 已提交 | 52b7d2a | ClawOrg | 2026-07-11 | ✅ | — | — |
| D10 | feat(D10): engine-core 包退役 — diagnosis.ts 切换至 S… | ✅ 已提交 | e783c07 | ClawOrg | 2026-07-11 | ✅ | — | — |
| D9 | builtin-loops-v1 | ✅ 已提交 | c4b8f39 | ClawOrg | 2026-07-26 | ✅ | — | — |
| D8 | a-L2-main-agent-v1 | ✅ 已提交 | fff82e3 | ClawOrg | 2026-07-23 | ✅ | — | — |
| D6 | 2026-07-10-D6-推送通知接线 | ✅ 已提交 | d8f0156 | ClawOrg | 2026-07-10 | ✅ | — | — |
| D5 | 2026-07-10-D5-CircuitBreaker接线 | ✅ 已提交 | 81d5f75 | ClawOrg | 2026-07-10 | ✅ | — | — |
| D4 | 2026-07-10-D4-Financial字段统一 | ✅ 已提交 | 7d0f1de | ClawOrg | 2026-07-10 | ✅ | — | — |
| D3 | 2026-07-10-D3-THEORY-METRIC_BINDS修复 | ✅ 已提交 | 31fa5a3 | ClawOrg | 2026-07-01 | ✅ | — | — |
| D2 | feat(I2-3a): 已有compute边引用迁移(12处)+D2死引用删除 | ✅ 已提交 | 0bb2f58 | ClawOrg | 2026-07-10 | ✅ | — | — |
| D1 | 2026-06-18-1653-Phase-0-Week-3-6--D1D3D5- | ✅ 已提交 | 40b9681 | ClawOrg | 2026-06-24 | ✅ | — | — |
> 审计（audit-result.json）: P0 0 / P1 0 / P2 0 @ 2026-07-29T12:08:21Z
## 版本历史
> 数据源: VERSION.md + version.log + git tag（D319 后增强）。
| 版本 | 日期/时间 | 变更 | git tag |
|------|------------|------|:---:|
| V4.7.0 | 2026-08-09 | D318+D319+D320 批次（git tag 自动化 + 双机身份 + 仪表盘 git 化） | ✅ |
| V4.6.2 | 2026-08-07 | D317 修复（G12b/brief 解析 CI 红） | ✅ |
| V4.6.1 | 2026-08-05 | D316 修复（incident-loop 跨平台 + version.log 补写） | ✅ |
| V4.6.0 | 2026-08-04 | 控制塔独立化正式首发 | ✅ |
- 4.7.0 2026-08-09T21:29:47+0800: D320 仪表盘 git 化
- 4.7.0 2026-08-09T21:00:01+0800: auto-tag V4.7.0
- 4.7.0 2026-08-09T15:37:47+0800: D318 双机身份+hooks
## CI 状态（gh run）
> degraded: gh 不可用: failed to get runs: HTTP 401: Bad credentials (https://api.github.com/repos/tangbaobao520/SynovaAgent/actions/runs?per_p
| Run | 工作流 | 状态 | 结论 | 关联 D# |
|:---:|------|:---:|:---:|------|
| — | （无 gh run 数据） | — | — | — |
## 同步健康（D323 预留）
- 未推送提交: 0（origin/<branch>..HEAD）
- 工作区变更: 315 个文件（git status --porcelain）
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
> **控制塔 V4.6.0 迭代状态（Claude Code 执行中）**：
>
> | D# | 任务 | 状态 |
> |----|------|------|
> | D311 | M1 多会话协调（session_registry/verify-parallel/staging-guard/wait-manager + pre-push 门禁3-5 改基） | ✅ 9096993 |
> | D312 | M2 hook×git 兼容 + baseline-check + U4（hook-git-guard/detect + 铁律0-3 + 基线工具） | ✅ e9b7e1c |
> | D313 | M3 brief 契约（模板-解析器同源 + check-brief-parseable + M3b 写集验证 + UTF-8 + M5b） | ✅ 624281f（**未推送**） |
> | D314 | M4 基线豁免 + 独立化底座（自身健康五维/fail-open/VERSION.md 首发/学习闭环） | ⚠️ c5d8d15 有条件通过 — **2 个 P1 待 D316 修 + 未推送** |
> | D315/D315b | D313 M5 UTF-8 批量收尾（39 文件）+ 补漏 2 文件 | ✅ 63b6529 + 6a5eb01（**未推送**） |
> | D316 | **V4.6.0 修复**：incident-loop bash 跨平台 + version.log 补写 + 推送 4 提交 | 🔴 P1 | 📝 dev doc 就绪 — 待派发 |
>
> **后续待办**：
>
> | D# | 任务 | 优先级 | 状态 |
> |----|------|:---:|------|
> | D307 | 共享 worktree 防 stash/回滚事故（禁 git stash + worktree 隔离 + 控制塔 git 操作防护） | P0 | ❌ 需写 dev doc（本次回滚再次证实） |
> | D308 | current-brief 独立化 + 共享配置文件（ci.yml/pre-push/task-briefs）纳入写锁/认领强制 | P2 | ❌ 需排期 |
> | D309 | admin-knowledge.ts L1→L4 修复（CI Architecture 转绿） | P0 | ❌ 需写 dev doc |
> | D310 | _extinct 25 个 tsc 错误（tsconfig 排除 extensions/sentinels/_extinct/） | P1 | ❌ 需写 dev doc |
> | **D317** | **G12b/brief 解析 CI 红修复（D316 审计：resolver 回退选中 D286 旧 brief → Iron Laws 红；+ python3 跨平台）** | **P0** | **✅ dev doc 就绪（20260807）— 待派发** |
> | **D318** | **双机身份隔离 + hooks 可移植（configure-machine + 全量 hook 安装 + 自检 + MACBOOK-SETUP）** | **P0** | **✅ dev doc 就绪（20260808）— 待派发** |
> | **D319** | **git tag 自动化（synova-commit 自动 tag + pre-push 一致性 + 历史回填；批次版本编排 V4.7.0 独占）** | **P1** | **✅ dev doc 就绪（20260808）— 待派发** |
> | **D320** | **仪表盘 git 化生成器（gen-task-board.py 渲染 DASHBOARD + override 薄层；批次 V4.7.0 由 D319 编排）** | **P1** | **✅ dev doc 就绪（20260808）— 待派发** |
> | 决策 | npm audit electron CVE（升级 vs 豁免） | P0 | ⏸ 待创始人 |
> | P2-1 | hook-git-detect 测试隔离硬化（EXIT trap 清窗 + 失败输出测试名）——D312 审计发现偶发 | P2 | ❌ 并入 D314/小修 |
> | 恢复 | v4.9 完整版仪表盘恢复（stash@{0} + 本恢复区合并） | — | ⏳ 待并行 session 完成后 |
> | 首发 | 控制塔 V4.6.0 正式首发（VERSION.md 当前 V4.6.0-WIP） | — | ⏳ 待 D314 |
>
> **已完成记录**：U4（pre-commit 分母 /12）✅、U5（pre-push 8→12 组）✅、铁律 0-3 禁 stash ✅、VERSION.md 建立（V4.6.0-WIP）✅、baseline/tsc-errors.json（28 条 seed）✅。
>
> **参照**：[V4.6.0 设计稿 v1.4](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\strategy\SYNOVA-DESIGN-控制塔V4.6-独立化-20260802.md) | [DeepSeek 哲学 note](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\DeepSeek哲学-控制塔借鉴-20260802.md)
>
> 开发文档: [implementation/](../plans/codex/implementation/) | 权威文档: [research/](research/)
> 最后更新: 2026-08-03 | 控制塔 V4.6.0 迭代中 (D311✅ D312✅ D313🔄) | CT 20/20 | 门禁 12 组
> English: [DASHBOARD.md](DASHBOARD.md)

> 📡 **飞书 ↔ Codex 对话桥 (2026-08-07 登记)**: 官方 @larksuite/cli 接入，用户在飞书里直接与 Codex 对话。
> 代码: [scripts/feishu-bridge/](../scripts/feishu-bridge/)（feishu_bridge.py v2.0 + README + .env）。
> 架构: `lark-cli event consume im.message.receive_v1`（长连接，无需公网 URL）→ `codex exec/resume` → `lark-cli im +messages-reply` 回复原消息；每 chat 一 thread 续接，message_id 去重，日志 bridge.log。
> 当前状态: ⚠️ **事件长连接已连通（websocket connected + ready marker 实测通过），但应用权限未开通** — 待创始人在飞书开放平台操作：
> ① 开通 `im:message.p2p_msg:readonly` + `im:message:send_as_bot`；② 订阅事件 `im.message.receive_v1`（长连接模式）；③ 创建版本并发布。完成后在飞书给机器人发消息即可端到端验证。
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
| 哨兵 | 45活跃 | 50 |
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

---
状态: implemented
日期: 2026-09-08
决策: 任务看板 running 列口径校准——running 仅 = claimed + spec_done；impl_done → todo（待 K3 审计）；closed → done；cancelled → failed；Win git 派生 committed 与 impl_done 同口径 → todo（2026-09-08 创始人派单指示，修订 2026-08-23「impl_done→running」旧口径）
理由: 看板「进行中 94」vs task-state 权威活跃 ~13（claimed 11 + spec_done 3）严重虚高——impl_done→running（52 张）+ Win committed→running（25 张）把"代码写完等审计"算成了活跃工作。创始人裁决 running 语义 = 活跃推进中，仅 claimed + spec_done。防假完成原则保留（impl_done ≠ done，K3 审计才算 done，2026-08-23 创始人决策），故 impl_done 落 todo（待审计队列），done 列仅 audited + closed。
---

## 变更清单
1. dsh/plugins/task-board-adapter/lib/sync.js — DEFAULT_STATUS_MAPPING 七态（spec_done/claimed→running；impl_done→todo；audited/closed→done；cancelled/failed→failed）；buildDescription 对 impl_done 附「待 K3 审计」说明；mapWinTaskToBoardTask committed→todo
2. dsh/plugins/task-board-adapter/test/sync.test.js — 断言同步（37 例）
3. dsh/plugins/task-board-adapter/README.md — 映射表同步（M7 防线）

## 关联
- D502（任务看板多源统一）原口径所在任务；本决策为其映射层的口径修订
- 编号体系盲区同案登记：D598（Claude 线 PR #427 已合并）/D599（docs/feat 在途）均无 task-state 登记，alloc 会重发——D601 手工登记跳过（D551/D559 改号先例）
- 部署待创始人点头（重启 dsh web 中断会话，D502 同款待办）

# Task Brief: D544 左栏验收合并

## Q0: 定位
D544 = D538 实现（910 行）的验收合并任务：8 条验收逐条核 + 测试实跑 + CI 确认。
本 brief 同时认领 merge 带入的 D538 实现文件（CI diff 模式 base...HEAD 全量）。

## Q2: 范围
做什么:
- 更新 electron-renderer/（LeftPanel/RightPanel/stores/styles/emoji 修复 DS3）
- 修复 electron-renderer/package.json + package-lock.json（lucide 1.34.0）
- 更新 tests/electron/capability.test.ts
- merge feat/d538-frontend-leftbar 实现进验收分支（D538 全部实现文件随 merge 入 diff，本 brief 认领）
不做什么:
- 不改 src/
- 不改 scripts/audit/

## Q3: 验收
vitest 23/23 + tsc 零新增错 + 8 条验收标注表（chapter2-acceptance.md）+ CI 三 job 绿

## 架构层: L1 桌面端
## Done 标准: CI check-runs 三 job success + 合并 main

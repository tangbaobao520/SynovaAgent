# Task Brief: RUNTIME Phase 5.1 — Electron 自动更新

> 生成: 2026-07-04 | 对标: RUNTIME-EXCELLENCE-IMPL-v1.md §5.1
> 交付: task brief → test → impl → wire → tsc → vitest → pre-commit → push → CI ✅

## Q0: 定位

属于 **纵向（Electron 桌面端）**。

修改文件: `electron-main.ts`。新增依赖: `electron-updater`。

现有模块: electron-main.ts 已有 app lifecycle、tray、IPC、server lifecycle。无自动更新。

## Q1: 调研

决策链: SPEC → 测试(可测试部分) → 实现 → 接线 → 验证
引用: 铁律 0-2, 24, 31, 38

执行约束:
- rule: "autoUpdater 必须在 app.whenReady 后初始化"
  verify: "grep -n 'autoUpdater\|checkForUpdates' electron-main.ts"
- rule: "更新检查周期必须是 24 小时"
  verify: "grep -n '86400000\|24.*hour\|24h' electron-main.ts"
- rule: "重启前必须保存 state"
  verify: "grep -n 'saveState\|restoreState\|activeOrgId' electron-main.ts"

## Q2: 范围

做什么：
1. 安装 `electron-updater` 依赖
2. electron-main.ts:
   - 导入 autoUpdater from electron-updater
   - app.whenReady 后初始化 autoUpdater
   - 启动时检查更新 + 24h 周期 setInterval
   - 下载完成 → tray 通知 "新版本就绪，点击重启"
   - 用户点击 → 3 秒内退出并安装
   - 重启前保存 state (activeOrgId, lastMsgId, unreadCount) 到 JSON 文件
   - 重启后恢复 state
3. 右键菜单增加"检查更新"选项

不做什么：
- ❌ 不修改 server.ts
- ❌ 不修改任何中间件或路由
- ❌ 不使用 as any

## Q3: 验收

入口: 应用启动 → autoUpdater.checkForUpdates()
处理: 24h 周期检查 → 下载 → 通知用户 → 确认重启
结果: 托盘弹出 "新版本就绪" 通知，点击后重启并恢复到重启前状态

## 本任务在哪一层
Electron 桌面层（独立于五层架构）

## Done 标准

## Done 标准
- [ ] electron-updater 依赖已安装
- [ ] autoUpdater 在 app.whenReady 后初始化
- [ ] 更新检查 24h 周期
- [ ] 重启前保存并恢复 state
- [ ] tsc --noEmit 零错误
- [ ] pre-commit 8 组通过
- [ ] CI success

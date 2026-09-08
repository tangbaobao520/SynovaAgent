# D602 red→green 证据（tests/electron/ipc-contract.test.ts + notification-center.test.ts）

> 铁律 0-2: 实现前测试文件先存在且失败（red），实现后转绿（green）。两轮输出均为实跑原文摘录。

## §1 RED（实现前，基线 origin/main@92b094de 代码 + 2 新测试文件）

```
 ❯ tests/electron/ipc-contract.test.ts (5 tests | 5 failed) 14ms
     × 用例 1: preload 暴露面 keys ≡ bridge.ElectronAPI keys（双向相等）
     × 用例 2: bridge keys ⊆ 契约白名单 + 3 死接口全 electron-renderer/src 零命中（铁律 37 回归锁）
     × 用例 3: main.cjs ipcMain 通道集合 ⊇ preload invoke/send 通道集合
     × 用例 4: main.cjs 不含 Tray 旧页 URL（/cockpit 与 /app/admin.html 页面引用清零…）
     × 用例 5: main 含 3 推送通道 send + preload on* 含 off 退订语义 + on 通道有 main 发送方
 ❯ tests/electron/notification-center.test.ts (18 tests | 18 failed) 86ms
     × 用例 6a~6d / 7a~7c / 8 / 8b / 9a~9c / 10a~10c / 11a~11c（全部 18 条）

 Test Files  2 failed (2)
      Tests  23 failed (23)
```

任务书指定两条必红项的失败原文：
- **用例 1 现状必红（preload 2≠接口 10）**:
  `AssertionError: expected [ 'getConfig', 'getServerUrl' ] to deeply equal [ 'getAppVersion', 'getConfig', …(10 项) ]`
  ——现状 preload.cjs 仅 2 方法 vs bridge.ElectronAPI 10 方法（审计 P0-2 物理复现）。
- **用例 3 现状必红（main 零 ipcMain）**:
  `AssertionError: expected [] to deeply equal [ 'app:get-version', 'notify:show', 'tray:update-state' ]`
  ——main.cjs 解析出的 ipcMain 通道集合为空。
- 用例 4 现状必红（Tray 旧页在位）: `expected '…main.cjs…' not to contain '${SERVER_URL}/cockpit'`
- notification-center 全红原因: pushLocalNotification/loadTicketNotifications/actOnTicket/TicketActions 等
  导出不存在（import 失败——D593 right-panel 同款 red 语义）。

## §2 GREEN（实现后）

```
 ✓ tests/electron/ipc-contract.test.ts (5 tests) 21ms
 ✓ tests/electron/notification-center.test.ts (18 tests) 116ms
 Test Files  2 passed (2)
      Tests  23 passed (23)
```

（实现过程中间态: 19/23 → 修 4 处 → 23/23。4 处修正 = ①bridge.ts 头注释含死接口名字面量——DS7 物理清零
grep 连注释命中，改写注释不含死名 ②main.cjs 注释含旧页 URL 字面量——同上 ③测试解析器补 CHANNELS
常量形态（preload 用字面量常量表而非内联字符串，解析器需常量回查）④用例 11b 传参形态（组件单对象参数）。）

## §3 零回归（DS8）

- `tests/electron/use-streaming-conversation.test.ts`: **21/21 全绿，文件零改动**（git diff 空）
- tests/electron/ 全目录: 12 文件 164 passed + 3 skipped（skip 为基线固有）— 0 failed
- 全量 vitest: 失败**文件集**与基线（origin/main@92b094de 独立 worktree 实跑）**diff=空**（9 文件恒等）:
  zero-code-industry / expert-file-loader.integration / check-architecture-gate / analytical-lens /
  e2e-autonomy.integration / graphbridge-wiring / l3-wiring / phase1-diagnosis-wiring / diagnosis-report-persistence
  ——全部为 L2/L3/orchestrator/architecture 域既有失败，与本写集（electron/ + electron-renderer/src/ +
  tests/electron/）**零 import 交集**；同代码复跑观测到基线自身方差（zero-code-industry 2↔3、
  llm-config.test.ts 偶发 1），非本任务引入。
- `npx tsc --noEmit`: 根 28 错误 = 基线 28（样本同为 extensions/sentinels/_extinct TS2307/TS7006）；
  electron-renderer 侧 0 错误。

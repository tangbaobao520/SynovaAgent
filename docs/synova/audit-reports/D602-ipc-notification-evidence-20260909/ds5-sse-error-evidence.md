# D602 DS5 证据——SSE error 可见（真实后端 error 帧 + 渲染层消费链）

> Spec founder 验收: "SSE error 帧接入 NotificationCenter（对话的错误可被用户看到）"
> spec §10 DS5: "对话/诊断流 error 帧 → 通知中心本地通知可见 + electronAPI 在场时系统通知触发（用例 7/11 + 真实后端 error 场景日志/截图）"

## ① 真实后端 error 帧捕获（logs/consult-sse-full-stream.log.txt）

隔离真实后端（同 DS4 实例，无 LLM key）：
```
curl -s -N -X POST http://localhost:18991/api/diagnosis/consult \
  -H "Content-Type: application/json" \
  -d '{"teamId":"d602-org","initiator":{"role":"ga","name":"D602-证据"}}'
```
真实 SSE 流中捕获 **error 帧**（logs/consult-sse-error-frame.txt 原文）：
```
data: {"type":"error","message":"LLM 调用失败: deepseek API Key 未配置（INVALID_CREDENTIAL 语义 — 修正存储值而非补供）"}
```
同流随后还有 `{"type":"complete",...,"degradedModules":["phase2_llm"],...}` 降级帧——后端诚实降级语义（铁律 31）上游真实在场。

## ② 渲染层消费链（error 帧 → 用户可见）

```
SSE error 帧（真实捕获 ①）
  → electron-renderer/src/hooks/useStreaming.ts:244-253 case 'error':
      storeNow.setError(...) + storeNow.setPhase('error')            （既有，中栏错误条）
      + useAppStore.getState().pushLocalNotification({                （D602 新增一行接线）
          title:'对话流错误', body: evt.message…, severity:'warning'})
  → app-store.pushLocalNotification:
      localNotifications 入栈（通知中心"错误通知"段渲染源）
      + window.electronAPI.showNotification(title, body, id)          （系统通知旁路，try/catch warn 不抛）
  → NotificationCenter.tsx 渲染 LocalNotificationItem（标题+正文+✕ 关闭）
```
接线物理证明（生产调用点 grep）：
```
electron-renderer/src/hooks/useStreaming.ts:249:  useAppStore.getState().pushLocalNotification({
electron-renderer/src/App.tsx:95:                 useAppStore.getState().pushLocalNotification({   ← main P0 push 订阅
electron-renderer/src/stores/app-store.ts:234:    if (api?.showNotification) api.showNotification(item.title, item.body, item.id);
```

## ③ 测试锁定（tests/electron/notification-center.test.ts，全绿）

| 用例 | 锁定内容 |
|---|---|
| 7a | electronAPI.showNotification stub → 被调用且 title/body/id 透传 |
| 7b | electronAPI 缺失 → 跳过系统通知不抛（降级，铁律 24） |
| 7c | 系统通知抛异常 → warn 降级，本地通知仍入栈（通知中心可见，铁律 24/31） |
| 11b | LocalNotificationItem 静态渲染：标题"对话流错误"+正文+关闭按钮 data-local-dismiss |
| 11c | NotifErrorBanner："通知获取失败：{msg}"（消灭"暂无通知"假空态——审计 §3.5.1 "error 未渲染"缺陷修复） |

## 环境边界（如实声明）

- headless 证据环境无 Electron 壳运行 → OS 级系统通知弹窗无法物理截图；该半程由 ②的 main.cjs 'notify:show' handler（ipc-contract 用例 3 通道覆盖）+ ③用例 7a stub 调用断言静态锁定。OS 弹窗留桌面端人工验收（`npm run dev` + 触发一次无 key 诊断即可复现）。
- error 帧消息文本"LLM 调用失败…"为真实后端真实降级输出，非构造 mock。

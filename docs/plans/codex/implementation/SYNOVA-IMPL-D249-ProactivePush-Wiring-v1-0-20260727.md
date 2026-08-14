<!-- SYNOVA-IMPL-D249 v2.0 | 2026-07-27 | M1 Push通道接线 -->
# SynovaAgent -- D249 ProactivePush 通道接线 v2.0
> v1.0 错误: 后端 Node.js 进程不能直接调 Electron Notification API
> v2.0 修正: ProactivePush → emitSignal() → cockpit/data → Electron main.cjs checkP0Alerts 轮询 → Notification

## 代码验证
- synova-agent.ts L90: `new ProactivePush([])` — 空通道 ❌
- proactive-push.ts: `onP0Finding()` 已有 P0 检测 + Action 创建 + 重试逻辑 ✅
- electron/main.cjs L116-130: `checkP0Alerts()` 已每5分钟轮询 `/api/cockpit/data` + `new Notification()` ✅
- emitSignal 已存在: `scripts/control-tower/emit-signal.py` ✅
- 路径: ProactivePush → emitSignal → .codex/signals/sentinel.json → generate-dashboard.py → cockpit/data → Electron Notification

## Q0-Q4
Q0: ProactivePush 空通道。Electron 已有通知轮询但 ProactivePush 不产出信号——链路断裂在信号产出端。
Q2: 做——ProactivePush.onP0Finding() 中追加 emitSignal('sentinel', 'red', ...) 调用。不做——创建 PushChannel 实例(不需要, 信号文件就是通道)。
Q3: SentinelRunner → P0 finding → proactivePush.onP0Finding → emitSignal → .codex/signals/sentinel.json → Electron 5分钟轮询 → 桌面通知
Q4: L1×2 测试 (Mock emitSignal + P0 finding 触发信号)

## 改动 (仅 proactive-push.ts +10行)

### src/agent/proactive-push.ts — onP0Finding() 追加 emitSignal
在 onP0Finding() 方法的 pushToAllChannels 前追加:
```typescript
// D249: 产出控制塔信号 — Electron main.cjs 轮询 cockpit/data 触发桌面通知
try {
  const { execSync } = require('child_process');
  execSync(`python scripts/control-tower/emit-signal.py sentinel red "${finding.title}"`, { timeout: 5000 });
} catch (err) {
  log.warn({ err }, 'emitSignal 失败 — 降级');
}
```

Signal 产出后: generate-dashboard.py 读取 → cockpit/data 返回 → Electron checkP0Alerts 轮询 → Notification.show()

## 测试 (L1×2)
| # | 测试 | 验证 |
|---|------|------|
| 1 | onP0Finding P0→emitSignal 被调用 | L1 mock |
| 2 | P1/P2 finding→不调用 emitSignal | L1 |

## 完成标准
P0 finding → 信号文件产出。Electron 轮询可触发桌面通知。2 tests。tsc零新增。as any=0。

# Reference Map

| 符号 | 文件 | 行 | 内容 |
|------|------|-----|------|

## proactive-push\|ProactivePush\|PushChannel
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/proactive-push.ts | `2: * src/agent/proactive-push.ts — P0 哨兵告警主动推送服务` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/proactive-push.ts | `23:const log = createLogger('agent/proactive-push');` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/proactive-push.ts | `42:export interface PushChannel {` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/proactive-push.ts | `98:// ═══ ProactivePush ═══` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/proactive-push.ts | `100:export class ProactivePush {` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/proactive-push.ts | `101:  private channels: PushChannel[];` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/proactive-push.ts | `108:    channels: PushChannel[],` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/proactive-push.ts | `191:          actorId: 'system:proactive-push',` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/proactive-push.ts | `210:  async pushToChannel(channel: PushChannel, finding: SentinelFinding, message?: PushMessage): Promise<PushResult> {` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/synova-agent.ts | `24:import { ProactivePush } from './proactive-push';` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/synova-agent.ts | `89:    // D21-FIX: 创建 ProactivePush 实例 + 注入 ActionStore + 接线到 SentinelRunner` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/synova-agent.ts | `90:    const proactivePush = new ProactivePush([]);  // 空通道 — 推送后续接线` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/synova-agent.ts | `92:    this.sentinelRunner.setProactivePush(proactivePush);` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/growth/action-store.ts | `19:import type { SentinelFinding } from '../agent/proactive-push';` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/growth/action-types.ts | `8:import type { SentinelFinding } from '../agent/proactive-push';` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/growth/action-types.ts | `71:// ═══ ActionStore 最小接口（供 ProactivePush 使用） ═══` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/sentinel/runner.ts | `20:import { ProactivePush } from "../agent/proactive-push";` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/sentinel/runner.ts | `133:  private proactivePush: ProactivePush \| null = null;` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/sentinel/runner.ts | `140:  /** 注入 ProactivePush 实例 (D17) */` |
| `proactive-push\|ProactivePush\|PushChannel` | D | /novis-backup-20260526/Novis/synova-agent/src/sentinel/runner.ts | `141:  setProactivePush(push: ProactivePush): void {` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/interactive-card.test.ts | `125:describe('D18 — ProactivePush 集成', () => {` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/interactive-card.test.ts | `127:    // 验证 proactive-push.ts 导入了 InteractiveCardHandler` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/interactive-card.test.ts | `128:    const { ProactivePush } = await import('../../src/agent/proactive-push');` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/interactive-card.test.ts | `129:    const push = new ProactivePush([]);` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/proactive-push.test.ts | `2: * tests/agent/proactive-push.test.ts — D17 ProactivePush 测试` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/proactive-push.test.ts | `7:import { ProactivePush } from '../../src/agent/proactive-push';` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/proactive-push.test.ts | `8:import type { PushChannel, SentinelFinding } from '../../src/agent/proactive-push';` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/proactive-push.test.ts | `22:describe('ProactivePush', () => {` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/proactive-push.test.ts | `25:      const p = new ProactivePush([{ id: 'test', type: 'feishu', enabled: true, send: async () => 'msg-1' }], undefined, FAST_RETRY);` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/proactive-push.test.ts | `31:      const p = new ProactivePush([{ id: 'test', type: 'feishu', enabled: true, send: async () => 'msg-1' }], undefined, FAST_RETRY);` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/proactive-push.test.ts | `37:      const p = new ProactivePush([{ id: 'test', type: 'feishu', enabled: true, send: async () => 'msg-1' }], undefined, FAST_RETRY);` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/proactive-push.test.ts | `45:      const p = new ProactivePush([{ id: 'ch1', type: 'feishu', enabled: true, send: async () => 'mid-1' }], undefined, FAST_RETRY);` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/proactive-push.test.ts | `55:      const p = new ProactivePush([` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/proactive-push.test.ts | `66:      const p = new ProactivePush([` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/proactive-push.test.ts | `76:      const p = new ProactivePush([{` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/proactive-push.test.ts | `90:      const channel: PushChannel = {` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/proactive-push.test.ts | `98:      const p = new ProactivePush([channel], undefined, FAST_RETRY);` |
| `proactive-push\|ProactivePush\|PushChannel` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/growth/action-store.test.ts | `8:import type { SentinelFinding } from '../../src/agent/proactive-push';` |

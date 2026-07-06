/**
 * l1/im-channel.ts — IM 交互通道统一接口 (Task 13)
 *
 * 定义 sendMessage / sendCard / handleWebhook 统一接口。
 * 各平台 (飞书/企微/Slack/Teams) 实现此接口后注册到 IMRegistry。
 * 用户可在对话中切换 IM 通道。
 */
import { createLogger } from '@synova/logger';

const log = createLogger('l1/im-channel');

// ═══ Unified IM Interface ═══

export interface IMMessage {
  text: string;
  markdown?: string;
}

export interface IMCard {
  title: string;
  content: string;
  actions?: Array<{ label: string; value: string; type: 'primary' | 'default' | 'danger' }>;
}

export interface IMChannel {
  readonly platform: string;
  readonly name: string;

  /** 发送纯文本消息 */
  sendMessage(target: string, msg: IMMessage): Promise<{ ok: boolean; error?: string }>;

  /** 发送富文本卡片 */
  sendCard(target: string, card: IMCard): Promise<{ ok: boolean; error?: string }>;

  /** Webhook 接收回调 */
  handleWebhook?(payload: unknown): Promise<{ reply?: IMMessage; card?: IMCard }>;

  /** 健康检查 */
  healthCheck(): Promise<{ healthy: boolean; error?: string }>;
}

// ═══ IMRegistry ═══

export class IMRegistry {
  private channels = new Map<string, IMChannel>();
  private activeChannel: string | null = null;

  register(channel: IMChannel): void {
    this.channels.set(channel.platform, channel);
    log.info({ platform: channel.platform }, 'IM 通道已注册');
  }

  get(platform: string): IMChannel | undefined {
    return this.channels.get(platform);
  }

  list(): IMChannel[] {
    return [...this.channels.values()];
  }

  /** 切换活跃通道 */
  switchTo(platform: string): boolean {
    if (this.channels.has(platform)) {
      this.activeChannel = platform;
      return true;
    }
    return false;
  }

  getActive(): IMChannel | undefined {
    if (!this.activeChannel) return undefined;
    return this.channels.get(this.activeChannel);
  }
}

// ═══ Feishu Webhook Channel (P0 实现) ═══

export function createFeishuWebhookChannel(webhookUrl: string): IMChannel {
  return {
    platform: 'feishu',
    name: '飞书 Webhook',

    async sendMessage(target: string, msg: IMMessage) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msg_type: 'text',
            content: { text: `${msg.text}${msg.markdown ? '\n' + msg.markdown : ''}` },
          }),
        });
        return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },

    async sendCard(target: string, card: IMCard) {
      try {
        const elements: unknown[] = [{ tag: 'div', text: { tag: 'plain_text', content: card.content } }];
        if (card.actions) {
          elements.push({
            tag: 'action',
            actions: card.actions.map(a => ({
              tag: 'button',
              text: { tag: 'plain_text', content: a.label },
              type: a.type === 'danger' ? 'danger' : a.type === 'primary' ? 'primary' : 'default',
              value: a.value,
            })),
          });
        }
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msg_type: 'interactive',
            card: { header: { title: { tag: 'plain_text', content: card.title } }, elements },
          }),
        });
        return { ok: res.ok };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },

    async healthCheck() {
      if (!webhookUrl) return { healthy: false, error: '飞书 Webhook URL 未配置' };
      return { healthy: true };
    },
  };
}

// ═══ Singleton ═══

let _instance: IMRegistry | null = null;
export function getIMRegistry(inject?: IMRegistry): IMRegistry {
  if (inject) { _instance = inject; return inject; }
  if (!_instance) _instance = new IMRegistry();
  return _instance;
}

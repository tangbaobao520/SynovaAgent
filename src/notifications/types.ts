/**
 * src/notifications/types.ts — 通知渠道类型定义
 *
 * v3.6 Batch 1 — NotificationAdapter 接口 + 事件驱动解耦
 */

/** 通知优先级 */
export type NotificationPriority = 'P0' | 'P1' | 'P2';

/** 通知目标系统 */
/** 文件驱动 — 不硬编码枚举值。新渠道通过 manifest.json 注册。 */
export type NotificationTargetSystem = string;

/** 通知对象 */
export interface Notification {
  /** 唯一标识 */
  id: string;
  /** 组织 ID */
  orgId: string;
  /** 通知标题 */
  title: string;
  /** 通知详情 */
  description: string;
  /** 优先级 */
  priority: NotificationPriority;
  /** 目标系统（jira/linear/email/slack 等） */
  targetSystem: NotificationTargetSystem;
  /** 负责人 */
  assignee?: string;
  /** 关联的诊断报告 ID */
  reportId?: string;
  /** 额外上下文 */
  metadata?: Record<string, unknown>;
  /** 创建时间 */
  createdAt: string;
}

/** 通知发送结果 */
export interface NotificationResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

/**
 * 通知适配器接口。
 * 每个通知渠道（Jira、Linear、Email、Slack 等）实现此接口。
 * 通过 manifest.json + ExtensionLoader 自动发现和注册。
 */
export interface NotificationAdapter {
  /** 适配器名称（对应 manifest 中的 channel 字段） */
  readonly channel: string;

  /**
   * 判断此适配器是否应处理给定的通知。
   * 默认：匹配 targetSystem === channel。可覆盖实现自定义路由逻辑。
   */
  shouldHandle(notification: Notification): boolean;

  /**
   * 发送通知。返回发送结果。
   */
  send(notification: Notification): Promise<NotificationResult>;
}

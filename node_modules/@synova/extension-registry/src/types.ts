/**
 * extensions/types.ts — Extension Registry 类型定义 (Slice 4.2)
 *
 * 运行时扩展注册中心的核心类型。
 * 对标 MASTER-REPORT: "SOG本体/专家Agent/诊断模块/工具/技能全部可运行时扩展"
 *
 * @frozen 2026-06-03 — 拆包前冻结。ExtensionType/ExtensionState 枚举只增不删。
 * @since 0.1.0
 */
 */

/** Extension type — what kind of capability is being extended */
export type ExtensionType =
  | 'sog-node'
  | 'sog-edge'
  | 'expert-agent'
  | 'diagnostic-module'
  | 'tool'
  | 'skill';

/** Extension lifecycle states */
export type ExtensionState =
  | 'registered'
  | 'loaded'
  | 'validated'
  | 'active'
  | 'deactivated'
  | 'error';

/** Extension manifest — self-describing metadata */
export interface ExtensionManifest {
  /** Unique name (e.g. 'sog-financial-node', 'feishu-connector') */
  name: string;

  /** Semantic version */
  version: string;

  /** Extension type */
  type: ExtensionType;

  /** Human-readable description */
  description: string;

  /** Author / source */
  author?: string;

  /** Dependencies on other extensions (by name) */
  dependencies?: string[];

  /** Custom metadata blob */
  metadata?: Record<string, unknown>;
}

/** Extension lifecycle event */
export interface ExtensionLifecycleEvent {
  extensionName: string;
  from: ExtensionState;
  to: ExtensionState;
  timestamp: string;
  error?: string;
}

/** Resolved extension — manifest + implementation */
export interface ResolvedExtension<T = unknown> {
  manifest: ExtensionManifest;
  implementation: T;
  state: ExtensionState;
  lifecycle: ExtensionLifecycleEvent[];
  registeredAt: string;
  activatedAt?: string;
}

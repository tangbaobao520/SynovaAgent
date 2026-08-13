import { createLogger } from '@synova/logger';
const log = createLogger('src.env.env-snapshot-schema');
/**
 * src/env/env-snapshot-schema.ts — 环境快照 TypeScript 类型定义 (D217)
 *
 * 匹配 D211 env_validator.py snapshot 命令生成的 .codex/env-snapshot.json 结构。
 * 用于 IDE 类型提示和运行时类型校验。
 *
 * 契约:
 *   @input  — .codex/env-snapshot.json
 *   @output — EnvironmentSnapshot 接口
 *   @degraded — JSON.parse 失败 → unknown + 类型守卫
 */

/** 系统信息 */
export interface SystemInfo {
  os: string;
  release: string;
  encoding: string;
}

/** Node.js 环境 */
export interface NodeInfo {
  version: string;
  npm_version: string;
}

/** Python 环境 */
export interface PythonInfo {
  version: string;
  executable: string;
}

/** Git 环境 */
export interface GitInfo {
  version: string;
}

/** TypeScript 环境 */
export interface TypeScriptInfo {
  version: string;
}

/** Git hooks 状态 */
export interface HooksInfo {
  pre_commit: boolean;
  post_commit: boolean;
}

/** 环境快照 (对应 .codex/env-snapshot.json) */
export interface EnvironmentSnapshot {
  version: string;
  created_at: string;
  system: SystemInfo;
  node: NodeInfo;
  python: PythonInfo;
  git: GitInfo;
  typescript: TypeScriptInfo;
  hooks: HooksInfo;
}

/**
 * 安全加载环境快照。
 * JSON.parse 失败时返回 null，调用方处理降级。
 */
export function loadSnapshot(path: string): EnvironmentSnapshot | null {
  try {
    const fs = require("fs");
    const raw = fs.readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as EnvironmentSnapshot;
    // 基本结构验证
    if (!parsed.version || !parsed.system || !parsed.node || !parsed.hooks) {
      return null;
    }
    return parsed;
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "环境快照模块加载");
    return null;
  }
}

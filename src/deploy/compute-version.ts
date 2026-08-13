/**
 * src/deploy/compute-version.ts — Compute contract 版本追踪
 *
 * D48: 第9份权威文档 第二章。追踪 compute 函数的 contractId 版本，
 * 用于升级前验证 compute contract 兼容性。
 *
 * 接口:
 *   getComputeVersion(contracts): ComputeVersionResult
 *     — 计算当前版本号和按 contractId 的版本映射
 *   compareComputeCompatibility(old, new): ComputeCompatibilityResult
 *     — 比较两版本是否有破坏性变更
 */
import { createLogger } from '@synova/logger';

const log = createLogger('deploy/compute-version');

/** Compute contract 定义 */
export interface ComputeContract {
  /** 唯一标识, 如 "compute/margin/gross-profit" */
  contractId: string;
  /** compute 函数名 */
  name: string;
  /** 语义版本号 (递增整数) */
  version: number;
  /** 最后一次变更描述 */
  lastMigration?: string;
}

/** 版本查询结果 */
export interface ComputeVersionResult {
  /** 所有 contract 中的最高版本号 */
  latestVersion: number;
  /** contractId → 版本号 映射 */
  contracts: Record<string, number>;
  /** 总 contract 数 */
  totalContracts: number;
}

/** 兼容性检查结果 */
export interface ComputeCompatibilityResult {
  compatible: boolean;
  /** 新增的 contract (新版本有, 旧版本无) */
  added: string[];
  /** 有版本变化的 contract */
  changed: string[];
  /** 被移除的 contract (旧版本有, 新版本无) */
  removed: string[];
  blockedReason?: string;
}

/**
 * 计算 compute 版本信息。
 * 遍历所有 contract, 找出最高版本号和每个 contractId 的版本。
 *
 * @param contracts — ComputeContract 列表
 * @returns ComputeVersionResult
 */
export function getComputeVersion(contracts: ComputeContract[]): ComputeVersionResult {
  let latestVersion = 0;
  const contractMap: Record<string, number> = {};

  for (const c of contracts) {
    contractMap[c.contractId] = c.version;
    if (c.version > latestVersion) {
      latestVersion = c.version;
    }
  }

  log.debug({ totalContracts: contracts.length, latestVersion }, 'Compute 版本信息');
  return {
    latestVersion,
    contracts: contractMap,
    totalContracts: contracts.length,
  };
}

/**
 * 比较新旧 compute contract 列表的兼容性。
 * 新增 contract 允许。变更 contract (版本号不同) 视为兼容变更。
 * 移除 contract 视为破坏性变更。
 *
 * @param oldContracts — 旧版本 contract 列表
 * @param newContracts — 新版本 contract 列表
 * @returns ComputeCompatibilityResult
 */
export function compareComputeCompatibility(
  oldContracts: ComputeContract[],
  newContracts: ComputeContract[],
): ComputeCompatibilityResult {
  const oldMap = new Map(oldContracts.map((c) => [c.contractId, c]));
  const newMap = new Map(newContracts.map((c) => [c.contractId, c]));

  const oldIds = new Set(oldMap.keys());
  const newIds = new Set(newMap.keys());

  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  // 新增的 contract
  for (const id of newIds) {
    if (!oldIds.has(id)) {
      added.push(id);
    } else if (newMap.get(id)!.version !== oldMap.get(id)!.version) {
      changed.push(id);
    }
  }

  // 被移除的 contract
  for (const id of oldIds) {
    if (!newIds.has(id)) {
      removed.push(id);
    }
  }

  if (removed.length > 0) {
    const reason = `检测到 ${removed.length} 个 compute contract 被移除: ${removed.join(', ')}。`;
    log.warn({ removed, reason }, 'Compute contract 不兼容');
    return { compatible: false, added, changed, removed, blockedReason: reason };
  }

  log.info({ added: added.length, changed: changed.length, removed: 0 }, 'Compute contract 兼容');
  return { compatible: true, added, changed, removed };
}

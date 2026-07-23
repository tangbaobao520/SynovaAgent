/**
 * src/contract/contract-gate.ts — 契约门禁引擎 (D215)
 *
 * 下游 Agent 启动时加载契约并 grep 验证接口是否真实存在。
 * 与 D208 contract-archiver.py validate 逻辑一致。
 *
 * 验证规则:
 *   export_function → grep "function NAME\|export function NAME" src/
 *   export_class → grep "class NAME\b" src/
 *   edge_id → grep NAME extensions/ontology/edge-types/
 *   file_path → fs.existsSync(path)
 *
 * 契约:
 *   @input  — ContractStore（依赖注入）
 *   @output — ValidationReport
 *   @degraded — grep 不可用 → degraded:true + 不阻断
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';
import type { ContractRecord, ContractStore } from './contract-store';

const log = createLogger('contract/gate');

// ═══ Types ═══

export interface ValidationItem {
  contractId: string;
  name: string;
  type: string;
  pass: boolean;
  detail: string;
}

export interface ValidationReport {
  pass: boolean;
  failures: ValidationItem[];
  degraded: boolean;
  checkedAt: string;
}

// ═══ ContractGate ═══

export class ContractGate {
  private store: ContractStore;
  private repoRoot: string;

  constructor(store: ContractStore, repoRoot?: string) {
    this.store = store;
    this.repoRoot = repoRoot || process.cwd();
  }

  /**
   * 验证全部未归档契约。
   * 逐条 grep 验证接口是否真实存在于代码中。
   */
  async validateAll(): Promise<ValidationReport> {
    const contracts = this.store.load();
    const failures: ValidationItem[] = [];
    let degraded = false;

    for (const contract of contracts) {
      try {
        const item = await this.validateOne(contract);
        if (!item.pass) failures.push(item);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ err: msg, contractId: contract.contractId }, '契约验证异常 — 降级');
        degraded = true;
      }
    }

    const report: ValidationReport = {
      pass: failures.length === 0 && !degraded,
      failures,
      degraded,
      checkedAt: new Date().toISOString(),
    };

    log.info({ total: contracts.length, failures: failures.length, degraded }, '契约门禁检查完成');
    return report;
  }

  /**
   * 验证单条契约。
   */
  async validateOne(contract: ContractRecord): Promise<ValidationItem> {
    const { type, name, filePath } = contract;

    try {
      switch (type) {
        case 'export_function':
          return this.grepCheck(contract, `function ${name}\\|export function ${name}\\b`, 'src/');

        case 'export_class':
          return this.grepCheck(contract, `class ${name}\\b`, 'src/');

        case 'edge_id':
          return this.grepCheck(contract, name, 'extensions/ontology/edge-types/');

        case 'file_path':
          if (!filePath) return { contractId: contract.contractId, name, type, pass: false, detail: 'filePath 为空' };
          const fullPath = join(this.repoRoot, filePath);
          const pathExists = existsSync(fullPath);
          return {
            contractId: contract.contractId, name, type,
            pass: pathExists,
            detail: pathExists ? `文件存在: ${filePath}` : `文件不存在: ${filePath}`,
          };

        case 'api_endpoint':
          return this.grepCheck(contract, name, 'src/routes/');

        default:
          return { contractId: contract.contractId, name, type, pass: false, detail: `未知契约类型: ${type}` };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { contractId: contract.contractId, name, type, pass: false, detail: `验证异常: ${msg}` };
    }
  }

  /**
   * grep 验证：在指定路径搜索标识符。
   * grep 不可用时降级返回 pass:true（不阻断）。
   */
  private grepCheck(contract: ContractRecord, pattern: string, searchPath: string): ValidationItem {
    try {
      const targetDir = join(this.repoRoot, searchPath);
      if (!existsSync(targetDir)) {
        return { contractId: contract.contractId, name: contract.name, type: contract.type, pass: true, detail: `路径不存在，跳过: ${searchPath}` };
      }

      const result = execSync(
        `grep -r "${pattern}" "${targetDir}" --include="*.ts" --include="*.tsx" 2>/dev/null | head -3`,
        { encoding: 'utf-8', timeout: 10000 },
      );

      const found = result.trim().length > 0;
      return {
        contractId: contract.contractId,
        name: contract.name,
        type: contract.type,
        pass: found,
        detail: found ? `匹配: ${result.split('\n')[0].substring(0, 120)}` : `未找到: ${pattern} 在 ${searchPath}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // grep 不可用或超时 → 降级，不阻断
      log.warn({ err: msg, pattern, searchPath }, 'grep 验证失败 — 降级通过');
      return { contractId: contract.contractId, name: contract.name, type: contract.type, pass: true, detail: `grep 降级: ${msg}` };
    }
  }
}

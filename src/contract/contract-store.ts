/**
 * src/contract/contract-store.ts — 契约存档器 (D215)
 *
 * 持久化契约到 .codex/contracts/ 目录。
 * 对标 D208 contract-archiver.py 的 save/load/archive 功能。
 *
 * 存储路径: .codex/contracts/CONTRACT-{taskId}-{date}-{seq}.json
 * 归档路径: .codex/contracts/archive/CONTRACT-{taskId}-{date}-{seq}.json
 *
 * 契约:
 *   @input  — ContractRecord[]
 *   @output — 文件路径 / ContractRecord[]
 *   @degraded — 目录不可写 → log.warn + throw; JSON损坏 → log.error + 跳过
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';

const log = createLogger('contract/store');

// ═══ Types ═══

export interface ContractRecord {
  contractId: string;
  type: 'export_function' | 'export_class' | 'edge_id' | 'file_path' | 'api_endpoint';
  name: string;
  signature: string;
  filePath?: string;
  edgeIds?: string[];
  callerFile?: string;
  confidence: number;
  sourceLine: number;
  extractedAt: string;
}

const CONTRACTS_DIR = join(process.cwd(), '.codex', 'contracts');
const ARCHIVE_DIR = join(CONTRACTS_DIR, 'archive');

// ═══ ContractStore ═══

export class ContractStore {
  private baseDir: string;
  private archiveDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || CONTRACTS_DIR;
    this.archiveDir = join(this.baseDir, 'archive');
    this.ensureDir(this.baseDir);
  }

  private ensureDir(dir: string): void {
    try { mkdirSync(dir, { recursive: true }); } catch {
      log.warn({ dir }, '契约目录创建失败 — 降级');
    }
  }

  /**
   * 保存契约到 .codex/contracts/。
   * 生成文件名: CONTRACT-{taskId}-{YYYYMMDD}-{seq}.json
   *
   * @returns 写入的文件路径
   */
  save(contracts: ContractRecord[], taskId: string): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(Date.now() % 1000).padStart(3, '0');
    const fileName = `CONTRACT-${taskId}-${date}-${seq}.json`;
    const filePath = join(this.baseDir, fileName);

    try {
      writeFileSync(filePath, JSON.stringify({ taskId, contracts, savedAt: now.toISOString() }, null, 2), 'utf-8');
      log.info({ filePath, count: contracts.length }, '契约已保存');
      return filePath;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, filePath }, '契约保存失败 — 降级');
      throw new Error(`契约保存失败: ${msg}`);
    }
  }

  /**
   * 加载契约。
   * taskId 指定 → 加载该任务最新契约文件。
   * taskId 未指定 → 加载全部未归档契约。
   */
  load(taskId?: string): ContractRecord[] {
    try {
      if (!existsSync(this.baseDir)) return [];

      const files = readdirSync(this.baseDir)
        .filter(f => f.startsWith('CONTRACT-') && f.endsWith('.json'))
        .filter(f => !taskId || f.includes(`CONTRACT-${taskId}-`))
        .sort()
        .reverse();

      const allContracts: ContractRecord[] = [];
      for (const file of files) {
        try {
          const raw = readFileSync(join(this.baseDir, file), 'utf-8');
          const data = JSON.parse(raw);
          const contracts: ContractRecord[] = data.contracts || [];
          allContracts.push(...contracts);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error({ err: msg, file }, '契约文件解析失败 — 跳过');
        }
      }
      return allContracts;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, '契约加载失败 — 降级');
      return [];
    }
  }

  /**
   * 归档契约：移动到 archive/ 子目录。
   */
  archive(contractId: string): void {
    this.ensureDir(this.archiveDir);
    try {
      const files = readdirSync(this.baseDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = readFileSync(join(this.baseDir, file), 'utf-8');
          const data = JSON.parse(raw);
          const contracts: ContractRecord[] = data.contracts || [];
          if (contracts.some(c => c.contractId === contractId)) {
            const src = join(this.baseDir, file);
            const dest = join(this.archiveDir, file);
            renameSync(src, dest);
            log.info({ contractId, file }, '契约已归档');
            return;
          }
        } catch { continue; }
      }
      log.warn({ contractId }, '未找到匹配的契约文件');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, contractId }, '契约归档失败 — 降级');
    }
  }

  /**
   * 列出所有未归档的契约文件名。
   */
  list(): string[] {
    try {
      if (!existsSync(this.baseDir)) return [];
      return readdirSync(this.baseDir)
        .filter(f => f.startsWith('CONTRACT-') && f.endsWith('.json'))
        .sort();
    } catch {
      return [];
    }
  }
}

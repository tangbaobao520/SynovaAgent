/**
 * sentinel-runner.ts — 哨兵按需运行器 (L3)
 *
 * 编排者在 Phase 2 调用此模块，获取哨兵发现的客观数据。
 * 与 registry.ts 分工: registry 管生命周期(cron调度), runner 管按需执行(诊断时调用)。
 *
 * 哨兵来源:
 *   1. 内置哨兵 (key-person-risk 等)
 *   2. extensions/sentinels/* /manifest.json (文件驱动, 另一个 Claude 建)
 *   3. src/sentinel/adapters/*.ts (过渡期兼容)
 *
 * Iron law #24: catch + log + degraded.
 * Iron law #38: zero unsafe type casts.
 */
import { createLogger } from '../logger';
import type { SentinelFinding } from './types';

const log = createLogger('sentinel/runner');

// ═══ 类型 ═══

/** GraphStore 查询接口 — runner 只需要读 */
interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

/** 单个哨兵实现接口 */
interface SentinelImpl {
  id: string;
  dimension: string;
  expert: string;
  check(teamId: string, store: GraphStoreReader): Promise<SentinelFinding[]> | SentinelFinding[];
}

/** runner 配置 */
interface RunnerConfig {
  /** 超时 (ms), 单个哨兵超过此时间则降级 */
  timeoutMs: number;
}

const DEFAULT_CONFIG: RunnerConfig = { timeoutMs: 30000 };

// ═══ Runner ═══

export class SentinelRunner {
  private sentinels: SentinelImpl[] = [];
  private config: RunnerConfig;

  constructor(config?: Partial<RunnerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registerBuiltins();
  }

  /** 列出全部已注册哨兵 */
  listAll(): SentinelImpl[] {
    return [...this.sentinels];
  }

  /** 注册哨兵 (供外部扩展, 如 ExtensionLoader 扫描后注册) */
  register(s: SentinelImpl): void {
    if (!this.sentinels.find(e => e.id === s.id)) {
      this.sentinels.push(s);
    }
  }

  /** 为团队运行全部哨兵, 返回 Finding[] */
  async runForTeam(teamId: string, store: GraphStoreReader): Promise<SentinelFinding[]> {
    const all: SentinelFinding[] = [];
    for (const s of this.sentinels) {
      try {
        const findings = await Promise.race([
          Promise.resolve(s.check(teamId, store)),
          new Promise<SentinelFinding[]>((_, reject) =>
            setTimeout(() => reject(new Error(`timeout ${s.id}`)), this.config.timeoutMs)
          ),
        ]);
        all.push(...findings);
      } catch (err: unknown) {
        log.warn({ err, id: s.id, teamId }, '哨兵执行失败 — degraded');
      }
    }
    if (all.length > 0) {
      log.info({ teamId, findings: all.length, sentinels: this.sentinels.length }, '哨兵运行完成');
    }
    return all;
  }

  // ═══ 内置哨兵 ═══

  private registerBuiltins(): void {
    // KeyPersonRisk
    this.register({
      id: 'key-person-risk',
      dimension: 'D3',
      expert: 'org',
      async check(teamId, store) {
        const { checkKeyPersonRisk } = await import('../l3/key-person-risk');
        return checkKeyPersonRisk(store, teamId).findings;
      },
    });
  }
}

// ═══ LLM 格式化 ═══

/** 将 Finding[] 格式化为 LLM prompt 文本 */
export function formatFindingsForLLM(findings: SentinelFinding[]): string {
  if (findings.length === 0) return '';

  const crit = findings.filter(f => f.severity === 'critical');
  const warn = findings.filter(f => f.severity === 'warning');

  const lines: string[] = ['## 哨兵监测数据 (客观事实)\n'];
  if (crit.length > 0) {
    lines.push(`🔴 严重 (${crit.length} 条):`);
    for (const f of crit) lines.push(`- ${f.title}: ${f.description}`);
  }
  if (warn.length > 0) {
    lines.push(`\n🟡 警告 (${warn.length} 条):`);
    for (const f of warn) lines.push(`- ${f.title}: ${f.description}`);
  }
  lines.push(`\n共 ${findings.length} 条发现。请基于以上客观数据生成诊断假设。`);
  return lines.join('\n');
}

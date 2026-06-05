/**
 * orchestrator/module-runner.ts — 并行模块调度器 (Iter 5)
 *
 * Phase 1: 并行执行 engine-core 29 诊断模块 (computeModule).
 * 每个模块独立超时，失败模块 → degradedModules[] + 其他继续。
 */
import { createLogger } from '../logger';

const log = createLogger('orchestrator/module-runner');

// ═══ Types ═══

export interface ModuleTask {
  name: string;
  priority?: string;
  compute(): Promise<ModuleResult>;
}

export interface ModuleResult {
  moduleId: string;
  findings?: Array<{ type: string; summary: string }>;
  error?: string;
  durationMs?: number;
}

export interface ModuleRunResults {
  results: ModuleResult[];
  degradedModules: string[];
  totalDurationMs: number;
  completedCount: number;
  failedCount: number;
}

export interface ModuleRunnerConfig {
  maxParallel: number;
  perModuleTimeoutMs: number;
  priorityGroups?: string[][];
  retryFailedModules?: boolean;
  /** Phase 1b: after all modules complete, call with results for GraphStore sync */
  afterRun?: (results: ModuleRunResults) => Promise<void>;
}

// ═══ ModuleRunner ═══

export class ModuleRunner {
  private config: ModuleRunnerConfig;

  constructor(config: Partial<ModuleRunnerConfig> = {}) {
    this.config = {
      maxParallel: config.maxParallel ?? 10,
      perModuleTimeoutMs: config.perModuleTimeoutMs ?? 30_000,
      priorityGroups: config.priorityGroups,
      retryFailedModules: config.retryFailedModules ?? false,
      afterRun: config.afterRun,
    };
  }

  /**
   * Run all modules in parallel with timeout and degradation.
   * Failed modules are recorded in degradedModules[] — others continue.
   */
  async runAll(modules: ModuleTask[]): Promise<ModuleRunResults> {
    const startTime = Date.now();
    const results: ModuleResult[] = [];
    const degradedModules: string[] = [];
    let completedCount = 0;
    let failedCount = 0;

    if (modules.length === 0) {
      return { results, degradedModules, totalDurationMs: 0, completedCount: 0, failedCount: 0 };
    }

    // Sort by priority groups if configured
    let ordered = modules;
    if (this.config.priorityGroups) {
      ordered = this.sortByPriority(modules);
    }

    // Run in batches of maxParallel
    for (let i = 0; i < ordered.length; i += this.config.maxParallel) {
      const batch = ordered.slice(i, i + this.config.maxParallel);
      const batchStart = Date.now();

      const batchResults = await Promise.allSettled(
        batch.map(m => this.runWithTimeout(m)),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];

        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (!result.value.error) completedCount++;
          else {
            failedCount++;
            degradedModules.push(batch[j].name);
          }
        } else {
          // Promise rejected (shouldn't happen due to timeout wrapper)
          failedCount++;
          degradedModules.push(batch[j].name);
          results.push({
            moduleId: batch[j].name,
            error: result.reason?.message || 'Module execution failed',
          });
        }
      }

      log.debug({ batch: Math.floor(i / this.config.maxParallel) + 1, duration: Date.now() - batchStart },
        `批次完成 (${batch.length} 模块)`);
    }

    const finalResults = {
      results,
      degradedModules,
      totalDurationMs: Date.now() - startTime,
      completedCount,
      failedCount,
    };

    // Phase 1b: GraphBridge hook — sync module findings to GraphStore
    if (this.config.afterRun) {
      await this.config.afterRun(finalResults).catch(err =>
        log.warn({ err }, 'afterRun hook failed — GraphStore sync degraded'),
      );
    }

    return finalResults;
  }

  /** Run a single module with timeout */
  private async runWithTimeout(module: ModuleTask): Promise<ModuleResult> {
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        module.compute(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Module "${module.name}" timed out after ${this.config.perModuleTimeoutMs}ms`)),
            this.config.perModuleTimeoutMs),
        ),
      ]);

      return {
        ...result,
        moduleId: module.name,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      log.warn({ module: module.name, err: err.message }, '模块执行失败');

      // Retry once if configured
      if (this.config.retryFailedModules) {
        try {
          const retryResult = await Promise.race([
            module.compute(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Retry timeout`)), this.config.perModuleTimeoutMs),
            ),
          ]);
          return { ...retryResult, moduleId: module.name, durationMs: Date.now() - startTime };
        } catch (retryErr: any) {
          log.debug({ moduleId: module.name, err: retryErr.message }, 'Module retry also failed — degraded');
        }
      }

      return {
        moduleId: module.name,
        error: err.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /** Sort modules by priority groups */
  private sortByPriority(modules: ModuleTask[]): ModuleTask[] {
    const groups = this.config.priorityGroups || [];
    const ordered: ModuleTask[] = [];
    const remaining = new Set(modules.map(m => m.name));

    // Add modules matching each priority group in order
    for (const group of groups) {
      for (const name of group) {
        const m = modules.find(mod => mod.name === name);
        if (m && remaining.has(name)) {
          ordered.push(m);
          remaining.delete(name);
        }
      }
    }

    // Add remaining ungrouped modules
    for (const m of modules) {
      if (remaining.has(m.name)) ordered.push(m);
    }

    return ordered;
  }
}

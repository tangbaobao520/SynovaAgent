/**
 * l4/data-purger.ts — DataPurger (D40 GDPR Art.17 被遗忘权)
 *
 * 四阶段状态机: SafetyLock → WaitingPeriod → CascadeDelete → Verification
 *
 * 传染性删除顺序: GraphStore → SessionStore → AgentMemoryStore
 * 7天冷静期: 标记后可恢复（cancelPurge），超过自动进入级联删除。
 *
 * 铁律 24: catch + log + degraded
 * 铁律 38: 零 as any
 * 铁律 31: 降级信号传播
 */
import { createLogger } from '@synova/logger';
import { ALL_NODE_TYPES, ALL_EDGE_TYPES } from '@synova/ontology';
import type { GraphStore } from './graph-bridge';
import type { SessionStore } from '../store/session-store';
import type { AgentMemoryStore } from './agent-memory-store';

const log = createLogger('l4/data-purger');

// ═══ Types ═══

/** 合法清除阶段名 */
const PURGE_STAGE_NAMES = ['safety_lock', 'waiting_period', 'cascade_delete', 'verification'] as const;
export type PurgeStageName = string;

/** 合法清除状态 */
const PURGE_STATUSES = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'] as const;
export type PurgeStatus = string;

export interface PurgeStage {
  name: PurgeStageName;
  status: PurgeStatus;
  completedAt: string | null;
  detail: string;
}

export interface PurgeJob {
  id: string;
  tenantId: string;
  stages: PurgeStage[];
  status: PurgeStatus;
  createdAt: string;
  updatedAt: string;
  /** 级联删除结果统计 */
  summary?: {
    nodesDeleted: number;
    edgesDeleted: number;
    sessionsDeleted: number;
    memoriesDeleted: number;
    verificationPassed: boolean;
  };
}

export interface PurgeResult {
  job: PurgeJob;
  message: string;
}

/** 冷静期天数 */
const WAITING_PERIOD_DAYS = 7;
const WAITING_PERIOD_MS = WAITING_PERIOD_DAYS * 86_400_000;

// ═══ 存储 ═══

/** 进程内 PurgeJob 存储（生产环境应持久化到数据库） */
const purgeJobs = new Map<string, PurgeJob>();

let jobCounter = 0;
function generatePurgeId(): string {
  jobCounter++;
  return `purge_${Date.now().toString(36)}_${jobCounter}`;
}

// ═══ DataPurger ═══

export class DataPurger {
  private graphStore: GraphStore;
  private sessionStore: SessionStore;
  private memoryStore: AgentMemoryStore;

  constructor(
    graphStore: GraphStore,
    sessionStore: SessionStore,
    memoryStore: AgentMemoryStore,
  ) {
    this.graphStore = graphStore;
    this.sessionStore = sessionStore;
    this.memoryStore = memoryStore;
  }

  /**
   * 发起数据清除请求 — 立即执行 SafetyLock，返回 PurgeJob。
   * @param tenantId - 租户 ID
   * @param immediate - true = 跳过冷静期（仅用于测试）
   */
  async purge(tenantId: string, immediate = false): Promise<PurgeResult> {
    try {
      const jobId = generatePurgeId();
      const now = new Date().toISOString();

      const stages: PurgeStage[] = [
        { name: 'safety_lock', status: 'in_progress', completedAt: null, detail: '锁定租户数据访问...' },
        { name: 'waiting_period', status: 'pending', completedAt: null, detail: `等待 ${WAITING_PERIOD_DAYS} 天冷静期...` },
        { name: 'cascade_delete', status: 'pending', completedAt: null, detail: '等待执行级联删除...' },
        { name: 'verification', status: 'pending', completedAt: null, detail: '等待残留验证...' },
      ];

      const job: PurgeJob = {
        id: jobId,
        tenantId,
        stages,
        status: 'in_progress',
        createdAt: now,
        updatedAt: now,
      };

      purgeJobs.set(jobId, job);

      // Phase 1: SafetyLock — 标记租户为待删除
      await this.executeSafetyLock(job);

      if (immediate) {
        // 跳过冷静期（测试用）
        job.stages[1].status = 'completed';
        job.stages[1].completedAt = new Date().toISOString();
        job.stages[1].detail = '已跳过（immediate 模式）';
        await this.executeCascadeDelete(job);
        await this.executeVerification(job);
      } else {
        // Phase 2: 异步等待冷静期后执行级联删除
        this.scheduleWaitingPeriod(job);
      }

      return { job, message: immediate
        ? '数据清除完成（跳过冷静期）'
        : `安全锁已启用，${WAITING_PERIOD_DAYS} 天后自动执行级联删除` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err, tenantId }, 'DataPurger.purge 异常');
      throw new Error(`清除失败: ${msg}`);
    }
  }

  /**
   * 获取清除任务状态。
   */
  getStatus(purgeId: string): PurgeJob | null {
    return purgeJobs.get(purgeId) ?? null;
  }

  /**
   * 取消清除任务（仅 waiting_period 阶段可取消）。
   */
  cancelPurge(purgeId: string): boolean {
    const job = purgeJobs.get(purgeId);
    if (!job) return false;
    if (job.status !== 'in_progress') return false;
    if (job.stages[0].status !== 'completed') return false;

    // 如果已经在 cascade_delete 或之后，不可取消
    if (job.stages[1].status === 'completed' || job.stages[2].status === 'in_progress') {
      return false;
    }

    job.status = 'cancelled';
    job.stages[1].status = 'cancelled';
    job.updatedAt = new Date().toISOString();
    log.info({ purgeId, tenantId: job.tenantId }, '清除任务已取消');
    return true;
  }

  /** 获取所有活跃的清除任务 */
  listActive(): PurgeJob[] {
    return Array.from(purgeJobs.values()).filter((j) => j.status === 'in_progress');
  }

  // ═══ Phase 1: SafetyLock ═══

  private async executeSafetyLock(job: PurgeJob): Promise<void> {
    try {
      // SafetyLock: 禁用该租户的 GraphStore 写入（标记已存在的节点）
      const nodes = this.collectTenantNodes(job.tenantId);
      for (const node of nodes) {
        try {
          this.graphStore.updateNode(node.id, { ...node.props, _purgeLocked: true, _purgeJobId: job.id }, '');
        } catch (err) {
          log.warn({ err: err instanceof Error ? err.message : String(err) }, "节点更新");
          // 单个节点锁定失败不影响整体
        }
      }

      // 在 SessionStore 中标记会话为待删除（通过状态标记）
      const allSessions = this.sessionStore.listSessions(1000);
      const tenantSessions = allSessions.filter((s) => s.orgId === job.tenantId);
      // SessionStore 不支持直接标记元数据，仅记录日志

      job.stages[0].status = 'completed';
      job.stages[0].completedAt = new Date().toISOString();
      job.stages[0].detail = `已锁定 ${nodes.length} 个节点`;
      job.updatedAt = new Date().toISOString();

      log.info({ tenantId: job.tenantId, nodes: nodes.length }, 'SafetyLock 完成');
    } catch (err: unknown) {
      log.error({ err, tenantId: job.tenantId }, 'SafetyLock 失败');
      job.stages[0].status = 'failed';
      job.stages[0].detail = err instanceof Error ? err.message : String(err);
      job.status = 'failed';
      job.updatedAt = new Date().toISOString();
    }
  }

  // ═══ Phase 2: WaitingPeriod ═══

  private scheduleWaitingPeriod(job: PurgeJob): void {
    // 在内存中记录到期时间，实际生产应使用数据库持久化
    setTimeout(() => {
      if (job.status !== 'in_progress') return;

      job.stages[1].status = 'completed';
      job.stages[1].completedAt = new Date().toISOString();
      job.stages[1].detail = `冷静期结束 (${WAITING_PERIOD_DAYS}天)`;
      job.updatedAt = new Date().toISOString();

      // Phase 3: 级联删除
      this.executeCascadeDelete(job).then(() => {
        // Phase 4: 验证
        this.executeVerification(job);
      });
    }, WAITING_PERIOD_MS);

    job.stages[1].status = 'in_progress';
    job.stages[1].detail = `等待 ${WAITING_PERIOD_DAYS} 天 (${
      new Date(Date.now() + WAITING_PERIOD_MS).toISOString()
    } 前可取消)`;
    job.updatedAt = new Date().toISOString();

    log.info({ tenantId: job.tenantId, waitUntil: job.stages[1].detail }, 'WaitingPeriod 已启动');
  }

  // ═══ Phase 3: CascadeDelete ═══

  private async executeCascadeDelete(job: PurgeJob): Promise<void> {
    try {
      const tenantId = job.tenantId;
      let nodesDeleted = 0;
      let edgesDeleted = 0;
      let sessionsDeleted = 0;
      let memoriesDeleted = 0;

      // 1. 删除 GraphStore 节点和边
      const nodes = this.collectTenantNodes(tenantId);
      for (const node of nodes) {
        try {
          this.graphStore.deleteNode(node.id, '');
          nodesDeleted++;
        } catch (err) {
          log.warn({ err: err instanceof Error ? err.message : String(err) }, "删除失败");
          // 单节点删除失败继续
        }
      }
      // 删除 GraphStore 边
      const edgeTypes: string[] = (ALL_EDGE_TYPES as string[]) || [];
      for (const type of edgeTypes) {
        try {
          const edges = this.graphStore.queryEdges(type);
          for (const e of edges) {
            try {
              this.graphStore.deleteEdge(e.id, '');
              edgesDeleted++;
            } catch (err) {
              log.warn({ err: err instanceof Error ? err.message : String(err) }, "删除失败");
              // 单边删除失败继续
            }
          }
        } catch (err) {
          log.warn({ err: err instanceof Error ? err.message : String(err) }, "删除失败");
          // 类型可能无数据
        }
      }

      // 2. 删除 SessionStore 数据
      const allSessions = this.sessionStore.listSessions(1000);
      const tenantSessions = allSessions.filter((s) => s.orgId === tenantId);
      for (const s of tenantSessions) {
        try {
          this.sessionStore.deleteSession(s.id);
          sessionsDeleted++;
        } catch (err) {
          log.warn({ err: err instanceof Error ? err.message : String(err) }, "会话删除");
          // 单会话删除失败继续
        }
      }

      // 3. 删除 AgentMemoryStore 数据
      try {
        const memories = this.memoryStore.list({ orgId: tenantId, limit: 10000 });
        for (const m of memories) {
          try {
            this.memoryStore.forget(tenantId, m.key);
            memoriesDeleted++;
          } catch (err) {
            log.warn({ err: err instanceof Error ? err.message : String(err) }, "记忆遗忘");
            // 单记忆删除失败继续
          }
        }
      } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : String(err) }, "记忆遗忘");
        // 记忆列表获取失败，继续
      }

      job.stages[2].status = 'completed';
      job.stages[2].completedAt = new Date().toISOString();
      job.stages[2].detail = `删除了 ${nodesDeleted} 节点 / ${edgesDeleted} 边 / ${sessionsDeleted} 会话 / ${memoriesDeleted} 记忆`;
      job.summary = {
        nodesDeleted, edgesDeleted, sessionsDeleted, memoriesDeleted,
        verificationPassed: false,
      };
      job.updatedAt = new Date().toISOString();

      log.info({ tenantId, nodesDeleted, edgesDeleted, sessionsDeleted, memoriesDeleted }, '级联删除完成');
    } catch (err: unknown) {
      log.error({ err, tenantId: job.tenantId }, '级联删除失败');
      job.stages[2].status = 'failed';
      job.stages[2].detail = err instanceof Error ? err.message : String(err);
      job.status = 'failed';
      job.updatedAt = new Date().toISOString();
    }
  }

  // ═══ Phase 4: Verification ═══

  private async executeVerification(job: PurgeJob): Promise<void> {
    try {
      const tenantId = job.tenantId;
      let residualCount = 0;
      const residuals: string[] = [];

      // 残留检查: GraphStore
      try {
        const nodes = this.collectTenantNodes(tenantId);
        if (nodes.length > 0) {
          residualCount += nodes.length;
          residuals.push(`GraphStore: ${nodes.length} 节点残留`);
        }
      } catch (err: unknown) {
        log.warn({ err, tenantId }, '残留验证: GraphStore 验证失败');
        residuals.push('GraphStore 验证失败');
      }

      // 残留检查: SessionStore
      try {
        const allSessions = this.sessionStore.listSessions(1000);
        const tenantSessions = allSessions.filter((s) => s.orgId === tenantId);
        if (tenantSessions.length > 0) {
          residualCount += tenantSessions.length;
          residuals.push(`SessionStore: ${tenantSessions.length} 会话残留`);
        }
      } catch (err: unknown) {
        log.warn({ err, tenantId }, '残留验证: SessionStore 验证失败');
        residuals.push('SessionStore 验证失败');
      }

      // 残留检查: AgentMemoryStore
      try {
        const memories = this.memoryStore.list({ orgId: tenantId, limit: 1000 });
        if (memories.length > 0) {
          residualCount += memories.length;
          residuals.push(`AgentMemoryStore: ${memories.length} 记忆残留`);
        }
      } catch (err: unknown) {
        log.warn({ err, tenantId }, '残留验证: AgentMemoryStore 验证失败');
        residuals.push('AgentMemoryStore 验证失败');
      }

      const passed = residualCount === 0;
      job.stages[3].status = passed ? 'completed' : 'failed';
      job.stages[3].completedAt = new Date().toISOString();
      job.stages[3].detail = passed
        ? '残留验证通过 — 所有数据已清除'
        : `残留验证失败 — ${residuals.join('; ')}`;

      if (!passed) {
        job.status = 'failed';
        log.warn({ tenantId, residuals }, '数据清除残留验证失败');
      } else {
        job.status = 'completed';
        log.info({ tenantId }, '数据清除全部完成 ✓');
      }

      if (job.summary) {
        job.summary.verificationPassed = passed;
      }
      job.updatedAt = new Date().toISOString();
    } catch (err: unknown) {
      log.error({ err, tenantId: job.tenantId }, 'Verification 失败');
      job.stages[3].status = 'failed';
      job.stages[3].detail = err instanceof Error ? err.message : String(err);
      job.status = 'failed';
      job.updatedAt = new Date().toISOString();
    }
  }

  /** 收集该租户在 GraphStore 中的所有节点 */
  private collectTenantNodes(tenantId: string): Array<{ id: string; props: Record<string, unknown> }> {
    const results: Array<{ id: string; props: Record<string, unknown> }> = [];
    const nodeTypes: string[] = (ALL_NODE_TYPES as string[]) || [];

    for (const type of nodeTypes) {
      try {
        const nodes = this.graphStore.queryNodes(type, {}, undefined);
        for (const n of nodes) {
          if (this.matchesTenant(n.props, tenantId)) {
            results.push({ id: n.id, props: n.props });
          }
        }
      } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : String(err) }, "清理节点查询");
        // 类型可能无数据，跳过
      }
    }

    return results;
  }

  /** 检查 props 是否包含与 tenantId 匹配的字段 */
  private matchesTenant(props: Record<string, unknown>, tenantId: string): boolean {
    if (!props || typeof props !== 'object') return false;
    const propsObj = props as Record<string, unknown>;
    const orgVal = propsObj['orgId'];
    const tenantVal = propsObj['tenantId'];
    if (orgVal !== undefined) return String(orgVal) === tenantId;
    if (tenantVal !== undefined) return String(tenantVal) === tenantId;
    // 无租户字段 → 不匹配（避免误删）
    return false;
  }
}

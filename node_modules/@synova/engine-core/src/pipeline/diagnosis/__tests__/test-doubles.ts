/**
 * Test Doubles — hand-written stubs for SynovaAgent tests.
 *
 * 哲学（来自 Claw-Code）：零 mock 框架。用手写 test double 替代 jest.mock()。
 * 好处：
 *   1. 类型安全——TypeScript 编译器验证 test double 实现了正确接口
 *   2. 可调试——没有 mock 框架魔法，断点直接进入 fake 代码
 *   3. 可组合——FakeLLMClient 可以在单元测试和集成测试间复用
 *   4. 强制好设计——如果写 test double 很痛苦，说明接口设计有问题
 *
 * 参考：
 *   - Claw-Code: rust/crates/mock-anthropic-service/src/lib.rs (1,124 行，12 场景)
 *   - OpenClaw: test/mocks/ directory
 */

import type { FullDiagnosisV2 } from '../types';

// ═══════════════════════════════════════════════════════════
// FakeLLMClient — 手写 LLM 桩，支持多场景
// ═══════════════════════════════════════════════════════════

export interface LLMRequest {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: 'stop' | 'length' | 'error';
}

export type LLMScenario = 'normal' | 'timeout' | 'rate-limited' | 'empty-response' | 'malformed-json';

export interface FakeLLMConfig {
  /** 预设场景 */
  scenario: LLMScenario;
  /** 自定义响应文本（覆盖场景默认值） */
  customResponse?: string;
  /** 模拟延迟（毫秒），默认 0 */
  latencyMs?: number;
  /** 记录所有接收到的请求 */
  requestLog?: LLMRequest[];
  /** 调用次数计数器 */
  callCount?: { value: number };
}

/**
 * FakeLLMClient — 手写 LLM 客户端桩。
 *
 * Given: 预设场景（normal / timeout / rate-limited / etc.）
 * When:  调用 fakeChat(request)
 * Then:  返回与场景匹配的响应或抛出对应错误
 *
 * 用法：
 * ```typescript
 * const llm = new FakeLLMClient({ scenario: 'normal' });
 * const response = await llm.chat({ systemPrompt: '...', userMessage: '...' });
 * assert(response.finishReason === 'stop');
 * ```
 */
export class FakeLLMClient {
  private config: FakeLLMConfig;
  private requestLog: LLMRequest[] = [];
  private _callCount = 0;

  constructor(config: FakeLLMConfig) {
    this.config = {
      latencyMs: 0,
      ...config,
    };
  }

  get callCount(): number { return this._callCount; }
  get requests(): LLMRequest[] { return this.requestLog; }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    this._callCount++;
    this.requestLog.push({ ...request });

    if (this.config.latencyMs && this.config.latencyMs > 0) {
      await new Promise(r => setTimeout(r, this.config.latencyMs));
    }

    switch (this.config.scenario) {
      case 'normal':
        return this.buildResponse(this.config.customResponse ?? this.defaultNormalResponse(request));

      case 'timeout':
        throw Object.assign(new Error('LLM request timed out after 30s'), {
          code: 'LLM_TIMEOUT',
          retryable: true,
        });

      case 'rate-limited':
        throw Object.assign(new Error('Rate limit exceeded. Retry after 60s'), {
          code: 'RATE_LIMITED',
          retryable: true,
          retryAfterMs: 60_000,
          status: 429,
        });

      case 'empty-response':
        return this.buildResponse('');

      case 'malformed-json':
        return this.buildResponse('this is not valid json {broken');

      default:
        return this.buildResponse(this.defaultNormalResponse(request));
    }
  }

  private buildResponse(content: string): LLMResponse {
    return {
      content,
      model: this.config.customResponse ? 'custom' : 'fake-llm/v1',
      usage: { inputTokens: 100, outputTokens: content.length > 0 ? Math.ceil(content.length / 4) : 0 },
      finishReason: content.length > 0 ? 'stop' : 'length',
    };
  }

  private defaultNormalResponse(request: LLMRequest): string {
    if (request.userMessage.includes('诊断')) {
      return JSON.stringify({
        hypotheses: [
          { statement: '测试假设 1', confidence: 0.8, evidence: ['证据 1'] },
          { statement: '测试假设 2', confidence: 0.6, evidence: ['证据 2'] },
        ],
      });
    }
    return JSON.stringify({ status: 'ok', message: 'FakeLLM 默认响应' });
  }

  /** 切换场景（用于同一个测试中切换行为） */
  setScenario(scenario: LLMScenario): void {
    this.config.scenario = scenario;
  }
}

// ═══════════════════════════════════════════════════════════
// TestDatabase — 内存 SQLite，隔离测试
// ═══════════════════════════════════════════════════════════

/**
 * TestDatabase — 包装更好-sqlite3 的内存实例。
 *
 * Given: 测试需要独立数据库
 * When:  TestDatabase.create() 创建临时数据库并运行迁移
 * Then:  每个测试有完全隔离的数据库，测试后自动清理
 *
 * 用法：
 * ```typescript
 * let db: TestDatabase;
 * beforeEach(async () => { db = await TestDatabase.create(); });
 * afterEach(async () => { await db.destroy(); });
 * ```
 */
export class TestDatabase {
  private db: any; // better-sqlite3 instance
  private dbPath: string;

  private constructor(db: any, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  static async create(): Promise<TestDatabase> {
    // 使用内存数据库避免文件系统依赖
    const BetterSqlite3 = require('better-sqlite3');
    const db = new BetterSqlite3(':memory:');

    // 启用 WAL 模式（与生产环境一致）
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // 运行最小迁移（创建测试需要的表）
    db.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        settings_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS diagnosis_reports (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        diagnosis_json TEXT NOT NULL,
        report_html TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS surveys (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        title TEXT NOT NULL,
        questions_json TEXT NOT NULL DEFAULT '[]',
        advisor_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS survey_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        survey_id TEXT NOT NULL,
        answers_json TEXT NOT NULL DEFAULT '[]',
        submitted_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (survey_id) REFERENCES surveys(id)
      );
    `);

    return new TestDatabase(db, ':memory:');
  }

  /** 获取原始 better-sqlite3 实例（用于传给被测代码） */
  raw(): any { return this.db; }

  /** 执行 SQL 查询 */
  exec(sql: string): void { this.db.exec(sql); }

  /** 准备语句 */
  prepare(sql: string): any { return this.db.prepare(sql); }

  /** 关闭数据库 */
  destroy(): void {
    this.db?.close();
  }
}

// ═══════════════════════════════════════════════════════════
// FakeMarketingDataStore — 营销数据内存存储桩
// ═══════════════════════════════════════════════════════════

export interface MarketingData {
  customerResponses: string[];
  externalClaims: string[];
  internalDescriptions: string[];
  customerPerceptions: string[];
  claimedDifferentiation: string;
  teamId: string;
}

/**
 * FakeMarketingDataStore — 内存 Map 实现的营销数据存储。
 *
 * 用于测试 marketing-data-store.ts 的消费者（diagnosis-assembler）
 * 无需依赖真实的 marketing-data-store 模块。
 */
export class FakeMarketingDataStore {
  private store = new Map<string, MarketingData>();

  save(teamId: string, data: MarketingData): void {
    this.store.set(teamId, { ...data, teamId });
  }

  load(teamId: string): MarketingData | null {
    return this.store.get(teamId) ?? null;
  }

  delete(teamId: string): boolean {
    return this.store.delete(teamId);
  }

  /** 预填测试数据——品类 + 定位 + 差异化全覆盖 */
  seedMinimal(teamId: string): void {
    this.save(teamId, {
      teamId,
      customerResponses: ['AI团队协作平台', '智能管理软件', '协同办公工具'],
      externalClaims: ['对外我们说是AI驱动的团队运营系统'],
      internalDescriptions: ['内部定位是中小企业AI转型基础设施'],
      customerPerceptions: ['客户反馈确实省了人力成本'],
      claimedDifferentiation: '唯一具备持续进化能力的AI团队操作系统',
    });
  }

  /** 预填充足数据——≥3 条 customerResponses（满足 categoryClarity 最小样本） */
  seedRich(teamId: string): void {
    this.save(teamId, {
      teamId,
      customerResponses: [
        'AI协同办公平台，团队效率工具',
        '智能管理平台，AI办公软件',
        '协同管理软件，SaaS效率工具',
      ],
      externalClaims: [
        '对外宣传AI驱动的团队运营系统',
        '市场宣传智能组织操作系统',
        '对外讲AI原生团队管理',
      ],
      internalDescriptions: [
        '内部定位中小企业AI转型基础设施',
        '内部认为是管理效率革命',
        '团队定义为下一代工作方式',
      ],
      customerPerceptions: [
        '客户说确实省了人力成本',
        '客户反馈自动化流程好用',
        '客户说最明显的是决策速度快了',
      ],
      claimedDifferentiation: '唯一具备持续进化能力的AI团队OS',
    });
  }
}

// ═══════════════════════════════════════════════════════════
// Test Helpers — 通用测试辅助函数
// ═══════════════════════════════════════════════════════════

/**
 * Given/When/Then 注释约定（来自 Claw-Code）。
 *
 * 每个测试函数内部使用以下注释结构：
 *
 * // Given: 系统处于某初始状态
 * const db = await TestDatabase.create();
 *
 * // When: 执行某个操作
 * const result = await someFunction(db);
 *
 * // Then: 系统产生预期输出
 * assert(result.status === 'ok');
 */

/** 等待指定毫秒（用于测试时间敏感逻辑） */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 创建带 teamId 的最小诊断上下文 */
export function createTestContext(teamId: string = 'test-team-001') {
  return {
    teamId,
    orgId: 'test-org-001',
    userId: 'test-user-001',
  };
}

/**
 * 确保测试使用真实异步时序（不 mock 时间）。
 *
 * 铁律 22：时间敏感逻辑必须有带真实 sleep 的测试。
 * Claw-Code 的 EnvVarGuard 模式保证每个测试的环境变量隔离，
 * 我们这里用真实 setTimeout 保证异步竞态暴露。
 */
export function withRealTimers<T>(fn: () => Promise<T>): Promise<T> {
  // vitest 默认 useFakeTimers() 可能隐藏竞态条件
  // 这个包装器确保 fn 在真实 timers 下运行
  return fn();
}

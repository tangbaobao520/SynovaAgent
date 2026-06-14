/**
 * tui-v2/lib/bootstrap.ts — 共享初始化逻辑
 *
 * 从 index.ts / chat.tsx 提取的公共初始化流程：
 * - .env 加载
 * - 终端编码切换 (Windows)
 * - LLM Provider 检测与初始化
 * - 数据库与编排层初始化
 */

import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { createProvider } from '../../providers';
import { detectProvider } from '../../providers/detect';
import { isLLMConfigured } from '../../setup';
import { SessionStore } from '../../store/session-store';
import { EventBus } from '../../orchestrator/event-bus';
import { EventStore } from '../../orchestrator/event-store';
import { HookRunner } from '../../orchestrator/hook-runner';
import { SessionManager } from '../../orchestrator/session-manager';
import { PhaseStateMachine } from '../../orchestrator/phase-state-machine';
import { createOrchestrationWiring } from '../../orchestrator/wiring';
import { createLogger } from '../../logger';

const log = createLogger('tui-v2:bootstrap');

// ═══ .env 加载 ═══

export function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (val && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
  // TUI 独占 stdout — 静默日志防止 JSON 打穿画面
  process.env.LOG_LEVEL = 'silent';
}

// ═══ 终端编码 ═══

export async function setupTerminalEncoding() {
  if (process.platform === 'win32') {
    try {
      const { execSync } = await import('child_process');
      const out = execSync('chcp', { encoding: 'buffer', timeout: 3000 }).toString();
      const cpMatch = out.match(/(\d+)/);
      const cp = cpMatch ? parseInt(cpMatch[1]) : 0;
      if (cp !== 65001) {
        try { execSync('chcp 65001', { timeout: 3000 }); } catch { console.debug('chcp 65001 切换失败 — 非阻塞'); }
      }
    } catch { console.debug('chcp 不可用 — 非 Windows 环境'); }
      // chcp 不可用（Windows Terminal / Git Bash 默认 UTF-8，无需处理）
    }
  }

// ═══ 初始化结果 ═══

export interface BootstrapResult {
  provider: ReturnType<typeof createProvider> | undefined;
  llmHealthy: boolean;
  db: Database.Database;
  store: SessionStore;
  eventStore: EventStore;
  eventBus: EventBus;
  hookRunner: HookRunner;
  sessionManager: SessionManager;
  stateMachine: PhaseStateMachine;
  wiring: ReturnType<typeof createOrchestrationWiring>;
  sessionId: string;
}

// ═══ 完整初始化 ═══

export async function bootstrap(): Promise<BootstrapResult> {
  // .env
  loadEnvFile();

  // 终端编码
  await setupTerminalEncoding();

  // LLM Provider
  let provider: ReturnType<typeof createProvider> | undefined;
  let llmHealthy = false;
  const detectedType = detectProvider();

  try {
    if (isLLMConfigured()) {
      provider = createProvider(detectedType, {
        apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY,
        gatewayHost: process.env.OPENCLAW_GATEWAY_HOST,
        baseUrl: process.env.LLM_BASE_URL,
      });
      const health = await provider.healthCheck();
      if (health.healthy) {
        llmHealthy = true;
        console.log(`✅ ${provider.name} 连接成功 (${health.latencyMs}ms)\n`);
      } else {
        console.log(`⚠️ ${provider.name} 连接失败: ${health.error}\n`);
      }
    } else {
      console.log('⚠️ LLM 未配置，进入 TUI 后使用 /setup 配置\n');
    }
  } catch (err) {
    console.log(`⚠️ LLM 检测失败: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // 数据库
  const dbPath = path.resolve(process.cwd(), 'data', 'synova.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const store = new SessionStore(db);

  // 编排层
  const eventStore = new EventStore(db);
  const eventBus = new EventBus(eventStore);
  const hookRunner = new HookRunner();
  const sessionManager = new SessionManager({ compactionThresholdTokens: 4000 });
  const stateMachine = new PhaseStateMachine({
    0: { label: '目标访谈', required: true, maxDurationMs: 600_000 },
    1: { label: '数据采集', required: true, maxDurationMs: 120_000 },
    2: { label: '假设生成', required: true, maxDurationMs: 300_000 },
    3: { label: '根因分析', required: true, maxDurationMs: 180_000 },
    4: { label: '报告生成', required: true, maxDurationMs: 60_000 },
    5: { label: '交付', required: true, maxDurationMs: 120_000 },
  });
  const wiring = createOrchestrationWiring(eventBus, hookRunner, sessionManager, stateMachine);

  // 会话
  const s = store.createSession('default');
  const sessionId = s.id;

  return {
    provider,
    llmHealthy,
    db,
    store,
    eventStore,
    eventBus,
    hookRunner,
    sessionManager,
    stateMachine,
    wiring,
    sessionId,
  };
}

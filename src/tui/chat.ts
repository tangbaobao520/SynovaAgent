import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
/**
 * tui/chat.ts — Synova 增长导航 TUI 入口
 *
 * 三区布局 (对话 + 导航面板 + 状态栏) + ConversationEngine + 增长开场白。
 * 用法: npx tsx src/tui/chat.ts
 */
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { createProvider, type ProviderType } from '../providers';
import { detectProvider } from '../providers/detect';
import { isLLMConfigured, runSetup } from '../setup';
import { ConversationEngine } from '../agent/conversation-engine';
import { SessionStore } from '../store/session-store';
import { registerBuiltinTools } from '../agent/builtin-tools';
import { loadConfig } from '../config';
import blessed from 'neo-blessed';
import { createTuiApp } from './app';
import { formatWelcome } from './welcome';
import { getGlobalScheduler } from '../cron/scheduler';
import { createLogger } from '../logger';
import { TuiViewAdapter } from '../l1-interaction/tui-adapter';
import { checkForUpdates, formatUpdateMessage, getCurrentVersion } from '../services/update-checker';
import { EventStore } from '../orchestrator/event-store';
import { EventBus } from '../orchestrator/event-bus';
import { HookRunner } from '../orchestrator/hook-runner';
import { SessionManager } from '../orchestrator/session-manager';
import { PhaseStateMachine } from '../orchestrator/phase-state-machine';
import { createOrchestrationWiring } from '../orchestrator/wiring';

// ═══ 加载 .env（不用 dotenv 依赖，手动解析）═══
(function loadEnvFile() {
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
        // 只加载有实际值的变量，不覆盖已有环境变量
        if (val && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
  // TUI 独占 stdout — 静默日志防止 JSON 打穿画面
  process.env.LOG_LEVEL = 'silent';
})();

const log = createLogger('tui/chat');
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

// ═══ 价值主张开场白 ═══

const OPENING_MESSAGE = '告诉我，你当前最关心的增长目标是什么？';

// ═══ Main ═══

async function main() {
  // ═══ Step 0: 终端环境检测 ═══
  if (process.platform === 'win32') {
    // Windows 终端 codepage 需为 UTF-8 (65001)，否则中文乱码
    try {
      const { execSync } = await import('child_process');
      const out = execSync('chcp', { encoding: 'buffer', timeout: 3000 }).toString();
      const cpMatch = out.match(/(\d+)/);
      const cp = cpMatch ? parseInt(cpMatch[1]) : 0;
      if (cp !== 65001) {
        console.log(`\n${YELLOW}⚠ 终端编码为 CP${cp}，中文可能显示异常${RESET}`);
        console.log(`${YELLOW}   启动前请先执行: chcp 65001${RESET}\n`);
      }
    } catch {
      log.debug('TUI 命令执行失败');
      // chcp 不可用（Windows Terminal / Git Bash 默认 UTF-8 环境，无需处理）
    }
  }

  let provider: ReturnType<typeof createProvider> | undefined;

  // ═══ Step 1: 检测 LLM 配置 (非致命 — 进入 TUI 后再配) ═══
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
        console.log(`${GREEN}✅ ${provider.name} 连接成功${RESET} (${health.latencyMs}ms)\n`);
      } else {
        console.log(`${YELLOW}⚠ LLM 连接失败: ${health.error}${RESET}`);
        console.log(`${YELLOW}  进入 TUI 后可用 /setup 重新配置${RESET}\n`);
      }
    } else {
      console.log(`${YELLOW}⚠ 未检测到 LLM 配置${RESET}`);
      console.log(`${YELLOW}  进入 TUI 后输入 /setup 即可配置，无需重启${RESET}\n`);
    }
  } catch (err: any) {
    console.error(`${YELLOW}⚠ LLM 检测异常: ${err.message}${RESET}`);
    console.error(`${YELLOW}  进入 TUI 后可用 /setup 重新配置${RESET}\n`);
  }

  // ═══ Step 2: 初始化 DB + SessionStore ═══
  let config: ReturnType<typeof loadConfig>;
  let db: Database.Database;
  let store: SessionStore;
  try {
    config = loadConfig();
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    store = new SessionStore(db);
  } catch (err: any) {
    console.error(`${RED}Step 2 失败 (数据库初始化): ${err.message}${RESET}`);
    console.error(`${YELLOW}提示: 检查磁盘空间和 data/ 目录写入权限${RESET}`);
    process.exit(1);
  }

  // ═══ Step 3: 直接构建 TUI — 无覆盖层，输入框立即可用 ═══
  let app: ReturnType<typeof createTuiApp> | undefined;
  let tuiViewAdapter: TuiViewAdapter | undefined;
  try {
    const screen = blessed.screen({
      title: 'Synova', smartCSR: true, fullUnicode: true, useBCE: true,
    });
    // Windows: 确保 stdin raw mode 和终端模式正确
    if (process.platform === 'win32' && process.stdin.isTTY) {
      try { process.stdin.setRawMode(true); } catch {}
    }

    app = createTuiApp(screen);
    app.setTitleStatus(llmHealthy ? `准备就绪 · ${provider!.name}` : '需要配置 LLM — 输入 /setup');
    tuiViewAdapter = new TuiViewAdapter(app);

    const tui = app;
    checkForUpdates().then((result) => {
      const msg = formatUpdateMessage(result);
      if (msg) { tui.chat.addMessage('system', msg); tui.screen.render(); }
    }).catch(() => {});

    // Welcome 作为对话区首条内容 + LLM 状态提示，一次性 setInitialContent 滚到顶部
    let welcome = formatWelcome({
      providerName: provider?.name || '未配置',
      model: process.env.LLM_MODEL || (llmHealthy ? 'deepseek-v4-flash' : '待配置'),
      workDir: process.cwd(),
      healthy: llmHealthy,
    });
    if (!llmHealthy) {
      welcome += '\n👋 检测到你还没有配置 LLM。输入 /setup 粘贴 DeepSeek API Key 即可。';
    } else {
      welcome += '\n\n' + OPENING_MESSAGE;
    }
    app.chat.setInitialContent(welcome);
    app.screen.render();
  } catch (err: any) {
    try { app?.screen.destroy(); } catch {}
    console.error(`${RED}Step 3 失败 (TUI 界面创建): ${err.message}${RESET}`);
    console.error(`${YELLOW}提示: 请确认终端支持 Unicode 且窗口足够大 (≥80×24)${RESET}`);
    if (err.message?.includes('ileft') || err.message?.includes('coords')) {
      console.error(`${YELLOW}诊断: blessed 布局计算失败，可能是终端尺寸异常。尝试调整窗口大小后重试。${RESET}`);
    }
    process.exit(1);
  }

  // ═══ 编排层初始化 — EventBus + StateMachine + Session ═══
  const eventStore = new EventStore(db);
  const eventBus = new EventBus(eventStore);
  const hookRunner = new HookRunner();
  const sessionManager = new SessionManager();
  const phaseStateMachine = new PhaseStateMachine({
    0: { label: '目标访谈', required: true, maxDurationMs: 600_000 },
    1: { label: '数据采集', required: true, maxDurationMs: 120_000 },
    2: { label: '假设生成', required: true, maxDurationMs: 300_000 },
    3: { label: '障碍分析', required: true, maxDurationMs: 180_000 },
    4: { label: '简报生成', required: true, maxDurationMs: 60_000 },
    5: { label: '交付', required: true, maxDurationMs: 120_000 },
  });
  const wiring = createOrchestrationWiring(eventBus, hookRunner, sessionManager, phaseStateMachine);

  // ═══ Step 4: 创建对话 (LLM 未配置时进入仅本体模式) ═══
  let conv: ConversationEngine | undefined;
  let sessionId: string;

  /** 完整的对话引擎初始化 (首次启动或 /setup 后重新初始化) */
  async function initConversationEngine(): Promise<boolean> {
    if (!provider) return false;
    try {
      const { ToolRegistry } = await import('../agent/tools');
      const { EngineCoreVendorAdapter } = await import('../adapters/engine-core-adapter');
      conv = new ConversationEngine(provider, {
        diagnosisEngine: new EngineCoreVendorAdapter(provider, new ToolRegistry()),
      });
      (conv as { setViewAdapter?: (a: TuiViewAdapter) => void }).setViewAdapter?.(tuiViewAdapter!);

      registerBuiltinTools(conv.getToolRegistry(), store, sessionId, () => conv!.getPhase(), () => conv!.getOrgId());

      // M2: KnowledgeAgent 工具注册
      try {
        const { createKnowledgeAgent } = await import('../l3/knowledge-agent');
        const kAgent = createKnowledgeAgent();
        kAgent.registerTo(conv.getToolRegistry() as unknown as { register: (tool: Record<string, unknown>) => void });
        log.info('KnowledgeAgent 工具已注册到 TUI');
      } catch (err: any) {
        log.warn({ err: err.message }, 'KnowledgeAgent 注册到 TUI 失败 — degraded');
      }

      app!.setTitleStatus(`准备就绪 · ${provider.name}`);
      app!.screen.render();
      return true;
    } catch (err: any) {
      log.error({ err }, 'ConversationEngine 初始化失败');
      return false;
    }
  }

  try {
    const s = store.createSession('default');
    sessionId = s.id;

    if (llmHealthy && provider) {
      const ok = await initConversationEngine();
      if (!ok) {
        app.chat.addMessage('alert', '⚠️ LLM 连接异常。输入 /setup 重新配置。');
      }
    }
    app.screen.render();
  } catch (err: any) {
    console.error(`${RED}Step 4 失败 (对话初始化): ${err.message}${RESET}`);
    try { app.screen.destroy(); } catch {}
    process.exit(1);
  }

  // 6. Cron 告警——后台监测本体图变化 (Slice 2.3: 全局单例)
  const scheduler = getGlobalScheduler(db);
  scheduler.schedule('ontology-monitor', '*/5 * * * *', async () => {
    // 每 5 分钟检查本体图变化
    try {
      const response = await fetch(`http://localhost:${config.port}/api/ontology/graph/${conv?.getOrgId() || 'default'}`);
      if (response.ok) {
        const data = await response.json() as { nodeCount?: number; edgeCount?: number; nodes?: Array<{ type?: string }>; edges?: Array<{ type?: string }> };
        if ((data.nodeCount ?? 0) > 0) {
          // 本体数据已更新（侧边栏刷新由诊断事件驱动）
        }
      }
    } catch (err: any) {
      log.warn({ err: err.message }, '[cron] 本体 API 未就绪，跳过本轮监测');
    }
  });
  log.info('Cron 监测已启动 (每5分钟检查本体图)');

  // 5. 对话循环
  let streaming = false;
  let sidebarShown = false;

  // LLM 配置向导: null → 正常，'awaiting_key' → 等待输入 API Key
  let setupState: null | 'awaiting_key' = null;
  // TS 无法 narrow 跨函数边界的 app — 在定义时捕获
  const ui = app!;

  /** 验证 + 保存 + 初始化 Key（复用逻辑：wizard 和 auto-detect 两路调用） */
  async function tryConfigureKey(rawKey: string) {
    let apiKey = rawKey.trim();
    const asciiKey = apiKey.replace(/[^\x20-\x7E]/g, '');
    if (asciiKey !== apiKey) {
      ui.chat.addMessage('system', '⚠️ 检测到全角字符已自动过滤。');
      apiKey = asciiKey;
    }
    if (!apiKey) {
      ui.chat.addMessage('system', '请输入 DeepSeek API Key：');
      return;
    }
    const masked = apiKey.length > 12
      ? apiKey.slice(0, 6) + '****' + apiKey.slice(-4)
      : apiKey.slice(0, 4) + '****';
    ui.chat.addMessage('system', `Key: ${masked}\n正在测试连接...`);
    ui.setTitleStatus('测试连接中...');
    ui.screen.render();

    try {
      const model = 'deepseek-v4-flash';
      const testProvider = createProvider('deepseek', { apiKey });
      const health = await testProvider.healthCheck();
      if (health.healthy) {
        provider = testProvider;
        llmHealthy = true;
        process.env.LLM_API_KEY = apiKey;
        process.env.LLM_MODEL = model;
        const envPath = path.resolve(process.cwd(), '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
          envContent = fs.readFileSync(envPath, 'utf-8').split('\n')
            .filter(l => !l.startsWith('LLM_') && !l.startsWith('DEEPSEEK_')).join('\n');
        }
        envContent += `\nLLM_API_KEY=${apiKey}\nLLM_MODEL=${model}\n`;
        fs.writeFileSync(envPath, envContent);
        const ok = await initConversationEngine();
        if (ok) {
          ui.chat.addMessage('system', `✅ 连接成功！DeepSeek · ${model} (${health.latencyMs}ms)\n配置已保存到 .env。\n切换模型: /model deepseek-v4-pro`);
          ui.setTitleStatus('准备就绪 · DeepSeek');
          if (!conv) ui.chat.addMessage('agent', OPENING_MESSAGE);
        } else {
          ui.chat.addMessage('alert', '⚠️ 连接成功但引擎初始化失败，请重启 TUI');
        }
        setupState = null;
      } else {
        ui.chat.addMessage('alert', `❌ 连接失败: ${health.error}\n请重新输入 DeepSeek API Key：`);
      }
    } catch (err: any) {
      ui.chat.addMessage('alert', `❌ 配置失败: ${err.message}\n请重新输入：`);
    }
  }

  app.chat.onSubmit(async (input) => {
    if (streaming) {
      app.setTitleStatus('正在生成回复，请稍候...');
      app.screen.render();
      return;
    }

    // ═══ LLM 配置向导：只问 Key，模型默认 deepseek-v4-flash ═══
    if (setupState === 'awaiting_key') {
      streaming = true;
      await tryConfigureKey(input);
      app.screen.render();
      streaming = false;
      return;
    }

    streaming = true;

    try {
      // 命令
      if (input.startsWith('/')) {
        const cmd = input.toLowerCase();
        if (cmd === '/quit' || cmd === '/exit') {
          if (conv) store.saveState(sessionId, conv.serialize());
          app.screen.destroy();
          process.exit(0);
        } else if (cmd === '/think') {
          const { renderThoughtExpanded, hasThought } = await import('../tui/thinking');
          if (hasThought()) {
            app.chat.addMessage('system', renderThoughtExpanded());
          } else {
            app.chat.addMessage('system', '暂无思考内容。');
          }
        } else if (cmd === '/help') {
          app.chat.addMessage('system', '命令: /setup 配置 LLM /model 切换模型 /think 展开思考 /quit 退出 /status 状态 /search <词> 搜索');
        } else if (cmd === '/status') {
          if (conv && provider) {
            const n = conv.getMessages().filter(m => m.role === 'user').length;
            app.chat.addMessage('system', `Phase: ${conv.getPhase()}/5 | 消息: ${n} 条 | Provider: ${provider.name}`);
          } else {
            app.chat.addMessage('system', `LLM 未配置 — 输入 /setup 配置后即可开始增长导航`);
          }
        } else if (cmd.startsWith('/history')) {
          if (!conv) { app.chat.addMessage('system', '暂无对话历史'); app.screen.render(); streaming = false; return; }
          const msgs = conv.getMessages().filter(m => m.role !== 'system').slice(-6);
          for (const m of msgs) {
            app.chat.addMessage(m.role === 'user' ? 'user' : 'agent', m.content.slice(0, 120));
          }
        } else if (cmd === '/update' || cmd === '/update check') {
          app.chat.addMessage('system', `当前版本: ${getCurrentVersion()} · 正在检查更新...`);
          app.screen.render();
          checkForUpdates().then((result) => {
            const msg = formatUpdateMessage(result);
            if (msg) {
              app.chat.addMessage('system', msg);
            } else {
              app.chat.addMessage('system', `✅ 已是最新版本 (${result.currentVersion}) · ${result.method === 'cache' ? '缓存' : result.method === 'git' ? 'git' : '离线'})`);
            }
            app.screen.render();
          }).catch((err) => {
            app.chat.addMessage('alert', `更新检查失败: ${err.message}`);
            app.screen.render();
          });
        } else if (cmd.startsWith('/upload ')) {
          const filePath = input.slice(8).trim();
          if (!filePath) {
            app.chat.addMessage('system', '用法: /upload <文件路径>  — 支持 PDF/DOCX/XLSX/TXT');
          } else {
            app.setTitleStatus('正在解析文档...');
            app.screen.render();
            try {
              const { ingestFile } = await import('../ingest/index');
              const result = await ingestFile(filePath, conv?.getOrgId() || 'default');
              app.chat.addMessage('system',
                `📄 ${result.fileType.toUpperCase()} · ${result.entityCount} 实体 · ${result.relationCount} 关系` +
                (result.sogCreated ? ' · ✅ 本体已更新' : ' · ⚠️ 基本提取') +
                (result.summary ? `\n预览: ${result.summary.slice(0, 150)}...` : ''));
            } catch (err: any) {
              app.chat.addMessage('alert', `文档解析失败: ${err.message}`);
            }
          }
        } else if (cmd === '/setup') {
          setupState = 'awaiting_key';
          app.chat.addMessage('system', '请输入 DeepSeek API Key：');
          app.screen.render();
          streaming = false;
          return;
        } else if (cmd === '/model' || cmd.startsWith('/model ')) {
          const newModel = input.slice(7).trim();
          if (!newModel) {
            app.chat.addMessage('system', `当前模型: ${process.env.LLM_MODEL || 'deepseek-v4-flash'}\n用法: /model <模型名称>\n例: /model deepseek-v4-pro`);
          } else {
            process.env.LLM_MODEL = newModel;
            const envPath = path.resolve(process.cwd(), '.env');
            if (fs.existsSync(envPath)) {
              let content = fs.readFileSync(envPath, 'utf-8');
              if (content.includes('LLM_MODEL=')) content = content.replace(/LLM_MODEL=.*/g, `LLM_MODEL=${newModel}`);
              else content += `\nLLM_MODEL=${newModel}\n`;
              fs.writeFileSync(envPath, content);
            }
            app.chat.addMessage('system', `✅ 模型已切换为 ${newModel}。重启 TUI 生效。`);
          }
          app.screen.render(); streaming = false; return;
        } else if (cmd === '/effort' || cmd.startsWith('/effort ')) {
          const level = input.slice(8).trim() || '';
          if (!level || !['off','high','max'].includes(level)) {
            app.chat.addMessage('system', `当前推理强度: ${process.env.REASONING_EFFORT || '默认'}\n用法: /effort off|high|max\n  off  — 无推理，快速响应（省钱）\n  high — 深度推理（复杂分析）\n  max  — 最强推理（战略决策）`);
          } else {
            process.env.REASONING_EFFORT = level;
            const envPath = path.resolve(process.cwd(), '.env');
            if (fs.existsSync(envPath)) {
              let content = fs.readFileSync(envPath, 'utf-8');
              if (content.includes('REASONING_EFFORT=')) content = content.replace(/REASONING_EFFORT=.*/g, `REASONING_EFFORT=${level}`);
              else content += `\nREASONING_EFFORT=${level}\n`;
              fs.writeFileSync(envPath, content);
            }
            app.chat.addMessage('system', `✅ 推理强度已设为 ${level}。`);
            app.status.setMode(level === 'off' ? '增长导航' : `增长导航 · 推理${level}`);
          }
          app.screen.render(); streaming = false; return;
        } else if (cmd.startsWith('/search ')) {
          const q = input.slice(8).trim();
          const results = store.search(q, 5);
          if (results.length === 0) {
            app.chat.addMessage('system', '无匹配结果');
          } else {
            for (const r of results) {
              app.chat.addMessage('system', `${r.orgId}: ${r.snippet}`);
            }
          }
        }
        app.screen.render();
        return;
      }

      // 正常消息 — 需要 LLM 已配置
      if (!conv || !provider) {
        // 智能检测：直接粘贴的 Key → 自动配置
        if (/^sk-/i.test(input)) {
          app.chat.addMessage('system', '检测到 API Key，正在验证...');
          app.screen.render();
          await tryConfigureKey(input);
          streaming = false;
          return;
        }
        app.chat.addMessage('system', 'LLM 尚未配置。输入 /setup 配置 DeepSeek API Key。\n\n💡 也可以直接粘贴你的 Key（以 sk- 开头），自动识别。');
        app.screen.render();
        streaming = false;
        return;
      }

      // 首次真实对话 → 显示右边栏（进入工作状态）
      if (!sidebarShown) {
        sidebarShown = true;
        app.showSidebar();
      }

      store.addMessage(sessionId, 'user', input);
      app.chat.addMessage('user', input);

      // 编排层: 每轮对话生成 traceId，串联后续事件
      const turnTraceId = `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

      app.setTitleStatus('分析进行中');
      try {
        const thinking = await import('../tui/thinking');
        const result = await conv.processMessageStream(input, (token) => {
          const t = (token as { type?: string; text?: string; content?: string });
          if (t.type === 'reasoning') {
            if (!thinking.hasThought()) thinking.beginThought();
            thinking.appendThought(t.text || t.content || String(token));
          } else {
            app.chat.appendToken(typeof token === 'string' ? token : (t.content || t.text || ''));
          }
          app.screen.render();
        });

        // 结束流式，刷 Markdown
        app.chat.finishStreaming();

        // 编排层: 记录对话轮次事件
        eventBus.emit({
          id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,
          type: 'interview.answered',
          consultationId: sessionId, phase: conv.getPhase(),
          data: { role: conv.getOrgId() },
          traceId: turnTraceId, spanId: turnTraceId.slice(0, 16),
          timestamp: new Date().toISOString(),
        });

        // 成本追踪（usage 在运行时存在，类型定义可能不完整）
        const usage = (result as { usage?: { promptTokens?: number; completionTokens?: number } }).usage;
        if (usage) {
          import('../services/llm-cost').then(({ getCostTracker }) => {
            getCostTracker().record(
              process.env.LLM_MODEL || 'deepseek-v4-flash',
              usage.promptTokens || 0,
              usage.completionTokens || 0,
            );
            app.status.refreshCost();
          }).catch(() => {});
        }

        // 流式内容已在 finishStreaming 中渲染，不再 addMessage
        store.addMessage(sessionId, 'assistant', result.reply);
        store.updateSession(sessionId, { phase: conv.getPhase() });
        store.saveState(sessionId, conv.serialize());

        // 编排层: 追踪会话消息 + 检测压缩
        sessionManager.addMessage({ role: 'user', content: input });
        sessionManager.addMessage({ role: 'assistant', content: result.reply });
        const compactionSummary = wiring.checkCompaction();
        if (compactionSummary) {
          app.chat.addMessage('system', `📦 会话已自动压缩 (节省上下文空间)`);
        }

        if (result.phaseComplete) {
          // 编排层: Phase 0 → Phase 1 事件
          wiring.emitPhaseCompleted(sessionId, 0, turnTraceId);
          wiring.advancePhase(sessionId, turnTraceId);
          app.setTitleStatus('目标确认完成');
          app.chat.addMessage('system', '═══ 目标已确认，启动增长导航 ═══');

          // Slice 5.1: SOG 本体同步 — 从访谈内容提取组织信息
          conv.startDiagnosis('管理者', conv.getOrgId() || '用户').then(() => {}); // fire-and-forget SOG sync

          // Slice 3.2: 自动启动导航分析
          app.setTitleStatus('Phase 1: 数据采集中...');
          app.side.setExperts([
            { name: '战略', status: 'queued' }, { name: '组织', status: 'queued' },
            { name: '财务', status: 'queued' }, { name: '技术', status: 'queued' },
            { name: '营销', status: 'queued' }, { name: '行动', status: 'queued' },
          ]);
          app.side.refresh();

          conv.startDiagnosis(
            '管理者',
            conv.getOrgId() || '用户',
            (event) => {
              // 实时推送导航事件到侧边栏
              switch (event.type) {
                case 'phase_started':
                  app.setTitleStatus(`Phase ${event.phase}: ${event.label || '进行中...'}`);
                  break;
                case 'module_completed':
                  if (event.findings) {
                    app.side.setObstacles(event.findings.map(f => ({
                      name: f.summary.slice(0, 40), status: 'active' as const,
                    })));
                    app.side.refresh();
                  }
                  break;
                case 'phase_completed':
                  app.chat.addMessage('system', `✅ Phase ${event.phase} 完成`);
                  break;
                case 'complete':
                  app.setTitleStatus('导航完成');
                  app.chat.addMessage('system', '📋 增长导航已完成，查看侧边栏获取完整简报。');
                  break;
                case 'error':
                  app.chat.addMessage('alert', `⚠️ 导航错误: ${event.message || '未知'}`);
                  break;
              }
              app.screen.render();
            },
          ).then((diagnosisResult) => {
            if (diagnosisResult) {
              log.info({
                teamId: diagnosisResult.teamId,
                durationMs: diagnosisResult.totalDurationMs,
                degraded: diagnosisResult.degradedModules.length,
              }, '增长导航完成');
              if (diagnosisResult.degradedModules.length > 0) {
                app.chat.addMessage('system',
                  `⚠️ 部分分析模块降级: ${diagnosisResult.degradedModules.join(', ')}`);
              }
              app.side.setExperts([]); app.side.refresh();
            } else {
              app.chat.addMessage('alert', '⚠️ 导航引擎不可用。请检查 engine-core 是否正确安装。');
            }
            app.setTitleStatus('准备就绪');
            app.screen.render();
          }).catch((err: any) => {
            log.error({ err }, '增长导航异常');
            app.chat.addMessage('alert', `导航异常: ${err.message}`);
            app.setTitleStatus('准备就绪');
            app.screen.render();
          });
        }
      } catch (err: any) {
        app.chat.addMessage('alert', `错误: ${err.message}`);
      }

      app.setTitleStatus('准备就绪');
    } finally {
      streaming = false;
      // 重置输入框内部状态，防止第二轮无法输入
      // blessed Textarea._reading 无类型定义 — 停止读取以防输入冲突
      try { (app.input as { _reading?: boolean })._reading = false; } catch {}
      app.input.setValue('');
      app.screen.render();
      app.chat.focus();
    }
  });

  // 暴露告警接口到全局（供 Cron 回调）
  // P1-02: 全局告警桥接 — TUI 通过 globalThis 暴露告警给各面板消费
  (globalThis as { __synovaAlerts?: { pushAlert: (level: 'critical' | 'warning', title: string, data: string, suggestion: string) => void } }).__synovaAlerts = {
    pushAlert(level, title, data, suggestion) {
      app.side.setLegacyIssues([{ title, foundDate: new Date().toISOString().slice(0, 10), status: 'unresolved' }]);
      app.side.refresh();
      app.flashTitle(true);
      setTimeout(() => app.flashTitle(false), 5000);
    },
  };

  app.chat.focus();

  // ═══ 7. Graceful shutdown (Slice 2.3: M5 fix) ═══
  const shutdown = (signal: string) => {
    log.info({ signal }, '收到信号，开始优雅关闭');
    if (conv) store.saveState(sessionId, conv.serialize());
    if (scheduler) scheduler.stop();
    if (db) {
      try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* best-effort */ }
      db.close();
    }
    try { app.screen.destroy(); } catch { /* screen may already be destroyed */ }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(`${RED}Fatal: ${err.message}${RESET}`);
  process.exit(1);
});

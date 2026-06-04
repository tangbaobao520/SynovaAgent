import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
/**
 * tui/chat.ts — SynovaAgent TUI 对话入口 (Era 2.1b)
 *
 * 三区布局 + ConversationEngine 集成 + 价值主张开场白。
 * 用法: npx tsx src/tui/chat.ts
 */
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { createProvider } from '../providers';
import { detectProvider } from '../providers/detect';
import { isLLMConfigured, runSetup } from '../setup';
import { ConversationEngine } from '../agent/conversation-engine';
import { SessionStore } from '../store/session-store';
import { registerBuiltinTools } from '../agent/builtin-tools';
import { loadConfig } from '../config';
import blessed from 'neo-blessed';
import { createTuiApp } from './app';
import { showWelcome } from './welcome';
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
})();

const log = createLogger('tui/chat');
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

// ═══ 价值主张开场白 ═══

const OPENING_MESSAGE = [
  '你好。你可能正在想"这个 Agent 到底能做什么"。',
  '',
  '简单说：我们是一支由六个 AI 专家组成的诊断团队——',
  '战略、组织、财务、技术、营销、行动——',
  '他们会同时分析你的组织，交叉验证发现，',
  '标注出互相矛盾的结论。',
  '',
  '整个过程 10-15 分钟，结束后会持续监测你',
  '组织的关键指标。准备好了吗？',
  '',
  '先告诉我你的组织名称。',
].join('\n');

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
      // chcp 不可用（Windows Terminal / Git Bash 默认 UTF-8 环境，无需处理）
    }
  }

  let provider: ReturnType<typeof createProvider>;

  // ═══ Step 1: LLM 配置 ═══
  try {
    if (!isLLMConfigured()) {
      console.log('未检测到 LLM 配置，进入 Setup...');
      await runSetup();
    }

    provider = createProvider(detectProvider(), {
      apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY,
      gatewayHost: process.env.OPENCLAW_GATEWAY_HOST,
      baseUrl: process.env.LLM_BASE_URL,
    });

    // 验证连接
    const health = await provider.healthCheck();
    if (!health.healthy) {
      console.log(`\n${RED}⚠ LLM 连接失败: ${health.error}${RESET}`);
      console.log(`${YELLOW}将以离线模式启动——本体功能可用，诊断需要 LLM。${RESET}`);
      console.log(`${YELLOW}修复 Key 后重启: $env:LLM_API_KEY="sk-your-key"; npx tsx src/tui/chat.ts${RESET}\n`);
    } else {
      console.log(`${GREEN}✅ ${provider.name} 连接成功${RESET} (${health.latencyMs}ms)\n`);
    }
  } catch (err: any) {
    console.error(`${RED}Step 1 失败 (LLM 配置): ${err.message}${RESET}`);
    console.error(`${YELLOW}提示: 检查网络连接或 API Key 格式${RESET}`);
    process.exit(1);
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

  // ═══ Step 3: Welcome 过渡页 ═══
  // readline (runSetup) 关闭后需清理终端模式
  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode?.(false); } catch {}
    process.stdin.resume();
    await new Promise(r => setTimeout(r, 50));
  }

  let app: ReturnType<typeof createTuiApp>;
  try {
    // 先创建一个临时 screen 用于 Welcome 页
    const welcomeScreen = blessed.screen({
      title: 'Synova',
      smartCSR: true,
      fullUnicode: true,
      useBCE: true,
    });

    // 显示 Welcome 过渡页，等待用户按 Enter
    await showWelcome(welcomeScreen, {
      providerName: provider.name,
      model: process.env.LLM_MODEL || 'deepseek-v4-flash',
      workDir: process.cwd(),
    });

    // Enter 后在同一 screen 上构建 TUI 三栏布局
    app = createTuiApp(welcomeScreen);
    app.setTitleStatus(`准备就绪 · ${provider.name}`);

    // Slice C: ViewAdapter — ConversationEngine 通过此接口与 TUI 通信
    const viewAdapter = new TuiViewAdapter(app);

    // 启动时后台检查更新 (借鉴 Hermes banner prefetch)
    checkForUpdates().then((result) => {
      const msg = formatUpdateMessage(result);
      if (msg) {
        app.chat.addMessage('system', msg);
        app.screen.render();
      }
    }).catch(() => { /* 静默降级 */ });
  } catch (err: any) {
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
    0: { label: '组织访谈', required: true, maxDurationMs: 600_000 },
    1: { label: '数据采集', required: true, maxDurationMs: 120_000 },
    2: { label: '假设生成', required: true, maxDurationMs: 300_000 },
    3: { label: '根因分析', required: true, maxDurationMs: 180_000 },
    4: { label: '报告生成', required: true, maxDurationMs: 60_000 },
    5: { label: '交付', required: true, maxDurationMs: 120_000 },
  });
  const wiring = createOrchestrationWiring(eventBus, hookRunner, sessionManager, phaseStateMachine);

  // ═══ Step 4: 创建对话 ═══
  let conv: ConversationEngine;
  let sessionId: string;
  try {
    // TUI 始终以新会话开始——旧会话可查询但不自动恢复
    // （这与 CLI 不同：CLI 面向反复使用，TUI 面向单次深度诊断）
    // 铁律 39: 注入 DiagnosisEngine 适配器 — TUI 诊断链路
    const { ToolRegistry } = await import('../agent/tools');
    const { EngineCoreVendorAdapter } = await import('../adapters/engine-core-adapter');
    conv = new ConversationEngine(provider, {
      diagnosisEngine: new EngineCoreVendorAdapter(provider, new ToolRegistry()),
    });
    // Slice C: bind ViewAdapter for L1 decoupling
    // P1-02: ViewAdapter 为 L1 接口注入, conv 是 ConversationEngine 类型未导出该方法
    (conv as { setViewAdapter?: (a: ViewAdapter) => void }).setViewAdapter?.(viewAdapter);
    const s = store.createSession('default');
    sessionId = s.id;

    // 显示开场白
    app.chat.addMessage('agent', OPENING_MESSAGE);

    registerBuiltinTools(conv.getToolRegistry(), store, sessionId, () => conv.getPhase(), () => conv.getOrgId());
    app.side.setPhase(conv.getPhase());
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
      const response = await fetch(`http://localhost:${config.port}/api/ontology/graph/${conv.getOrgId() || 'default'}`);
      if (response.ok) {
        const data = await response.json() as { nodeCount?: number; nodes?: Array<{ type?: string }>; edges?: Array<{ type?: string }> };
        if (data.nodeCount > 0) {
          app.side.setOntologySummary({
            persons: data.nodes?.filter((n: any) => n.type === SOGNodeType.PERSON).length || 0,
            teams: data.nodes?.filter((n: any) => n.type === SOGNodeType.TEAM).length || 0,
            tools: data.nodes?.filter((n: any) => n.type === SOGNodeType.AGENT || n.type === SOGNodeType.TOOL).length || 0,
            edges: data.edgeCount || 0,
          });
        }
      }
    } catch (err: any) {
      log.warn({ err: err.message }, '[cron] 本体 API 未就绪，跳过本轮监测');
    }
  });
  log.info('Cron 监测已启动 (每5分钟检查本体图)');

  // 5. 对话循环
  let streaming = false;

  app.chat.onSubmit(async (input) => {
    if (streaming) {
      app.setTitleStatus('正在生成回复，请稍候...');
      app.screen.render();
      return;
    }
    streaming = true;

    try {
      // 命令
      if (input.startsWith('/')) {
        const cmd = input.toLowerCase();
        if (cmd === '/quit' || cmd === '/exit') {
          store.saveState(sessionId, conv.serialize());
          app.screen.destroy();
          process.exit(0);
        } else if (cmd === '/help') {
          app.chat.addMessage('system', '命令: /quit 退出 /status 状态 /history 历史 /search <词> 搜索 /upload <文件路径> 上传 /update 检查更新');
        } else if (cmd === '/status') {
          const n = conv.getMessages().filter(m => m.role === 'user').length;
          app.chat.addMessage('system', `Phase: ${conv.getPhase()}/5 | 消息: ${n} 条 | Provider: ${provider.name}`);
        } else if (cmd.startsWith('/history')) {
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
              const result = await ingestFile(filePath, conv.getOrgId() || 'default');
              app.chat.addMessage('system',
                `📄 ${result.fileType.toUpperCase()} · ${result.entityCount} 实体 · ${result.relationCount} 关系` +
                (result.sogCreated ? ' · ✅ 本体已更新' : ' · ⚠️ 基本提取') +
                (result.summary ? `\n预览: ${result.summary.slice(0, 150)}...` : ''));
            } catch (err: any) {
              app.chat.addMessage('alert', `文档解析失败: ${err.message}`);
            }
          }
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

      // 正常消息
      store.addMessage(sessionId, 'user', input);
      app.chat.addMessage('user', input);

      // 编排层: 每轮对话生成 traceId，串联后续事件
      const turnTraceId = `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

      app.setTitleStatus('诊断进行中');
      try {
        const result = await conv.processMessageStream(input, (token) => {
          app.chat.appendToken(token);
          app.screen.render();
        });

        // 编排层: 记录对话轮次事件
        eventBus.emit({
          id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,
          type: 'interview.answered',
          consultationId: sessionId, phase: conv.getPhase(),
          data: { role: conv.getOrgId() },
          traceId: turnTraceId, spanId: turnTraceId.slice(0, 16),
          timestamp: new Date().toISOString(),
        });

        // 流式内容已完成，作为完整消息添加
        app.chat.addMessage('agent', result.reply);
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

        app.side.setPhase(conv.getPhase());
        if (result.phaseComplete) {
          // 编排层: Phase 0 → Phase 1 事件
          wiring.emitPhaseCompleted(sessionId, 0, turnTraceId);
          wiring.advancePhase(sessionId, turnTraceId);
          app.setTitleStatus('诊断完成');
          app.chat.addMessage('system', '═══ Phase 0 完成，启动六阶段诊断 ═══');

          // Slice 5.1: SOG 本体同步 — 从访谈内容提取组织信息
          conv.startDiagnosis('管理者', conv.getOrgId() || '用户').then(() => {}); // fire-and-forget SOG sync
          app.side.setOntologySummary({ persons: 1, teams: 1, tools: 0, edges: 0 });

          // Slice 3.2: 自动启动诊断流水线
          app.setTitleStatus('Phase 1: 数据采集中...');
          app.side.setDiagnosisProgress(1, '数据采集', []);

          conv.startDiagnosis(
            '管理者',
            conv.getOrgId() || '用户',
            (event) => {
              // 实时推送诊断事件到侧边栏
              switch (event.type) {
                case 'phase_started':
                  app.setTitleStatus(`Phase ${event.phase}: ${event.label || '进行中...'}`);
                  app.side.setDiagnosisProgress(event.phase, event.label || '', []);
                  break;
                case 'module_completed':
                  if (event.findings) {
                    app.side.setDiagnosisProgress(
                      conv.getPhase(),
                      '',
                      event.findings.map(f => ({ moduleId: f.moduleId, text: f.summary })),
                    );
                  }
                  break;
                case 'phase_completed':
                  app.chat.addMessage('system', `✅ Phase ${event.phase} 完成`);
                  break;
                case 'complete':
                  app.setTitleStatus('诊断完成');
                  app.chat.addMessage('system', '📋 六阶段诊断已完成，查看侧边栏获取完整报告。');
                  break;
                case 'error':
                  app.chat.addMessage('alert', `⚠️ 诊断错误: ${event.message || '未知'}`);
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
              }, '诊断流水线完成');
              if (diagnosisResult.degradedModules.length > 0) {
                app.chat.addMessage('system',
                  `⚠️ 部分诊断模块降级: ${diagnosisResult.degradedModules.join(', ')}`);
              }
              app.side.setDiagnosisProgress(5, '完成', []);
            } else {
              app.chat.addMessage('alert', '⚠️ 诊断引擎不可用。请检查 engine-core 是否正确安装。');
            }
            app.setTitleStatus('准备就绪');
            app.screen.render();
          }).catch((err: any) => {
            log.error({ err }, '诊断流水线异常');
            app.chat.addMessage('alert', `诊断异常: ${err.message}`);
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
  (globalThis as { __synovaAlerts?: { addAlert: (a: SynovaAlert) => void } }).__synovaAlerts = {
    pushAlert(level: 'critical' | 'warning', title: string, data: string, suggestion: string) {
      app.side.pushAlert({ level, title, data, suggestion });
      app.flashTitle(true);
      setTimeout(() => app.flashTitle(false), 5000);
    },
  };

  app.chat.focus();

  // ═══ 7. Graceful shutdown (Slice 2.3: M5 fix) ═══
  const shutdown = (signal: string) => {
    log.info({ signal }, '收到信号，开始优雅关闭');
    store.saveState(sessionId, conv.serialize());
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

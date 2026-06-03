/**
 * cli.ts — SynovaAgent 终端对话 (Era 1.3+1.4)
 *
 * 完整的 Agent 对话循环 + 会话持久化 + 流式输出。
 * 用法: npx tsx src/cli.ts
 *
 * 流程:
 *   1. 检测 LLM → 未配置则 Setup 向导
 *   2. 显示历史会话 → 选择恢复或新建
 *   3. 对话循环 (流式 token 输出 + 每轮自动保存)
 *   4. Ctrl+C 中断生成但保留对话
 */
import * as readline from 'readline';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { createProvider } from './providers';
import { detectProvider } from './providers/detect';
import { isLLMConfigured, runSetup } from './setup';
import { AgentConversation } from './agent/conversation';
import { SessionStore } from './store/session-store';
import { registerBuiltinTools } from './agent/builtin-tools';
import type { LLMProvider } from './providers/types';
import { loadConfig } from './config';

const BOLD = '\x1b[1m'; const DIM = '\x1b[2m';
const GREEN = '\x1b[32m'; const RED = '\x1b[31m'; const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m'; const PURPLE = '\x1b[35m'; const BLUE = '\x1b[34m'; const RESET = '\x1b[0m';

let interrupted = false;

// ═══ Main ═══

async function main() {
  console.log('');
  console.log(`${PURPLE}${BOLD}  SynovaAgent${RESET} ${DIM}— 组织数字孪生诊断${RESET}`);
  console.log('');

  // 1. LLM 配置
  if (!isLLMConfigured()) {
    console.log(`${YELLOW}⚠️  未检测到 LLM 配置${RESET}`);
    await runSetup();
  }

  let provider: LLMProvider;
  try {
    provider = createProvider(detectProvider(), {
      apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY,
      gatewayHost: process.env.OPENCLAW_GATEWAY_HOST,
      baseUrl: process.env.LLM_BASE_URL,
    });
  } catch (err: any) {
    console.log(`${RED}Provider 创建失败: ${err.message}${RESET}`);
    process.exit(1);
  }

  // 验证连接
  const health = await provider.healthCheck();
  if (!health.healthy) {
    console.log(`${YELLOW}⚠ LLM 连接失败: ${health.error}${RESET}`);
    console.log(`${DIM}  以离线模式运行。修复 Key 后重启。${RESET}\n`);
  } else {
    console.log(`${GREEN}✅ ${provider.name} 连接成功${RESET} (${health.latencyMs}ms)\n`);
  }

  // 2. 初始化数据库 + 会话存储
  const config = loadConfig();
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  const store = new SessionStore(db);

  // 3. 显示历史会话
  const sessions = store.listSessions(5);
  let conv: AgentConversation;
  let sessionId: string;

  if (sessions.length > 0) {
    console.log(`${DIM}最近会话:${RESET}`);
    sessions.forEach((s, i) => {
      const date = new Date(s.updatedAt).toLocaleDateString('zh-CN');
      console.log(`  ${GREEN}${i + 1}.${RESET} ${s.orgId} ${DIM}(Phase ${s.phase}, ${date})${RESET}`);
    });
    console.log(`  ${GREEN}n.${RESET} 新建会话`);
    console.log('');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const choice = await new Promise<string>(r => rl.question(`${CYAN}选择 (n=新建):${RESET} `, r));
    rl.close();

    const idx = parseInt(choice) - 1;
    if (idx >= 0 && idx < sessions.length) {
      const state = store.loadState(sessions[idx].id);
      if (state) {
        conv = AgentConversation.fromState(provider, state);
        sessionId = sessions[idx].id;
        console.log(`${GREEN}✅ 恢复会话: ${state.orgId}${RESET} (Phase ${state.phase}, ${state.messages.length} 条消息)\n`);
        // 回放最近几条消息
        const msgs = state.messages.slice(-4);
        for (const m of msgs) {
          const label = m.role === 'user' ? `${GREEN}你:${RESET}` : `${PURPLE}Agent:${RESET}`;
          console.log(`${label} ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}`);
        }
        console.log('');
        registerBuiltinTools(conv.getToolRegistry(), store, sessionId, () => conv.getPhase(), () => conv.getOrgId());
        startChat(provider, store, conv, sessionId);
        return;
      }
    }
  }

  // 新建会话
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const orgName = await new Promise<string>(r => rl.question(`${CYAN}组织名称:${RESET} `, r));
  rl.close();

  conv = new AgentConversation(provider, { orgId: orgName || 'default' });
  const sess = store.createSession(orgName || 'default');
  sessionId = sess.id;
  store.saveState(sessionId, conv.serialize());
  registerBuiltinTools(conv.getToolRegistry(), store, sessionId, () => conv.getPhase(), () => conv.getOrgId());

  console.log('');
  startChat(provider, store, conv, sessionId);
}

// ═══ Chat Loop ═══

function startChat(provider: LLMProvider, store: SessionStore, conv: AgentConversation, sessionId: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const agentLabel = () => process.stdout.write(`\n${PURPLE}Agent:${RESET} `);
  const userLabel = () => process.stdout.write(`${GREEN}你:${RESET} `);

  // Agent 先开场（如果会话没有 user 消息）
  const userMsgs = conv.getMessages().filter(m => m.role === 'user');
  if (userMsgs.length === 0) {
    agentLabel();
    conv.processMessageStream('你好', (token) => process.stdout.write(token))
      .then(result => {
        process.stdout.write('\n');
        store.addMessage(sessionId, 'assistant', result.reply);
        store.saveState(sessionId, conv.serialize());
        userLabel();
      });
  } else {
    userLabel();
  }

  // Ctrl+C 中断生成但保留对话
  process.on('SIGINT', () => {
    if (interrupted) {
      console.log(`\n${DIM}再见。会话已保存。${RESET}\n`);
      rl.close(); process.exit(0);
    }
    interrupted = true;
    console.log(`\n${YELLOW}⏸ 生成已中断（再次 Ctrl+C 退出）${RESET}`);
    userLabel();
  });

  // 流式进度条（Phase 1-5）
  const showPhaseProgress = (phase: number, label: string) => {
    const bar = '█'.repeat(phase) + '░'.repeat(5 - phase);
    process.stdout.write(`\r${BLUE}[${bar}]${RESET} Phase ${phase}/5: ${label}`);
    if (phase === 5) process.stdout.write('\n');
  };

  rl.on('line', async (line) => {
    interrupted = false;
    const input = line.trim();
    if (!input) { userLabel(); return; }

    switch (input.toLowerCase()) {
      case '/quit': case '/exit':
        store.saveState(sessionId, conv.serialize());
        console.log(`${DIM}会话已保存。再见。${RESET}\n`);
        rl.close(); process.exit(0);
      case '/help':
        console.log(`${DIM}  /quit 退出  /status 状态  /history 历史  /search <关键词> 搜索${RESET}`);
        userLabel(); return;
      case '/status':
        const msgs = conv.getMessages();
        console.log(`${DIM}  组织: ${conv.getOrgId()} | Phase: ${conv.getPhase()} | 消息: ${msgs.length} 条${RESET}`);
        userLabel(); return;
      case '/history':
        const allMsgs = conv.getMessages().filter(m => m.role !== 'system');
        allMsgs.slice(-10).forEach(m => {
          const label = m.role === 'user' ? `${GREEN}你${RESET}` : `${PURPLE}Agent${RESET}`;
          console.log(`${DIM}  ${label}: ${m.content.slice(0, 80)}${m.content.length > 80 ? '...' : ''}${RESET}`);
        });
        userLabel(); return;
    }

    if (input.startsWith('/search ')) {
      const query = input.slice(8).trim();
      const results = store.search(query, 5);
      if (results.length === 0) {
        console.log(`${DIM}  无匹配结果${RESET}`);
      } else {
        results.forEach(r => {
          console.log(`${DIM}  ${r.orgId}: ${r.snippet.replace(/<mark>/g, YELLOW).replace(/<\/mark>/g, RESET + DIM)}${RESET}`);
        });
      }
      userLabel(); return;
    }

    // 保存用户消息
    store.addMessage(sessionId, 'user', input);

    // Phase 检测——如果推进到 Phase 1+，显示进度
    if (conv.getPhase() >= 1) {
      showPhaseProgress(conv.getPhase(), conv.getPhase() === 1 ? '数据采集' :
        conv.getPhase() === 2 ? '假设生成' : conv.getPhase() === 3 ? '根因分析' :
        conv.getPhase() === 4 ? '报告生成' : '交付');
    }

    // 流式输出 Agent 回复
    agentLabel();
    try {
      const result = await conv.processMessageStream(input, (token) => {
        if (!interrupted) process.stdout.write(token);
      });

      process.stdout.write('\n');

      // 保存
      store.addMessage(sessionId, 'assistant', result.reply);
      store.updateSession(sessionId, { phase: conv.getPhase() });
      store.saveState(sessionId, conv.serialize());

      if (result.phaseComplete) {
        console.log(`\n${YELLOW}${BOLD}  ═══ Phase 0 完成，诊断就绪 ═══${RESET}`);
        console.log(`${DIM}  当前为演示模式。真实诊断需配置 LLM Key 并连接诊断引擎。${RESET}\n`);
      }
    } catch (err: any) {
      if (!interrupted) {
        console.log(`\n${RED}  ❌ ${err.message}${RESET}`);
      }
      console.log('');
    } finally {
      interrupted = false;
      userLabel();
    }
  });

  rl.on('close', () => {
    store.saveState(sessionId, conv.serialize());
    console.log(`\n${DIM}会话已保存。${RESET}\n`);
    process.exit(0);
  });
}

// ═══ Helpers ═══

main().catch((err) => {
  console.error(`${RED}Fatal: ${err.message}${RESET}`);
  process.exit(1);
});

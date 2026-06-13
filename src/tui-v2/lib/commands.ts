/**
 * tui-v2/lib/commands.ts — 命令处理逻辑
 * @state: real — 5个斜杠命令全部接线，生产可用
 *
 * 从 chat.tsx 提取的斜杠命令处理：
 * - /setup, /model, /help, /quit, /exit
 * - /think, /budget, /status, /history
 * - /update, /upload, /search, /effort
 */

import * as path from 'path';
import * as fs from 'fs';
import { createProvider } from '../../providers';
import { SessionStore } from '../../store/session-store';
import { getCostTracker, formatCost } from '../../services/llm-cost';
import { checkForUpdates, formatUpdateMessage, getCurrentVersion, type UpdateCheckResult } from '../../services/update-checker';
import type Database from 'better-sqlite3';

export interface CommandContext {
  sessionId: string;
  db: Database.Database;
  store: SessionStore;
  convRef: { current: any };
  currentProvider: ReturnType<typeof createProvider> | undefined;
  addSystemMessage: (text: string) => void;
  addAgentMessage: (text: string) => void;
  addAlertMessage: (text: string) => void;
  setSetupState: (state: null | 'awaiting_key') => void;
  setStreaming: (v: boolean) => void;
  setStatus: (status: string) => void;
  setCurrentProvider: (p: ReturnType<typeof createProvider>) => void;
  setLlmHealthy: (v: boolean) => void;
  initConversationEngine: (prov: ReturnType<typeof createProvider>) => Promise<boolean>;
  exit: () => void;
  getGlobalScheduler: (db: Database.Database) => { stop: () => void };
}

export type CommandResult = { handled: true; streaming?: boolean } | { handled: false };

export async function handleCommand(input: string, ctx: CommandContext): Promise<CommandResult> {
  if (!input.startsWith('/')) return { handled: false };

  const cmd = input.toLowerCase();

  // /quit /exit
  if (cmd === '/quit' || cmd === '/exit') {
    if (ctx.convRef.current) ctx.store.saveState(ctx.sessionId, ctx.convRef.current.serialize());
    const scheduler = ctx.getGlobalScheduler(ctx.db);
    scheduler.stop();
    try { ctx.db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* WAL checkpoint 不可用 — 非阻塞 */ }
    ctx.db.close();
    ctx.exit();
    return { handled: true };
  }

  // /think
  if (cmd === '/think') {
    const { renderThoughtExpanded, hasThought } = await import('./thinking');
    if (hasThought()) {
      ctx.addSystemMessage(renderThoughtExpanded());
    } else {
      ctx.addSystemMessage('暂无思考内容。');
    }
    return { handled: true };
  }

  // /budget
  if (cmd === '/budget' || cmd.startsWith('/budget ')) {
    const tracker = getCostTracker();
    const amount = parseFloat(input.slice(8).trim());
    if (!amount || amount <= 0) {
      ctx.addSystemMessage(`当前预算上限: ¥${tracker.budgetRemaining.toFixed(2)}\n本次费用: ${formatCost(tracker.sessionCost)}\n用法: /budget <金额> 设置上限`);
    } else {
      process.env.LLM_BUDGET = String(amount);
      ctx.addSystemMessage(`✅ 预算上限已设为 ¥${amount}`);
    }
    return { handled: true };
  }

  // /balance — 刷新 DeepSeek 余额
  if (cmd === '/balance') {
    ctx.setStatus('正在查询余额...');
    try {
      const { fetchDeepseekBalance, formatBalance } = await import('../../services/deepseek-balance');
      const b = await fetchDeepseekBalance();
      if (b) {
        ctx.addSystemMessage(`💰 DeepSeek 账户余额: ${formatBalance(b)}\n(上次更新: ${new Date(b.fetchedAt).toLocaleTimeString()})`);
      } else {
        ctx.addSystemMessage('⚠️ 无法获取余额。请确认 LLM_API_KEY 已配置。');
      }
    } catch (err: any) {
      ctx.addAlertMessage(`余额查询失败: ${err.message}`);
    }
    ctx.setStatus('准备就绪');
    return { handled: true };
  }

  // /help
  if (cmd === '/help') {
    ctx.addSystemMessage('命令: /setup 配置 LLM /model 切换模型 /balance 余额 /think 展开思考 /quit 退出 /status 状态 /search <词> 搜索 /effort off|high|max /budget <金额> /upload <路径> /update 检查更新');
    return { handled: true };
  }

  // /status
  if (cmd === '/status') {
    if (ctx.convRef.current && ctx.currentProvider) {
      const n = ctx.convRef.current.getMessages().filter((m: any) => m.role === 'user').length;
      ctx.addSystemMessage(`Phase: ${ctx.convRef.current.getPhase()}/5 | 消息: ${n} 条 | Provider: ${ctx.currentProvider.name}`);
    } else {
      ctx.addSystemMessage('LLM 未配置 — 输入 /setup 配置后即可开始增长导航');
    }
    return { handled: true };
  }

  // /history
  if (cmd.startsWith('/history')) {
    if (!ctx.convRef.current) { ctx.addSystemMessage('暂无对话历史'); return { handled: true }; }
    const msgs = ctx.convRef.current.getMessages().filter((m: any) => m.role !== 'system').slice(-6);
    for (const m of msgs) {
      ctx.addSystemMessage(`${m.role === 'user' ? '用户' : 'Agent'}: ${m.content.slice(0, 120)}`);
    }
    return { handled: true };
  }

  // /update
  if (cmd === '/update' || cmd === '/update check') {
    ctx.addSystemMessage(`当前版本: ${getCurrentVersion()} · 正在检查更新...`);
    checkForUpdates().then((result: UpdateCheckResult) => {
      const msg = formatUpdateMessage(result);
      if (msg) ctx.addSystemMessage(msg);
      else ctx.addSystemMessage(`✅ 已是最新版本 (${result.currentVersion})`);
    }).catch((err: Error) => {
      ctx.addAlertMessage(`更新检查失败: ${err.message}`);
    });
    return { handled: true };
  }

  // /upload
  if (cmd.startsWith('/upload ')) {
    const filePath = input.slice(8).trim();
    if (!filePath) {
      ctx.addSystemMessage('用法: /upload <文件路径>  — 支持 PDF/DOCX/XLSX/TXT');
    } else {
      ctx.setStatus('正在解析文档...');
      try {
        const { ingestFile } = await import('../../ingest/index');
        const result = await ingestFile(filePath, ctx.convRef.current?.getOrgId() || 'default');
        ctx.addSystemMessage(
          `📄 ${result.fileType.toUpperCase()} · ${result.entityCount} 实体 · ${result.relationCount} 关系` +
          (result.sogCreated ? ' · ✅ 本体已更新' : ' · ⚠️ 基本提取') +
          (result.summary ? `\n预览: ${result.summary.slice(0, 150)}...` : '')
        );
      } catch (err: any) {
        ctx.addAlertMessage(`文档解析失败: ${err.message}`);
      }
    }
    return { handled: true };
  }

  // /setup
  if (cmd === '/setup') {
    ctx.setSetupState('awaiting_key');
    ctx.addSystemMessage('请输入 DeepSeek API Key：');
    return { handled: true, streaming: false };
  }

  // /model
  if (cmd === '/model' || cmd.startsWith('/model ')) {
    const newModel = input.slice(7).trim();
    if (!newModel) {
      ctx.addSystemMessage(`当前模型: ${process.env.LLM_MODEL || 'deepseek-v4-flash'}\n用法: /model <模型名称>\n例: /model deepseek-v4-pro`);
    } else {
      process.env.LLM_MODEL = newModel;
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf-8');
        if (content.includes('LLM_MODEL=')) content = content.replace(/LLM_MODEL=.*/g, `LLM_MODEL=${newModel}`);
        else content += `\nLLM_MODEL=${newModel}\n`;
        fs.writeFileSync(envPath, content);
      }
      ctx.addSystemMessage(`✅ 模型已切换为 ${newModel}。重启 TUI 生效。`);
    }
    return { handled: true };
  }

  // /effort
  if (cmd === '/effort' || cmd.startsWith('/effort ')) {
    const level = input.slice(8).trim() || '';
    if (!level || !['off', 'high', 'max'].includes(level)) {
      ctx.addSystemMessage(`当前推理强度: ${process.env.REASONING_EFFORT || '默认'}\n用法: /effort off|high|max\n  off  — 无推理，快速响应（省钱）\n  high — 深度推理（复杂分析）\n  max  — 最强推理（战略决策）`);
    } else {
      process.env.REASONING_EFFORT = level;
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf-8');
        if (content.includes('REASONING_EFFORT=')) content = content.replace(/REASONING_EFFORT=.*/g, `REASONING_EFFORT=${level}`);
        else content += `\nREASONING_EFFORT=${level}\n`;
        fs.writeFileSync(envPath, content);
      }
      ctx.addSystemMessage(`✅ 推理强度已设为 ${level}。`);
    }
    return { handled: true };
  }

  // /search
  if (cmd.startsWith('/search ')) {
    const q = input.slice(8).trim();
    const results = ctx.store.search(q, 5);
    if (results.length === 0) {
      ctx.addSystemMessage('无匹配结果');
    } else {
      for (const r of results) {
        ctx.addSystemMessage(`${r.orgId}: ${r.snippet}`);
      }
    }
    return { handled: true };
  }

  // 未知命令
  ctx.addSystemMessage(`未知命令: ${input}\n输入 /help 查看可用命令`);
  return { handled: true };
}

// ═══ Key 配置 ═══

const OPENING_MESSAGE = '你好！我是 Synova 增长导航助手。\n\n我能帮助你：\n- 设定增长目标\n- 发现增长障碍\n- 协调 AI 专家分析\n- 生成诊断报告';

export async function tryConfigureKey(rawKey: string, ctx: CommandContext): Promise<boolean> {
  let apiKey = rawKey.trim();
  const asciiKey = apiKey.replace(/[^\x20-\x7E]/g, '');
  if (asciiKey !== apiKey) {
    ctx.addSystemMessage('⚠️ 检测到全角字符已自动过滤。');
    apiKey = asciiKey;
  }
  if (!apiKey) {
    ctx.addSystemMessage('请输入 DeepSeek API Key：');
    return false;
  }
  const masked = apiKey.length > 12
    ? apiKey.slice(0, 6) + '****' + apiKey.slice(-4)
    : apiKey.slice(0, 4) + '****';
  ctx.addSystemMessage(`Key: ${masked}\n正在测试连接...`);
  ctx.setStatus('测试连接中...');

  try {
    const model = 'deepseek-v4-flash';
    const testProvider = createProvider('deepseek', { apiKey });
    const health = await testProvider.healthCheck();
    if (health.healthy) {
      ctx.setCurrentProvider(testProvider);
      ctx.setLlmHealthy(true);
      process.env.LLM_API_KEY = apiKey;
      process.env.LLM_MODEL = model;
      const ok = await ctx.initConversationEngine(testProvider);
      if (ok) {
        ctx.addSystemMessage(`✅ 连接成功！DeepSeek · ${model} (${health.latencyMs}ms)\n💡 永久保存请运行 PowerShell:\n   [Environment]::SetEnvironmentVariable('LLM_API_KEY', '<key>', 'User')\n切换模型: /model deepseek-v4-pro`);
        ctx.setStatus('准备就绪 · DeepSeek');
        if (!ctx.convRef.current) ctx.addAgentMessage(OPENING_MESSAGE);
      } else {
        ctx.addAlertMessage('⚠️ 连接成功但引擎初始化失败，请重启 TUI');
      }
      ctx.setSetupState(null);
      return ok;
    } else {
      ctx.addAlertMessage(`❌ 连接失败: ${health.error}\n请重新输入 DeepSeek API Key：`);
      return false;
    }
  } catch (err: any) {
    ctx.addAlertMessage(`❌ 配置失败: ${err.message}\n请重新输入：`);
    return false;
  }
}

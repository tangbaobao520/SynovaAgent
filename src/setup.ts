/**
 * setup.ts — 交互式终端 Setup 向导 (Era 1.1)
 *
 * 首次启动检测无 LLM 配置 → 自动引导用户选择 Provider → 输入 Key → 测试连接 → 写入 .env
 *
 * 对标 Hermes `hermes setup` 的交互体验，但适配我们的场景:
 *   - 3 个 Provider (DeepSeek / OpenAI-compatible / Gateway)
 *   - 实时连接测试
 *   - .env 持久化 + 当前会话立即生效
 */
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { createProvider, listProviderTypes, type ProviderType } from './providers';
import type { LLMProvider } from './providers/types';

const BOLD = '\x1b[1m'; const DIM = '\x1b[2m';
const GREEN = '\x1b[32m'; const RED = '\x1b[31m'; const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m'; const RESET = '\x1b[0m';

export interface SetupResult {
  providerType: ProviderType;
  apiKey: string;
  baseUrl?: string;
  gatewayHost?: string;
  model?: string;
  provider: LLMProvider;
}

/** 检测是否已配置 LLM */
export function isLLMConfigured(): boolean {
  return !!(process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENCLAW_GATEWAY_HOST);
}

/** 运行交互式 Setup */
export async function runSetup(): Promise<SetupResult> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (q: string): Promise<string> => new Promise(r => rl.question(q, r));

  console.log('');
  console.log(`${BOLD}${CYAN}  ═══ SynovaAgent Setup ═══${RESET}`);
  console.log(`${DIM}  配置 LLM Provider 以启用诊断对话能力${RESET}`);
  console.log('');

  // Step 1: 选择 Provider
  const providers = listProviderTypes();
  console.log(`${BOLD}选择 LLM Provider:${RESET}`);
  providers.forEach((p, i) => console.log(`  ${GREEN}${i + 1}.${RESET} ${p.label}`));
  console.log('');

  let choice: number;
  while (true) {
    const input = await question(`${CYAN}输入数字 (1-${providers.length}):${RESET} `);
    choice = parseInt(input);
    if (choice >= 1 && choice <= providers.length) break;
    console.log(`${RED}请输入 1-${providers.length}${RESET}`);
  }
  const selected = providers[choice - 1];

  // Step 2: 输入 API Key / Gateway Host
  let apiKey = '', gatewayHost = '', baseUrl = '';
  if (selected.type === 'gateway') {
    gatewayHost = await question(`${CYAN}Gateway 地址 (默认 http://127.0.0.1:18789):${RESET} `);
    if (!gatewayHost) gatewayHost = 'http://127.0.0.1:18789';
  } else {
    apiKey = await question(`${CYAN}API Key:${RESET} `);
    if (!apiKey.trim()) {
      console.log(`${YELLOW}⚠️  未输入 API Key。诊断功能将不可用，可稍后设置。${RESET}`);
    }
    if (selected.type === 'openai') {
      baseUrl = await question(`${CYAN}Base URL (默认 https://api.openai.com/v1):${RESET} `);
    }
  }

  // Step 3: 测试连接
  console.log(`\n${DIM}测试连接...${RESET}`);
  const provider = createProvider(selected.type, {
    apiKey: apiKey.trim() || undefined,
    gatewayHost: gatewayHost || undefined,
    baseUrl: baseUrl || undefined,
  });

  const health = await provider.healthCheck();
  if (health.healthy) {
    console.log(`${GREEN}✅ 连接成功!${RESET} (延迟: ${health.latencyMs}ms)`);
  } else {
    console.log(`${RED}❌ 连接失败: ${health.error}${RESET}`);
    console.log(`${YELLOW}将继续保存配置，你可以稍后修正。${RESET}`);
  }

  // Step 4: 写入 .env
  const envPath = path.resolve(process.cwd(), '.env');
  const envLines: string[] = [];
  if (fs.existsSync(envPath)) {
    // 保留已有配置，只更新 LLM 相关
    const existing = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of existing) {
      if (!line.startsWith('LLM_') && !line.startsWith('DEEPSEEK_') && !line.startsWith('OPENCLAW_') && !line.startsWith('OPENAI_')) {
        envLines.push(line);
      }
    }
  }
  if (selected.type === 'gateway') {
    if (gatewayHost) envLines.push(`OPENCLAW_GATEWAY_HOST=${gatewayHost}`);
  } else if (selected.type === 'openai') {
    if (apiKey.trim()) envLines.push(`LLM_API_KEY=${apiKey.trim()}`);
    if (baseUrl) envLines.push(`LLM_BASE_URL=${baseUrl}`);
  } else {
    if (apiKey.trim()) envLines.push(`LLM_API_KEY=${apiKey.trim()}`);
  }
  envLines.push(`# SynovaAgent Provider: ${selected.type}`);
  try {
    fs.writeFileSync(envPath, envLines.filter(l => l.trim()).join('\n') + '\n');
  } catch (err: any) {
    console.log(`${RED}❌ 配置写入失败: ${err.message}${RESET}`);
    console.log(`${YELLOW}配置仅在本会话生效，重启后需重新设置。${RESET}`);
  }

  // 写入当前会话（仅非空值）
  if (apiKey.trim()) process.env.LLM_API_KEY = apiKey.trim();
  if (gatewayHost) process.env.OPENCLAW_GATEWAY_HOST = gatewayHost;
  if (baseUrl) process.env.LLM_BASE_URL = baseUrl;

  console.log(`${GREEN}✅ 配置已保存到 ${envPath}${RESET}`);
  console.log('');
  rl.close();

  return {
    providerType: selected.type,
    apiKey: apiKey.trim(),
    baseUrl: baseUrl || undefined,
    gatewayHost: gatewayHost || undefined,
    provider,
  };
}

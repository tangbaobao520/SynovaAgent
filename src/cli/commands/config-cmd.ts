/**
 * cli/commands/config-cmd.ts — config 子命令 (Era C6)
 *
 * synova config show | set <key> <value> | rollback
 *
 * 铁律 39: L1 交互层 — 读取/修改配置文件。
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CLICommand } from '../types';

const CONFIG_PATH = () => join(process.cwd(), 'synova.json');
const LAST_GOOD_PATH = () => CONFIG_PATH() + '.last-good';

export function createConfigCommand(): CLICommand {
  return {
    name: 'config',
    description: '管理系统配置 (show/set/rollback)',
    subcommands: ['show', 'set', 'rollback'],
    async handler(args: string[]) {
      const sub = args[0];

      if (!sub || sub === '--help') {
        console.log(`
用法: synova config <子命令> [参数]

子命令:
  show                   显示当前完整配置
  set <key> <value>     修改配置项 (用 . 分隔路径, 如 server.port 3000)
  rollback              回滚到 last-good 配置

示例:
  synova config show
  synova config set server.port 8080
  synova config set llm.model deepseek-chat
  synova config rollback
`);
        return;
      }

      switch (sub) {
        case 'show':
          await showConfig();
          break;
        case 'set':
          if (!args[1] || !args[2]) {
            console.error('用法: synova config set <key> <value>');
            return;
          }
          await setConfig(args[1], args[2]);
          break;
        case 'rollback':
          await rollback();
          break;
        default:
          console.error(`未知子命令: ${sub}`);
      }
    },
  };
}

async function showConfig(): Promise<void> {
  if (!existsSync(CONFIG_PATH())) {
    console.log('\n⚠️  synova.json 不存在, 使用默认配置。');
    return;
  }
  const content = readFileSync(CONFIG_PATH(), 'utf-8');
  try {
    const parsed = JSON.parse(content);
    console.log('\n当前配置:');
    console.log(JSON.stringify(parsed, null, 2));

    // 检查 last-good
    if (existsSync(LAST_GOOD_PATH())) {
      console.log('\n✅ 存在 last-good 备份, 可用 config rollback 回滚。');
    }
  } catch {
    console.log('\n⚠️  synova.json 格式无效。');
    if (existsSync(LAST_GOOD_PATH())) {
      console.log('运行 synova config rollback 回滚到 last-good。');
    }
  }
}

async function setConfig(key: string, value: string): Promise<void> {
  if (!existsSync(CONFIG_PATH())) {
    console.error('synova.json 不存在, 创建默认配置...');
    const { DEFAULT_CONFIG: DC } = await import('../../config-file');
    writeFileSync(CONFIG_PATH(), JSON.stringify(DC, null, 2));
  }

  const content = readFileSync(CONFIG_PATH(), 'utf-8');
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(content);
  } catch {
    console.error('配置文件损坏, 请先修复或回滚。');
    return;
  }

  // 备份
  writeFileSync(LAST_GOOD_PATH(), JSON.stringify(config, null, 2));

  // 解析 key (如 server.port)
  const keys = key.split('.');
  let current: any = config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) current[keys[i]] = {};
    current = current[keys[i]];
  }

  // 转换 value 类型
  const lastKey = keys[keys.length - 1];
  const existing = current[lastKey];
  let typedValue: any = value;
  if (typeof existing === 'number') typedValue = Number(value);
  else if (typeof existing === 'boolean') typedValue = value === 'true' || value === '1';
  else if (typeof existing === 'object' && existing !== null) {
    try { typedValue = JSON.parse(value); } catch { /* 保留字符串 */ }
  }

  current[lastKey] = typedValue;
  writeFileSync(CONFIG_PATH(), JSON.stringify(config, null, 2));
  console.log(`✅ config.${key} = ${JSON.stringify(typedValue)}`);
}

async function rollback(): Promise<void> {
  if (!existsSync(LAST_GOOD_PATH())) {
    console.error('没有可回滚的 last-good 配置。');
    return;
  }

  try {
    const content = readFileSync(LAST_GOOD_PATH(), 'utf-8');
    JSON.parse(content); // 验证格式
    writeFileSync(CONFIG_PATH(), content);
    console.log('✅ 已回滚到 last-good 配置。');
  } catch {
    console.error('last-good 配置损坏, 无法回滚。');
  }
}

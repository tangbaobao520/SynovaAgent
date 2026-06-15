/**
 * cli/commands/measurer.ts — measurer 子命令 (Era C6)
 *
 * synova measurer list | show <id> | set-threshold <id> <value>
 *
 * 铁律 39: L1 交互层 — 读测量器配置。
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { CLICommand } from '../types';

const MEASURER_DIR = () => join(process.cwd(), 'measurers');

export function createMeasurerCommand(): CLICommand {
  return {
    name: 'measurer',
    description: '管理诊断测量器 (list/show/set-threshold)',
    subcommands: ['list', 'show', 'set-threshold'],
    async handler(args: string[]) {
      const sub = args[0];

      if (!sub || sub === '--help') {
        console.log(`
用法: synova measurer <子命令> [参数]

子命令:
  list                    列出所有测量器
  show <id>               查看某测量器的配置
  set-threshold <id> <n>  设置阈值 (0-1)

说明:
  - 测量器配置文件在 measurers/ 目录下
  - 每个测量器是 YAML 格式的配置文件
`);
        return;
      }

      switch (sub) {
        case 'list':
          await listMeasurers();
          break;
        case 'show':
          if (!args[1]) { console.error('请指定测量器 ID: synova measurer show <id>'); return; }
          await showMeasurer(args[1]);
          break;
        case 'set-threshold':
          if (!args[1] || !args[2]) {
            console.error('用法: synova measurer set-threshold <id> <value>');
            return;
          }
          const value = parseFloat(args[2]);
          if (isNaN(value) || value < 0 || value > 1) {
            console.error('阈值必须在 0-1 之间');
            return;
          }
          await setThreshold(args[1], value);
          break;
        default:
          console.error(`未知子命令: ${sub}`);
      }
    },
  };
}

async function listMeasurers(): Promise<void> {
  if (!existsSync(MEASURER_DIR())) {
    console.log('\n⚠️  measurers/ 目录不存在，尚未配置测量器。');
    return;
  }

  console.log('\n已注册的测量器:');
  const files = readdirSync(MEASURER_DIR()).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  for (const file of files) {
    try {
      const content = readFileSync(join(MEASURER_DIR(), file), 'utf-8');
      const dimMatch = content.match(/dimension:\s*(.+)/);
      const freqMatch = content.match(/frequency:\s*(.+)/);
      const thresholdMatch = content.match(/threshold:\s*([\d.]+)/);
      console.log(`  📊 ${file}`);
      if (dimMatch) console.log(`     维度: ${dimMatch[1].trim()}`);
      if (freqMatch) console.log(`     频率: ${freqMatch[1].trim()}`);
      if (thresholdMatch) console.log(`     阈值: ${thresholdMatch[1].trim()}`);
    } catch {
      console.log(`  ⚠️  ${file} (读取失败)`);
    }
  }
}

async function showMeasurer(id: string): Promise<void> {
  const path = join(MEASURER_DIR(), id.endsWith('.yml') ? id : `${id}.yml`);
  if (!existsSync(path)) {
    console.error(`测量器 "${id}" 不存在。`);
    return;
  }
  const content = readFileSync(path, 'utf-8');
  console.log(`\n${id}:\n`);
  console.log(content);
}

async function setThreshold(id: string, value: number): Promise<void> {
  const path = join(MEASURER_DIR(), id.endsWith('.yml') ? id : `${id}.yml`);
  if (!existsSync(path)) {
    console.error(`测量器 "${id}" 不存在。`);
    return;
  }

  const content = readFileSync(path, 'utf-8');
  const updated = content.replace(/threshold:\s*[\d.]+/, `threshold: ${value}`);
  if (updated === content) {
    console.error(`测量器 "${id}" 中未找到 threshold 字段。`);
    return;
  }
  writeFileSync(path, updated);
  console.log(`✅ 测量器 "${id}" 阈值已设为 ${value}`);
}

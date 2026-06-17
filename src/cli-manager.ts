/**
 * cli-manager.ts — CLI 管理体系入口 (Era C6)
 *
 * synova 命令行工具, 覆盖 expert/measurer/knowledge/config 子命令。
 * 对标: OpenClaw 的 60+ 子命令 CLI
 *
 * 零外部依赖: 用 process.argv 手动解析。
 * 铁律 39: L1 交互层 — 不直接操作 L3/L4/L5。
 */

import { fileURLToPath } from 'node:url';
import { createLogger } from './logger';
import { createExpertCommand } from './cli/commands/expert';
import { createMeasurerCommand } from './cli/commands/measurer';
import { createKnowledgeCommand } from './cli/commands/knowledge';
import { createConfigCommand } from './cli/commands/config-cmd';
import type { CLICommand } from './cli/types';

const log = createLogger('cli/manager');

export type { CLICommand };

// ═══ CLIManager ═══

export class CLIManager {
  private commands = new Map<string, CLICommand>();

  /** 注册一个顶级命令 */
  register(command: CLICommand): void {
    if (this.commands.has(command.name)) {
      log.warn({ name: command.name }, '命令重复注册, 覆盖旧值');
    }
    this.commands.set(command.name, command);
  }

  /** 解析并执行命令行参数 */
  async execute(argv: string[]): Promise<void> {
    const args = argv.slice(2); // 去掉 node 和脚本路径

    if (args.length === 0 || args[0] === '--help' || args[0] === 'help') {
      this.printHelp();
      return;
    }

    const cmdName = args[0];
    const command = this.commands.get(cmdName);

    if (!command) {
      console.error(`未知命令: ${cmdName}`);
      console.error(`运行 synova --help 查看可用命令`);
      process.exit(1);
    }

    try {
      await command.handler(args.slice(1));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`命令执行失败: ${msg}`);
      process.exit(1);
    }
  }

  /** 打印帮助信息 */
  printHelp(): void {
    console.log(`
╔══════════════════════════════════════════╗
║  Synova CLI — 组织诊断管理工具           ║
╚══════════════════════════════════════════╝

用法: synova <command> [subcommand] [options]

命令:
${Array.from(this.commands.values())
  .map(c => `  ${c.name.padEnd(20)} ${c.description}`)
  .join('\n')}

运行 synova <command> --help 查看子命令详情.
`);
  }
}

// ═══ Main Entry (if run directly) ═══

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const manager = new CLIManager();
  registerDefaultCommands(manager);
  manager.execute(process.argv).catch(err => {
    console.error('CLI 异常:', err);
    process.exit(1);
  });
}

// ═══ Command Registration ═══

export function registerDefaultCommands(manager: CLIManager): void {
  manager.register(createExpertCommand());
  manager.register(createMeasurerCommand());
  manager.register(createKnowledgeCommand());
  manager.register(createConfigCommand());
  manager.register(createStatusCommand());
  manager.register(createReloadCommand());
}

// ═══ Built-in Commands ═══

function createStatusCommand(): CLICommand {
  return {
    name: 'status',
    description: '显示系统状态 (预算/上下文/哨兵/专家)',
    subcommands: [],
    async handler(_args: string[]) {
      const { loadConfig: loadCfg } = await import('./config');
      const config = loadCfg();
      const port = config.port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/status/budget`);
        const result = await res.json() as Record<string, unknown>;
        console.log('\n系统状态:');
        console.log(`  预算消耗: ${result.totalSpent ?? 'N/A'} tokens`);
        console.log(`  调用次数: ${result.callCount ?? 'N/A'}`);
        console.log(`  缓存命中率: ${((result.cacheHitRate as number) * 100).toFixed(1)}%`);
        console.log(`  消耗速率: ${((result.burnRate as number) ?? 0).toFixed(0)} tokens/min`);
        if (result.degraded) console.log('  ⚠️  预算追踪器未初始化 (degraded 模式)');
      } catch {
        console.log('\n⚠️  无法连接到 Synova 服务器 (127.0.0.1:' + port + ')');
        console.log('  确保服务器正在运行。');
      }
    },
  };
}

function createReloadCommand(): CLICommand {
  return {
    name: 'reload',
    description: '热加载配置 (等价于 POST /api/reload)',
    subcommands: [],
    async handler(_args: string[]) {
      const { loadConfig: loadCfg } = await import('./config');
      const config = loadCfg();
      const port = config.port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/reload`, { method: 'POST' });
        const result = await res.json() as Record<string, unknown>;
        if (result.ok) {
          console.log('✅ 配置已热加载');
        } else {
          console.log('⚠️  热加载返回异常:', result.message || '未知错误');
        }
      } catch {
        console.log('⚠️  无法连接到 Synova 服务器, 确保服务器正在运行。');
      }
    },
  };
}

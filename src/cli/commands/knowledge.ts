/**
 * cli/commands/knowledge.ts — knowledge 子命令 (Era C6)
 *
 * synova knowledge add <industry> <file> | list
 *
 * 铁律 39: L1 交互层 — 管理知识文件。
 */

import { existsSync, writeFileSync, readFileSync, readdirSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';
import type { CLICommand } from '../types';

const KNOWLEDGE_DIR = () => join(process.cwd(), 'knowledge');

export function createKnowledgeCommand(): CLICommand {
  return {
    name: 'knowledge',
    description: '管理行业知识文件 (add/list)',
    subcommands: ['add', 'list'],
    async handler(args: string[]) {
      const sub = args[0];

      if (!sub || sub === '--help') {
        console.log(`
用法: synova knowledge <子命令> [参数]

子命令:
  add <industry> <file>  添加行业知识文件 (复制到 knowledge/{industry}/)
  list                   列出所有行业知识

示例:
  synova knowledge add 月子中心 ./report.md
  synova knowledge list
`);
        return;
      }

      switch (sub) {
        case 'add':
          if (!args[1] || !args[2]) {
            console.error('用法: synova knowledge add <industry> <file>');
            return;
          }
          await addKnowledge(args[1], args[2]);
          break;
        case 'list':
          await listKnowledge();
          break;
        default:
          console.error(`未知子命令: ${sub}`);
      }
    },
  };
}

async function addKnowledge(industry: string, filePath: string): Promise<void> {
  const source = join(process.cwd(), filePath);
  if (!existsSync(source)) {
    console.error(`文件不存在: ${filePath}`);
    return;
  }

  const targetDir = join(KNOWLEDGE_DIR(), industry);
  mkdirSync(targetDir, { recursive: true });

  const fileName = filePath.split(/[/\\]/).pop() || 'knowledge.md';
  copyFileSync(source, join(targetDir, fileName));
  console.log(`✅ 已添加知识文件到 knowledge/${industry}/${fileName}`);
}

async function listKnowledge(): Promise<void> {
  if (!existsSync(KNOWLEDGE_DIR())) {
    console.log('\n⚠️  knowledge/ 目录不存在。');
    console.log('运行 synova knowledge add <industry> <file> 添加。');
    return;
  }

  console.log('\n行业知识:');
  const industries = readdirSync(KNOWLEDGE_DIR(), { withFileTypes: true });
  let found = false;
  for (const entry of industries) {
    if (entry.isDirectory()) {
      const files = readdirSync(join(KNOWLEDGE_DIR(), entry.name));
      const mdFiles = files.filter(f => f.endsWith('.md'));
      if (mdFiles.length > 0) {
        found = true;
        console.log(`  📚 ${entry.name}/`);
        for (const f of mdFiles) {
          const content = readFileSync(join(KNOWLEDGE_DIR(), entry.name, f), 'utf-8');
          const firstLine = content.split('\n')[0]?.replace(/^#\s*/, '') || '(无标题)';
          console.log(`      📄 ${f} — ${firstLine}`);
        }
      }
    }
  }
  if (!found) console.log('  (空)');
}

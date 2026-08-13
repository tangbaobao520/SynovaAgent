/**
 * cli/commands/expert.ts — expert 子命令 (Era C6)
 *
 * synova expert list | show <type> | create <type> | edit <type> | delete <type>
 *
 * 铁律 39: L1 交互层 — 通过文件系统和 API 操作。
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline';
import type { CLICommand } from '../types';

const EXPERT_BASE = () => join(process.cwd(), 'expert');

const BUILTIN_EXPERTS = [
  'strategy', 'org', 'finance', 'tech', 'marketing', 'action', 'business_model', 'knowledge',
];

export function createExpertCommand(): CLICommand {
  return {
    name: 'expert',
    description: '管理诊断专家 (list/show/create/edit/delete)',
    subcommands: ['list', 'show', 'create', 'edit', 'delete'],
    async handler(args: string[]) {
      const sub = args[0];

      if (!sub || sub === '--help') {
        console.log(`
用法: synova expert <子命令> [参数]

子命令:
  list                    列出所有已注册专家
  show <type>             查看某专家的信息
  create <type>           交互式创建新专家 (写到 expert/{type}/)
  edit <type>             编辑某专家的配置
  delete <type>           删除自定义专家

说明:
  - 内置 8 位专家 (${BUILTIN_EXPERTS.join('/')}) 不可删除
  - 自定义专家存储在 expert/ 目录
`);
        return;
      }

      switch (sub) {
        case 'list':
          await listExperts();
          break;
        case 'show':
          if (!args[1]) { console.error('请指定专家类型: synova expert show <type>'); return; }
          await showExpert(args[1]);
          break;
        case 'create':
          if (!args[1]) { console.error('请指定专家类型: synova expert create <type>'); return; }
          await createExpert(args[1]);
          break;
        case 'edit':
          if (!args[1]) { console.error('请指定专家类型: synova expert edit <type>'); return; }
          await editExpert(args[1]);
          break;
        case 'delete':
          if (!args[1]) { console.error('请指定专家类型: synova expert delete <type>'); return; }
          await deleteExpert(args[1]);
          break;
        default:
          console.error(`未知子命令: ${sub}`);
          console.error('运行 synova expert --help 查看用法');
      }
    },
  };
}

async function listExperts(): Promise<void> {
  console.log('\n内置专家:');
  for (const name of BUILTIN_EXPERTS) {
    const dir = join(EXPERT_BASE(), name);
    const hasFiles = existsSync(dir) ? ' (已自定义)' : '';
    console.log(`  ✅ ${name}${hasFiles}`);
  }

  // 列出自定义专家
  if (existsSync(EXPERT_BASE())) {
    const entries = readdirSync(EXPERT_BASE(), { withFileTypes: true });
    const custom = entries.filter(e => e.isDirectory() && !BUILTIN_EXPERTS.includes(e.name));
    if (custom.length > 0) {
      console.log('\n自定义专家:');
      for (const dir of custom) {
        console.log(`  🔧 ${dir.name}`);
      }
    }
  }
}

async function showExpert(type: string): Promise<void> {
  const dir = join(EXPERT_BASE(), type);
  if (!existsSync(dir)) {
    console.log(`专家 "${type}" 尚无自定义配置，使用内置默认。`);
    return;
  }
  const files = readdirSync(dir);
  console.log(`\n专家: ${type}`);
  for (const file of files) {
    if (file.endsWith('.md')) {
      const content = readFileSync(join(dir, file), 'utf-8');
      const firstLine = content.split('\n')[0] || '(空)';
      console.log(`  ${file}:`);
      console.log(`    ${firstLine}`);
    }
  }
}

async function createExpert(type: string): Promise<void> {
  const dir = join(EXPERT_BASE(), type);
  if (existsSync(dir)) {
    console.error(`专家 "${type}" 已存在，使用 edit 修改。`);
    return;
  }

  // 检查模板
  const templateDir = join(EXPERT_BASE(), '_template');
  if (existsSync(templateDir)) {
    console.log(`从模板创建 ...`);
    copyTemplate(templateDir, dir, type);
    console.log(`✅ 专家 "${type}" 已创建`);
    console.log(`   编辑文件: ${dir}/`);
    return;
  }

  // 无模板, 交互式创建
  mkdirSync(dir, { recursive: true });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const answer = await new Promise<string>(resolve => {
    rl.question(`专家名称 (${type}): `, resolve);
  });
  rl.close();

  const name = answer || type;
  writeFileSync(join(dir, 'IDENTITY.md'), `# ${name}\n\n角色: ${type}\n`);
  writeFileSync(join(dir, 'SOUL.md'), `# ${name} 诊断风格\n\n方法论: ...\n`);
  writeFileSync(join(dir, 'TOOLS.md'), `# 可用工具\n\n- ...\n`);

  console.log(`✅ 专家 "${name}" (${type}) 已创建`);
  console.log(`   编辑: ${dir}/`);
}

function copyTemplate(src: string, dest: string, type: string): void {
  mkdirSync(dest, { recursive: true });
  const files = readdirSync(src);
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    let content = readFileSync(join(src, file), 'utf-8');
    content = content.replace(/\{\{type\}\}/g, type);
    writeFileSync(join(dest, file), content);
  }
}

async function editExpert(type: string): Promise<void> {
  const dir = join(EXPERT_BASE(), type);
  if (!existsSync(dir)) {
    console.log(`专家 "${type}" 尚无自定义文件, 运行 create 先创建。`);
    return;
  }
  console.log(`\n${type}/ 目录下的文件:`);
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  for (const f of files) {
    console.log(`  ${f}`);
  }
  console.log(`\n请用编辑器打开 ${dir}/ 下的文件进行编辑。`);
}

async function deleteExpert(type: string): Promise<void> {
  if (BUILTIN_EXPERTS.includes(type)) {
    console.error(`❌ 不能删除内置专家 "${type}"`);
    return;
  }
  const dir = join(EXPERT_BASE(), type);
  if (!existsSync(dir)) {
    console.error(`专家 "${type}" 不存在。`);
    return;
  }
  rmSync(dir, { recursive: true, force: true });
  console.log(`✅ 专家 "${type}" 已删除`);
}

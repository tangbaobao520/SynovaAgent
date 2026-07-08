#!/usr/bin/env tsx
/**
 * tests/fixtures/jsonl-runner.ts — JSONL 回放测试执行器 (Phase G6)
 *
 * 用途: 回放历史对话 JSONL → 验证消息结构 → 检测退化。
 *
 * 使用:
 *   npx tsx tests/fixtures/jsonl-runner.ts tests/fixtures/jsonl/sample-diagnosis.jsonl
 *   npx tsx tests/fixtures/jsonl-runner.ts tests/fixtures/jsonl/  (目录批量)
 *
 * 铁律 38: as any 零容忍
 * 铁律 33: *.ts 工具脚本，非测试文件
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

// ═══ 类型 ═══

interface ReplayMessage {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface ReplayResult {
  file: string;
  total: number;
  valid: number;
  invalid: number;
  errors: string[];
}

// ═══ 验证 ═══

function validateMessage(msg: unknown, lineNum: number): string | null {
  if (!msg || typeof msg !== 'object') {
    return `第 ${lineNum} 行: 非对象类型 (${typeof msg})`;
  }

  const m = msg as Record<string, unknown>;

  if (!m.role || typeof m.role !== 'string') {
    return `第 ${lineNum} 行: 缺少 role 字段或类型错误`;
  }

  const VALID_ROLES = ['system', 'user', 'assistant', 'tool'];
  if (!VALID_ROLES.includes(m.role)) {
    return `第 ${lineNum} 行: 无效 role "${m.role}"`;
  }

  if (typeof m.content !== 'string') {
    return `第 ${lineNum} 行: content 不是字符串`;
  }

  // tool 消息必须有 tool_call_id
  if (m.role === 'tool' && typeof m.tool_call_id !== 'string') {
    return `第 ${lineNum} 行: tool 消息缺少 tool_call_id`;
  }

  return null; // 通过
}

function parseReplayFile(filePath: string): ReplayResult {
  const result: ReplayResult = {
    file: filePath,
    total: 0,
    valid: 0,
    invalid: 0,
    errors: [],
  };

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`读取失败: ${msg}`);
    return result;
  }

  const lines = raw.split('\n').filter(l => l.trim() !== '');

  for (let i = 0; i < lines.length; i++) {
    result.total++;
    let parsed: unknown;

    try {
      parsed = JSON.parse(lines[i]);
    } catch (parseErr) {
      console.error('JSONL parse error at line ' + (i + 1));
      result.invalid++;
      result.errors.push(`第 ${i + 1} 行: JSON 解析失败`);
      continue;
    }

    const errMsg = validateMessage(parsed, i + 1);
    if (errMsg) {
      result.invalid++;
      result.errors.push(errMsg);
    } else {
      result.valid++;
    }
  }

  return result;
}

// ═══ 执行 ═══

function printResult(result: ReplayResult): void {
  console.log(`\n📄 ${path.basename(result.file)}`);
  console.log(`   消息总数: ${result.total}`);
  console.log(`   有效:     ${result.valid}`);
  console.log(`   无效:     ${result.invalid}`);

  if (result.errors.length > 0) {
    console.log(`   错误详情:`);
    for (const err of result.errors) {
      console.log(`     ❌ ${err}`);
    }
  } else if (result.total > 0) {
    console.log(`   ✅ 全部通过`);
  }
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('用法: npx tsx tests/fixtures/jsonl-runner.ts <file-or-dir> [file-or-dir...]');
    process.exit(1);
  }

  let totalFiles = 0;
  let totalValid = 0;
  let totalInvalid = 0;

  for (const arg of args) {
    const stat = fs.statSync(arg, { throwIfNoEntry: false });
    if (!stat) {
      console.error(`❌ 路径不存在: ${arg}`);
      continue;
    }

    if (stat.isDirectory()) {
      const entries = fs.readdirSync(arg)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => path.join(arg, f));

      for (const entry of entries) {
        totalFiles++;
        const result = parseReplayFile(entry);
        printResult(result);
        totalValid += result.valid;
        totalInvalid += result.invalid;
      }
    } else if (stat.isFile() && arg.endsWith('.jsonl')) {
      totalFiles++;
      const result = parseReplayFile(arg);
      printResult(result);
      totalValid += result.valid;
      totalInvalid += result.invalid;
    } else {
      console.error(`❌ 跳过非 JSONL 文件: ${arg}`);
    }
  }

  console.log(`\n═══════════════════════════════════`);
  console.log(`📊 汇总: ${totalFiles} 个文件, ${totalValid + totalInvalid} 条消息`);
  console.log(`   有效: ${totalValid}  无效: ${totalInvalid}`);

  if (totalInvalid > 0) {
    console.log(`❌ 发现 ${totalInvalid} 条无效消息`);
    process.exit(1);
  } else {
    console.log(`✅ 全部 ${totalValid} 条消息通过验证`);
  }
}

main();

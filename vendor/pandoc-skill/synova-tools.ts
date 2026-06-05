/**
 * vendor/pandoc-skill/synova-tools.ts — 注册为 Synova ToolRegistry 工具
 */
import type { ToolRegistry } from '../../src/agent/tools';
import { spawn } from 'child_process';
import path from 'path';

const SKILL_DIR = path.resolve(__dirname);

export function registerPandocTools(registry: ToolRegistry): void {
  registry.register({
    name: 'convert_md_to_docx',
    description: '将 Markdown 文件转换为 Word DOCX 格式，支持中文模板、标题编号、SCI 论文格式',
    executionMode: 'local',
    operationType: 'write',
    sideEffects: 'none',
    parameters: {
      type: 'object',
      properties: {
        inputPath: { type: 'string', description: '输入的 Markdown 文件路径' },
        outputPath: { type: 'string', description: '输出的 DOCX 文件路径' },
        template: { type: 'string', description: '模板名称（可选，默认 template_标题不编号-列表第二行顶格.docx）' },
      },
      required: ['inputPath', 'outputPath'],
      additionalProperties: false,
    },
    handler: async (params) => {
      const scriptPath = path.join(SKILL_DIR, 'scripts', 'md2docx.py');
      const proc = spawn('python3', [scriptPath, params.inputPath as string, '-o', params.outputPath as string], {
        timeout: 60000,
      });
      return new Promise((resolve, reject) => {
        let output = '';
        proc.stdout.on('data', (d) => output += d);
        proc.stderr.on('data', (d) => output += d);
        proc.on('close', (code) => {
          if (code === 0) resolve({ outputPath: params.outputPath, message: '转换成功' });
          else reject(new Error(`转换失败 (${code}): ${output}`));
        });
      });
    },
  });

  registry.register({
    name: 'convert_docx_to_md',
    description: '将 Word DOCX 文件转换为 Markdown 格式',
    executionMode: 'local',
    operationType: 'read',
    sideEffects: 'none',
    parameters: {
      type: 'object',
      properties: {
        inputPath: { type: 'string', description: '输入的 DOCX 文件路径' },
        outputPath: { type: 'string', description: '输出的 Markdown 文件路径' },
      },
      required: ['inputPath', 'outputPath'],
      additionalProperties: false,
    },
    handler: async (params) => {
      const scriptPath = path.join(SKILL_DIR, 'scripts', 'docx2md.py');
      const proc = spawn('python3', [scriptPath, params.inputPath as string, '-o', params.outputPath as string], {
        timeout: 60000,
      });
      return new Promise((resolve, reject) => {
        let output = '';
        proc.stdout.on('data', (d) => output += d);
        proc.stderr.on('data', (d) => output += d);
        proc.on('close', (code) => {
          if (code === 0) resolve({ outputPath: params.outputPath, message: '转换成功' });
          else reject(new Error(`转换失败 (${code}): ${output}`));
        });
      });
    },
  });
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanFieldMappings } from '../../src/agent/adapter-scanner';

function createMockMapping(dir: string, name: string): void {
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ name, label: name, targetNodeType: 'Financial', mappings: [{ externalField: '收入', prop: 'total_revenue', type: 'number' }] }), 'utf-8');
}

describe('AdapterScanner', () => {
  let tmpDir: string;
  const origCwd = process.cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synova-adapter-scanner-'));
    process.cwd = () => tmpDir;
    fs.mkdirSync(path.join(tmpDir, 'extensions', 'ontology', 'field-mappings'), { recursive: true });
  });

  afterEach(() => {
    process.cwd = origCwd;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('正常: 8个JSON — 返回8个适配器', () => {
    const names = ['erp-standard', 'erp-operational', 'hr-standard', 'crm-standard', 'competitive-intel', 'external-intel', 'innovation-pipeline', 'risk-register'];
    for (const n of names) createMockMapping(path.join(tmpDir, 'extensions', 'ontology', 'field-mappings'), n);
    const result = scanFieldMappings();
    expect(result.adapters).toHaveLength(8);
    expect(result.adapters.map(a => a.name).sort()).toEqual(names.sort());
    expect(result.degraded).toBe(false);
  });

  it('边界: 空目录 — 返回空列表', () => {
    const result = scanFieldMappings();
    expect(result.adapters).toHaveLength(0);
    // 空目录不是错误，degraded = false
    expect(result.degraded).toBe(false);
  });

  it('异常: JSON解析失败 — 跳过并返回degraded', () => {
    const dir = path.join(tmpDir, 'extensions', 'ontology', 'field-mappings');
    fs.writeFileSync(path.join(dir, 'bad.json'), '{invalid}', 'utf-8');
    createMockMapping(dir, 'good');
    const result = scanFieldMappings();
    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe('good');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.degraded).toBe(true);
  });

  it('异常: 缺少必填字段 — 跳过', () => {
    const dir = path.join(tmpDir, 'extensions', 'ontology', 'field-mappings');
    fs.writeFileSync(path.join(dir, 'no-name.json'), JSON.stringify({ label: 'no name' }), 'utf-8');
    createMockMapping(dir, 'valid');
    const result = scanFieldMappings();
    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe('valid');
  });

  it('边界: 目录不存在 — 返回degraded', () => {
    fs.rmSync(path.join(tmpDir, 'extensions', 'ontology', 'field-mappings'), { recursive: true, force: true });
    const result = scanFieldMappings();
    expect(result.adapters).toHaveLength(0);
    expect(result.degraded).toBe(true);
    expect(result.errors.some(e => e.includes('不存在'))).toBe(true);
  });
});

/**
 * inject.ts — GSS fixture 契约校验与归一（黄金场景共享基建 2/4）
 *
 * 一句话: 场景 fixture 按 extensions/ontology/field-mappings/ 的契约校验、归一，
 *         把"外部字段名"翻译成"本体属性名"（externalField → prop）。
 *
 * 契约:
 *   @input  — --mapping <名>（如 erp-standard，对应 field-mappings/erp-standard.json）
 *             --fixture <路径>（场景 fixture JSON: { "<externalField>": value, ... }）
 *             [--out <路径>]（默认 stdout）
 *   @output — 归一载荷 JSON { normalized: { "<prop>": value }, mapping: "<名>",
 *             unknownFields: [...], missingRequired: [...] }
 *   @degraded — mapping 文件缺失/损坏 → exit 2；fixture 不是对象 → exit 2；
 *               未知字段/缺失必填 → 载荷附带清单（调用方决定是否 fatal，
 *               铁律 31 降级信号传播——不静默丢字段）
 *   @error  — INJECT_MAPPING_ERROR / INJECT_FIXTURE_ERROR（.code 语义，K3 P0-2 契约对齐教训）
 *
 * 红线: 只读 field-mappings/，绝不写回；数字归一失败（"abc" 当 number）→ 报错不猜。
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MAPPINGS_DIR = path.join(REPO_ROOT, 'extensions', 'ontology', 'field-mappings');

// ESM 主模块判断（package.json type=module 下 require.main 不可用）
const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

interface MappingField {
  externalField: string;
  prop: string;
  type: string;
}

interface MappingDoc {
  name: string;
  label: string;
  targetNodeType: string;
  mappings: MappingField[];
}

export interface InjectResult {
  normalized: Record<string, string | number>;
  mapping: string;
  targetNodeType: string;
  unknownFields: string[];
  missingRequired: string[];
}

export function inject(mappingName: string, fixture: unknown): InjectResult {
  const mappingPath = path.join(MAPPINGS_DIR, `${mappingName}.json`);
  let doc: MappingDoc;
  try {
    doc = JSON.parse(fs.readFileSync(mappingPath, 'utf-8')) as MappingDoc;
  } catch (e) {
    console.error(`degraded: INJECT_MAPPING_ERROR 映射文件缺失/损坏 ${mappingPath}: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  if (!Array.isArray(doc.mappings)) {
    console.error(`degraded: INJECT_MAPPING_ERROR 映射结构非法（无 mappings 数组）: ${mappingPath}`);
    process.exit(2);
  }
  if (typeof fixture !== 'object' || fixture === null || Array.isArray(fixture)) {
    console.error('degraded: INJECT_FIXTURE_ERROR fixture 必须是 JSON 对象');
    process.exit(2);
  }

  const byExternal = new Map<string, MappingField>();
  for (const m of doc.mappings) byExternal.set(m.externalField, m);

  const record = fixture as Record<string, unknown>;
  const normalized: Record<string, string | number> = {};
  const unknownFields: string[] = [];
  const missingRequired: string[] = [];

  for (const [field, value] of Object.entries(record)) {
    const m = byExternal.get(field);
    if (!m) {
      unknownFields.push(field);
      continue;
    }
    if (m.type === 'number') {
      const n = typeof value === 'number' ? value : Number(value);
      if (typeof value !== 'number' && Number.isNaN(n)) {
        console.error(`degraded: INJECT_FIXTURE_ERROR 字段 "${field}" 期望 number，得到 ${JSON.stringify(value)}（不猜值）`);
        process.exit(2);
      }
      normalized[m.prop] = n;
    } else {
      normalized[m.prop] = String(value);
    }
  }
  // 必填检查: mapping 中 type=number 且 fixture 未提供 → 缺失清单（不替场景编数）
  for (const m of doc.mappings) {
    if (!(m.externalField in record)) missingRequired.push(m.externalField);
  }

  return { normalized, mapping: doc.name, targetNodeType: doc.targetNodeType, unknownFields, missingRequired };
}

if (isMain) {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const mapping = get('--mapping');
  const fixturePath = get('--fixture');
  const outPath = get('--out');
  if (!mapping || !fixturePath) {
    console.error('用法: npx tsx inject.ts --mapping <名> --fixture <路径> [--out <路径>]');
    process.exit(2);
  }
  let fixture: unknown;
  try {
    fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  } catch (e) {
    console.error(`degraded: INJECT_FIXTURE_ERROR fixture 读取失败 ${fixturePath}: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  const r = inject(mapping, fixture);
  const payload = JSON.stringify(r, null, 2);
  if (outPath) fs.writeFileSync(outPath, payload + '\n', 'utf-8');
  else console.log(payload);
}

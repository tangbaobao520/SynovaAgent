/**
 * src/deploy/schema-version.ts — Schema 版本管理 & 破坏性 DDL 检测
 *
 * D48: 第9份权威文档 第二章。检测升级包中是否包含破坏性 Schema 变更。
 * 约束2: Schema 只 ADD 不 DROP — DROP/ALTER 列类型 → blocked:true。
 *
 * 接口:
 *   checkSchemaCompatibility(migrations): SchemaCompatibilityResult
 *     — 分析迁移 SQL 列表，返回兼容性判定
 */
import { createLogger } from '@synova/logger';

const log = createLogger('deploy/schema-version');

/** DDL 变更类型 — string 运行时校验 (文件驱动合规: 不用联合类型) */
export type DDLChangeType = string;

/** 单条 Schema 变更记录 */
export interface DDLChange {
  type: DDLChangeType;
  table: string;
  column?: string;
  detail?: string;
}

/** Schema 兼容性检查结果 */
export interface SchemaCompatibilityResult {
  /** true=兼容可升级, false=有破坏性变更 */
  compatible: boolean;
  /** 检测到的所有变更 */
  changes: DDLChange[];
  /** 不兼容时的阻断原因 */
  blockedReason?: string;
}

/** 迁移动作定义 — 类型 + 正则 */
interface DDLPattern { type: string; regex: RegExp; destructive: boolean; }

/** 迁移动作正则 (兼容 CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN 等) */
const DDL_PATTERNS: DDLPattern[] = [
  { type: 'add_table', regex: /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i, destructive: false },
  { type: 'add_column', regex: /^\s*ALTER\s+TABLE\s+(\w+)\s+ADD\s+(?:COLUMN\s+)?(\w+)/i, destructive: false },
  { type: 'drop_table', regex: /^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i, destructive: true },
  { type: 'drop_column', regex: /^\s*ALTER\s+TABLE\s+(\w+)\s+DROP\s+(?:COLUMN\s+)?(\w+)/i, destructive: true },
  { type: 'alter_column_type', regex: /^\s*ALTER\s+TABLE\s+(\w+)\s+ALTER\s+(?:COLUMN\s+)?(\w+)/i, destructive: true },
];

/**
 * 检测迁移 SQL 列表中的 Schema 变更。
 * 解析每行 SQL，识别 CREATE/ALTER/DROP 操作。
 *
 * @param migrations — 迁移 SQL 语句列表
 * @returns 所有识别到的变更
 */
function parseSchemaChanges(migrations: string[]): DDLChange[] {
  const changes: DDLChange[] = [];

  for (const sql of migrations) {
    const trimmed = sql.trim();
    if (!trimmed) continue;

    for (const { type, regex } of DDL_PATTERNS) {
      const match = trimmed.match(regex);
      if (match) {
        changes.push({
          type,
          table: match[1],
          column: match[2] || undefined,
          detail: trimmed.length > 80 ? trimmed.slice(0, 77) + '...' : trimmed,
        });
        break; // 一条 SQL 只匹配一种操作
      }
    }
  }

  return changes;
}

/**
 * 检查 Schema 兼容性。
 * 约束2: Schema 只 ADD 不 DROP — 破坏性变更导致 blocked。
 *
 * @param migrations — 迁移 SQL 语句列表
 * @returns SchemaCompatibilityResult — 兼容/不兼容 + 所有变更 + 阻断原因
 */
export function checkSchemaCompatibility(migrations: string[]): SchemaCompatibilityResult {
  const changes = parseSchemaChanges(migrations);
  const destructiveTypes = DDL_PATTERNS.filter((p) => p.destructive).map((p) => p.type);
  const destructive = changes.filter((c) => destructiveTypes.includes(c.type));

  if (destructive.length > 0) {
    const detail = destructive
      .map((d) => `[${d.type}] ${d.table}${d.column ? `.${d.column}` : ''}`)
      .join('; ');
    const reason = `检测到 ${destructive.length} 项破坏性 Schema 变更: ${detail}。Schema 只允许 ADD 操作。`;
    log.warn({ destructiveChanges: destructive.length, detail }, 'Schema 不兼容 — 阻断升级');
    return { compatible: false, changes, blockedReason: reason };
  }

  log.info({ totalChanges: changes.length, destructive: 0 }, 'Schema 兼容');
  return { compatible: true, changes };
}

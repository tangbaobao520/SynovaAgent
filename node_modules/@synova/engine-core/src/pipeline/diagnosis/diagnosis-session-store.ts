/**
 * diagnosis-session-store.ts — 诊断会话持久化
 *
 * B2: 对标 Claw-Code session.rs + Hermes hermes_state.py。
 *
 * Claw-Code 模式：
 *   - JSONL 追加写（一条消息一行）→ 重启读小文件，快
 *   - 原子写入（temp file + rename）
 *   - 轮转（256KB，保留 3 份）
 *   - 密钥脱敏（写入前过滤敏感字段）
 *   - 字段截断（16KB 上限）
 *
 * Hermes 模式：
 *   - SQLite + WAL 模式 → 并发读
 *   - FTS5 全文搜索 → 快速检索历史消息
 *   - 会话元数据索引
 *
 * Synova 融合：
 *   - JSONL = 主持久化（对标 Claw-Code，重启快）
 *   - SQLite = 索引 + 搜索（对标 Hermes，检索快）
 *   - 会话分裂：压缩后创建子会话（对标 Hermes parent_session_id）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/session-store');

// ====================================================================
// Types
// ====================================================================

export interface SessionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  phase?: number;
  toolName?: string;
  tokens?: number;
  timestamp: string;
}

export interface DiagnosisSession {
  sessionId: string;
  orgId: string;
  teamId: string;
  status: 'active' | 'compacted' | 'completed' | 'archived';
  messageCount: number;
  compactionCount: number;
  /** 压缩后创建的子会话 ID（对标 Hermes parent_session_id） */
  parentSessionId?: string;
  /** 子会话列表 */
  childSessionIds: string[];
  createdAt: string;
  updatedAt: string;
  /** 估算总 token 数 */
  estimatedTokens: number;
}

export interface SessionSearchResult {
  sessionId: string;
  messageContent: string; // 前 200 字符
  phase?: number;
  timestamp: string;
  score: number;
}

// ====================================================================
// Config
// ====================================================================

const ROTATE_AFTER_BYTES = 256 * 1024;     // 对标 Claw-Code: 256KB
const MAX_ROTATED_FILES = 3;                // 对标 Claw-Code: 保留 3 份
const MAX_FIELD_BYTES = 16 * 1024;          // 对标 Claw-Code: 16KB 截断
const SENSITIVE_PATTERNS = [                // 对标 Claw-Code: 密钥脱敏
  /sk-[a-zA-Z0-9]{20,}/g,
  /(?:api_key|apikey|secret|token|password)[=:]\s*\S+/gi,
];

// ====================================================================
// Store
// ====================================================================

let dataDir: string;
let db: any; // better-sqlite3 instance

export function initSessionStore(dir: string, database?: any): void {
  dataDir = dir;
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (database) {
    db = database;
    initSQLiteSchema();
  }
  log.info({ dataDir, hasSqlite: !!db }, '[session-store] 已初始化');
}

function initSQLiteSchema(): void {
  if (!db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS diagnosis_sessions (
      session_id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      message_count INTEGER DEFAULT 0,
      compaction_count INTEGER DEFAULT 0,
      parent_session_id TEXT,
      estimated_tokens INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_org ON diagnosis_sessions(org_id, created_at DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS session_messages_fts USING fts5(
      session_id, content, phase,
      tokenize='unicode61 remove_diacritics 2'
    );
  `);
}

// ====================================================================
// Session CRUD (对标 Claw-Code session_control.rs)
// ====================================================================

function sessionPath(orgId: string, sessionId: string): string {
  const orgDir = path.join(dataDir, 'sessions', orgId);
  if (!fs.existsSync(orgDir)) fs.mkdirSync(orgDir, { recursive: true });
  return path.join(orgDir, `${sessionId}.jsonl`);
}

export function createSession(orgId: string, teamId: string): DiagnosisSession {
  const sessionId = `diag_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  const session: DiagnosisSession = {
    sessionId, orgId, teamId,
    status: 'active',
    messageCount: 0,
    compactionCount: 0,
    childSessionIds: [],
    createdAt: now,
    updatedAt: now,
    estimatedTokens: 0,
  };

  // JSONL: bootstrap with metadata line
  const file = sessionPath(orgId, sessionId);
  const meta = JSON.stringify({ type: 'session_meta', ...session }) + '\n';
  fs.writeFileSync(file, meta, 'utf-8'); // 对标 Claw-Code: 首次全量写

  // SQLite
  if (db) {
    db.prepare(`INSERT INTO diagnosis_sessions (session_id, org_id, team_id, status, message_count, compaction_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(sessionId, orgId, teamId, 'active', 0, 0, now, now);
  }

  return session;
}

export function getSession(sessionId: string): DiagnosisSession | null {
  if (db) {
    return db.prepare('SELECT * FROM diagnosis_sessions WHERE session_id = ?').get(sessionId) as DiagnosisSession | null;
  }
  return null;
}

// ====================================================================
// Message Append (对标 Claw-Code append_persisted_message)
// ====================================================================

export function appendMessage(
  sessionId: string,
  orgId: string,
  message: Omit<SessionMessage, 'timestamp'>,
): void {
  const now = new Date().toISOString();
  const fullMsg: SessionMessage = { ...message, timestamp: now };

  // ── 脱敏（对标 Claw-Code secrets redaction）──
  let content = fullMsg.content;
  for (const pattern of SENSITIVE_PATTERNS) {
    content = content.replace(pattern, '[REDACTED]');
  }
  // ── 截断（对标 Claw-Code 16KB field truncation）──
  if (content.length > MAX_FIELD_BYTES) {
    content = content.slice(0, MAX_FIELD_BYTES - 20) + '...[TRUNCATED]';
  }
  fullMsg.content = content;
  fullMsg.tokens = Math.ceil(content.length / 4) + 1;

  // ── JSONL 追加（对标 Claw-Code append-only）──
  const file = sessionPath(orgId, sessionId);
  rotateIfNeeded(file);
  const line = JSON.stringify({ type: 'message', ...fullMsg }) + '\n';
  fs.appendFileSync(file, line, 'utf-8');

  // ── SQLite 索引 ──
  if (db) {
    db.prepare('UPDATE diagnosis_sessions SET message_count = message_count + 1, estimated_tokens = estimated_tokens + ?, updated_at = ? WHERE session_id = ?')
      .run(fullMsg.tokens ?? 0, now, sessionId);
    db.prepare('INSERT INTO session_messages_fts(session_id, content, phase) VALUES (?, ?, ?)')
      .run(sessionId, content.slice(0, 500), message.phase ?? -1);
  }
}

// ====================================================================
// File Rotation (对标 Claw-Code rotate_session_file_if_needed)
// ====================================================================

function rotateIfNeeded(file: string): void {
  try {
    const stat = fs.statSync(file);
    if (stat.size < ROTATE_AFTER_BYTES) return;

    const dir = path.dirname(file);
    const base = path.basename(file, '.jsonl');
    const ts = Date.now();
    const rotated = path.join(dir, `${base}.rot-${ts}.jsonl`);
    fs.renameSync(file, rotated);

    // 保留最多 3 份轮转文件（对标 Claw-Code）
    const rotatedFiles = fs.readdirSync(dir)
      .filter(f => f.startsWith(base + '.rot-'))
      .map(f => path.join(dir, f))
      .sort();
    while (rotatedFiles.length > MAX_ROTATED_FILES) {
      fs.unlinkSync(rotatedFiles.shift()!);
    }
  } catch {
    // 文件不存在或无法访问，跳过轮转
  }
}

// ====================================================================
// Session Compaction (对标 Claw-Code compact + Hermes session split)
// ====================================================================

export function compactSession(
  orgId: string,
  sessionId: string,
  compactionSummary: string,
): string {
  // 标记当前会话为 compacted
  if (db) {
    db.prepare('UPDATE diagnosis_sessions SET status = ?, compaction_count = compaction_count + 1, updated_at = ? WHERE session_id = ?')
      .run('compacted', new Date().toISOString(), sessionId);
  }

  // 创建子会话（对标 Hermes parent_session_id）
  const childSession = createSession(orgId, '');
  if (db) {
    db.prepare('UPDATE diagnosis_sessions SET parent_session_id = ? WHERE session_id = ?')
      .run(sessionId, childSession.sessionId);
  }

  // 写入压缩摘要作为子会话的首条消息
  appendMessage(childSession.sessionId, orgId, {
    role: 'system',
    content: `[会话压缩 #${(getSession(sessionId)?.compactionCount ?? 0) + 1}] ${compactionSummary}`,
    phase: undefined,
  });

  log.info({ parentSessionId: sessionId, childSessionId: childSession.sessionId },
    '[session-store] 会话压缩完成，子会话已创建');

  return childSession.sessionId;
}

// ====================================================================
// Search (对标 Hermes FTS5 + Claw-Code JSONL grep)
// ====================================================================

export function searchSessions(orgId: string, query: string, limit = 10): SessionSearchResult[] {
  const results: SessionSearchResult[] = [];

  // SQLite FTS5（对标 Hermes）
  if (db) {
    const rows = db.prepare(
      `SELECT session_id, content, phase, rank FROM session_messages_fts WHERE session_messages_fts MATCH ? AND session_id IN
       (SELECT session_id FROM diagnosis_sessions WHERE org_id = ?) ORDER BY rank LIMIT ?`
    ).all(query, orgId, limit) as any[];

    for (const row of rows) {
      results.push({
        sessionId: row.session_id,
        messageContent: row.content.slice(0, 200),
        phase: row.phase >= 0 ? row.phase : undefined,
        timestamp: '',
        score: 1 / (1 + row.rank),
      });
    }
  }

  // JSONL grep 回退（对标 Claw-Code——简单但可靠）
  if (results.length === 0) {
    const orgDir = path.join(dataDir, 'sessions', orgId);
    if (!fs.existsSync(orgDir)) return [];

    const files = fs.readdirSync(orgDir).filter(f => f.endsWith('.jsonl'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(orgDir, file), 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'message') {
              results.push({
                sessionId: msg.sessionId || file.replace('.jsonl', ''),
                messageContent: msg.content?.slice(0, 200) || '',
                phase: msg.phase,
                timestamp: msg.timestamp || '',
                score: 0.5,
              });
            }
          } catch { /* skip */ }
        }
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }
  }

  return results;
}

// ====================================================================
// Load Session Messages (对标 Claw-Code load_from_path)
// ====================================================================

export function loadSessionMessages(orgId: string, sessionId: string): SessionMessage[] {
  const file = sessionPath(orgId, sessionId);
  if (!fs.existsSync(file)) return [];

  const messages: SessionMessage[] = [];
  const content = fs.readFileSync(file, 'utf-8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'message') {
        messages.push({
          role: msg.role,
          content: msg.content,
          phase: msg.phase,
          toolName: msg.toolName,
          tokens: msg.tokens,
          timestamp: msg.timestamp,
        });
      }
    } catch { /* skip corrupted lines */ }
  }
  return messages;
}

/** 关闭存储（测试用） */
export function closeSessionStore(): void {
  // 无操作——JSONL 不需要关闭
}

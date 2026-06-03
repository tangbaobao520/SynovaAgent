/**
 * session-transcript.ts — JSONL 会话转录
 *
 * 追加式类型化条目写入 sessions/{sessionId}.jsonl，一行一 JSON。
 * 支持 fork（子诊断分支）和 replay（按序回放审计）。
 *
 * 写入路径：
 *   process.env.DIAGNOSIS_SESSIONS_DIR || './data/diagnosis-sessions'
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DiagnosisEvent } from './types';

// ====================================================================
// SessionTranscriptor
// ====================================================================

export class SessionTranscriptor {
  private sessionId: string;
  private dir: string;
  private filePath: string;

  constructor(sessionId: string, baseDir?: string) {
    this.sessionId = sessionId;
    this.dir = baseDir || process.env.DIAGNOSIS_SESSIONS_DIR || path.join(process.cwd(), 'data', 'diagnosis-sessions');
    this.filePath = path.join(this.dir, `${sessionId}.jsonl`);
    this.ensureDir();
  }

  // ── 写入 ──

  /** 追加一条事件（原子 write + newline） */
  append(event: DiagnosisEvent): void {
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(this.filePath, line, 'utf-8');
  }

  /** 批量追加 */
  appendAll(events: DiagnosisEvent[]): void {
    const lines = events.map(e => JSON.stringify(e) + '\n').join('');
    fs.appendFileSync(this.filePath, lines, 'utf-8');
  }

  // ── 分支 ──

  /**
   * 创建子分支——新建一个 session-id，在父转录中写入 fork 事件。
   * 返回子 SessionTranscriptor 实例。
   */
  fork(childSessionId: string): SessionTranscriptor {
    // 在父转录中记录 fork 点
    this.append({
      type: 'session_forked',
      childSessionId,
      timestamp: new Date().toISOString(),
    } as unknown as DiagnosisEvent);

    return new SessionTranscriptor(childSessionId, this.dir);
  }

  // ── 读取 ──

  /** 按序回放全部事件（审计用） */
  replay(): DiagnosisEvent[] {
    if (!fs.existsSync(this.filePath)) return [];
    const content = fs.readFileSync(this.filePath, 'utf-8');
    if (!content.trim()) return [];
    return content
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as DiagnosisEvent);
  }

  /** 回放指定数量的事件 */
  replayN(n: number): DiagnosisEvent[] {
    return this.replay().slice(0, n);
  }

  /** 获取事件总数（不加载全部内容，只统计行数） */
  count(): number {
    if (!fs.existsSync(this.filePath)) return 0;
    const content = fs.readFileSync(this.filePath, 'utf-8');
    if (!content.trim()) return 0;
    return content.trim().split('\n').filter(line => line.trim()).length;
  }

  // ── 管理 ──

  get sessionId_(): string {
    return this.sessionId;
  }

  get filePath_(): string {
    return this.filePath;
  }

  /** 删除转录文件 */
  delete(): boolean {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
      return true;
    }
    return false;
  }

  /** 检查转录文件是否存在 */
  exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  // ── 内部 ──

  private ensureDir(): void {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }
}

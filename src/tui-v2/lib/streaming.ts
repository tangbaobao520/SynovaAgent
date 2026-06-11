/**
 * tui-v2/lib/streaming.ts — 流式输出引擎
 *
 * 对标 CodeWhale streaming/ 目录：
 *   - LineBuffer: 换行边界门控
 *   - StreamChunker: Grapheme 分块
 *   - CommitTicker: 自适应释放策略
 *
 * 流水线: raw delta → LineBuffer → StreamChunker → CommitTicker → UI
 */

import { splitGraphemes } from './grapheme';

// ── LineBuffer ──

/** 换行边界门控 — 防止部分 Markdown 泄露到 UI */
export class LineBuffer {
  private buffer = '';

  push(delta: string): void {
    this.buffer += delta;
  }

  /** 取出已完成的完整行（到最后一个 \n 为止） */
  takeCommittable(): string {
    const lastNL = this.buffer.lastIndexOf('\n');
    if (lastNL === -1) return '';
    const result = this.buffer.slice(0, lastNL + 1);
    this.buffer = this.buffer.slice(lastNL + 1);
    return result;
  }

  /** 剩余未提交内容（流末尾调用） */
  flush(): string {
    const result = this.buffer;
    this.buffer = '';
    return result;
  }

  get pending(): string {
    return this.buffer;
  }
}

// ── StreamChunker ──

/** Grapheme 对齐分块 */
export class StreamChunker {
  private chunks: string[] = [];

  pushDelta(text: string): void {
    const graphemes = splitGraphemes(text);
    for (const g of graphemes) {
      this.chunks.push(g);
    }
  }

  takeChunks(maxCount: number): string[] {
    const taken = this.chunks.slice(0, maxCount);
    this.chunks = this.chunks.slice(maxCount);
    return taken;
  }

  get length(): number {
    return this.chunks.length;
  }
}

// ── CommitTicker ──

/** 自适应释放策略 */
export class CommitTicker {
  private lastCommitTime = 0;
  private isFirst = true;
  private readonly firstDelayMs: number;
  private readonly batchDelayMs: number;
  private readonly batchSize: number;

  constructor(opts?: {
    firstDelayMs?: number;
    batchDelayMs?: number;
    batchSize?: number;
  }) {
    this.firstDelayMs = opts?.firstDelayMs ?? 0;
    this.batchDelayMs = opts?.batchDelayMs ?? 50;
    this.batchSize = opts?.batchSize ?? 20;
  }

  /** 检查是否应该提交 */
  shouldCommit(bufferedChunks: number): { should: boolean; count: number } {
    if (bufferedChunks === 0) return { should: false, count: 0 };

    const now = Date.now();

    // 首 token 立即释放（降低延迟感知）
    if (this.isFirst) {
      this.isFirst = false;
      this.lastCommitTime = now;
      return { should: true, count: Math.min(bufferedChunks, 5) };
    }

    // 后续按时间窗口批量释放
    const elapsed = now - this.lastCommitTime;
    if (elapsed >= this.batchDelayMs) {
      this.lastCommitTime = now;
      return { should: true, count: Math.min(bufferedChunks, this.batchSize) };
    }

    return { should: false, count: 0 };
  }

  reset(): void {
    this.isFirst = true;
    this.lastCommitTime = 0;
  }
}

// ── StreamingPipeline ──

/** 完整的流式输出流水线 */
export class StreamingPipeline {
  private lineBuffer = new LineBuffer();
  private chunker = new StreamChunker();
  private ticker = new CommitTicker();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onCommit: (text: string) => void;
  private onPending: (text: string) => void;

  constructor(opts: {
    onCommit: (text: string) => void;
    onPending: (text: string) => void;
  }) {
    this.onCommit = opts.onCommit;
    this.onPending = opts.onPending;
  }

  /** 接收新的 delta
   *  绕过 LineBuffer — 直接推入 StreamChunker
   *  原因: LineBuffer 要求换行才提交，导致无换行的文本永远不可见
   *  参考 CodeWhale: 对助手文本 bypass_gate=true
   *  安全: ink 层的 Synchronized Output + 行级 Diff 已解决闪烁，无需换行门控
   */
  push(delta: string): void {
    this.chunker.pushDelta(delta);
    this.scheduleCommit();
  }

  /** 流结束，刷新剩余内容 */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // 提交所有剩余 chunks
    while (this.chunker.length > 0) {
      const chunks = this.chunker.takeChunks(this.chunker.length);
      this.onCommit(chunks.join(''));
    }

    this.ticker.reset();
  }

  private scheduleCommit(): void {
    if (this.timer) return;

    const check = () => {
      this.timer = null;
      const { should, count } = this.ticker.shouldCommit(this.chunker.length);
      if (should && count > 0) {
        const chunks = this.chunker.takeChunks(count);
        this.onCommit(chunks.join(''));
      }
      // 如果还有未提交的 chunks，继续调度
      if (this.chunker.length > 0) {
        this.scheduleCommit();
      }
    };

    // 首 token 立即检查，后续按 batchDelayMs
    const delay = this.ticker['isFirst'] ? 0 : 50;
    this.timer = setTimeout(check, delay);
  }

  /** 取消所有待处理的定时器 */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

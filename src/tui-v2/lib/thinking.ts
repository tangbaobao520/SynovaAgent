/**
 * tui-v2/lib/thinking.ts — 思考过程管理
 *
 * 对标 CodeWhale streaming_thinking.rs。
 * - 默认折叠显示 "Thought for Ns"
 * - spinner 动画 |/- 实时旋转（状态驱动，无 setInterval）
 * - Ctrl+O 展开/折叠
 * - 压缩时保留推理摘要
 *
 * 设计原则：不使用 setInterval 驱动 spinner，而是由调用方
 * 在每次渲染时调用 getSpinnerChar() 获取当前帧字符。
 * ink 的重渲染机制会在状态变化时触发更新，从而自然推进 spinner。
 */

const SPINNER = ['|', '/', '-', '\\'];
const SPINNER_INTERVAL = 100; // ms — spinner 帧切换间隔

let accumulatedThought = '';
let thoughtStartTime = 0;
let thoughtExpanded = false;
let spinnerFrame = 0;
let lastSpinnerTime = 0;
let isThinking = false;
let stashedReasoning = '';

/** 获取当前 spinner 字符（基于时间推移自动切换帧） */
function getSpinnerChar(): string {
  if (!isThinking) return '';
  const now = Date.now();
  if (now - lastSpinnerTime >= SPINNER_INTERVAL) {
    spinnerFrame = (spinnerFrame + 1) % SPINNER.length;
    lastSpinnerTime = now;
  }
  return SPINNER[spinnerFrame];
}

/** 开始新一轮思考 */
export function beginThought(): void {
  accumulatedThought = '';
  thoughtStartTime = Date.now();
  thoughtExpanded = false;
  spinnerFrame = 0;
  lastSpinnerTime = Date.now();
  isThinking = true;
}

/** 追加思考 token */
export function appendThought(text: string): void {
  accumulatedThought += text;
}

/** 是否有思考内容 */
export function hasThought(): boolean { return accumulatedThought.length > 0; }

/** 折叠/展开开关 */
export function toggleExpanded(): void { thoughtExpanded = !thoughtExpanded; }
export function isExpanded(): boolean { return thoughtExpanded; }

/** 停止思考计时 */
export function finalizeThought(): void {
  isThinking = false;
}

/** 保存推理摘要（压缩时调用） */
export function stashReasoning(): string {
  if (accumulatedThought.length > 0) {
    stashedReasoning = `[推理摘要 ${new Date().toISOString().slice(0, 10)}] ${accumulatedThought.slice(0, 200)}`;
  }
  return stashedReasoning;
}

/** 获取保存的推理摘要 */
export function getStashedReasoning(): string { return stashedReasoning; }

/** 生成思考块（折叠模式） */
export function renderThought(): string {
  if (!accumulatedThought) return '';
  const elapsed = ((Date.now() - thoughtStartTime) / 1000).toFixed(1);
  const spinner = getSpinnerChar();
  const duration = isThinking
    ? `Thinking… ${elapsed}s ${spinner}`
    : `Thought for ${elapsed}s`;
  const preview = accumulatedThought.slice(0, 120).replace(/\n/g, ' ');
  return [
    `  ┌─ ${duration}`,
    `  │ ${preview}${accumulatedThought.length > 120 ? '…' : ''} (ctrl+o)`,
    `  └─`,
  ].join('\n');
}

/** 生成展开的思考内容 */
export function renderThoughtExpanded(): string {
  if (!accumulatedThought) return '';
  const elapsed = ((Date.now() - thoughtStartTime) / 1000).toFixed(1);
  return [
    `  ┌─ Thought for ${elapsed}s ──`,
    accumulatedThought,
    `  └─`,
  ].join('\n');
}

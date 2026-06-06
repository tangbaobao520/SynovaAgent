/**
 * tui/thinking.ts — 思考过程管理 (对标 CodeWhale streaming_thinking.rs)
 *
 * - 默认折叠显示 "Thought for Ns"
 * - spinner 动画 \|/- 实时旋转
 * - Ctrl+O 展开/折叠
 * - 压缩时保留推理摘要
 */

const B = '\x1b[1m';
const D = '\x1b[2m';
const C = '\x1b[36m';
const R = '\x1b[0m';

const SPINNER = ['|', '/', '-', '\\'];
const SPINNER_INTERVAL = 100; // ms

let accumulatedThought = '';
let thoughtStartTime = 0;
let thoughtExpanded = false;
let spinnerIdx = 0;
let spinnerTimer: ReturnType<typeof setInterval> | null = null;
let stashedReasoning = '';

/** 开始新一轮思考 */
export function beginThought(): void {
  accumulatedThought = '';
  thoughtStartTime = Date.now();
  thoughtExpanded = false;
  spinnerIdx = 0;
  if (spinnerTimer) clearInterval(spinnerTimer);
  spinnerTimer = setInterval(() => { spinnerIdx = (spinnerIdx + 1) % 4; }, SPINNER_INTERVAL);
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
  if (spinnerTimer) { clearInterval(spinnerTimer); spinnerTimer = null; }
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
  const spinner = spinnerTimer ? SPINNER[spinnerIdx] : '';
  const duration = spinnerTimer
    ? `${D}Thinking… ${elapsed}s ${C}${spinner}${R}`
    : `${D}Thought for ${elapsed}s${R}`;
  const preview = accumulatedThought.slice(0, 120).replace(/\n/g, ' ');
  return [
    `${D}  ┌─${R} ${duration}`,
    `${D}  │${R} ${preview}${accumulatedThought.length > 120 ? '…' : ''}${D} (ctrl+o)${R}`,
    `${D}  └─${R}`,
  ].join('\n');
}

/** 生成展开的思考内容 */
export function renderThoughtExpanded(): string {
  if (!accumulatedThought) return '';
  const elapsed = ((Date.now() - thoughtStartTime) / 1000).toFixed(1);
  const lines = accumulatedThought.split('\n');
  const out = [
    `${C}  ┌─ Thought for ${elapsed}s (ctrl+o to fold) ──${R}`,
  ];
  for (const line of lines.slice(0, 30)) {
    out.push(`${D}  │${R} ${line.slice(0, 120)}`);
  }
  if (lines.length > 30) out.push(`${D}  │${R} ... ${lines.length - 30} more lines`);
  out.push(`${C}  └─${R}`);
  return out.join('\n');
}

/** 根据展开状态渲染 */
export function renderThoughtToggle(): string {
  return thoughtExpanded ? renderThoughtExpanded() : renderThought();
}

/** 重置思考状态（新消息开始时调用） */
export function resetThought(): void {
  accumulatedThought = '';
  thoughtStartTime = 0;
  thoughtExpanded = false;
  if (spinnerTimer) { clearInterval(spinnerTimer); spinnerTimer = null; }
}

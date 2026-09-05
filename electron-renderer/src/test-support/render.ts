/**
 * test-support/render.ts — D556 UI 断言渲染桥接（renderToStaticMarkup 兼容 API）
 *
 * WHY 零依赖元素树序列化器（而非 react-dom/server）——spec §8 机制在 CI 物理不成立:
 *   1. root package-lock.json 零 react-dom/zustand/react-markdown（扁平+嵌套均无，2026-08-29 实查）；
 *   2. ci.yml vitest job 仅 root `npm ci`（零 electron-renderer 引用）→ renderer node_modules 在 CI 不存在；
 *   3. 零新依赖红线（根/renderer package.json、vitest.config.ts 均不在写集）→ 无法引入 react-dom。
 * 本桥接对**纯函数组件树**产出与 react-dom/server 同构的伪 HTML 字符串（直接调用 FC 展开、
 * 不执行 hook/effect——与静态渲染语义一致），供 tests/ga-collab-ui.test.ts 五场景字符串断言。
 * 仅 tests 引用，生产 bundle 零影响（spec §14 决策 B 的依赖约束保持零新增）。
 *
 * 契约（铁律 47）:
 *   @input  — node: ReactNode（纯函数组件树；含 hook 的组件不适用——与 react-dom/server 一致）
 *   @output — 伪 HTML 字符串: `<div class="x" data-k="v">text</div>`（className→class、data-* 原样、
 *             文本转义 & < >；事件/style/undefined/false 跳过——断言所需最小集）
 *   @degraded — 超过 MAX_DEPTH → 截断为 ''（防环/防失控；正常树不触达）
 *   @error  — 非纯函数组件（class 组件/hook 组件）调用即抛——本桥接只服务纯展示组件树（测试基建，非产品路径）
 */
import type { ReactElement, ReactNode } from 'react';

/** 序列化最大深度（防御环引用/失控树；GaDetailSections 树深 < 12） */
const MAX_DEPTH = 64;

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 断言所需最小属性集: className→class、id/name/type/href、data-*、布尔 disabled/checked */
function serializeAttrs(props: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (name: string, value: unknown): void => {
    if (typeof value === 'string' && value.length > 0) parts.push(` ${name}="${escapeText(value)}"`);
    else if (typeof value === 'number' && Number.isFinite(value)) parts.push(` ${name}="${String(value)}"`);
  };
  if (typeof props.className === 'string' && props.className.length > 0) push('class', props.className);
  push('id', props.id);
  push('name', props.name);
  push('type', props.type);
  push('href', props.href);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('data-')) push(key, value);
  }
  if (props.disabled === true) parts.push(' disabled');
  if (props.checked === true) parts.push(' checked');
  return parts.join('');
}

function isReactElement(node: object): node is ReactElement {
  return '$$typeof' in node;
}

function serialize(node: ReactNode, depth: number): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string') return escapeText(node);
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((child) => serialize(child, depth)).join('');
  if (typeof node !== 'object' || !isReactElement(node)) return '';
  if (depth > MAX_DEPTH) return '';

  const element = node as ReactElement;
  const type = element.type;
  const props = (element.props ?? {}) as Record<string, unknown>;

  // 纯函数组件 → 直接调用展开（JSXElementConstructor 可赋给 (props: unknown) => ReactNode）
  if (typeof type === 'function') {
    const component = type as (props: unknown) => ReactNode;
    return serialize(component(props), depth + 1);
  }
  // Fragment（symbol reactor.fragment）等非宿主标记 → 透传 children
  if (typeof type === 'symbol') {
    return serialize(props.children as ReactNode, depth + 1);
  }
  // 宿主元素（div/span/section/form/...）
  if (typeof type === 'string') {
    const children = serialize(props.children as ReactNode, depth + 1);
    return `<${type}${serializeAttrs(props)}>${children}</${type}>`;
  }
  // memo/lazy/portal 等未支持标记 — 测试树中不存在，跳过
  return '';
}

/**
 * renderToStaticMarkup — react-dom/server 同名 API 的零依赖等价实现（见文件头 WHY）。
 * @input  node: 纯函数组件树的根 ReactNode
 * @output 伪 HTML 字符串（确定性输出——同一棵树恒得同一串，可 includes/正则断言）
 * @degraded 超 MAX_DEPTH 子树 → ''（正常树不触达）
 * @error  含 hook/class 组件的树 — 与 react-dom/server 一样不适用（本仓 UI 测试树均为纯展示组件）
 */
export function renderToStaticMarkup(node: ReactNode): string {
  return serialize(node, 0);
}

/**
 * tui/color-tags.ts — neo-blessed 内置 tags 颜色常量
 *
 * 对标 CodeWhale Span::styled()：blessed 内部处理 ANSI 生成，
 * 应用代码只使用声明式 tag，不再手工拼接原始 ANSI 转义序列。
 *
 * 用法: `${CYAN}文本${CLOSE}` → blessed 自动转为 \x1b[36m文本\x1b[0m
 * 所有 blessed.box 需设置 tags: true
 */
export const BOLD   = '{bold}';
export const DIM    = '{grey-fg}';
export const GREEN  = '{green-fg}';
export const YELLOW = '{yellow-fg}';
export const CYAN   = '{cyan-fg}';
export const PURPLE = '{magenta-fg}';
export const RED    = '{red-fg}';
export const WHITE  = '{white-fg}';
export const CLOSE  = '{/}';

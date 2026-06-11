/**
 * tui-v2/lib/mouse-input.ts — 终端鼠标滚轮支持
 *
 * 原理:
 *   1. render() 之前创建 PassThrough 代理替换 process.stdin
 *   2. 从真实 stdin 手动读取 → 过滤 SGR 鼠标序列 → 写入代理
 *   3. ink 连接到代理流, 只看到干净的键盘数据
 *   4. 滚轮事件 → 模块级回调 (React 组件通过 setHandlers 注入)
 *
 * 关键: 必须在 render() 之前调用 install(), 否则 ink 先拿到原始 stdin。
 *       install() 不依赖 React —— 纯 Node.js 流操作。
 *
 * 用法:
 *   // 在 render() 之前:
 *   installStdinProxy();
 *   render(<App />);
 *
 *   // 在组件内:
 *   useEffect(() => {
 *     setScrollHandlers(onScrollUp, onScrollDown);
 *     return () => setScrollHandlers(null, null);
 *   }, []);
 */

import { PassThrough } from 'stream';
import { createLogger } from '../../logger';

const log = createLogger('mouse-input');

const ENABLE_MOUSE  = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
const DISABLE_MOUSE = '\x1b[?1000l\x1b[?1002l\x1b[?1006l';

const SGR_PREFIX = '\x1b[<';
const SGR_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/;
const WHEEL_UP   = 64;
const WHEEL_DOWN = 65;

// ── 模块级回调 (React 组件通过 setScrollHandlers 注入) ──
let gOnWheelUp: (() => void) | null = null;
let gOnWheelDown: (() => void) | null = null;

export function setScrollHandlers(
  up: (() => void) | null,
  down: (() => void) | null,
): void {
  gOnWheelUp = up;
  gOnWheelDown = down;
}

// ── 安装状态 ──
let installed = false;
let realStdin: typeof process.stdin;
let proxy: PassThrough;
let cleanupRegistered = false;

/**
 * 安装 stdin 代理。必须在 render() 之前调用一次。
 */
export function installStdinProxy(): void {
  if (installed) return;
  installed = true;

  realStdin = process.stdin;
  process.stdout.write(ENABLE_MOUSE);

  // ── 1. 创建代理流 ──
  proxy = new PassThrough({ allowHalfOpen: false });

  // isTTY — ink 和其他库判断是否为终端
  (proxy as unknown as Record<string, unknown>).isTTY = (realStdin as unknown as { isTTY?: boolean }).isTTY ?? false;

  // isRaw — ink v5+ 可能会读这个判断 raw mode
  Object.defineProperty(proxy, 'isRaw', {
    get: () => {
      const r = (realStdin as unknown as { isRaw?: unknown }).isRaw;
      return typeof r === 'function' ? r.call(realStdin) : r;
    },
    configurable: true,
    enumerable: true,
  });

  // rows / columns
  for (const prop of ['rows', 'columns']) {
    Object.defineProperty(proxy, prop, {
      get: () => (realStdin as unknown as Record<string, unknown>)[prop],
      configurable: true,
      enumerable: true,
    });
  }

  // setRawMode — ink 用来启用 raw 模式
  (proxy as unknown as Record<string, unknown>).setRawMode = function(mode: boolean) {
    return (realStdin as unknown as { setRawMode?: (m: boolean) => unknown }).setRawMode?.(mode);
  };

  // resume / pause / ref / unref — 代理到真实 stdin
  for (const fn of ['resume', 'pause', 'ref', 'unref'] as const) {
    (proxy as unknown as Record<string, unknown>)[fn] = function(...args: unknown[]) {
      const orig = (realStdin as unknown as Record<string, Function>)[fn];
      return typeof orig === 'function' ? orig.apply(realStdin, args) : undefined;
    };
  }

  // on / off / once / addListener / removeListener — EventEmitter 方法
  // process.stdin 是 ReadStream, 本质是 EventEmitter。
  // PassThrough 继承自 Transform → Duplex → Readable → Stream → EventEmitter,
  // 它原生支持 on/off/once/addListener/removeListener 等方法, 无需代理。
  // ink 通过它们监听 data/readable/end 等事件, 代理流自动处理。

  // ── 2. 暂停真实 stdin, 手动读取 ──
  realStdin.pause();

  const pump = (): void => {
    let buf: Buffer | null;
    while ((buf = (realStdin as unknown as { read(n?: number): Buffer | null }).read()) !== null) {
      const str = buf.toString();
      let idx = 0;

      // 逐个字符扫描，过滤 \x1b[< 起头的 SGR 鼠标序列
      while (idx < str.length) {
        if (str.startsWith(SGR_PREFIX, idx)) {
          // 找到 SGR 序列的结束位置 (M 或 m)
          const endIdx = str.indexOf('M', idx);
          const endIdx2 = str.indexOf('m', idx);
          const end = endIdx === -1 ? endIdx2 : endIdx2 === -1 ? endIdx : Math.min(endIdx, endIdx2);
          if (end === -1) {
            // 序列不完整（跨 buf 边界），丢弃剩余
            idx = str.length;
            break;
          }
          const seq = str.slice(idx, end + 1);
          const match = seq.match(SGR_RE);
          if (match) {
            const code = parseInt(match[1], 10);
            const isPress = match[4] === 'M';
            if (isPress) {
              if (code === WHEEL_UP) {
                for (let i = 0; i < 3; i++) gOnWheelUp?.();
              } else if (code === WHEEL_DOWN) {
                for (let i = 0; i < 3; i++) gOnWheelDown?.();
              }
            }
          }
          idx = end + 1;
        } else {
          // 非 SGR 前缀 → 写入代理流
          const nextSgr = str.indexOf(SGR_PREFIX, idx);
          const chunkEnd = nextSgr === -1 ? str.length : nextSgr;
          proxy.write(str.slice(idx, chunkEnd));
          idx = chunkEnd;
        }
      }
    }
  };

  realStdin.on('readable', pump);

  // ── 3. 替换 process.stdin ──
  Object.defineProperty(process, 'stdin', {
    value: proxy,
    writable: true,
    configurable: true,
  });

  // ── 4. 退出清理 ──
  if (!cleanupRegistered) {
    cleanupRegistered = true;
    const cleanup = (): void => {
      process.stdout.write(DISABLE_MOUSE);
      if (installed) {
        realStdin.off('readable', pump);
        proxy.end();
        Object.defineProperty(process, 'stdin', {
          value: realStdin,
          writable: true,
          configurable: true,
        });
        installed = false;
      }
    };
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  log.info('stdin 代理已安装');
}

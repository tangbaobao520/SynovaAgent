/**
 * tests/electron/ipc-contract.test.ts — D602 IPC 三方静态契约测试
 *
 * Spec: SYNOVA-IMPL-DSH-D602-interactive-cards-preload-20260908.md §7 用例 1-5（red→green）
 *   1. preload 暴露面 keys ≡ bridge.ElectronAPI keys 双向相等（现状 2≠10 必红 → 8≡8）
 *   2. bridge keys ⊆ 8 方法契约白名单 + 3 死接口（minimizeToTray/pauseNotifications/resumeNotifications）
 *      全 electron-renderer/src 零命中（死接口回归锁，铁律 37）
 *   3. main.cjs ipcMain 通道集合 ⊇ preload invoke/send 通道集合（现状零 ipcMain 必红）
 *   4. main.cjs 不含 Tray 旧页 URL（${SERVER_URL}/cockpit、${SERVER_URL}/app/admin.html——菜单修复契约；
 *      注意 /api/cockpit/data 是 P0 轮询合法保留，spec §5.3 决策 6-B，不在断言面）
 *   5. main.cjs 含 3 推送通道 send（push-notification/notification:click/navigate）+
 *      preload on* 订阅含 ipcRenderer.off 退订语义（防 effect 重挂载双订阅）+
 *      preload on 通道 ⊆ main send 通道（main 侧确有发送方——接线物理证明）
 *
 * 模式: desktop-build.test.ts 先例——fs.readFileSync 读三份源码 + 正则解析通道/方法集合（物理断言）。
 * red→green: 实现前本文件先存在且失败（spec DS1：现状 preload 2 方法 / main 零 ipcMain 必红）。
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ═══ 解析器（纯函数——物理事实提取，不做语义判断） ═══

/** 解析 preload.cjs contextBridge.exposeInMainWorld('electronAPI', { ... }) 对象字面量一级键 */
function parsePreloadKeys(source: string): string[] {
  const anchor = source.match(/exposeInMainWorld\(\s*['"]electronAPI['"]\s*,\s*\{/);
  if (!anchor || anchor.index === undefined) return [];
  const start = anchor.index + anchor[0].length;
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  const body = source.slice(start, i - 1);
  return [...body.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)].map((m) => m[1]);
}

/** 解析 bridge.ts ElectronAPI 接口成员名（spec §5.2-A 契约单源） */
function parseBridgeKeys(source: string): string[] {
  const m = source.match(/export interface ElectronAPI\s*\{([^}]*)\}/);
  if (!m) return [];
  return [...m[1].matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)].map((x) => x[1]);
}

/** preload CHANNELS 常量 → 字面量回查（`KEY: 'channel-name'` 定义行） */
function resolveChannelConstant(source: string, key: string): string | null {
  const def = source.match(new RegExp(`${key}\\s*:\\s*'([^']+)'`));
  return def ? def[1] : null;
}

/** preload ipcRenderer.invoke/send 通道集合（字面量与 CHANNELS 常量两种形态） */
function parsePreloadRequestChannels(source: string): string[] {
  const out = new Set<string>();
  // 字面量形态: ipcRenderer.invoke('ch' / ipcRenderer.send('ch', ...
  for (const m of source.matchAll(/ipcRenderer\.(?:invoke|send)\(\s*['"]([^'"]+)['"]/g)) {
    out.add(m[1]);
  }
  // CHANNELS 常量形态: ipcRenderer.invoke(CHANNELS.X) / ipcRenderer.send(CHANNELS.X, args...)
  for (const m of source.matchAll(/ipcRenderer\.(?:invoke|send)\(\s*CHANNELS\.([A-Z_]+)/g)) {
    const ch = resolveChannelConstant(source, m[1]);
    if (ch) out.add(ch);
  }
  return [...out];
}

/** preload ipcRenderer.on 订阅通道集合（subscribe 辅助 + 字面量两种形态） */
function parsePreloadOnChannels(source: string): string[] {
  const out = new Set<string>();
  // 直接字面量形式: ipcRenderer.on('ch', ...)
  for (const m of source.matchAll(/ipcRenderer\.on\(\s*['"]([^'"]+)['"]/g)) out.add(m[1]);
  // subscribe 辅助形式: subscribe(CHANNELS.X, ...) → 常量定义回查字面量
  for (const m of source.matchAll(/subscribe\(\s*CHANNELS\.([A-Z_]+)\s*,/g)) {
    const ch = resolveChannelConstant(source, m[1]);
    if (ch) out.add(ch);
  }
  return [...out];
}

/** main.cjs ipcMain.handle/on 通道集合 */
function parseMainHandlerChannels(source: string): { handle: string[]; on: string[] } {
  const handle = [...source.matchAll(/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const on = [...source.matchAll(/ipcMain\.on\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  return { handle, on };
}

/** main.cjs webContents.send 通道集合 */
function parseMainSendChannels(source: string): string[] {
  return [...source.matchAll(/webContents\.send\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/** 递归列目录文件（死接口全目录零命中断言用） */
function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

// ═══ 契约白名单（spec §5.2-A 表 8 方法——单源，禁止再增死接口） ═══

const CONTRACT_METHODS = [
  'getServerUrl',
  'getConfig',
  'getAppVersion',
  'showNotification',
  'updateTrayState',
  'onPushNotification',
  'onNotificationClick',
  'onNavigate',
] as const;

const DEAD_METHODS = ['minimizeToTray', 'pauseNotifications', 'resumeNotifications'] as const;

// ═══ tests ═══

describe('D602: IPC 三方静态契约（spec §7 用例 1-5）', () => {
  const preload = read('electron/preload.cjs');
  const bridge = read('electron-renderer/src/ipc/bridge.ts');
  const main = read('electron/main.cjs');

  it('用例 1: preload 暴露面 keys ≡ bridge.ElectronAPI keys（双向相等）', () => {
    const preloadKeys = parsePreloadKeys(preload);
    const bridgeKeys = parseBridgeKeys(bridge);
    expect(preloadKeys.sort()).toEqual([...bridgeKeys].sort());
    // 契约数收敛锁定: 恰好 8（spec §5.3 决策 1——方法集 B）
    expect(bridgeKeys.length).toBe(8);
    expect(preloadKeys.length).toBe(8);
  });

  it('用例 2: bridge keys ⊆ 契约白名单 + 3 死接口全 electron-renderer/src 零命中（铁律 37 回归锁）', () => {
    const bridgeKeys = parseBridgeKeys(bridge);
    for (const key of bridgeKeys) {
      expect((CONTRACT_METHODS as readonly string[]).includes(key)).toBe(true);
    }
    const srcDir = path.join(ROOT, 'electron-renderer/src');
    for (const file of walkFiles(srcDir)) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const dead of DEAD_METHODS) {
        expect({ file, dead, hit: content.includes(dead) }).toEqual({ file, dead, hit: false });
      }
    }
  });

  it('用例 3: main.cjs ipcMain 通道集合 ⊇ preload invoke/send 通道集合', () => {
    const preloadChannels = parsePreloadRequestChannels(preload);
    // preload 请求面恰为 3 通道（app:get-version / tray:update-state / notify:show）
    expect(preloadChannels.sort()).toEqual(['app:get-version', 'notify:show', 'tray:update-state']);
    const { handle, on } = parseMainHandlerChannels(main);
    const mainChannels = new Set([...handle, ...on]);
    for (const ch of preloadChannels) {
      expect({ channel: ch, covered: mainChannels.has(ch) }).toEqual({ channel: ch, covered: true });
    }
    // main 侧 handler 恰好覆盖 3 通道（不多注册死通道）
    expect(mainChannels.size).toBe(3);
  });

  it('用例 4: main.cjs 不含 Tray 旧页 URL（/cockpit 与 /app/admin.html 页面引用清零；/api/cockpit/data 轮询保留）', () => {
    expect(main).not.toContain('${SERVER_URL}/cockpit');
    expect(main).not.toContain('${SERVER_URL}/app/admin.html');
    expect(main).not.toContain('/app/admin.html');
    // 菜单三项指向现役 UI（打开 Synova / 打开通知中心 / Quit）
    expect(main).toContain("label: '打开 Synova'");
    expect(main).toContain("label: '打开通知中心'");
    // P0 轮询数据源合法保留（spec §5.3 决策 6-B）
    expect(main).toContain('/api/cockpit/data');
  });

  it('用例 5: main 含 3 推送通道 send + preload on* 含 off 退订语义 + on 通道有 main 发送方', () => {
    const sendChannels = parseMainSendChannels(main);
    for (const ch of ['push-notification', 'notification:click', 'navigate']) {
      expect({ channel: ch, sent: sendChannels.includes(ch) }).toEqual({ channel: ch, sent: true });
    }
    // preload 订阅退订语义（ipcRenderer.off——防 effect 重挂载双订阅）
    expect(preload).toMatch(/ipcRenderer\.off/);
    // preload on* 通道 ⊆ main send 通道（main 侧确有发送方——接线物理证明）
    const onChannels = parsePreloadOnChannels(preload);
    expect(onChannels.sort()).toEqual(['navigate', 'notification:click', 'push-notification']);
    for (const ch of onChannels) {
      expect({ channel: ch, sent: sendChannels.includes(ch) }).toEqual({ channel: ch, sent: true });
    }
  });
});

/**
 * tests/electron/desktop-build.test.ts — D504 打包配置 + renderer 接线静态断言
 *
 * 契约（铁律 47）: 机器可判定的打包/接线物理事实（CI 无 GUI 也能验证 L1-1/1-5）:
 *   ① build-synova.cjs extraResources 携带后端运行资产（dist/extensions/renderer）
 *   ② files 白名单含 electron/backend-spawn.cjs
 *   ③ electron/package.json 提供 pack/pack:dir 脚本
 *   ④ main.cjs 集成 ensureBackend（WIRE CHECK）+ before-quit stop + isPackaged 双引导分支
 *   ⑤ vite proxy 指向 18790（缺陷 D 修复）
 *   ⑥ renderer fetch 全部经 getApiBase（生产 loadFile 后相对路径失效）
 *   ⑦ SYNOVA_DB_PATH 注入（userData 数据目录，L1-7）
 * 铁律 48: 每条断言有 expect()，物理 grep/read 文件内容。
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf-8');

describe('D504 打包配置 — electron-builder 产物面', () => {
  const buildConfig = read('build-synova.cjs');

  it('extraResources 携带后端运行资产（dist + extensions）', () => {
    expect(buildConfig).toMatch(/extraResources/);
    expect(buildConfig).toMatch(/from:\s*'dist'/);
    expect(buildConfig).toMatch(/from:\s*'extensions'/);
  });

  it('files 白名单含 backend-spawn.cjs 与 renderer 产物', () => {
    expect(buildConfig).toContain('electron/backend-spawn.cjs');
    expect(buildConfig).toMatch(/dist\/renderer/);
  });

  it('electron/package.json 提供 pack / pack:dir 脚本', () => {
    const pkg = JSON.parse(read('electron/package.json')) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.pack).toBeTruthy();
    expect(pkg.scripts?.['pack:dir']).toContain('--dir');
  });
});

describe('D504 main.cjs — 服务自启 + 双引导接线（WIRE CHECK）', () => {
  const main = read('electron/main.cjs');

  it('whenReady 集成 ensureBackend（铁律 0-2 WIRE CHECK——零引用 = 未完成）', () => {
    expect(main).toMatch(/require\(['"]\.\/backend-spawn\.cjs['"]\)/);
    expect(main).toMatch(/ensureBackend\(/);
  });

  it('before-quit 调 stop()（生命周期闭环）', () => {
    expect(main).toMatch(/before-quit[\s\S]*?\.stop\(\)/);
  });

  it('app.isPackaged 双引导分支互斥（L1-5 单一入口）', () => {
    expect(main).toMatch(/app\.isPackaged/);
    expect(main).toMatch(/loadFile\([\s\S]*?renderer/);
  });

  it('prod spawn 注入 SYNOVA_DB_PATH（L1-7 升级不丢数据基础）', () => {
    expect(main).toMatch(/SYNOVA_DB_PATH/);
    expect(main).toMatch(/getPath\('userData'\)/);
  });

  it('spawn 降级显式提示（铁律 11/24——不静默）', () => {
    expect(main).toMatch(/degraded/);
    expect(main).toMatch(/console\.(warn|error)/);
  });
});

describe('D504 renderer — base URL 接线（缺陷 C/D 修复）', () => {
  it('vite proxy 指向 18790（缺陷 D）', () => {
    const vite = read('electron-renderer/vite.config.ts');
    expect(vite).toContain('http://localhost:18790');
    expect(vite).not.toContain('http://localhost:3000');
  });

  it('统一封装 src/lib/api.ts 导出 getApiBase', () => {
    const api = read('electron-renderer/src/lib/api.ts');
    expect(api).toMatch(/export function getApiBase/);
    expect(api).toMatch(/getServerUrl/);
  });

  it('bridge ElectronAPI 接口含 getServerUrl（preload 已有，接口补声明）', () => {
    const bridge = read('electron-renderer/src/ipc/bridge.ts');
    expect(bridge).toMatch(/getServerUrl/);
  });

  it('全部 fetch 调用点接 base URL（铁律 9——grep 无裸相对路径 fetch）', () => {
    const files = [
      'electron-renderer/src/App.tsx',
      'electron-renderer/src/hooks/useStreaming.ts',
      'electron-renderer/src/hooks/useNotifications.ts',
      'electron-renderer/src/components/LeftPanel.tsx',
      'electron-renderer/src/components/RightPanel.tsx',
    ];
    for (const f of files) {
      const src = read(f);
      // 不得再有裸 fetch('/api...) / fetch('/health'...)（模板字符串相对路径同理）
      const bare = src.match(/fetch\(\s*['"`](\/api|\/health)[^'"`]*['"`]/g) ?? [];
      expect(bare, `${f} 仍存在裸相对路径 fetch: ${bare.join(', ')}`).toHaveLength(0);
    }
    // 且至少 useStreaming consult 调用带 base
    const streaming = read('electron-renderer/src/hooks/useStreaming.ts');
    expect(streaming).toMatch(/getApiBase\(\)/);
  });
});

describe('D504 GS-01 — Electron 产物断言组接线', () => {
  it('run.sh 含 Electron 断言组（backend-spawn 契约 + renderer 产物 + 配置断言）', () => {
    const run = read('scripts/golden-scenarios/GS-01-first-diagnosis/run.sh');
    expect(run).toMatch(/backend-spawn/);
    expect(run).toMatch(/electron/i);
  });
});

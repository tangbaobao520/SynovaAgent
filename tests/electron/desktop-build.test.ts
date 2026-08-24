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

// ═══ D517 新增断言组（spec §7——L1 单元 + 产物物理断言 + workflow 契约）═══

describe('D517 打包配置 — mac zip target + 构建链契约', () => {
  it('mac target 含 dmg + zip 双 target（zip 供 CI artifact 与解包验证）', () => {
    const cfg = read('build-synova.cjs');
    expect(cfg).toMatch(/target:\s*'dmg'/);
    expect(cfg).toMatch(/target:\s*'zip'/);
  });

  it('构建链三步契约写入 build-synova.cjs 头注释（顺序错=空包）', () => {
    const cfg = read('build-synova.cjs');
    expect(cfg).toMatch(/构建链契约/);
    expect(cfg).toMatch(/npm run build:backend/);
    expect(cfg).toMatch(/electron-renderer/);
    expect(cfg).toMatch(/顺序不可颠倒/);
  });

  it('extraResources 携带后端 bundle 与原生模块 externals（D518 prod 运行时）', () => {
    const cfg = read('build-synova.cjs');
    expect(cfg).toMatch(/backend\.mjs/);
    expect(cfg).toMatch(/better-sqlite3\/\*\*/);
    expect(cfg).toMatch(/bcrypt\/\*\*/);
    // node_modules→node_modules 映射存在（externals 落包）
    expect(cfg).toMatch(/from:\s*'node_modules',\s*to:\s*'node_modules'/);
  });
});

describe('D517 CI — desktop-build workflow 契约', () => {
  const wfPath = path.join(ROOT, '.github/workflows/desktop-build.yml');

  it('workflow 文件存在且含 macos/windows 双平台 matrix', () => {
    expect(fs.existsSync(wfPath)).toBe(true);
    const wf = fs.readFileSync(wfPath, 'utf-8');
    expect(wf).toMatch(/macos-latest/);
    expect(wf).toMatch(/windows-latest/);
    expect(wf).toMatch(/matrix/);
  });

  it('构建链三步顺序 + 产物断言 + upload-artifact（产物缺失即红）', () => {
    const wf = fs.readFileSync(wfPath, 'utf-8');
    expect(wf).toMatch(/npm run build:backend/);
    expect(wf).toMatch(/test -f dist\/backend\.mjs/);
    expect(wf).toMatch(/working-directory: electron-renderer/);
    expect(wf).toMatch(/npx electron-builder --config build-synova\.cjs/);
    expect(wf).toMatch(/upload-artifact@v4/);
    expect(wf).toMatch(/if-no-files-found: error/);
    expect(wf).toMatch(/::error::no dmg produced/);
  });

  it('触发器: push main + workflow_dispatch（任何人可手动复现）', () => {
    const wf = fs.readFileSync(wfPath, 'utf-8');
    expect(wf).toMatch(/push:[\s\S]*?branches:\s*\[main\]/);
    expect(wf).toMatch(/workflow_dispatch:/);
  });
});

describe('D517 产物物理断言组（release/ 存在时生效；未构建环境 skip+warn 不误报）', () => {
  const releaseDir = path.join(ROOT, 'release');

  const maybe = fs.existsSync(releaseDir) ? it : it.skip;
  if (!fs.existsSync(releaseDir)) {
    // 铁律 11/24: skip 不静默——console.warn 留痕
    console.warn('[desktop-build.test] release/ 不存在——产物断言组 skip（未构建环境，非失败）');
  }

  // electron-builder 25 磁盘事实: 配置声明多 arch 时 --dir 产物目录带 arch 后缀
  // （release/mac-arm64 / release/mac-x64；单 arch 时为 release/mac）。以磁盘为准自动发现。
  const findMacAppDir = (): string => {
    const cands = fs.readdirSync(releaseDir)
      .filter((d) => /^mac(-\w+)?$/.test(d))
      .map((d) => path.join(releaseDir, d, 'SynovaAgent.app'))
      .filter((d) => fs.existsSync(d))
      // 多 arch 产物目录并存时取最新（历史构建残留的残缺目录不干扰断言）
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (cands.length === 0) throw new Error('release/ 存在但未找到 mac*/SynovaAgent.app——疑似空打包');
    return cands[0];
  };

  maybe('--dir 产物 release/mac*/SynovaAgent.app 存在且 >100MB（DS1 物理契约）', () => {
    const appDir = findMacAppDir();
    const total = require('child_process').execSync(
      `du -sm "${appDir}" | cut -f1`, { encoding: 'utf-8' },
    ).trim();
    expect(Number(total)).toBeGreaterThan(100);
  });

  maybe('--dir 产物含后端 bundle 与 renderer 运行资产（extraResources 真实落包，非空包）', () => {
    const res = path.join(findMacAppDir(), 'Contents', 'Resources');
    expect(fs.existsSync(path.join(res, 'dist', 'backend.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(res, 'renderer', 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(res, 'extensions'))).toBe(true);
    // 原生模块 externals 落包（D518 prod 运行时）
    expect(fs.existsSync(path.join(res, 'node_modules', 'better-sqlite3'))).toBe(true);
    expect(fs.existsSync(path.join(res, 'node_modules', 'bcrypt'))).toBe(true);
  });

  maybe('full 构建产物 dmg/zip 存在且 zip >10MB（<10MB=空包红，L2c 边界）', () => {
    const files = fs.readdirSync(releaseDir);
    const dmg = files.filter((f) => f.endsWith('.dmg'));
    const zip = files.filter((f) => /-mac.*\.zip$/.test(f));
    if (dmg.length === 0 && zip.length === 0) return; // 只跑过 --dir 的环境: 无 full 产物，不误报
    expect(dmg.length).toBeGreaterThan(0);
    expect(zip.length).toBeGreaterThan(0);
    for (const z of zip) {
      const st = fs.statSync(path.join(releaseDir, z));
      expect(st.size).toBeGreaterThan(10 * 1024 * 1024);
    }
  });
});

describe('D517 renderer 类型冲突修复回归（window.electronAPI 单一类型源）', () => {
  it('api.ts 不再独立声明 ElectronServerApi 全局（与 bridge.ts ElectronAPI 冲突=build 红）', () => {
    const api = read('electron-renderer/src/lib/api.ts');
    expect(api).not.toMatch(/interface ElectronServerApi/);
    expect(api).toMatch(/import type \{ ElectronAPI \}/);
  });
});

describe('D504 GS-01 — Electron 产物断言组接线', () => {
  it('run.sh 含 Electron 断言组（backend-spawn 契约 + renderer 产物 + 配置断言）', () => {
    const run = read('scripts/golden-scenarios/GS-01-first-diagnosis/run.sh');
    expect(run).toMatch(/backend-spawn/);
    expect(run).toMatch(/electron/i);
  });
});

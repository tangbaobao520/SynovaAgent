/**
 * tests/electron/dual-guide-packaging-guard.test.ts — D716/1-5 打包形状守卫（G-4）+ 渲染层唯一入口（G-5）
 *
 * 契约（铁律 47）:
 *   G-4 打包形状: build-synova.cjs 的 files 白名单与 extraResources 均不含 app/ 条目
 *       （把旧 Web UI 打进安装包 = 打包态重造双引导）。反向验证 T12：注入 'app' 条目 → 守卫红。
 *   G-5 唯一入口在渲染层: electron/main.cjs prod 分支 loadFile(renderer/index.html)，
 *       且 LlmSetupCard 被 WelcomeScreen 引用（防"退场了但没有新入口"）。
 * 域红线: 本文件对 electron/、electron-renderer/、build-synova.cjs **只读断言**（Mac DSH 域，零写入）。
 * 模式: 沿 tests/electron/desktop-build.test.ts 的只读文本断言；文件名不含 app/ 前缀防同目录撞车。
 * 注: 真实包内清单（release/ 产物）不在 CI 断言范围——本守卫是"打包形状"静态防线（spec §7），
 *     包内实测归安装验证脚本（mac-install-verify），两者互补不互替。
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf-8');

/** 从构建配置文本中抽取 `key: [` 起的完整数组块（深度计数处理嵌套 filter 数组） */
function extractArrayBlock(text: string, key: string): string {
  const lines = text.split(/\r?\n/);
  const buf: string[] = [];
  let collecting = false;
  let depth = 0;
  for (const line of lines) {
    if (!collecting) {
      if (new RegExp(`^\\s*${key}:\\s*\\[`).test(line)) {
        collecting = true;
        buf.push(line);
        depth = (line.match(/\[/g) ?? []).length - (line.match(/\]/g) ?? []).length;
        if (depth <= 0) break;
      }
      continue;
    }
    buf.push(line);
    depth += (line.match(/\[/g) ?? []).length - (line.match(/\]/g) ?? []).length;
    if (depth <= 0) break;
  }
  if (!collecting) throw new Error(`构建配置中未找到 ${key}: [ 数组块——守卫读不到断言对象，按红处理`);
  return buf.join('\n');
}

/** G-4 判定本体：块内所有带引号条目中命中 app/ 语义的（'app'、'app/**'、'!app/**'、'xx/app' 等） */
function findAppEntries(block: string): string[] {
  const entries = [...block.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  return entries.filter((e) => {
    const bare = e.replace(/^!/, '');
    return bare === 'app' || /(^|\/)app(\/|$)/.test(bare);
  });
}

describe('D716/1-5 守卫 G-4 — 打包形状（只读断言 build-synova.cjs）', () => {
  const buildConfig = read('build-synova.cjs');

  it('G-4 files 白名单不含 app/ 条目（旧 Web UI 不得进包）', () => {
    expect(findAppEntries(extractArrayBlock(buildConfig, 'files'))).toEqual([]);
  });

  it('G-4 extraResources 不含 app/ 条目（dist/extensions/renderer/node_modules 之外零携带）', () => {
    expect(findAppEntries(extractArrayBlock(buildConfig, 'extraResources'))).toEqual([]);
  });

  it('G-4 前置自检：files 含 electron/main.cjs（守卫读的是真实打包配置，不是空文本）', () => {
    expect(extractArrayBlock(buildConfig, 'files')).toContain('electron/main.cjs');
  });

  it('T12 反向验证（红→撤销→绿，文本副本）：files 注入 app/ 条目 → 守卫红；撤销 → 守卫复绿', () => {
    // 红：注入（等价于有人把整个 app/ 打进安装包）
    const injected = buildConfig.replace('files: [', "files: [\n    'app',");
    expect(findAppEntries(extractArrayBlock(injected, 'files'))).not.toEqual([]);
    // 绿：撤销后原配置复绿（本测试对真实文件零写入）
    expect(findAppEntries(extractArrayBlock(buildConfig, 'files'))).toEqual([]);
  });
});

describe('D716/1-5 守卫 G-5 — 唯一入口在渲染层（只读断言 electron 域）', () => {
  it('G-5 electron/main.cjs prod 分支 loadFile(renderer/index.html)（唯一窗口入口）', () => {
    const main = read('electron/main.cjs');
    expect(main).toMatch(/loadFile\(path\.join\(process\.resourcesPath,\s*'renderer',\s*'index\.html'\)\)/);
  });

  it('G-5 首诊卡片接线：LlmSetupCard 被 WelcomeScreen 生产 import + 渲染（非注释）', () => {
    const welcome = read('electron-renderer/src/components/WelcomeScreen.tsx');
    expect(welcome).toMatch(/import\s*\{[^}]*LlmSetupCard[^}]*\}\s*from\s*'\.\/LlmSetupCard'/);
    expect(welcome).toMatch(/<LlmSetupCard/);
    expect(fs.existsSync(path.join(ROOT, 'electron-renderer', 'src', 'components', 'LlmSetupCard.tsx'))).toBe(true);
  });
});

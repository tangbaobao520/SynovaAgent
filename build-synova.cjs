/**
 * build-synova.cjs — SynovaAgent Electron 打包配置
 *
 * 方案 A: 桌面端安装包打包
 * 用法: npx electron-builder --config build-synova.cjs [--dir|--mac|--win]
 *
 * 产物:
 *   release/mac/SynovaAgent.app + release/*.dmg + release/*.zip (macOS, D517)
 *   release/SynovaAgent-{version}-win32-x64/SynovaAgent.exe / *.exe (Windows nsis)
 *
 * ── 构建链契约（D517+D518 修订，顺序不可颠倒——顺序错 = 空包）──
 *   步骤1  根目录: npm ci && npm run build:backend → esbuild 单文件 dist/backend.mjs（prod 后端入口）
 *          （tsc 不在打包链内: dist/src 在 prod 链路无消费者，tsc 全量类型门禁独立存在且
 *            main 存量错误由 ci.yml 白名单管理——非本切片债务）
 *   步骤2  cd electron-renderer && npm ci && npm run build → vite 产物 dist/renderer/（首诊 UI）
 *   步骤3  npx electron-builder --config build-synova.cjs [--dir]  → release/
 *   依据: extraResources 映射引用步骤1/2 产物（dist→dist!renderer、dist/renderer→renderer、
 *         extensions→extensions、node_modules→原生模块 externals）。步骤1/2 未完成或顺序颠倒
 *         → extraResources 落空 → 空包（tests/electron/desktop-build.test.ts 产物断言组会红）。
 *
 * CI: .github/workflows/desktop-build.yml 按此三步顺序执行（push main / workflow_dispatch）。
 * 手册: docs/synova/runbooks/desktop-build.md（本地命令 + Gatekeeper 未签名警告说明）。
 *
 * 基于 Novis box/build-desktop.js 架构模式。
 */

const pkg = require('./package.json');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * D713 打包链签名/原生依赖钩子（2026-09-13，创始人报告"打都打不开"）
 *
 * 背景（实测）:
 *   dmg/zip 内 app 无 Contents/_CodeSignature 封印 → macOS 拒绝启动（提示『已损坏』）。
 *   根因: app-builder-lib@25.1.8 在无 Developer ID 证书时只 log skip（out/macPackager.js:202-211），
 *         配置里也没有 identity → 产物从未被签名，而 CI 只断言产物"存在"不断言"可用"。
 * 修法（无付费证书时的正解）:
 *   ① beforePack: 按**目标架构**准备 better-sqlite3 的 electron 预编译（修 x64 包内含 arm64 模块的错配；
 *      CI 原命令不带 --arch，在 arm64 runner 上打 x64 包必然错配）。
 *   ② afterPack: 对 .app 做 ad-hoc 签名（codesign --sign -）并**立即自检**——自检失败即 throw 中止构建，
 *      坏包根本到不了 dmg/zip 与分发环节（铁律 35：能自动化的不靠人）。
 */
function d713Run(cmd, args, opts) {
  return spawnSync(cmd, args, Object.assign({ encoding: 'utf8' }, opts || {}));
}

function d713ArchName(arch) {
  // electron-builder Arch 枚举: 0=x64 1=ia32 2=armv7l 3=arm64 4=universal
  return { 0: 'x64', 1: 'ia32', 2: 'armv7l', 3: 'arm64' }[arch] || null;
}

const D713_SHIPPED_ARCHES = ['x64', 'arm64'];  // 我们实际出货的 mac 架构（build-synova.cjs mac.target）

function d713PrepNative(context) {
  const arch = d713ArchName(context.arch);
  if (!arch) {
    console.log(`[D713] 跳过 native 准备: 未映射 arch=${context.arch}`);
    return;
  }
  if (!D713_SHIPPED_ARCHES.includes(arch)) {
    // ia32 等未出货架构：better-sqlite3 无对应 electron 预编译（实测 "No prebuilt binaries found"）→
    // 显式跳过并说明，避免"未出货架构"把整次构建 fail 掉（fail-closed 只应作用于出货架构）
    console.log(`[D713] 跳过 native 准备: arch=${arch} 不在出货架构 ${D713_SHIPPED_ARCHES.join('/')} 内`);
    return;
  }
  const electronVersion = String((pkg.devDependencies || {}).electron || '').replace(/^[^0-9]*/, '');
  const cwd = path.join(__dirname, 'node_modules', 'better-sqlite3');
  if (!fs.existsSync(cwd)) {
    throw new Error(`[D713] better-sqlite3 目录不存在: ${cwd}（先跑 npm ci）`);
  }
  const r = d713Run('npx', ['prebuild-install', '-r', 'electron', '-t', electronVersion, '--arch', arch], { cwd, stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`[D713] native 依赖准备失败（arch=${arch}, electron=${electronVersion}）exit=${r.status}——fail-closed，不产出错配包`);
  }
  console.log(`[D713] native 依赖就绪: better-sqlite3 arch=${arch} electron=${electronVersion}`);
}

function d713SignApp(context) {
  if (context.electronPlatformName !== 'darwin') {
    console.log(`[D713] 非 darwin（${context.electronPlatformName}）→ 跳过 ad-hoc 签名`);
    return;
  }
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (!fs.existsSync(appPath)) {
    throw new Error(`[D713] app 产物不存在: ${appPath}`);
  }
  const sign = d713Run('codesign', ['--force', '--deep', '--sign', '-', appPath]);
  if (sign.status !== 0) {
    throw new Error(`[D713] ad-hoc 签名失败: ${sign.stderr || sign.stdout}`);
  }
  const verify = d713Run('codesign', ['--verify', '--deep', '--strict', appPath]);
  if (verify.status !== 0) {
    throw new Error(`[D713] 签名自检失败（构建阻断，防坏包出货）: ${verify.stderr || verify.stdout}`);
  }
  const seal = path.join(appPath, 'Contents', '_CodeSignature', 'CodeResources');
  if (!fs.existsSync(seal)) {
    throw new Error(`[D713] 签名封印缺失: ${seal}`);
  }
  console.log(`[D713] ad-hoc 签名 + 自检通过: ${appPath}`);
}

/**
 * D581 构建守卫契约（铁律 47）:
 *   输入: root — 仓库根目录（默认 __dirname；测试注入临时目录以覆盖 正常/缺失 两路径。
 *         字段名对齐 electron-builder BeforeBuildContext.appDir——BeforePackContext 实际
 *         无此字段，真实调用恒走 __dirname fallback，两者同为仓库根，语义等价）
 *   输出: dist/backend.mjs 存在 → undefined（放行打包）；缺失 → throw Error（message 含
 *         `npm run build:backend` 修复指引，electron-builder 以非零退出呈现，空包不出）
 *   降级: 无——静默放行 = 空包，fail-fast 是唯一行为（与 CI desktop-build.yml `test -f
 *         dist/backend.mjs` 门禁同语义）
 *   载体: module.exports.beforePack——beforeBuild 钩子挂在 installAppDependencies() 内，
 *         npmRebuild:false（D529 冻结项）时提前 return 永不执行；beforePack 在 doPack()
 *         开头无条件调用（app-builder-lib/out/platformPackager.js doPack），真实打包路径必经。
 */
function assertBackendArtifact(root = __dirname) {
  const backendArtifact = path.join(root, 'dist', 'backend.mjs');
  if (!fs.existsSync(backendArtifact)) {
    throw new Error(
      '[build-synova] 构建守卫: dist/backend.mjs 不存在（三步构建链步骤1产物，缺失必出空包）。' +
      '先跑 `npm run build:backend` 再打包（顺序契约见本文件头注释；CI desktop-build.yml test -f 同语义）。'
    );
  }
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.synova.agent',
  productName: 'SynovaAgent',
  copyright: 'Copyright © 2026 Synova',
  
  directories: {
    output: 'release',
    buildResources: 'assets',
  },

  // ══ D581 构建守卫（方案 b 语义: fail-fast 断言，不强制重建——CI test -f 同语义）══
  // 成功路径必须返回 undefined: packager.js 实证 beforeBuild/beforePack 返回 false 会被
  // 解读为"node_modules 由外部处理"而跳过依赖处理，绝不 return false。
  beforePack: (context) => assertBackendArtifact((context && context.appDir) || __dirname),

  // D529: 禁用 electron-builder 内建 @electron/rebuild——它把 N-API 的 bcrypt 6.0.0 误判为
  // node-gyp 模块去源码编译（bcrypt 6 是 prebuildify --napi，install=node-gyp-build，ABI 无关，
  // 无需为 Electron 重建），双平台实测挂死 30min+（VS2026/node-gyp 组合下 node-gyp rebuild 不返回）。
  // 改为 CI 显式 `npx @electron/rebuild -f -w better-sqlite3`（electron-v130 预编译直达，免源码编译）。
  npmRebuild: false,

  extraMetadata: {
    main: 'electron/main.cjs',
  },

  files: [
    'electron/main.cjs',
    'electron/backend-spawn.cjs',
    'electron/preload.cjs',
    'electron/config.json',
    'electron/icon.png',
    'package.json',
    '!node_modules/.cache/**',
    '!node_modules/electron-builder/**',
  ],

  // D504: 后端运行资产放 resources/（prod spawn: node dist/index.js + extensions 哨兵目录）
  // renderer 构建产物（vite outDir dist/renderer）→ resources/renderer（prod loadFile 目标）
  extraResources: [
    { from: 'dist', to: 'dist', filter: ['**/*', '!renderer/**'] },   // 含 backend.mjs（D518 prod 后端入口）
    { from: 'dist/renderer', to: 'renderer' },
    { from: 'extensions', to: 'extensions' },
    // D518: backend.mjs 的原生模块 externals——electron-builder 打包前会把项目 node_modules
    // 原生模块 rebuild 为 Electron ABI，此处复制即 ABI 一致（包内 Electron node 模式执行）
    { from: 'node_modules', to: 'node_modules', filter: [
      'better-sqlite3/**', 'bcrypt/**', 'bindings/**', 'file-uri-to-path/**', 'node-gyp-build/**',
    ] },
  ],

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'assets/icon.ico',
    artifactName: 'SynovaAgent-${version}-win32-x64.${ext}',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'SynovaAgent',
    installerIcon: 'assets/icon.ico',
    uninstallerIcon: 'assets/icon.ico',
  },

  mac: {
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },   // D517 新增: CI artifact + 解包验证
    ],
    category: 'public.app-category.business',
    // D713: 无 Developer ID 证书 → 显式声明不追证书（避免自动发现造成的非确定性），
    //       真正签名由下方 afterPack 的 ad-hoc 签名承担（arm64 可执行文件必须有签名才能启动）。
    identity: null,
  },

  // D713: 打包链钩子（顺序：beforePack 守卫+native 准备 → 打包 → afterPack 签名+自检 → dmg/zip）
  // ⚠ 必须与 D581 构建守卫共存：D713 首版误覆盖了 `beforePack: assertBackendArtifact`，
  //   导致 tests/electron/desktop-build.test.ts「缺失路径 fail-fast」红（2026-09-13 实测抓到，已修）。
  //   成功路径必须返回 undefined（D581 注释：返回 false 会被 electron-builder 解读为「node_modules 由外部处理」）。
  beforePack: (context) => {
    const guard = assertBackendArtifact((context && context.appDir) || __dirname);
    d713PrepNative(context);
    return guard;
  },
  afterPack: async (context) => { d713SignApp(context); },

  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }],
    category: 'Office',
  },

  // 自动更新 (方案 A Phase 2)
  // publish: {
  //   provider: 'github',
  //   owner: 'tangbaobao520',
  //   repo: 'SynovaAgent',
  // },
};

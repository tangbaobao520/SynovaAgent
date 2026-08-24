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
 * ── 构建链契约（D517，顺序不可颠倒——顺序错 = 空包）──
 *   步骤1  根目录: npm ci && npm run build      → tsc 产物 dist/src/index.js（后端入口）
 *   步骤2  cd electron-renderer && npm ci && npm run build → vite 产物 dist/renderer/（首诊 UI）
 *   步骤3  npx electron-builder --config build-synova.cjs [--dir]  → release/
 *   依据: extraResources 三条映射引用步骤1/2 的产物（dist→dist!renderer、dist/renderer→renderer、
 *         extensions→extensions）。步骤1/2 未完成或顺序颠倒 → extraResources 落空 → 打出不含
 *         后端与 renderer 的空包（tests/electron/desktop-build.test.ts 产物断言组会红）。
 *
 * CI: .github/workflows/desktop-build.yml 按此三步顺序执行（push main / workflow_dispatch）。
 * 手册: docs/synova/runbooks/desktop-build.md（本地命令 + Gatekeeper 未签名警告说明）。
 *
 * 基于 Novis box/build-desktop.js 架构模式。
 */

const pkg = require('./package.json');

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.synova.agent',
  productName: 'SynovaAgent',
  copyright: 'Copyright © 2026 Synova',
  
  directories: {
    output: 'release',
    buildResources: 'assets',
  },

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
    { from: 'dist', to: 'dist', filter: ['**/*', '!renderer/**'] },
    { from: 'dist/renderer', to: 'renderer' },
    { from: 'extensions', to: 'extensions' },
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
  },

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

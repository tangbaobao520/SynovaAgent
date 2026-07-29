/**
 * build-synova.js — SynovaAgent Electron 打包配置
 *
 * 方案 A: 桌面端 .exe 打包
 * 用法: npx electron-builder --config build-synova.js
 *
 * 产物:
 *   release/SynovaAgent-{version}-win32-x64/SynovaAgent.exe (Windows)
 *   release/SynovaAgent-{version}-darwin-x64/SynovaAgent.app (macOS)
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
    'electron/preload.cjs',
    'electron/config.json',
    'electron/icon.png',
    'package.json',
    '!node_modules/.cache/**',
    '!node_modules/electron-builder/**',
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
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
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

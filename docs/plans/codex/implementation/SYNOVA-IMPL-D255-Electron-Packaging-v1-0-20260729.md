<!-- SYNOVA-IMPL-D255 v1.0 | 2026-07-29 | Electron 桌面打包 -->
# SynovaAgent -- D255 Electron 桌面打包 (.exe) v1.0
> D233 修复了 Electron 可启动性, 但从未打包成 Windows .exe

## 代码验证
- build-synova.cjs: electron-builder 配置完整 (appId/productName/directories/files/win/nsis) ✅
- electron/main.cjs: 入口 133行, 含 Tray降级+Server检测+P0轮询 ✅
- electron/preload.cjs: contextBridge 暴露 electronAPI ✅
- electron/config.json: serverUrl=localhost:18790 ✅
- electron/icon.png: 104B 占位图标 ✅
- assets/icon.ico: 存在 ✅
- release/ 目录: 存在但为空 ❌
- 根 package.json devDependencies: 无 electron-builder ❌
- 根 package.json scripts: electron:build:win='electron-builder --config build-synova.cjs --win'——但 electron-builder 未安装 ❌

### build-synova.cjs files 配置问题
当前 files 数组包含:
- `'node_modules/electron/**/*'` —— electron 不在根 node_modules (在 electron/node_modules/), 此行无效 ❌
- `'!src/**'` + `'!app/**'` —— 排除源文件, 对瘦客户端正确 ✅
- 引用路径: `'synova_worker/'` 目录可能不存在 ❌

## Q0-Q4
Q0: Electron 能启动 (`npm run electron:dev`), 但不能打包成 .exe——electron-builder 未安装。
Q1: electron-builder Quick Start: npm install --save-dev electron-builder; 配置 build-synova.cjs; npx electron-builder --win
Q2: 做——根 package.json 加 electron-builder devDependency; 修正 files 配置(去掉无效 node_modules/electron 行); 去掉不存在的 synova_worker extraResources; 跑 electron:build:win → 产出 installable .exe。不做——macOS/Linux 打包, 自动更新, 代码签名。
Q3: npm run electron:build:win → release/SynovaAgent-0.1.0-win32-x64/SynovaAgent Setup 0.1.0.exe → 双击安装 → 桌面快捷方式 → 启动 → 连接 localhost:18790
Q4: L1 手动验证——双击 .exe, 检查窗口+托盘+离线页。纯打包无 tsc 变更。

## 改动 (3 文件)

### 1. package.json — 加 electron-builder devDependency
devDependencies 追加:
```json
"electron-builder": "^25.1.8"
```
安装: npm install --save-dev electron-builder@^25.1.8

### 2. build-synova.cjs — 修正 files 配置
替换 files 数组:
```javascript
files: [
  'electron/main.cjs',
  'electron/preload.cjs',
  'electron/config.json',
  'electron/icon.png',
  'package.json',
],
```
删除 extraResources (synova_worker 不存在且瘦客户端不需要):
```javascript
// extraResources removed — thin client doesn't need server-side Python worker
```

### 3. electron/icon.png — 可用 (104B 占位), 不需要改
assets/icon.ico 为安装程序图标, electron/icon.png 为运行时图标, 分离正确 ✅

## 测试 (L1 手动×3)
| # | 测试 |
|---|------|
| 1 | npm run electron:build:win → 产出 SynovaAgent Setup .exe |
| 2 | 双击安装 → 桌面快捷方式 + 开始菜单 |
| 3 | 启动 → 窗口加载 → Server 未运行时显示离线页 + 重试按钮 |

## 完成标准
Windows .exe 安装包可产出 + 安装后桌面快捷方式可启动。纯打包无 tsc 变更。

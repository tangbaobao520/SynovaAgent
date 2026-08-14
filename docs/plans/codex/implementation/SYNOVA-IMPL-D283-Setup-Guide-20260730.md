<!--
  SYNOVA-IMPL-D283: 客户自安装引导 — setup.html + setup.js + setup.css
  状态: dev doc | 2026-07-30
  权威文档: 开发者任务地图 v2.0 N10 + 预期状态模型 v3.1 §一
  依赖: D246 (onboarding wizard参考) D232 (deployment guide) D255 (Electron打包)
  并行: D281, D282 — 零共享文件
-->

# D283: 客户自安装引导 — setup.html + setup.js + setup.css

## 1. 权威文档引用

**来源**: [开发者任务地图 v2.0](D:\novis-backup-20260526\Novis\synova-agent\docs\synova\research\权威文档17-自诊断系统-20260729\权威文档17-开发者任务地图-v2-0-20260730.md) N10

> N10: 安装引导 — 文件: app/setup.html (新建), app/js/setup.js (新建), app/css/setup.css (新建)
> 当前状态: 无独立 setup 页。D246 做了 onboarding wizard(admin内嵌)，不是客户首次启动的引导页
> 验收: 不了解Synova的人能在10分钟内完成安装配置

**来源**: 预期状态模型 v3.1 §一

> 客户自己安装部署: ❌ 没有安装引导,没有首次配置页

## 2. 代码审计——现状

### 2.1 现有部署流程 (D232 manual guide)

```
git clone → npm install → python env_validator.py → npm run dev → 验证 login.html/cockpit
```

全手动，7步，需要命令行知识。

### 2.2 D246 onboarding wizard (不可复用)

D246 的 onboarding 是 admin.html 内嵌的注册→邀请→导入→诊断→查看引导。它是**管理员的入职**流程，不是**客户的安装配置**流程。两者的入口和上下文完全不同：

| | D246 admin onboarding | D283 setup.html |
|------|------|------|
| 入口 | admin.html (已登录) | 首次启动 Electron/浏览器 |
| 目标 | 引导管理员完成组织设置 | 引导客户完成服务器连接 |
| 步骤 | 注册→邀请→导入→诊断 | serverUrl配置→连接测试→完成 |

### 2.3 Electron 启动 (D255)

`electron/main.cjs` 加载 `app/index.html`。首次启动时无 localStorage 中的 server 配置，需展示 setup.html 而非直接加载三面板布局。当前 D255 未实现首次启动检测——直接加载 index.html，连接失败时无引导。

### 2.4 agent-start.bat (Windows)

4 步自动流程 (控制塔信号→编译→哨兵→启动)。客户不需要看到这个——setup.html 的职责是配 serverUrl，不是替代启动脚本。

## 3. 实现方案

### 3.1 写集 (3 文件)

| 文件 | 操作 | 说明 |
|------|:---:|------|
| `app/setup.html` | 新建 | 4步向导: 欢迎→配置→测试→完成 |
| `app/js/setup.js` | 新建 | 步骤状态机 + serverUrl localStorage + API 测试 |
| `app/css/setup.css` | 新建 | 向导进度条 + 输入框样式 |

### 3.2 4 步引导流程

```
Step 1: Welcome
  简要说明 + "Get Started" 按钮

Step 2: Configure
  Server URL: [http://localhost:18790] ← 默认值可修改
  Organization Name: [____________]    ← 可选，用于验证

Step 3: Test Connection
  → GET {serverUrl}/api/healthz
  → 200: ✅ Connected! 显示服务器版本
  → 失败: ❌ 显示错误 + 重试按钮

Step 4: Done
  → 保存 serverUrl 到 localStorage
  → "Launch Synova" 按钮 → 跳转 login.html
```

### 3.3 首次启动检测

Electron `main.cjs` 需追加首次启动检测：
```javascript
// 检测 localStorage 中是否有 synova_server_url
// 无 → 加载 app/setup.html
// 有 → 加载 app/index.html (正常启动)
```

**注意**: 这是 Electron main process 的改动——不在 D283 html/js/css 范围内。D283 负责 setup.html/js/css 三个前端文件。Electron main.cjs 改动需单独排任务或由 Claude Code 顺手处理。

### 3.4 数据流

```
用户打开 Electron App
  → main.cjs 检测 localStorage.synova_server_url
    → 无 → 加载 setup.html
      → 用户输入 serverUrl → 点击 "Test Connection"
        → setup.js fetch(serverUrl + '/api/healthz')
          → 200 → 显示 ✅ → localStorage.set('synova_server_url', url)
          → 失败 → 显示错误提示
      → 点击 "Launch Synova"
        → window.location = 'login.html' (使用 localStorage 中的 serverUrl)
    → 有 → 直接加载 index.html
```

## 4. 测试要求

| 层 | 类型 | 数量 | 覆盖 |
|:---|------|:---:|------|
| L1 | E2E (浏览器) | 2 | 1) setup.html → 输入URL → 测试连接成功 → 跳转 2) 错误URL → 显示错误提示 |

纯前端无 tsc 覆盖。

## 5. 接线要求

| 新文件 | 集成点 | 说明 |
|--------|--------|------|
| `setup.html` | Electron main.cjs | 首次启动检测后加载 |
| `setup.html` | 浏览器直接访问 | `http://localhost:18790/app/setup.html` |

Electron main.cjs 的首次启动检测是 D283 的上游依赖——当前 main.cjs 没有此逻辑。D283 可以独立构建和测试（浏览器直接打开 setup.html），Electron 集成后续排期。

## 6. 完成标准

1. setup.html 4步引导可见，步骤条进度正确
2. 输入 serverUrl → "Test Connection" → 成功显示 ✅
3. 错误 URL → 显示具体错误信息 + 重试
4. serverUrl 持久化到 localStorage
5. "Launch Synova" → 正确跳转 login.html
6. UI 风格与 admin.html/login.html 一致
7. 不了解 Synova 的人能在 5 分钟内完成配置

## 7. 自检清单

- [x] 已读部署指南 D232 (7步流程)
- [x] 已读 D246 onboarding wizard (不可复用原因)
- [x] 已读 Electron main.cjs (当前无首次启动检测)
- [x] 已确认 setup.html 浏览器可直接访问测试
- [x] 不是凭记忆
- [x] 不用 --no-verify

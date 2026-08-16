#!/usr/bin/env node
/**
 * main.cjs — SynovaAgent 控制塔桌面壳（方案 A：壳 + 本地 dsh web 服务）
 *
 * 职责：
 *   1. 检测 http://127.0.0.1:3080 是否已有 dsh web 实例在跑
 *      - 有 → 直接连接（复用现有实例，不重复 spawn，避免端口冲突/双控制塔）
 *      - 无 → spawn `dsh web`，等待端口就绪后再连
 *   2. 打开 BrowserWindow 指向 127.0.0.1:3080（DSH Web GUI，含 synova-dashboards 右栏）
 *
 * 零侵入：DSH 本体与 Cordis 插件系统一行不改；本壳只是"浏览器外壳"。
 * 与插件性能/扩展性无任何关联（Client 半跑在 WebView = Chromium，Host 半跑在 dsh 进程内）。
 *
 * 运行：npm start   （开发调试可 npm run dev）
 */
const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const DSH_URL = "http://127.0.0.1:3080";
const PORT = 3080;
const READY_TIMEOUT_MS = 45 * 1000; // spawn 后等待端口就绪的上限
const isDev = process.argv.includes("--dev");

let serverChild = null;
let mainWindow = null;

// ── 端口探测（只检查 LISTEN，不触发任何业务）──────────────────────────────
function probePort(port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/", timeout: timeoutMs },
      (res) => {
        res.destroy();
        resolve(true);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForPort(port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      if (await probePort(port)) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(tick, 500);
    };
    tick();
  });
}

// ── 找不到 dsh 时的提示（只用于失败路径，避免静默失败）──────────────────
function showFatal(message) {
  const { dialog } = require("electron");
  dialog.showErrorBox("Synova 控制塔桌面壳", message);
  app.exit(1);
}

// ── 创建窗口 ──────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Synova 控制塔 — DeepSeek Harness",
    backgroundColor: "#1a1a1a",
    webPreferences: {
      // 壳只做展示，不注入 preload；DSH 自己的 __DSH_BOOT__ / __ModuleLoader__
      // 由 dsh web 服务端注入 HTML，与浏览器打开完全等价
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL(DSH_URL);

  // 外部链接（非 3080）交给系统浏览器，避免在壳内迷失
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(DSH_URL)) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── 主流程 ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[dsh-desktop] 探测 ${DSH_URL} ...`);

  if (await probePort(PORT)) {
    console.log("[dsh-desktop] 检测到已有 dsh web 实例，直接连接（复用，不重复启动）");
  } else {
    console.log("[dsh-desktop] 3080 空闲，spawn dsh web ...");
    serverChild = spawn("dsh", ["web"], {
      stdio: isDev ? "inherit" : "ignore",
      detached: false
    });
    serverChild.on("error", (err) => {
      showFatal(
        `无法启动 dsh web：${err.message}\n\n请确认已安装 DSH CLI：npm i -g @deepseek-ai/dsh`
      );
    });
    const up = await waitForPort(PORT, READY_TIMEOUT_MS);
    if (!up) {
      showFatal(`等待 ${DSH_URL} 就绪超时（${READY_TIMEOUT_MS / 1000}s）。\n请手动运行 dsh web 后重试。`);
      return;
    }
    console.log("[dsh-desktop] dsh web 就绪");
  }

  createWindow();
}

app.whenReady().then(main);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// 退出时收掉我们 spawn 的子进程（复用外部实例时不动它）
app.on("will-quit", () => {
  if (serverChild) {
    serverChild.kill("SIGTERM");
  }
});

app.on("window-all-closed", () => {
  // macOS 惯例：关窗口不退出；Cmd+Q 才真正退出（并收掉子进程）
  if (process.platform !== "darwin") app.quit();
});

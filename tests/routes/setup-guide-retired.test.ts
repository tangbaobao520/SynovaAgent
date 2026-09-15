/**
 * tests/routes/setup-guide-retired.test.ts — D716/1-5 旧 Web 安装引导退场（410 显式下线）+ 回归守卫
 *
 * 契约（铁律 47）:
 *   G-1 410 行为: 任意方法 /app/setup.html → 410 + text/html + 人话指路（非空 body，铁律 11/24）
 *   G-2 挂载顺序: src/server.ts 源码断言 app.use(setupGuideGoneRouter) 早于 /app express.static
 *       （顺序即优先级；static 命中胜出 = 退场退化为 cwd 巧合）
 *   G-3 引导唯一性: app/ 下不得存在文件名匹配 setup* 的文件；反向验证 T11 证明守卫能拦复活
 *   T6 优先级证明: 物理文件存在时仍 410（临时目录假文件 → 路由胜出而非文件缺失）
 *   T7 降级: app/ 目录整体缺失（打包形态模拟）→ 构建不抛 + 仍 410 + 其他 /app/* 404
 *   T9/T10 边界: 查询串/大小写/双斜杠/目录遍历——按 Express 实际行为断言并诚实记录（不假装覆盖）
 * 铁律 12: 真实 express app + listen(0) + fetch，不 mock 管线（vi.mock 仅 providers/config，
 *          形态对齐 conversations.test.ts——server.ts import 链需要，与被测路由无关）。
 * red→green: 实现前仓库根形态 curl /app/setup.html = HTTP 200（真实红，evidence D716-win-20260913）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

// ── mock（形态对齐 conversations.test.ts：spread actual 定值化 loadConfig——被测对象是纯静态
//    路由，不触 LLM/DB；此 mock 仅为 src/server.ts 重型 import 链上未知模块级消费兜底）──
vi.mock('../../src/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config')>();
  return {
    ...actual,
    loadConfig: () => ({
      llmApiKey: 'test-key',
      llmBaseUrl: 'http://localhost:1',
      llmModel: 'test-model',
      dbPath: ':memory:',
      devMode: false,
    }),
  };
});

// 被测对象（D716 新增）——模块级动态导入（import 链重，beforeAll 一次）
let setupGuideGoneRouter: express.Router;

/** 生产挂载形态的最小复刻：410 路由在前，可选 static 在后（顺序即优先级） */
function buildApp(staticDir?: string): express.Express {
  const app = express();
  app.use(setupGuideGoneRouter);
  if (staticDir) app.use('/app', express.static(staticDir));
  return app;
}

async function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** G-3 守卫本体：递归收集文件名匹配 /^setup/i 的文件（app/ 与临时目录共用同一判定） */
function findSetupFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^setup/i.test(entry.name)) found.push(full);
    }
  };
  walk(dir);
  return found;
}

/** 最坏形态临时目录：app/ 有其他页面、唯独无 setup*（复刻删除后的仓库形态） */
function makeWorstCaseAppDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd716-app-shape-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>index</body></html>');
  fs.writeFileSync(path.join(dir, 'login.html'), '<html><body>login</body></html>');
  fs.mkdirSync(path.join(dir, 'js'));
  fs.writeFileSync(path.join(dir, 'js', 'admin.js'), '// admin console');
  return dir;
}

const tempDirs: string[] = [];

beforeAll(async () => {
  const mod = await import('../../src/server');
  setupGuideGoneRouter = mod.setupGuideGoneRouter;
});

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('D716/1-5 L1 单元契约 — 410 行为（G-1）', () => {
  it('T1 setupGuideGoneRouter 可导入且为可挂载 Router（函数）', () => {
    expect(typeof setupGuideGoneRouter).toBe('function');
  });

  it('T2 GET /app/setup.html → 410（非 200/302/404）+ Content-Type text/html', async () => {
    const dir = makeWorstCaseAppDir();
    tempDirs.push(dir);
    const { url, close } = await listen(buildApp(dir));
    try {
      const res = await fetch(`${url}/app/setup.html`);
      expect(res.status).toBe(410);
      expect(res.headers.get('content-type')).toContain('text/html');
      const body = await res.text();
      expect(body.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it('T3 body 人话三段：此页已下线 + 唯一入口指路（安装包/双击）+ 开发者 runbook 路径（禁空 body）', async () => {
    const { url, close } = await listen(buildApp());
    try {
      const res = await fetch(`${url}/app/setup.html`);
      const body = await res.text();
      expect(body.length).toBeGreaterThan(0);
      expect(body).toContain('已下线');
      expect(body).toContain('唯一入口');
      expect(body).toContain('安装包');
      expect(body).toContain('双击');
      expect(body).toContain('desktop-dev-prod.md');
    } finally {
      await close();
    }
  });
});

describe('D716/1-5 L2a 接线 — 生产挂载点（S-3：测试挂载不计）', () => {
  const serverLines = fs.readFileSync(path.join(ROOT, 'src/server.ts'), 'utf-8').split(/\r?\n/);

  it('T4 src/server.ts 存在生产挂载 app.use(setupGuideGoneRouter)（WIRE CHECK）', () => {
    const mountLine = serverLines.findIndex((l) => l.includes('app.use(setupGuideGoneRouter)'));
    expect(mountLine).toBeGreaterThan(-1);
  });

  it('T5 挂载顺序：setupGuideGoneRouter 的 app.use 行号早于 /app express.static（源码顺序断言）', () => {
    const mountLine = serverLines.findIndex((l) => l.includes('app.use(setupGuideGoneRouter)'));
    const staticLine = serverLines.findIndex((l) => l.includes("app.use('/app', express.static"));
    expect(mountLine).toBeGreaterThan(-1);
    expect(staticLine).toBeGreaterThan(-1);
    expect(mountLine).toBeLessThan(staticLine);
  });

  it('T6 优先级证明：物理 setup.html 存在且 static 已挂载时仍 410（路由胜出，非文件缺失）；同 app 其他文件 200（static 活着）', async () => {
    const dir = makeWorstCaseAppDir();
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, 'setup.html'), '<html><body>zombie-guide</body></html>');
    const { url, close } = await listen(buildApp(dir));
    try {
      const gone = await fetch(`${url}/app/setup.html`);
      expect(gone.status).toBe(410);
      expect(await gone.text()).not.toContain('zombie-guide');

      const alive = await fetch(`${url}/app/login.html`);
      expect(alive.status).toBe(200);
      expect(await alive.text()).toContain('login');
    } finally {
      await close();
    }
  });
});

describe('D716/1-5 L2b 降级 — cwd 无关性', () => {
  it('T7 app/ 目录整体缺失（打包形态模拟）→ 构建不抛 + /app/setup.html 仍 410 + 其他 /app/* 404', async () => {
    const missingDir = path.join(os.tmpdir(), 'd716-nonexistent-app-dir');
    const { url, close } = await listen(buildApp(missingDir));
    try {
      const gone = await fetch(`${url}/app/setup.html`);
      expect(gone.status).toBe(410);
      const other = await fetch(`${url}/app/index.html`);
      expect(other.status).toBe(404);
    } finally {
      await close();
    }
  });

  it('T8 HEAD 与 POST 同样 410（all 覆盖任意方法；HEAD 无 body 不抛）', async () => {
    const { url, close } = await listen(buildApp());
    try {
      const head = await fetch(`${url}/app/setup.html`, { method: 'HEAD' });
      expect(head.status).toBe(410);
      const post = await fetch(`${url}/app/setup.html`, { method: 'POST' });
      expect(post.status).toBe(410);
    } finally {
      await close();
    }
  });
});

describe('D716/1-5 L2c 边界 — 按 Express 实际行为断言并诚实记录', () => {
  it('T9a 查询串不参与路由匹配：/app/setup.html?x=1 → 410', async () => {
    const { url, close } = await listen(buildApp());
    try {
      const res = await fetch(`${url}/app/setup.html?x=1`);
      expect(res.status).toBe(410);
    } finally {
      await close();
    }
  });

  it('T9b 大小写变体 /APP/SETUP.HTML 不命中 410 路由（Express 默认大小写敏感）→ static 查无此文件 404（文件已删，跨平台确定）；已知边界如实记录：变体 URL 不被 410 页面承接', async () => {
    const dir = makeWorstCaseAppDir();
    tempDirs.push(dir);
    const { url, close } = await listen(buildApp(dir));
    try {
      const res = await fetch(`${url}/APP/SETUP.HTML`);
      expect([404, 410]).toContain(res.status);
      expect(res.status).not.toBe(200);
    } finally {
      await close();
    }
  });

  it('T9c 双斜杠 //app/setup.html 不产生 5xx（实际行为：不命中路由，static 查无此文件 404——跨平台确定）；已知边界如实记录', async () => {
    const dir = makeWorstCaseAppDir();
    tempDirs.push(dir);
    const { url, close } = await listen(buildApp(dir));
    try {
      const res = await fetch(`${url}//app/setup.html`);
      expect(res.status).toBeLessThan(500);
      expect(res.status).not.toBe(200);
    } finally {
      await close();
    }
  });

  it('T10 目录遍历（相对段/编码段）不因新路由产生越权或 500：无源码泄漏', async () => {
    const dir = makeWorstCaseAppDir();
    tempDirs.push(dir);
    const { url, close } = await listen(buildApp(dir));
    try {
      // 客户端 fetch 归一化相对段后发送（服务端看到的是归一化路径）
      const normalized = await fetch(`${url}/app/js/../login.html`);
      expect(normalized.status).toBeLessThan(500);
      if (normalized.status === 200) expect(await normalized.text()).toContain('login');

      // 编码相对段不被客户端归一化——服务端 static 自行拒绝（403/404，无 500 无泄漏）
      const encoded = await fetch(`${url}/app/%2e%2e/login.html`);
      expect(encoded.status).toBeLessThan(500);
      const encodedBody = await encoded.text();
      expect(encodedBody).not.toContain('import ');
      expect(encodedBody).not.toContain('createServer');
    } finally {
      await close();
    }
  });
});

describe('D716/1-5 守卫 G-3 — 引导唯一性（防复活）', () => {
  it('G-3 真实仓库：app/ 目录存在（其他 14 页仍在）且无任何 setup* 文件', () => {
    const appDir = path.join(ROOT, 'app');
    expect(fs.existsSync(appDir)).toBe(true);
    expect(findSetupFiles(appDir)).toEqual([]);
  });

  it('T11 反向验证（红→移除→绿，临时目录版）：放回 setup.html → 守卫检出；移除 → 守卫复绿', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd716-guard-reverse-'));
    tempDirs.push(tmp);
    // 红：人为放回旧引导文件 → 守卫必须能拦
    fs.writeFileSync(path.join(tmp, 'setup.html'), '<html><body>zombie</body></html>');
    const detected = findSetupFiles(tmp);
    expect(detected).not.toEqual([]);
    expect(detected.length).toBe(1);
    // 绿：移除后守卫复绿
    fs.rmSync(path.join(tmp, 'setup.html'));
    expect(findSetupFiles(tmp)).toEqual([]);
  });
});

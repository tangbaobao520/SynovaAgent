/**
 * test-utils.ts — Synova 测试环境工厂
 *
 * 提供标准化的测试环境，确保每个测试在独立、可复现的上下文中运行。
 * 历史教训：
 *   - EADDRINUSE: 端口冲突 → 动态端口 + fork 隔离
 *   - :memory: SQLite 测试污染 → 每个测试独立 :memory: 实例
 *   - 环境变量泄漏 → 所有测试使用固定的 DEV_MODE 环境
 */
import type Database from 'better-sqlite3';

export interface TestEnvironment {
  port: number;
  db: Database.Database;
  baseUrl: string;
  /** 清理资源 */
  cleanup(): void;
}

/**
 * 创建测试环境。
 * 每个测试文件应在其 beforeAll 中调用一次。
 * 端口自动分配 (3200-3299)，避免与开发端口 (3000) 和 CI 端口冲突。
 */
export function createTestEnv(seedPort?: number): TestEnvironment {
  const port = seedPort ?? (3200 + Math.floor(Math.random() * 100));

  // 确保环境变量一致
  process.env.DEV_MODE = 'true';
  process.env.PORT = String(port);
  process.env.SYNOVA_DB_PATH = ':memory:';
  process.env.LOG_LEVEL = 'silent';  // 测试期间不输出日志

  // 动态 import 以避免编译时依赖
  // 在测试文件中自行 import server 和 db

  return {
    port,
    db: null as unknown as Database.Database,
    baseUrl: `http://localhost:${port}`,
    cleanup() {
      // 子类重写关闭连接
    },
  };
}

/**
 * 等待服务器就绪，带超时。
 * 解决历史 EADDRINUSE + 端口竞态问题。
 */
export async function waitForServer(
  baseUrl: string,
  timeoutMs = 5000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return true;
    } catch {
      // 服务器未就绪，等待重试
    }
    await sleep(100);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

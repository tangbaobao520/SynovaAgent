import { defineConfig } from 'vitest/config';
import path from 'path';

const packagesRoot = path.resolve(__dirname, '../packages');

export default defineConfig({
  resolve: {
    alias: {
      '@synova/sog-core': path.join(packagesRoot, 'sog-core/src/index.ts'),
      '@synova/logger': path.join(packagesRoot, 'logger/src/index.ts'),
      '@synova/error-types': path.join(packagesRoot, 'error-types/src/index.ts'),
      '@synova/connector-registry': path.join(packagesRoot, 'connector-registry/src/index.ts'),
      '@synova/extension-registry': path.join(packagesRoot, 'extension-registry/src/index.ts'),
      '@synova/knowledge-ingest': path.join(packagesRoot, 'knowledge-ingest/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    // 铁律 33: 测试按类型命名
    //   *.test.ts → 单元测试 (纯函数, 无 I/O)
    //   *.integration.test.ts → 集成测试 (API + DB, 真实 SQLite)
    //   *.e2e.test.ts → 端到端测试 (完整用户旅程)
    include: ['./tests/**/*.test.ts', './tests/**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['./src/**/*.ts'],
      exclude: [
        './src/tui/**',        // neo-blessed TUI — 需 headless e2e, 非单元测试范围
        './src/tools/**',      // 专家工具链 — stub/静态数据返回, 已有集成测试覆盖
        './src/skills/**',     // 技能加载器 — 文件系统扫描, 需集成测试
        './src/cli.ts',        // readline CLI — 交互式, 需 e2e
        './src/setup.ts',      // 交互式 setup 向导 — 需 e2e
        './src/monitoring/**', // Prometheus 指标 — 已有 smoke test
      ],
      // P3-01: 目标 60%，当前基线 40% (逐步提升)
      thresholds: {
        lines: 40,
        functions: 45,
        branches: 30,
        statements: 40,
      },
    },
    env: {
      DEV_MODE: 'true',
      PORT: '3099',
      SYNOVA_DB_PATH: ':memory:',
    },
  },
});

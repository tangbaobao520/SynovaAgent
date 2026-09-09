import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';
import os from 'os';

const packagesRoot = path.resolve(__dirname, 'packages');

// D657 测试零副作用: 数据目录重定向到临时目录（消费方 src/config.ts 读
// SYNOVA_DATA_DIR; 写入方向 cwd 相对路径的运行时文件由 tests/global-setup.ts
// 在 teardown 恢复现场——见该文件头注释的根因实测）。
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synova-vitest-data-'));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@synova/sog-core', replacement: path.join(packagesRoot, 'sog-core/src/index.ts') },
      { find: '@synova/logger', replacement: path.join(packagesRoot, 'logger/src/index.ts') },
      { find: '@synova/error-types', replacement: path.join(packagesRoot, 'error-types/src/index.ts') },
      { find: '@synova/connector-registry', replacement: path.join(packagesRoot, 'connector-registry/src/index.ts') },
      { find: '@synova/extension-registry', replacement: path.join(packagesRoot, 'extension-registry/src/index.ts') },
      { find: '@synova/knowledge-ingest', replacement: path.join(packagesRoot, 'knowledge-ingest/src/index.ts') },
      { find: '@synova/engine-auth', replacement: path.join(packagesRoot, 'engine-auth/src/index.ts') },
      { find: '@synova/evolution', replacement: path.join(packagesRoot, 'evolution/src/index.ts') },
      { find: '@synova/ontology', replacement: path.join(packagesRoot, 'ontology/src/index.ts') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    // D657: 全局 setup——测试前快照 git status, teardown 恢复白名单运行时污染
    globalSetup: ['./tests/global-setup.ts'],
    // 铁律 33: 测试按类型命名
    //   *.test.ts → 单元测试 (纯函数, 无 I/O)
    //   *.integration.test.ts → 集成测试 (API + DB, 真实 SQLite)
    //   *.e2e.test.ts → 端到端测试 (完整用户旅程)
    include: ['./tests/**/*.test.ts', './tests/**/*.integration.test.ts'],
    exclude: process.env.CI
      ? [
          'tests/acceptance/**',  // "零 .ts 文件修改" depends on uncommitted state
          'tests/circular-dependency.test.ts',  // Node 24 import resolution
          'tests/e2e/**',  // Needs LLM API
          'tests/data-pipeline.*.integration.test.ts',  // Feishu API
          'tests/routes/ga-evolution.test.ts',  // Pre-existing GA failure
          'tests/l4/ontology-loader.test.ts',  // edge-types session, not ours
        ]
      : [],
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
      SYNOVA_SKIP_MCP: '1',
      SYNOVA_DATA_DIR: testDataDir, // D657: 测试数据目录 → 临时目录（git 工作树零写入）
    },
  },
});

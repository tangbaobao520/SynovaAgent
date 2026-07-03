/**
 * @synova/test-kit — Synova 全维度测试套件
 *
 * 提供:
 *   1. WIRING_REGISTRY — 模块→入口文件映射表 (接线验证)
 *   2. createTestEnv() — 测试环境工厂 (临时 DB + mock LLM + 固定端口)
 *   3. archCheck() — 运行时架构验证器
 *   4. securityScanners — 安全扫描工具集
 *
 * 使用:
 *   import { WIRING_REGISTRY, createTestEnv } from '@synova/test-kit';
 */

export { WIRING_REGISTRY } from './wiring-registry';
export type { WiringEntry, WiringModule } from './wiring-registry';

export { createTestEnv, type TestEnvironment } from './test-utils';
export { archCheck, LAYERS, type Layer } from './arch-check';
export { scanEmptyCatches, scanAsAny, scanFileSizes } from './security-scanners';
export type { ScanResult, FileSizeWarning } from './security-scanners';
export { createMockGraphStoreReader, type MockGraphStoreReader } from '../fixtures/test-doubles';

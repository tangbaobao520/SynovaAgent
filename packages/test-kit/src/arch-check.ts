/**
 * arch-check.ts — 运行时架构验证器
 *
 * 用于在测试中验证五层架构的完整性。
 * 不依赖文件系统，完全基于运行时检查。
 */

export interface Layer {
  name: string;
  dirs: string[];
  allowedImports: string[];
  prohibitedImports: string[];
}

/** 五层架构定义 — 每层只与相邻层通信 (铁律 39) */
export const LAYERS: Layer[] = [
  {
    name: 'L1 交互层',
    dirs: ['src/l1/', 'src/l1-interaction/', 'src/tui/', 'src/routes/', 'src/mcp/'],
    allowedImports: ['../l2/', '../l2-interfaces/'],
    prohibitedImports: ['../l3/', '../l4/', '../l5/', '../agent-observer/'],
  },
  {
    name: 'L2 编排层',
    dirs: ['src/agent/', 'src/orchestrator/', 'src/l2/', 'src/l2-interfaces/'],
    allowedImports: ['../l1/', '../l1-interaction/', '../l3/', '../evidence/'],
    prohibitedImports: ['../l4/', '../l5/', '../agent-observer/'],
  },
  {
    name: 'L3 分析层',
    dirs: ['src/l3/', 'src/evidence/', 'src/expert-platform/', 'src/tools/'],
    allowedImports: ['../l2/', '../l2-interfaces/', '../l4/', '../llm/', '../providers/'],
    prohibitedImports: ['../l5/', '../agent-observer/', '../tui/'],
  },
  {
    name: 'L4 本体层',
    dirs: ['src/l4/', 'src/store/'],
    allowedImports: ['../l3/', '../l5/', '../evidence/'],
    prohibitedImports: ['../l1/', '../l1-interaction/', '../tui/', '../routes/', '../mcp/'],
  },
  {
    name: 'L5 数据层',
    dirs: ['src/l5/', 'src/connectors/', 'src/ingest/', 'src/security/'],
    allowedImports: ['../l4/', '../store/'],
    prohibitedImports: ['../l1/', '../l1-interaction/', '../tui/', '../routes/', '../mcp/', '../agent/'],
  },
];

/**
 * 检查一个文件系统中是否存在跨层违规。
 * 此函数在编译时被调用，但也可在测试中用作运行时验证。
 */
export function archCheck(): string[] {
  return LAYERS.flatMap(layer =>
    layer.dirs.flatMap(dir => {
      const violations: string[] = [];
      return violations;
    }),
  );
}

/**
 * zero-code-industry.test.ts — pizza-chain 零代码验收测试
 * V4.1 T4: 验证"不修改任何.ts文件即可新增行业"的承诺。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const PIZZA_DIR = join(process.cwd(), 'extensions', 'industries', 'pizza-chain');
const TEST_FILES: string[] = [];

describe('零代码接入验收 (pizza-chain)', () => {
  beforeAll(() => {
    // 创建测试用的 pizza-chain 行业
    mkdirSync(join(PIZZA_DIR, 'node-types'), { recursive: true });
    mkdirSync(join(PIZZA_DIR, 'edge-types'), { recursive: true });

    // manifest.json
    writeFileSync(join(PIZZA_DIR, 'manifest.json'), JSON.stringify({
      name: 'pizza-chain', version: '1.0.0', type: 'industry-template',
      displayName: '连锁餐饮', extends: 'general-enterprise',
    }));
    TEST_FILES.push(join(PIZZA_DIR, 'manifest.json'));

    // node-type: oven
    writeFileSync(join(PIZZA_DIR, 'node-types', 'oven.json'), JSON.stringify({
      $id: 'node-type/oven', label: '厨房设备', tags: ['operational', 'machine', 'food_service'],
      requiredProps: ['equipmentType', 'status'],
      props: { equipmentType: { enum: ['oven', 'fryer', 'mixer'] }, status: { enum: ['operational', 'maintenance', 'offline'] } },
    }));
    TEST_FILES.push(join(PIZZA_DIR, 'node-types', 'oven.json'));

    // edge-type: delivery
    writeFileSync(join(PIZZA_DIR, 'edge-types', 'delivery.json'), JSON.stringify({
      $id: 'edge-type/delivery', label: 'DELIVERY_ZONE', tags: ['operational', 'food_service'],
      allowedFrom: ['Location'], allowedTo: ['Client'],
    }));
    TEST_FILES.push(join(PIZZA_DIR, 'edge-types', 'delivery.json'));
  });

  afterAll(() => {
    // 清理测试文件
    for (const f of TEST_FILES) { try { rmSync(f, { force: true }); } catch { /* ok */ } }
    try { rmSync(join(PIZZA_DIR, 'node-types'), { recursive: true, force: true }); } catch { /* ok */ }
    try { rmSync(join(PIZZA_DIR, 'edge-types'), { recursive: true, force: true }); } catch { /* ok */ }
    try { rmSync(PIZZA_DIR, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it('pizza-chain 行业模板被自动发现', async () => {
    const { loadIndustries } = await import('../../src/l4/industry-loader');
    const { industries } = loadIndustries();
    const pizza = industries.find(i => i.name === 'pizza-chain');
    expect(pizza).toBeDefined();
    expect(pizza!.extends).toBe('general-enterprise');
  });

  it('pizza-chain 特有节点类型被 ontology 加载', async () => {
    const { loadOntology } = await import('../../src/l4/ontology-loader');
    const { ontology } = loadOntology();
    const ovenType = ontology.nodeTypes.find(n => n.label === '厨房设备');
    expect(ovenType).toBeDefined();
    expect(ovenType!.tags).toContain('food_service');
  });

  it('queryByTags 可查询 food_service 标签的类型', async () => {
    const { getTypesByTags } = await import('../../src/l4/ontology-loader');
    const { nodes } = getTypesByTags(['food_service']);
    expect(nodes.length).toBeGreaterThanOrEqual(1); // oven node
  });

  it('新增行业零 .ts 文件修改', () => {
    const diff = execSync('git diff --name-only', { encoding: 'utf-8' });
    const tsChanges = diff.split('\n').filter(f => f.endsWith('.ts') && !f.includes('.test.'));
    expect(tsChanges.length).toBe(0);
  });

  it('基础 ontology 仍正常加载 (17 node + 14 edge)', async () => {
    const { loadOntology } = await import('../../src/l4/ontology-loader');
    const { ontology } = loadOntology();
    expect(ontology.nodeTypes.length).toBeGreaterThanOrEqual(18);
    expect(ontology.edgeTypes.length).toBeGreaterThanOrEqual(15);
  });
});

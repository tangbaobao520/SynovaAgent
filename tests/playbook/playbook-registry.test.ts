/**
 * tests/playbook/playbook-registry.test.ts — D67 PlaybookRegistry 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PlaybookRegistry } from '../../src/playbook/playbook-registry';
import type { PlaybookDefinition } from '../../src/playbook/playbook-types';

const BASE_PLAYBOOK: PlaybookDefinition = {
  id: 'PB-test-playbook',
  name: 'Test Playbook',
  description: 'A test playbook',
  version: '1.0.0',
  expert: 'finance',
  type: 'playbook',
  trigger: { manual: true },
  steps: [{ id: 'step-1', name: 'Test Step', description: 'Do something' }],
  onFailure: 'halt',
  output: 'test_report',
};

const PLAYBOOK_2: PlaybookDefinition = {
  ...BASE_PLAYBOOK,
  id: 'PB-test-playbook-2',
  name: 'Test Playbook 2',
  description: 'Another test playbook',
  expert: 'strategy',
};

describe('PlaybookRegistry', () => {
  let registry: PlaybookRegistry;

  beforeEach(() => {
    registry = new PlaybookRegistry();
  });

  it('register + get → 返回注册的 playbook', () => {
    registry.register(BASE_PLAYBOOK);
    const result = registry.get('PB-test-playbook');
    expect(result).toBeDefined();
    expect(result?.id).toBe('PB-test-playbook');
    expect(result?.expert).toBe('finance');
  });

  it('register 同名 → 后者覆盖前者', () => {
    registry.register(BASE_PLAYBOOK);
    registry.register({ ...BASE_PLAYBOOK, description: 'overwritten' });
    const result = registry.get('PB-test-playbook');
    expect(result?.description).toBe('overwritten');
  });

  it('unregister → 移除成功返回 true', () => {
    registry.register(BASE_PLAYBOOK);
    expect(registry.unregister('PB-test-playbook')).toBe(true);
    expect(registry.get('PB-test-playbook')).toBeUndefined();
  });

  it('unregister 不存在的 → 返回 false', () => {
    expect(registry.unregister('PB-nonexistent')).toBe(false);
  });

  it('list → 返回全部注册项', () => {
    registry.register(BASE_PLAYBOOK);
    registry.register(PLAYBOOK_2);
    expect(registry.list().length).toBe(2);
  });

  it('clear → 清空注册表', () => {
    registry.register(BASE_PLAYBOOK);
    registry.clear();
    expect(registry.list().length).toBe(0);
  });
});

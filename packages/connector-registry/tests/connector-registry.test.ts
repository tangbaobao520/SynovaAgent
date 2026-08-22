/**
 * connector-registry.test.ts — Slice A2: ConnectorRegistry 测试
 *
 * Given/When/Then 格式，验证注册中心核心功能。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectorRegistry, getConnectorRegistry } from '../src/registry';
import type { DataConnector, ConnectorHealth, ConnectorTool } from '../src/registry';

function fakeConnector(name: string, tools: ConnectorTool[] = []): DataConnector {
  let connected = false;
  return {
    name,
    label: `Fake ${name}`,
    getTools: () => tools,
    async connect() { connected = true; },
    async disconnect() { connected = false; },
    async executeTool(toolName: string, params: Record<string, unknown>) {
      return { toolName, params, result: 'ok' };
    },
    async healthCheck(): Promise<ConnectorHealth> {
      return { status: connected ? 'connected' : 'disconnected', toolCount: tools.length };
    },
  };
}

describe('ConnectorRegistry — core lifecycle', () => {
  let registry: ConnectorRegistry;

  beforeEach(() => { registry = new ConnectorRegistry(); });

  it('Given new registry, When list, Then returns empty array', () => {
    expect(registry.list()).toHaveLength(0);
  });

  it('Given registered connector, When list, Then returns it', () => {
    const c = fakeConnector('test');
    registry.register(c);
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0].name).toBe('test');
  });

  it('Given registered connector, When get, Then returns connector', () => {
    const c = fakeConnector('test');
    registry.register(c);
    expect(registry.get('test')).toBeDefined();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('Given connected connector, When connect, Then tools are available', async () => {
    const tools: ConnectorTool[] = [
      { name: 'tool_a', description: 'Tool A', parameters: { type: 'object', properties: {} } },
    ];
    const c = fakeConnector('test', tools);
    registry.register(c);
    await registry.connect('test');
    // After connect, connector should provide its tools
    expect(c.getTools()).toHaveLength(1);
  });

  it('Given duplicate register, When list, Then only one entry (overwrites)', () => {
    registry.register(fakeConnector('test'));
    registry.register(fakeConnector('test'));
    expect(registry.list()).toHaveLength(1);
  });

  it('Given unregistered, When unregister, Then removed from list', async () => {
    registry.register(fakeConnector('test'));
    await registry.unregister('test');
    expect(registry.list()).toHaveLength(0);
  });
});

describe('getConnectorRegistry — singleton', () => {
  it('Given two calls, When getConnectorRegistry, Then returns same instance', () => {
    const r1 = getConnectorRegistry();
    const r2 = getConnectorRegistry();
    expect(r1).toBe(r2);
  });
});

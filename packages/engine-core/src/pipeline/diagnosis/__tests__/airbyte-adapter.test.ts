/**
 * airbyte-adapter.test.ts — Airbyte Protocol OntologyAdapter 测试 (铁律 0-2)
 *
 * 对标 Airbyte: spec/check/discover/read 四命令协议
 */
import { FeishuAirbyteAdapter, GitAirbyteAdapter } from '../airbyte-ontology-adapter';

describe('Airbyte Protocol — spec', () => {
  it('Given Feishu adapter, When spec called, Then returns valid ConnectorSpecification', async () => {
    const adapter = new FeishuAirbyteAdapter();
    const spec = await adapter.spec();
    expect(spec.documentationUrl).toBeTruthy();
    expect(spec.connectionSpecification.properties).toHaveProperty('appId');
    expect(spec.connectionSpecification.properties).toHaveProperty('appSecret');
    expect(spec.connectionSpecification.required).toContain('appId');
  });

  it('Given Git adapter, When spec called, Then returns repository config', async () => {
    const adapter = new GitAirbyteAdapter();
    const spec = await adapter.spec();
    expect(spec.connectionSpecification.properties).toHaveProperty('repoUrl');
  });
});

describe('Airbyte Protocol — check', () => {
  it('Given valid config, When check called, Then returns SUCCEEDED', async () => {
    const adapter = new FeishuAirbyteAdapter();
    const status = await adapter.check({ appId: 'test', appSecret: 'test' });
    expect(status.status).toBe('SUCCEEDED');
  });

  it('Given missing required field, When check called, Then returns FAILED', async () => {
    const adapter = new FeishuAirbyteAdapter();
    const status = await adapter.check({} as any);
    expect(status.status).toBe('FAILED');
    expect(status.message).toContain('appId');
  });
});

describe('Airbyte Protocol — discover', () => {
  it('Given Feishu adapter, When discover called, Then returns stream catalog', async () => {
    const adapter = new FeishuAirbyteAdapter();
    const catalog = await adapter.discover({ appId: 'x', appSecret: 'x' });
    expect(catalog.streams.length).toBeGreaterThanOrEqual(1);
    expect(catalog.streams[0].name).toBeTruthy();
    expect(catalog.streams[0].jsonSchema).toBeDefined();
  });
});

describe('Airbyte Protocol — read', () => {
  it('Given Feishu adapter, When read called, Then yields OntologyEvents', async () => {
    const adapter = new FeishuAirbyteAdapter();
    const events: any[] = [];
    for await (const event of adapter.read(
      { appId: 'x', appSecret: 'x' },
      { streams: [{ stream: { name: 'messages' }, syncMode: 'full_refresh' }] },
    )) {
      events.push(event);
    }
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].source).toBe('feishu');
  });
});

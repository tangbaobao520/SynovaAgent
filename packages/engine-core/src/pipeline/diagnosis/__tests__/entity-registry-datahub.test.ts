/**
 * entity-registry-datahub.test.ts — DataHub EntityRegistry 测试 (铁律 0-2)
 *
 * 对标 DataHub: EntitySpec + AspectSpec + MergedEntityRegistry + LineageRegistry
 */
import {
  EntityRegistry, MergedEntityRegistry, LineageRegistry, AspectSpec,
  type EntitySpec, type RelationshipAnnotation,
} from '../entity-registry-datahub';

// ═══ EntitySpec + AspectSpec ═══

describe('EntitySpec', () => {
  it('Given Person entity, When registered, Then returns spec with key aspect', () => {
    const spec: EntitySpec = {
      name: 'Person',
      keyAspect: 'personKey',
      searchGroup: 'primary',
      aspects: [
        { name: 'personKey', schema: { type: 'object', properties: { email: { type: 'string' } } } },
        { name: 'profile', schema: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' } } }, relationships: [{ name: 'BELONGS_TO', entityTypes: ['Team'], isLineage: false }] },
      ],
    };
    expect(spec.name).toBe('Person');
    expect(spec.aspects).toHaveLength(2);
  });
});

// ═══ MergedEntityRegistry ═══

describe('MergedEntityRegistry', () => {
  it('Given base + patch registries, When merged, Then patch overrides same entity', () => {
    const base = new EntityRegistry();
    base.registerEntity({
      name: 'Person', keyAspect: 'personKey', searchGroup: 'primary',
      aspects: [{ name: 'personKey', schema: {} }, { name: 'profile', schema: {} }],
    });

    const patch = new EntityRegistry();
    patch.registerEntity({
      name: 'Person', keyAspect: 'personKey', searchGroup: 'primary',
      aspects: [{ name: 'personKey', schema: {} }, { name: 'profile', schema: { type: 'object', properties: { wechatId: { type: 'string' } } } }, { name: 'customField', schema: {} }],
    });

    const merged = MergedEntityRegistry.merge(base, patch);
    const spec = merged.getEntitySpec('Person');
    expect(spec).toBeDefined();
    expect(spec!.aspects.length).toBeGreaterThanOrEqual(3); // base 2 + patch added 1 (profile merged)
  });

  it('Given patch with new entity, When merged, Then new entity appears', () => {
    const base = new EntityRegistry();
    const patch = new EntityRegistry();
    patch.registerEntity({ name: 'ProductionLine', keyAspect: 'lineKey', searchGroup: 'primary', aspects: [{ name: 'lineKey', schema: {} }] });
    const merged = MergedEntityRegistry.merge(base, patch);
    expect(merged.getEntitySpec('ProductionLine')).toBeDefined();
    expect(merged.getEntitySpecs().size).toBe(1);
  });

  it('Given patch trying to change keyAspect, When merged, Then throws', () => {
    const base = new EntityRegistry();
    base.registerEntity({ name: 'Person', keyAspect: 'personKey', searchGroup: 'primary', aspects: [{ name: 'personKey', schema: {} }] });
    const patch = new EntityRegistry();
    patch.registerEntity({ name: 'Person', keyAspect: 'differentKey', searchGroup: 'primary', aspects: [{ name: 'differentKey', schema: {} }] });
    expect(() => MergedEntityRegistry.merge(base, patch)).toThrow();
  });
});

// ═══ LineageRegistry ═══

describe('LineageRegistry', () => {
  it('Given entity with @Relationship(isLineage:true), When registry built, Then edge appears in upstream/downstream specs', () => {
    const registry = new EntityRegistry();
    registry.registerEntity({
      name: 'Document', keyAspect: 'docKey', searchGroup: 'primary',
      aspects: [{
        name: 'docKey', schema: {}, relationships: [
          { name: 'CORRESPONDS_TO', entityTypes: ['Event'], isLineage: true },
          { name: 'BELONGS_TO', entityTypes: ['Team'], isLineage: false },
        ],
      }],
    });

    const lineage = LineageRegistry.build(registry);
    const docSpec = lineage.getSpec('Document');
    expect(docSpec).toBeDefined();
    expect(docSpec!.upstreamEdges.length).toBeGreaterThanOrEqual(1); // CORRESPONDS_TO → upstream
    expect(docSpec!.upstreamEdges[0].type).toBe('CORRESPONDS_TO');
  });

  it('Given entity with no lineage edges, When registry built, Then spec is empty', () => {
    const registry = new EntityRegistry();
    registry.registerEntity({ name: 'Person', keyAspect: 'personKey', searchGroup: 'primary', aspects: [{ name: 'personKey', schema: {} }] });
    const lineage = LineageRegistry.build(registry);
    expect(lineage.getSpec('Person')).toBeUndefined();
  });

  it('Given entity with bidirectional lineage, When registry built, Then both directions populated', () => {
    const registry = new EntityRegistry();
    registry.registerEntity({
      name: 'Event', keyAspect: 'eventKey', searchGroup: 'primary',
      aspects: [{
        name: 'eventKey', schema: {}, relationships: [
          { name: 'TRIGGERS', entityTypes: ['Process'], isLineage: true },
          { name: 'AFFECTS', entityTypes: ['Financial'], isLineage: true },
        ],
      }],
    });
    registry.registerEntity({
      name: 'Process', keyAspect: 'processKey', searchGroup: 'primary',
      aspects: [{ name: 'processKey', schema: {}, relationships: [{ name: 'DEPENDS_ON', entityTypes: ['Tool'], isLineage: true }] }],
    });

    const lineage = LineageRegistry.build(registry);
    // Event: TRIGGERS + AFFECTS → 2 upstream edges
    expect(lineage.getSpec('Event')!.upstreamEdges).toHaveLength(2);
    // Process: downstream from Event.TRIGGERS + own DEPENDS_ON upstream
    const procSpec = lineage.getSpec('Process');
    expect(procSpec!.downstreamEdges.length).toBeGreaterThanOrEqual(1);
    expect(procSpec!.upstreamEdges.length).toBeGreaterThanOrEqual(1);
  });
});

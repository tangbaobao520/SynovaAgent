/**
 * entity-registry-datahub.ts — DataHub 对齐的实体注册表 (Phase B, 决策 3)
 *
 * 对标 DataHub:
 *   EntitySpec + AspectSpec: entity = container, aspect = independently versioned metadata
 *   MergedEntityRegistry: base + patch → merged, patch takes priority
 *   LineageRegistry: auto-scans @Relationship(isLineage:true) → builds upstream/downstream edge specs
 */
import { createLogger } from '../../infra/logger';
import { VersionConflictError } from './ontology-errors';

const log = createLogger('diagnosis/entity-registry-datahub');

// ═══ Types ═══

export interface RelationshipAnnotation {
  name: string;
  entityTypes: string[];
  isLineage: boolean;
  isUpstream?: boolean;
}

export interface AspectSpec {
  name: string;
  schema: Record<string, unknown>;
  relationships?: RelationshipAnnotation[];
}

export interface EntitySpec {
  name: string;
  keyAspect: string;
  searchGroup: 'primary' | 'timeseries';
  aspects: AspectSpec[];
}

export interface EdgeInfo {
  type: string;
  direction: 'OUTGOING' | 'INCOMING';
  opposingEntityType: string;
}

export interface LineageSpec {
  upstreamEdges: EdgeInfo[];
  downstreamEdges: EdgeInfo[];
}

// ═══ EntityRegistry ═══

export class EntityRegistry {
  protected specs = new Map<string, EntitySpec>();
  protected aspects = new Map<string, AspectSpec>();

  registerEntity(spec: EntitySpec): void {
    this.specs.set(spec.name, spec);
    for (const aspect of spec.aspects) {
      this.aspects.set(`${spec.name}.${aspect.name}`, aspect);
    }
  }

  getEntitySpec(name: string): EntitySpec | undefined { return this.specs.get(name); }
  getEntitySpecs(): Map<string, EntitySpec> { return new Map(this.specs); }
  getAspectSpecs(): Map<string, AspectSpec> { return new Map(this.aspects); }
  getEntitiesBySearchGroup(group: string): EntitySpec[] {
    return [...this.specs.values()].filter(s => s.searchGroup === group);
  }
}

// ═══ MergedEntityRegistry (对标 DataHub MergedEntityRegistry.apply()) ═══

export class MergedEntityRegistry extends EntityRegistry {
  static merge(base: EntityRegistry, patch: EntityRegistry): MergedEntityRegistry {
    const merged = new MergedEntityRegistry();

    // Copy all base entities
    for (const [name, spec] of base.getEntitySpecs()) {
      merged.registerEntity({ ...spec, aspects: [...spec.aspects] });
    }

    // Apply patch: merge aspects for existing entities, insert new entities
    for (const [name, patchSpec] of patch.getEntitySpecs()) {
      const existing = merged.getEntitySpec(name);
      if (existing) {
        // Validate keyAspect compatibility
        if (existing.keyAspect !== patchSpec.keyAspect) {
          throw new VersionConflictError(`Entity '${name}': keyAspect mismatch (base=${existing.keyAspect}, patch=${patchSpec.keyAspect}). Cannot merge.`);
        }
        // Merge aspects: patch aspects override base aspects with same name
        const mergedAspects = [...existing.aspects];
        for (const patchAspect of patchSpec.aspects) {
          const idx = mergedAspects.findIndex(a => a.name === patchAspect.name);
          if (idx >= 0) mergedAspects[idx] = patchAspect; // Override
          else mergedAspects.push(patchAspect); // Insert new
        }
        merged.specs.set(name, { ...existing, aspects: mergedAspects });
      } else {
        merged.registerEntity({ ...patchSpec, aspects: [...patchSpec.aspects] });
      }
    }

    log.info({ base: base.getEntitySpecs().size, patch: patch.getEntitySpecs().size, merged: merged.getEntitySpecs().size }, '[entity-registry] Merged registries');
    return merged;
  }
}

// ═══ LineageRegistry (对标 DataHub LineageRegistry.buildLineageSpecs()) ═══

export class LineageRegistry {
  private specs = new Map<string, LineageSpec>();

  static build(registry: EntityRegistry): LineageRegistry {
    const lr = new LineageRegistry();

    for (const [entityName, entitySpec] of registry.getEntitySpecs()) {
      for (const aspect of entitySpec.aspects) {
        if (!aspect.relationships) continue;

        for (const rel of aspect.relationships) {
          if (!rel.isLineage) continue; // Only lineage edges

          for (const destType of rel.entityTypes) {
            const direction = rel.isUpstream ?? true; // Default: source is upstream

            // Source entity's spec
            if (!lr.specs.has(entityName)) lr.specs.set(entityName, { upstreamEdges: [], downstreamEdges: [] });
            const sourceSpec = lr.specs.get(entityName)!;

            // Destination entity's spec
            if (!lr.specs.has(destType)) lr.specs.set(destType, { upstreamEdges: [], downstreamEdges: [] });
            const destSpec = lr.specs.get(destType)!;

            if (direction) {
              // source → upstream, dest → downstream
              sourceSpec.upstreamEdges.push({ type: rel.name, direction: 'OUTGOING', opposingEntityType: destType });
              destSpec.downstreamEdges.push({ type: rel.name, direction: 'INCOMING', opposingEntityType: entityName });
            } else {
              // source → downstream, dest → upstream
              sourceSpec.downstreamEdges.push({ type: rel.name, direction: 'OUTGOING', opposingEntityType: destType });
              destSpec.upstreamEdges.push({ type: rel.name, direction: 'INCOMING', opposingEntityType: entityName });
            }
          }
        }
      }
    }

    log.info({ specs: lr.specs.size }, '[lineage-registry] Built from entity registry');
    return lr;
  }

  getSpec(entityName: string): LineageSpec | undefined { return this.specs.get(entityName); }
  getUpstreamEntities(entityName: string): EdgeInfo[] { return this.specs.get(entityName)?.upstreamEdges || []; }
  getDownstreamEntities(entityName: string): EdgeInfo[] { return this.specs.get(entityName)?.downstreamEdges || []; }
}

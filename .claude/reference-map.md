# Reference Map

| 符号 | 文件 | 行 | 内容 |
|------|------|-----|------|

## loadNodeTypeSchema
| `loadNodeTypeSchema` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/data-ingest-service.ts | `130:export function loadNodeTypeSchema(targetNodeType: string): NodeTypeSchema \| null {` |
| `loadNodeTypeSchema` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/data-ingest-service.ts | `233:  const schema = loadNodeTypeSchema(mapping.targetNodeType);` |
| `loadNodeTypeSchema` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `10: *   用例2/3/5 因 loadNodeTypeSchema 尚不存在而红（动态导入使 red 定位到用例断言而非模块级 import 错误）；` |
| `loadNodeTypeSchema` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `43: * D470: 动态导入 loadNodeTypeSchema。` |
| `loadNodeTypeSchema` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `51:  const { loadNodeTypeSchema } = await import('../../src/agent/data-ingest-service');` |
| `loadNodeTypeSchema` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `52:  return loadNodeTypeSchema(targetNodeType);` |
| `loadNodeTypeSchema` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `219:  it('用例5 Financial 回归: loadNodeTypeSchema 回退 financial.json，erp-standard 行为不变', async () => {` |

## loadFinancialSchema
| `loadFinancialSchema` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/data-ingest-service.ts | `108:export function loadFinancialSchema(): FinancialSchema {` |
| `loadFinancialSchema` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/data-ingest-service.ts | `124: *   降级: Financial 显式回退 loadFinancialSchema()（向后兼容 legacy 空白名单语义）；` |
| `loadFinancialSchema` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/data-ingest-service.ts | `133:    return loadFinancialSchema();` |
| `loadFinancialSchema` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `16:  loadFinancialSchema,` |
| `loadFinancialSchema` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `220:    // 回退分支接线: Financial 显式走 loadFinancialSchema()（legacy 语义逐位保留）` |
| `loadFinancialSchema` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `221:    const financialSchema = loadFinancialSchema();` |

## ingestBatch
| `ingestBatch` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/data-ingest-service.ts | `226:export async function ingestBatch(` |
| `ingestBatch` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/data.ts | `31:    const { loadFieldMapping, ingestBatch } = await import('../agent/data-ingest-service');` |
| `ingestBatch` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/data.ts | `62:    const result = await ingestBatch(` |
| `ingestBatch` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `17:  ingestBatch,` |
| `ingestBatch` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `72:    const result = await ingestBatch(fake.store, mapping, [row]);` |
| `ingestBatch` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `157:    const result = await ingestBatch(fake.store, mapping, [row1, row2]);` |
| `ingestBatch` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `193:    const resultA = await ingestBatch(fakeA.store, boundaryConfig, [{ 神秘字段: 'x' }]);` |
| `ingestBatch` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `211:    const resultB = await ingestBatch(fakeB.store, missingConfig, [{ X: 'y' }]);` |
| `ingestBatch` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `250:    const result = await ingestBatch(fake.store, mapping, [row]);` |

## loadFieldMapping
| `loadFieldMapping` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/adapter-registry.ts | `19:  /** 适配器配置全文（用于 loadFieldMapping 按名称加载） */` |
| `loadFieldMapping` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/data-ingest-service.ts | `91:export function loadFieldMapping(name: string): FieldMappingConfig \| null {` |
| `loadFieldMapping` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/data.ts | `31:    const { loadFieldMapping, ingestBatch } = await import('../agent/data-ingest-service');` |
| `loadFieldMapping` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/data.ts | `32:    const config = loadFieldMapping(mapping);` |
| `loadFieldMapping` | D | /novis-backup-20260526/Novis/synova-agent/extensions/ontology/custom-adapters/registry.ts | `21: * @param name - 适配器名称（用于 loadFieldMapping 加载）` |
| `loadFieldMapping` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `6: * 铁律 12: 真实 JSON 文件驱动（loadFieldMapping 直读 extensions/ontology/field-mappings/），不 mock 管线。` |
| `loadFieldMapping` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `15:  loadFieldMapping,` |
| `loadFieldMapping` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `36:function requireMapping(name: string): NonNullable<ReturnType<typeof loadFieldMapping>> {` |
| `loadFieldMapping` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/agent/data-ingest-service.test.ts | `37:  const m = loadFieldMapping(name);` |

# Reference Map

| 符号 | 文件 | 行 | 内容 |
|------|------|-----|------|

## row\['period'\]
| `row\['period'\]` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/data-ingest-service.ts | `203:  const period = row['period'];` |

## props.period
| `props.period` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/data-ingest-service.ts | `208:    props.period = periodStr; // D33: 传递给 createNode 用于时间字段推导` |
| `props.period` | D | /novis-backup-20260526/Novis/synova-agent/src/l4/graph-bridge.ts | `78:  // D33: 时间字段 — props.period 触发 valid_from/valid_to/observed_at 自动填充` |
| `props.period` | D | /novis-backup-20260526/Novis/synova-agent/src/l4/graph-bridge.ts | `86:      const period = String(props.period);` |

## standardKey
| `standardKey` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/data-ingest-service.ts | `201:  // D29: 标准键冲突检测 — 用外部 period 字段生成 standardKey` |
| `standardKey` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/data-ingest-service.ts | `202:  // D33: standardKey 扩展为含 validFrom 时间维度` |
| `standardKey` | D | /novis-backup-20260526/Novis/synova-agent/src/agent/data-ingest-service.ts | `207:    props.standardKey = `${graph}:${mapping.targetNodeType}:${periodStr}:${validFrom}`;` |
| `standardKey` | D | /novis-backup-20260526/Novis/synova-agent/src/l4/graph-bridge.ts | `77:  // D29: 可选冲突检测 — props.standardKey 触发标准键查询 + data_versions 追加` |
| `standardKey` | D | /novis-backup-20260526/Novis/synova-agent/src/l4/graph-bridge.ts | `92:    const standardKey = props?.standardKey;` |
| `standardKey` | D | /novis-backup-20260526/Novis/synova-agent/src/l4/graph-bridge.ts | `93:    if (standardKey) {` |
| `standardKey` | D | /novis-backup-20260526/Novis/synova-agent/src/l4/graph-bridge.ts | `94:      const existing = store.queryNodes(type, { standardKey: standardKey as string }, g);` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `208:  it('Given new standardKey, When createNode, Then initializes data_versions and has_conflict', () => {` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `209:    store.createNode('test_type', { standardKey: 'g:test_type:2026-Q1', name: 'first' }, orgId);` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `212:      standardKey: 'g:test_type:2026-Q1',` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `219:  it('Given same standardKey twice, When createNode second time, Then appends to data_versions and sets has_conflict', () => {` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `221:    const firstId = store.createNode('test_type', { standardKey: key, value: 100 }, orgId);` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `222:    const secondId = store.createNode('test_type', { standardKey: key, value: 200 }, orgId);` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `227:    expect((node?.props.data_versions as Array<Record<string, unknown>>)[0].value).toMatchObject({ standardKey: key, value: 100 });` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `231:  it('Given createNode without standardKey, When createNode, Then no conflict fields added (backward compat)', () => {` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `287:    store.createNode('test_type', { period: '2026-Q1', standardKey: 'g:t:2026-Q1:2026-01-01', name: 'q1' }, orgId);` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `295:    store.createNode('test_type', { period: '2026-06', standardKey: 'g:t:2026-06:2026-06-01', name: 'june' }, orgId);` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `302:    store.createNode('test_type', { standardKey: 'g:t:noperiod', name: 'no-p' }, orgId);` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `309:  it('Given D29 conflict with time fields, When same standardKey, Then conflict detected', () => {` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `311:    const firstId = store.createNode('test_type', { period: '2026-Q1', standardKey: key, value: 'a' }, orgId);` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `312:    const secondId = store.createNode('test_type', { period: '2026-Q1', standardKey: key, value: 'b' }, orgId);` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `339:    const nodeId = store.createNode('test_type', { standardKey: 'g:t:c1', value: 'v1' }, orgId);` |
| `standardKey` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/l4/graph-bridge.test.ts | `363:    const nodeId = store.createNode('test_type', { standardKey: 'g:t:resolved', value: 'v1' }, orgId);` |

## environment.*external.*growth.*control
| `environment.*external.*growth.*control` | *(无引用)* | — | — |

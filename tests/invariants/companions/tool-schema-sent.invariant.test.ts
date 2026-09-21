/**
 * tests/invariants/companions/tool-schema-sent.invariant.test.ts — 伴生①镜像单测（D865 组2）
 *
 * 镜像: src/invariants/companions/tool-schema-sent.invariant.ts（路径严格镜像，组2 硬要求）
 * 定位: INV-TOOL-SCHEMA-SENT 的**自身违约面**——空 tools 数组（A）/ 工具对话但 schema
 * 从未发出（B）/ 前缀豁免放行 / 无工具对话放行 / 回滚与异常登记。
 * 深度链路（真实 provider.chat 出站 + 韧性层 + HTTP 500）留在
 * tests/sentinel/invariants.test.ts 与 tests/integration/invariant-failclosed.integration.test.ts。
 *
 * 契约（铁律 47/48）:
 *   @input  — ctx（fail/hit/onRollback/flagAnomaly）；检查点 = wrap globalThis.fetch 的
 *             POST *chat/completions + JSON body
 *   @output — 合规请求原样透传（返回上游 Response）；违约 → reject InvariantError（未打到上游）
 *   @degraded — body 非 JSON → log.debug 豁免放行；检查层自身异常 → log.warn 放行原请求
 *   @error  — 违约 code=INV-TOOL-SCHEMA-SENT / owner=squad-b/coding；回滚遇替换 → flagAnomaly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InvariantRegistry, InvariantError } from '../../../src/invariants/registry';
import { onToolSchemaSent } from '../../../src/invariants/companions/tool-schema-sent.invariant';

const originalGlobalFetch = globalThis.fetch;
const CHAT_URL = 'http://upstream.invalid/v1/chat/completions';

let registry: InvariantRegistry;
let upstreamBodies: string[];

beforeEach(() => {
  registry = new InvariantRegistry();
  upstreamBodies = [];
  globalThis.fetch = async (_input, init) => {
    if (typeof init?.body === 'string') upstreamBodies.push(init.body);
    return new Response(JSON.stringify({ choices: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
});

afterEach(() => {
  registry.uninstallAll();
  globalThis.fetch = originalGlobalFetch;
});

/** 经被 wrap 的 fetch 出站一次 chat 请求 */
function postChat(body: unknown): Promise<Response> {
  return globalThis.fetch(CHAT_URL, { method: 'POST', body: JSON.stringify(body) });
}

/** 取 InvariantError 本体（断言 code/owner 用；无违约则返回 undefined） */
async function catchInvariant(p: Promise<Response>): Promise<InvariantError | undefined> {
  try {
    await p;
    return undefined;
  } catch (err: unknown) {
    return err instanceof InvariantError ? err : undefined;
  }
}

const TOOL_CALL_TURN = [
  { role: 'user', content: 'q' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 't', arguments: '{}' } }] },
  { role: 'tool', tool_call_id: 'c1', content: '{"r":1}' },
];

describe('伴生元数据（总纲 §9.4 notChecked）', () => {
  it('code/owner/packageName 稳定 + notChecked 非空显式清单', () => {
    expect(onToolSchemaSent.code).toBe('INV-TOOL-SCHEMA-SENT');
    expect(onToolSchemaSent.owner).toBe('squad-b/coding');
    expect(onToolSchemaSent.packageName).toBe('@synova/agent');
    expect(onToolSchemaSent.notChecked.length).toBeGreaterThanOrEqual(5);
    expect(onToolSchemaSent.notChecked.join('\n')).toContain('JSON Schema 合法性');
    expect(onToolSchemaSent.notChecked.join('\n')).toContain('收尾轮');
  });
});

describe('违约面 B：工具对话但 schema 从未发出（D819 复发形态）', () => {
  it('tools 缺失且该对话从未带过 tools → InvariantError，且请求未打到上游', async () => {
    registry.install(onToolSchemaSent);
    const err = await catchInvariant(postChat({ model: 'm', messages: TOOL_CALL_TURN }));
    expect(err).toBeInstanceOf(InvariantError);
    expect(err?.code).toBe('INV-TOOL-SCHEMA-SENT');
    expect(err?.owner).toBe('squad-b/coding');
    expect(err?.message).toContain('D819');
    expect(upstreamBodies).toHaveLength(0); // 违约在出站前拦截
    expect(registry.statusOf('INV-TOOL-SCHEMA-SENT')?.lastFailure).toContain('tools schema 缺失');
  });

  it('空 tools 数组 → InvariantError（显式空 schema 无合法收尾语义）', async () => {
    registry.install(onToolSchemaSent);
    const err = await catchInvariant(postChat({ model: 'm', messages: TOOL_CALL_TURN, tools: [] }));
    expect(err).toBeInstanceOf(InvariantError);
    expect(err?.message).toContain('tools 为空数组');
    expect(upstreamBodies).toHaveLength(0);
  });

  it('assistant.tool_calls 为空数组（未发生工具对话）→ 放行（只守可观察的工具对话事实）', async () => {
    registry.install(onToolSchemaSent);
    const res = await postChat({
      model: 'm',
      messages: [{ role: 'assistant', content: 'hi', tool_calls: [] }, { role: 'user', content: 'q' }],
    });
    expect(res.status).toBe(200);
    expect(upstreamBodies).toHaveLength(1);
    expect(registry.statusOf('INV-TOOL-SCHEMA-SENT')?.lastFailure).toBeNull();
  });
});

describe('放行面：前缀豁免与非检查面', () => {
  it('该对话此前成功带过 tools → 收尾轮丢 tools 放行（notChecked #2 显式声明的边界）', async () => {
    registry.install(onToolSchemaSent);
    const base = [{ role: 'user', content: 'q' }];
    await postChat({ model: 'm', messages: base, tools: [{ type: 'function', function: { name: 't' } }] });
    const grown = [...base, ...TOOL_CALL_TURN.slice(1)]; // 同前缀 + 追加 assistant.tool_calls/tool 消息（生产收尾轮形态）
    const res = await postChat({ model: 'm', messages: grown });
    expect(res.status).toBe(200);
    expect(upstreamBodies).toHaveLength(2);
    expect(registry.statusOf('INV-TOOL-SCHEMA-SENT')?.lastFailure).toBeNull();
    expect(registry.statusOf('INV-TOOL-SCHEMA-SENT')?.hitCount).toBe(2);
  });

  it('非 chat/completions 路径 / 非 POST → 不在检查面（notChecked #4）', async () => {
    registry.install(onToolSchemaSent);
    const resGet = await globalThis.fetch('http://upstream.invalid/v1/models');
    expect(resGet.status).toBe(200);
    const resOther = await globalThis.fetch('http://upstream.invalid/v1/embeddings', {
      method: 'POST',
      body: JSON.stringify({ messages: TOOL_CALL_TURN }),
    });
    expect(resOther.status).toBe(200);
    expect(registry.statusOf('INV-TOOL-SCHEMA-SENT')?.hitCount).toBe(0);
  });

  it('body 非 JSON 字符串 → 豁免放行（notChecked #4，检查器不当故障源）', async () => {
    registry.install(onToolSchemaSent);
    const res = await globalThis.fetch(CHAT_URL, { method: 'POST', body: 'not-json{' });
    expect(res.status).toBe(200);
    expect(upstreamBodies).toHaveLength(1);
    expect(registry.statusOf('INV-TOOL-SCHEMA-SENT')?.lastFailure).toBeNull();
  });
});

describe('回滚面：wrap 撤销与静默失效防假绿', () => {
  it('uninstall 还原 globalThis.fetch（无残留监听）', () => {
    const before = globalThis.fetch;
    registry.install(onToolSchemaSent);
    expect(globalThis.fetch).not.toBe(before);
    registry.uninstall('INV-TOOL-SCHEMA-SENT');
    expect(globalThis.fetch).toBe(before);
    expect(registry.registered).toBe(0);
  });

  it('回滚遇"已被他人替换" → flagAnomaly 进注册表级（探针可见，不再静默失效）', () => {
    registry.install(onToolSchemaSent);
    const stranger: typeof globalThis.fetch = async () => new Response('{}', { status: 200 });
    globalThis.fetch = stranger;
    registry.uninstall('INV-TOOL-SCHEMA-SENT');
    const snap = registry.snapshot();
    expect(snap.registered).toBe(0);
    expect(snap.anomalies).toHaveLength(1);
    expect(snap.anomalies[0]).toContain('已被他人替换');
    expect(snap.anomalies[0]).toContain('INV-TOOL-SCHEMA-SENT');
  });
});

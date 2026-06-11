/**
 * llm-stream.test.ts — 流式输出测试 (铁律 0-2)
 */
import { parseSSEStream, collectStream, toLLMResponse } from '../llm-stream';

describe('parseSSEStream', () => {
  it('Given valid SSE, When parsed, Then yields text_delta events', async () => {
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":" World"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    const response = new Response(readable, { headers: { 'content-type': 'text/event-stream' } });
    const events: string[] = [];
    for await (const e of parseSSEStream(response)) {
      if (e.type === 'text_delta') events.push(e.text);
    }
    expect(events).toEqual(['Hello', ' World']);
  });
});

describe('collectStream', () => {
  it('Given async iterable, When collected, Then returns StreamResult', async () => {
    async function* gen(): AsyncIterable<any> {
      yield { type: 'text_delta', text: 'A' };
      yield { type: 'text_delta', text: 'B' };
      yield { type: 'message_stop' };
    }
    const result = await collectStream(gen());
    expect(result.content).toBe('AB');
    expect(result.events).toHaveLength(3);
  });

  it('Given error event, When collected, Then throws', async () => {
    async function* gen(): AsyncIterable<any> {
      yield { type: 'error', message: 'fail' };
    }
    await expect(collectStream(gen())).rejects.toThrow('fail');
  });
});

describe('toLLMResponse', () => {
  it('converts StreamResult to LLMResponse', () => {
    const result = toLLMResponse({ content: 'Hello', model: 'claude', events: [], usage: { inputTokens: 10, outputTokens: 5 } });
    expect(result.content).toBe('Hello');
    expect(result.model).toBe('claude');
  });
});

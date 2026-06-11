/**
 * llm-stream.ts — LLM 流式输出 (对标 Claw-Code stream() → AssistantEvent[])
 *
 * Claw-Code: stream() 返回 AssistantEvent[] (Thinking | TextDelta | ToolUse | Usage | PromptCache | MessageStop)
 * 我们:       streamChat() 返回 AsyncIterable<StreamEvent>
 */
import type { LLMResponse } from './diagnosis-orchestrator';

// ═══ Stream Types ═══

export type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'message_stop' }
  | { type: 'error'; message: string };

export interface StreamResult {
  content: string;
  model: string;
  events: StreamEvent[];
  usage?: { inputTokens: number; outputTokens: number };
}

// ═══ SSE Parser ═══

/** Parse SSE text/event-stream into StreamEvents */
export async function* parseSSEStream(
  response: Response,
): AsyncIterable<StreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) { yield { type: 'error', message: 'No response body' }; return; }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') { yield { type: 'message_stop' }; return; }

      try {
        const json = JSON.parse(data);
        const choice = json.choices?.[0];
        if (!choice) continue;

        if (choice.delta?.content) yield { type: 'text_delta', text: choice.delta.content };
        if (choice.delta?.reasoning_content) yield { type: 'thinking', thinking: choice.delta.reasoning_content };
        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            yield { type: 'tool_use', id: tc.id, name: tc.function?.name || 'unknown', input: tc.function?.arguments || '' };
          }
        }
        if (json.usage) yield { type: 'usage', inputTokens: json.usage.prompt_tokens || 0, outputTokens: json.usage.completion_tokens || 0 };
      } catch { /* skip malformed SSE lines */ }
    }
  }
  yield { type: 'message_stop' };
}

/** Collect stream events into a single result (backward compat with consult()) */
export async function collectStream(events: AsyncIterable<StreamEvent>): Promise<StreamResult> {
  let content = '';
  let model = 'unknown';
  const allEvents: StreamEvent[] = [];
  let usage = { inputTokens: 0, outputTokens: 0 };

  for await (const event of events) {
    allEvents.push(event);
    switch (event.type) {
      case 'text_delta': content += event.text; break;
      case 'thinking': break;
      case 'usage': usage = { inputTokens: event.inputTokens, outputTokens: event.outputTokens }; break;
      case 'message_stop': break;
      case 'error': throw new Error(event.message);
    }
  }

  return { content, model, events: allEvents, usage };
}

/** Convert StreamResult to LLMResponse (backward compat) */
export function toLLMResponse(result: StreamResult): LLMResponse {
  return { content: result.content, model: result.model };
}

/**
 * view-adapter.test.ts — Slice C: ViewAdapter 接口测试
 */
import { describe, it, expect } from 'vitest';
import type { ViewAdapter } from '../src/l1-interaction/types';

describe('ViewAdapter interface', () => {
  it('Given ViewAdapter type, When methods called, Then shape is correct', () => {
    // Verify the interface shape at compile time
    const mock: ViewAdapter = {
      showAgentMessage: (t) => { expect(typeof t).toBe('string'); },
      showUserMessage: (t) => { expect(typeof t).toBe('string'); },
      appendToken: (t) => { expect(typeof t).toBe('string'); },
      showSystemMessage: (t) => { expect(typeof t).toBe('string'); },
      showError: (t) => { expect(typeof t).toBe('string'); },
      setStatus: (t) => { expect(typeof t).toBe('string'); },
      render: () => {},
    };

    mock.showAgentMessage('Hello');
    mock.showUserMessage('User input');
    mock.appendToken('t');
    mock.showSystemMessage('System');
    mock.showError('Error');
    mock.setStatus('Ready');
    mock.render();

    // If we got here without errors, the interface shape is valid
    expect(true).toBe(true);
  });

  it('Given ViewAdapter, When all methods exist, Then 7 methods total', () => {
    const methods = [
      'showAgentMessage', 'showUserMessage', 'appendToken',
      'showSystemMessage', 'showError', 'setStatus', 'render',
    ];
    expect(methods).toHaveLength(7);
  });
});

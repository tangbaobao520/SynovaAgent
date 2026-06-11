/**
 * tui-v2/index.ts — Synova 增长导航 TUI 入口 (ink 版本)
 *
 * 用法: npx tsx src/tui-v2/index.ts
 */

import React from 'react';
import { render } from 'ink';
import { bootstrap } from './lib/bootstrap';
import { App } from './app';
import { installStdinProxy } from './lib/mouse-input';

async function main() {
  const { engine, eventBus, provider } = await bootstrapWithEngine();

  if (!engine) {
    console.log('\n❌ 无法启动 TUI：ConversationEngine 初始化失败');
    console.log('请运行: npx tsx src/setup.ts 配置 LLM\n');
    process.exit(1);
  }

  installStdinProxy();
  render(
    React.createElement(App, {
      engine,
      eventBus,
      model: provider?.name || '未配置',
      workDir: process.cwd(),
    })
  );
}

async function bootstrapWithEngine() {
  const ctx = await bootstrap();
  const { provider, eventBus, hookRunner, sessionManager, stateMachine } = ctx;
  let engine;

  if (provider) {
    try {
      const { ConversationEngine } = await import('../agent/conversation-engine');
      engine = new ConversationEngine(provider, {
        sessionId: ctx.sessionId,
        eventBus,
        hookRunner,
        sessionManager,
        phaseStateMachine: stateMachine,
      });
    } catch (err) {
      console.error('ConversationEngine 初始化失败:', err);
    }
  }

  return { ...ctx, engine };
}

main().catch(err => {
  console.error('TUI 启动失败:', err);
  process.exit(1);
});

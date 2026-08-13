/**
 * index.ts — SynovaAgent 入口
 *
 * 组织数字孪生诊断 Agent。独立进程，配置 LLM 即用。
 *
 * 用法:
 *   DEV_MODE=true npx tsx src/index.ts
 *   LLM_API_KEY=sk-... npm start
 *
 * 生命周期: initEngineContext → SynovaAgent(db).start()
 *   → createServer() (HTTP) + SentinelRunner (Cron 哨兵)
 */
import { SynovaAgent } from './agent/synova-agent';
import { initEngineContext, getDatabase, closeEngineContext } from './init/engine-context';
import { logger } from '@synova/logger';

async function main() {
  try {
    initEngineContext();
    const db = getDatabase();
    const agent = new SynovaAgent(db);
    await agent.start();
    logger.info('SynovaAgent 就绪');
  } catch (err) {
    logger.error({ err }, 'SynovaAgent 启动失败');
    try { closeEngineContext(); } catch { console.debug('closeEngineContext 失败 — 进程即将退出, 忽略'); }
    process.exit(1);
  }
}

main();

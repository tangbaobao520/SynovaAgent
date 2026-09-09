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
import { startSynovaAgentProcess, stopSynovaAgentProcess } from './init/agent-entry';
import { logger } from '@synova/logger';

// D603 跨层修复（簇5）: initEngineContext/getDatabase 直取移入 init/agent-entry
// （组合根层，engine-context 同层）——进程入口只调 start/stop（铁律 39）。
async function main() {
  try {
    await startSynovaAgentProcess();
  } catch (err) {
    logger.error({ err }, 'SynovaAgent 启动失败');
    try { stopSynovaAgentProcess(); } catch { console.debug('stopSynovaAgentProcess 失败 — 进程即将退出, 忽略'); }
    process.exit(1);
  }
}

main();

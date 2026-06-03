/**
 * index.ts — SynovaAgent 入口
 *
 * 组织数字孪生诊断 Agent。独立进程，配置 LLM 即用。
 *
 * 用法:
 *   DEV_MODE=true npx tsx src/index.ts
 *   LLM_API_KEY=sk-... npm start
 */
import { createServer } from './server';
import { logger } from './logger';

async function main() {
  try {
    await createServer();
    logger.info('SynovaAgent 就绪');
  } catch (err) {
    logger.error({ err }, 'SynovaAgent 启动失败');
    process.exit(1);
  }
}

main();

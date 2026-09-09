/**
 * init/agent-entry.ts — SynovaAgent 进程装配（组合根层，engine-context 同层）
 * @state: real
 *
 * D603 跨层修复（扫描报告 §三 簇5 组合根簇）: src/index.ts 的
 * initEngineContext/getDatabase/closeEngineContext 直取移入本模块——
 * 进程入口（L1）只调 start/stop，不直触引擎上下文句柄（铁律 39）。
 * server.ts 同类装配已集中 deploy/bootstrap.ts（D83 先例），本模块对齐该模式。
 *
 * 契约（铁律 47）:
 *   @input  无（进程级装配，读 engine-context 全局配置）
 *   @output startSynovaAgentProcess → 已启动的 SynovaAgent；
 *           stopSynovaAgentProcess → 引擎上下文关闭（幂等语义同 closeEngineContext）。
 *   @degraded 无 — initEngineContext/getDatabase 失败原样抛出，由入口 catch 退出。
 */

import { initEngineContext, getDatabase, closeEngineContext } from './engine-context';
import { SynovaAgent } from '../agent/synova-agent';
import { logger } from '@synova/logger';

/**
 * 启动 SynovaAgent 进程（initEngineContext → SynovaAgent(db).start()）。
 * 序列与修复前 src/index.ts:19-23 逐字节一致。
 */
export async function startSynovaAgentProcess(): Promise<SynovaAgent> {
  initEngineContext();
  const db = getDatabase();
  const agent = new SynovaAgent(db);
  await agent.start();
  logger.info('SynovaAgent 就绪');
  return agent;
}

/** 关闭引擎上下文（进程退出路径专用，透传 closeEngineContext）。 */
export function stopSynovaAgentProcess(): void {
  closeEngineContext();
}

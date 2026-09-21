/**
 * src/invariants/index.ts — P-2 运行期不变量机制入口（D831）
 *
 * 汇出: 注册表（registry）+ 首批 3 条伴生（companions）+ 启动 Phase 工厂
 * （createRuntimeInvariantsPhase，由 src/deploy/bootstrap.ts 注册为 Phase 6）。
 *
 * 首批 3 条（D831 卡）:
 *   ① INV-TOOL-SCHEMA-SENT   出站 LLM 请求工具对话已发生时必须带非空 tools schema
 *   ② INV-TOOL-CALL-PAIRING  tool 消息 tool_call_id 必须与前置 assistant.tool_calls 配对
 *   ③ INV-DEGRADED-STICKY    会话聚合降级标记不得被后续成功写入抹掉/静默吞掉
 *
 * fail-closed 语义: execute 内断言 registered == 伴生清单数（含 0 = 空转）→
 * 抛错 → fatal → 启动失败（注册表空转 = 机制在场但不接线 = 总纲 §2.3 批判的形态，禁止）。
 * 原子回滚: 任一伴生 install 抛错 → installAll 撤销已装 wrap → rollback 再兜底
 * uninstallAll → 进程启动失败、无残留监听/部分注册。
 */

import { createLogger } from '@synova/logger';
import type { PhaseDefinition } from '../deploy/bootstrap';
import { InvariantRegistry } from './registry';
import { onToolSchemaSent } from './companions/tool-schema-sent.invariant';
import { onToolCallPairing } from './companions/tool-call-pairing.invariant';
import { onDegradedSticky } from './companions/degraded-sticky.invariant';

const log = createLogger('invariants');

export { InvariantRegistry, InvariantError } from './registry';
export type { InvariantCompanion, InvariantContext, InvariantSnapshot, InvariantStatus } from './registry';
export { onToolSchemaSent } from './companions/tool-schema-sent.invariant';
export { onToolCallPairing } from './companions/tool-call-pairing.invariant';
export { onDegradedSticky, getStickyDegradedSessions } from './companions/degraded-sticky.invariant';
export { invariantHealthRoutes } from './health-route';

/** 模块级注册表单例——bootstrap Phase 6 与健康探针共用同一实例 */
export const invariantRegistry = new InvariantRegistry();

/** 首批 3 条伴生（安装顺序即 wrap 叠加序；回滚按逆序撤销） */
export const RUNTIME_INVARIANT_COMPANIONS = [onToolSchemaSent, onToolCallPairing, onDegradedSticky] as const;

/**
 * 安装全部运行期不变量（幂等：先 uninstallAll 再装，供 Phase 重跑/测试隔离）。
 * 契约:
 *   @input  — registry?: InvariantRegistry（默认单例）
 *   @output — void（同步完成；伴生 install 均 void，无"注册中"中间态）
 *   @error  — 任一伴生抛错 → 原子回滚已装 wrap 后重抛（fatal 语义）
 */
export function installRuntimeInvariants(registry: InvariantRegistry = invariantRegistry): void {
  registry.uninstallAll();
  registry.installAll(RUNTIME_INVARIANT_COMPANIONS);
}

/**
 * Bootstrap Phase 工厂（Phase 6: runtime-invariants，fatal + rollbackOnFail）。
 * registered == 0 → execute 抛错 → 启动失败（fail-closed）。
 */
export function createRuntimeInvariantsPhase(): PhaseDefinition {
  return {
    id: 6,
    name: 'runtime-invariants',
    description: 'P-2 运行期不变量注册表 + 首批 3 条伴生（D831）: fail-closed，registered==0 即启动失败',
    fatal: true,
    rollbackOnFail: true,
    timeoutMs: 10_000,
    execute: async () => {
      installRuntimeInvariants();
      // D865 P2-5: 一致性断言（已装数 == 伴生清单数）——使"注册表空转"守卫构造上可达
      // （旧写法 execute 先装 3 条再判 registered==0，分支永不可达；且 installAll 被替身
      // /空转时注册表空 = 启动失败，fail-closed 不变）
      const snap = invariantRegistry.snapshot();
      const expected = RUNTIME_INVARIANT_COMPANIONS.length;
      if (snap.registered !== expected) {
        throw new Error(
          `runtime-invariants: registered==${snap.registered} != expected==${expected} — 不变量注册表空转/部分注册，启动失败（fail-closed，总纲 P-2）`,
        );
      }
      log.info({ registered: snap.registered, codes: snap.invariants.map((i) => i.code) }, 'Phase 6: 运行期不变量已安装');
    },
    rollback: async () => {
      invariantRegistry.uninstallAll();
      log.warn('Phase 6 回滚: 运行期不变量 wrap 已全部撤销（无残留监听/部分注册）');
    },
  };
}

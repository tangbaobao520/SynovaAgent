/**
 * agent/scheduler-service.ts — cron 调度器访问服务 (L2)
 * @state: real
 *
 * D603 跨层修复（扫描报告 §三 簇6 TUI/CLI 簇）: TUI（chat.tsx）经此访问全局
 * cron 调度器，不直触 cron/scheduler（L5，铁律 39）。
 * 纯转发 re-export——knowledge-bridge-service 桥接模式同款（扫描报告 §2.2 #11
 * 认可的 L2 桥接先例）；调度器生命周期（getGlobalScheduler 单例）不变。
 *
 * L1→L2 ✅ | L2→L5(cron) 装配职责 ✅
 */

export { getGlobalScheduler } from '../cron/scheduler';

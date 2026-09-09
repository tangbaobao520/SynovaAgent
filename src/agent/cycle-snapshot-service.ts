/**
 * agent/cycle-snapshot-service.ts — 循环快照查询服务 (L2)
 * @state: real
 *
 * D603 跨层修复（扫描报告 §三 簇3）: routes/overflow 经此访问 cycles 图桥接查询，
 * 不直触 cycles/overflow-graph-bridge（gate 按 graph-bridge 形态计 L1→L4；
 * cycles 层级归属另行裁决前的 L2 转发，扫描报告 §2.2 #14 修复路径）。
 * 纯转发 re-export——查询签名（orgId, cycleId, graphStore, opts）原样传播。
 *
 * L1→L2 ✅ | L2→cycles ✅（先例: agent/loop-handlers.ts:36 同款直引）
 */

export { getCycleSnapshots, getLatestSnapshot } from '../cycles/overflow-graph-bridge';

/**
 * l3/community-reports-adapter.ts — L3 适配层: 社区报告 (D292)
 *
 * 铁律 39: L2 禁触 L4。L2 diagnosis-launcher 动态 import 经此适配器访问 L4 community-reports。
 * 纯代理 — 转发 generateCommunityReports 同一实现, 不修改逻辑。
 */
export { generateCommunityReports } from '../l4/community-reports';

/**
 * connectors/index.ts — 数据连接器注册中心
 *
 * 国内轨: DomesticHub (飞书/钉钉/企微自研适配器)
 * 国际轨: NemoClaw MCP (标准化工具接口)
 *
 * 两个轨都实现 DataConnector 接口——诊断引擎代码完全统一。
 */
export { FeishuConnector, loadFeishuConfig } from './feishu';
export type { FeishuConfig } from './feishu';
export { syncFeishuMembersToSOG, feishuHealthCheck } from './feishu-bridge';
export type { FeishuMember, FeishuMessage } from './feishu-bridge';
export type { DataConnector, ConnectorMessage, ConnectorMember, ConnectorEvent, OntologyMapping } from './types';

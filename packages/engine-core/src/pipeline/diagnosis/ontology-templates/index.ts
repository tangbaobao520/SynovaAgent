/**
 * ontology-templates/index.ts — 行业本体模板加载器 (Phase B5)
 */
import type { NodeType, EdgeType } from '../types';

export interface OntologyTemplate {
  id: string;
  name: string;
  industry: string;
  version: string;
  nodeTypes: Array<{ type: NodeType; label: string; description: string; exampleProps: Record<string, unknown> }>;
  edgeTypes: Array<{ type: EdgeType; label: string; description: string; fromNodes: NodeType[]; toNodes: NodeType[] }>;
  keyMetrics: Array<{ id: string; name: string; formula: string; unit: string; threshold_warning?: number; threshold_critical?: number }>;
  diagnosticRules: Array<{ id: string; name: string; condition: string; severity: 'high' | 'medium' | 'low'; recommendation: string }>;
}

import { generalEnterprise } from './general-enterprise';
import { saasTech } from './saas-tech';
import { manufacturing } from './manufacturing';
import { financialServices } from './financial-services';

const templates: Record<string, OntologyTemplate> = {
  'general-enterprise': generalEnterprise,
  'saas-tech': saasTech,
  'manufacturing': manufacturing,
  'financial-services': financialServices,
};

export function getTemplate(id: string): OntologyTemplate | undefined { return templates[id]; }
export function listTemplates(): OntologyTemplate[] { return Object.values(templates); }
export function getTemplateIds(): string[] { return Object.keys(templates); }

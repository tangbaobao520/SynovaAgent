/**
 * sentinel/adapters/data-readiness-sentinel.ts — 数据就绪哨兵 (D5)
 * @state: real
 *
 * 检查 SOG 图中数据质量：缺失字段率、结构化数据比例、PII 混入风险。
 * 每周一 9:00 巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/data-readiness');

const config: SentinelConfig = {
  id: 'sentinel-data-readiness', name: '数据就绪', description: '检查本体层数据完整性: 缺失字段/结构化比例/PII风险。数据源: SOG图。', category: 'data-quality', priority: 'P1', mode: 'cron', cron: '0 9 * * 1', requiredDataSources: ['sog_graph'], confidenceModel: 'deterministic', version: '1.0.0',
};

// 常见 PII 字段模式
const PII_PATTERNS = [/身份证|id_card|ssn|护照|passport/i, /手机|电话|phone|mobile/i, /邮箱|email/i, /地址|address/i, /薪资|salary|工资|payroll/i, /银行|bank.*account/i];

export const dataReadinessSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      if (!db) { return { sentinelId: config.id, ok: true, findings: [], durationMs: 0, checkedAt, degraded: true }; }
      let totalNodes = 0; let missingProps = 0; let piiHits = 0; let structuredNodes = 0;
      try {
        const rows = db.prepare("SELECT type, props FROM graph_nodes WHERE props IS NOT NULL").all();
        totalNodes = rows.length;
        for (const r of rows) {
          const props = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {});
          const keys = Object.keys(props);
          if (keys.length === 0 || (keys.length === 1 && keys[0] === 'name')) { missingProps++; } else { structuredNodes++; }
          const propsStr = JSON.stringify(props);
          for (const pat of PII_PATTERNS) { if (pat.test(propsStr)) { piiHits++; break; } }
        }
      } catch { /* 表不存在 */ }
      if (totalNodes === 0) { return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true }; }
      const findings: SentinelFinding[] = [];
      const missingRate = missingProps / totalNodes;
      const structuredRate = structuredNodes / totalNodes;
      if (missingRate > 0.5) {
        findings.push({ id: `dr-missing-${now.getTime()}`, severity: 'critical', title: `数据缺失率过高 (${(missingRate * 100).toFixed(0)}%)`, description: `${totalNodes} 个节点中 ${missingProps} 个仅含 name 字段，数据质量不足支撑诊断。`, evidence: [`总节点: ${totalNodes}`, `缺失字段: ${missingProps}`, `结构化: ${structuredNodes}`], suggestion: '上传更丰富的企业文档（组织结构图、财务表、客户清单）。', detectedAt: checkedAt });
      }
      if (structuredRate < 0.3 && totalNodes > 10) {
        findings.push({ id: `dr-structured-${now.getTime()}`, severity: 'warning', title: `结构化数据不足 (${(structuredRate * 100).toFixed(0)}%)`, description: `仅有 ${structuredNodes}/${totalNodes} 个节点含结构化属性。Agent 缺乏结构化数据做计算。`, evidence: [`结构化节点: ${structuredNodes}`, `总节点: ${totalNodes}`], suggestion: '按维度上传结构化文档（Excel/CSV/表单）。', detectedAt: checkedAt });
      }
      if (piiHits > 0) {
        findings.push({ id: `dr-pii-${now.getTime()}`, severity: 'warning', title: `检测到 ${piiHits} 个节点含潜在 PII`, description: '个人身份信息(手机/身份证/薪资)混入本体层，存在隐私合规风险。', evidence: [`PII 命中: ${piiHits}/${totalNodes}`], suggestion: '运行 PIIScrubber 清理敏感字段，或标记为加密存储。', detectedAt: checkedAt });
      }
      return { sentinelId: config.id, ok: true, findings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) {
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true };
    }
  },
};

/**
 * sentinel/adapters/shadow-it-sentinel.ts — 影子 IT 哨兵 (D4)
 * @state: real
 *
 * 检测企业中存在但 IT 部门可能不知情的软件使用。
 * 通过对比"授权软件"和"实际使用的软件"之间的差异来发现影子IT。
 * 每周五 10:00 巡检。数据源: SOG 图 + authorization 属性。
 */
import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/shadow-it');

const config: SentinelConfig = {
  id: 'sentinel-shadow-it', name: '影子 IT',
  description: '检测未授权的软件使用: 对比授权清单 vs 实际使用。数据源: SOG图 authorization 属性。',
  category: 'risk', priority: 'P1', mode: 'cron', cron: '0 10 * * 5',
  requiredDataSources: ['sog_graph'], confidenceModel: 'deterministic', version: '1.0.0',
};

// 高风险软件类别 (通常与影子IT相关)
const HIGH_RISK_CATEGORIES = ['file_sharing', 'communication', 'project_management', 'note_taking', 'cloud_storage', 'ai_tool'];

export const shadowITSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      if (!db) { return { sentinelId: config.id, ok: true, findings: [], durationMs: 0, checkedAt, degraded: true }; }

      let tools: Array<{ id: string; name: string; authorized: boolean; category: string; riskLevel: string }> = [];
      try {
        const rows = db.prepare(
          "SELECT id, props FROM graph_nodes WHERE (type = 'TOOL' OR type = 'APP' OR type = 'SOFTWARE') AND props IS NOT NULL"
        ).all();
        for (const r of rows) {
          const props = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {});
          const auth = props.authorized ?? props.approved ?? props.sanctioned;
          tools.push({
            id: r.id as string,
            name: (props.name || r.id) as string,
            authorized: auth === true || auth === 'yes' || auth === 'approved',
            category: (props.category || props.type || 'uncategorized') as string,
            riskLevel: (props.riskLevel || 'unknown') as string,
          });
        }
      } catch { return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true }; }

      if (tools.length === 0) {
        return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: false };
      }

      const authorized = tools.filter(t => t.authorized);
      const unauthorized = tools.filter(t => !t.authorized);
      const unknown = tools.filter(t => !t.authorized && t.riskLevel === 'unknown');

      const findings: SentinelFinding[] = [];

      // 未授权工具
      if (unauthorized.length > 0) {
        const highRiskUnauthorized = unauthorized.filter(t =>
          HIGH_RISK_CATEGORIES.some(cat => t.category.toLowerCase().includes(cat))
        );
        const severity = highRiskUnauthorized.length > 0 ? 'critical' : 'warning';

        findings.push({
          id: `si-unauth-${now.getTime()}`, severity,
          title: `检测到 ${unauthorized.length} 个未授权/未知授权状态的工具`,
          description: `未授权: ${unauthorized.map(t => t.name).join(', ')}。其中高风险类别: ${highRiskUnauthorized.map(t => t.name).join(', ') || '无'}`,
          evidence: [
            `总工具: ${tools.length}`,
            `已授权: ${authorized.length}`,
            `未授权: ${unauthorized.length}`,
            `高风险类别(文件共享/通讯/协作/AI): ${highRiskUnauthorized.length}`,
          ],
          suggestion: highRiskUnauthorized.length > 0
            ? '高风险未授权工具可能涉及数据安全和合规风险。建议立即审查并纳入IT管理。'
            : '启动软件审计，确认未授权工具的合规性和安全风险。',
          detectedAt: checkedAt,
        });
      }

      // 授权率过低
      const authRate = tools.length > 0 ? authorized.length / tools.length : 0;
      if (tools.length >= 5 && authRate < 0.4) {
        findings.push({
          id: `si-rate-${now.getTime()}`, severity: 'critical',
          title: `软件授权率极低: ${(authRate * 100).toFixed(0)}% (${authorized.length}/${tools.length})`,
          description: `仅有 ${authorized.length} 个工具有明确授权记录。影子IT可能广泛存在。`,
          evidence: [`授权: ${authorized.length}`, `未授权/未知: ${tools.length - authorized.length}`],
          suggestion: '全面审计企业的软件使用情况。建立软件准入和审批流程。',
          detectedAt: checkedAt,
        });
      }

      // 状态未知的软件过多
      if (unknown.length >= 3) {
        findings.push({
          id: `si-unknown-${now.getTime()}`, severity: 'warning',
          title: `${unknown.length} 个工具的授权状态未知`,
          description: `未知状态: ${unknown.map(t => t.name).join(', ')}`,
          evidence: unknown.map(t => `${t.name}: category=${t.category}`),
          suggestion: '逐一确认这些工具的授权状态。标注为"已授权"或"需停用"。',
          detectedAt: checkedAt,
        });
      }

      return { sentinelId: config.id, ok: true, findings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) {
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true };
    }
  },
};

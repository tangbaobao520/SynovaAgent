/**
 * sentinel/adapters/saas-utilization-sentinel.ts — SaaS 利用率哨兵 (D4)
 * @state: real
 *
 * 检测企业购买的 SaaS 工具的利用率：哪些在用、哪些闲置、哪些重叠。
 * 每周一 10:00 巡检。数据源: SOG 图 TOOL/APP 节点。
 */
import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/saas-utilization');

const config: SentinelConfig = {
  id: 'sentinel-saas-utilization', name: 'SaaS 利用率',
  description: '检测企业的 SaaS 工具使用率：在用/闲置/重叠。数据源: SOG图 TOOL 节点。',
  category: 'health', priority: 'P1', mode: 'cron', cron: '0 10 * * 1',
  requiredDataSources: ['sog_graph'], confidenceModel: 'deterministic', version: '1.0.0',
};

export const saasUtilizationSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      if (!db) { return { sentinelId: config.id, ok: true, findings: [], durationMs: 0, checkedAt, degraded: true }; }

      // 查询所有软件/工具节点
      let tools: Array<{ id: string; name: string; status: string; category: string }> = [];
      try {
        const rows = db.prepare(
          "SELECT id, props FROM graph_nodes WHERE (type = 'TOOL' OR type = 'APP' OR type = 'SOFTWARE') AND props IS NOT NULL"
        ).all();
        for (const r of rows) {
          const props = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {});
          tools.push({
            id: r.id as string,
            name: (props.name || r.id) as string,
            status: (props.status || props.usageStatus || 'unknown') as string,
            category: (props.category || props.type || 'uncategorized') as string,
          });
        }
      } catch { return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true }; }

      if (tools.length === 0) {
        return { sentinelId: config.id, ok: true, findings: [
          { id: `su-empty-${now.getTime()}`, severity: 'info', title: '未检测到 SaaS 工具数据',
            description: '本体图中没有 TOOL/APP/SOFTWARE 节点。建议运行软件生态扫描。',
            evidence: ['工具节点数: 0'], suggestion: '通过 tech 专家或手动录入企业的软件清单。', detectedAt: checkedAt },
        ], durationMs: Date.now() - startTime, checkedAt, degraded: false };
      }

      const active = tools.filter(t => t.status === 'active' || t.status === 'in_use');
      const idle = tools.filter(t => t.status === 'idle' || t.status === 'unused' || t.status === 'unknown');
      const categories = new Map<string, string[]>();
      for (const t of tools) { const list = categories.get(t.category) || []; list.push(t.name); categories.set(t.category, list); }

      const findings: SentinelFinding[] = [];
      const utilRate = tools.length > 0 ? active.length / tools.length : 0;

      // 利用率过低
      if (utilRate < 0.4 && tools.length >= 3) {
        findings.push({
          id: `su-low-${now.getTime()}`, severity: 'critical',
          title: `SaaS 利用率过低 (${(utilRate * 100).toFixed(0)}%)`,
          description: `${tools.length} 个工具中仅 ${active.length} 个在用。闲置: ${idle.map(t => t.name).join(', ')}`,
          evidence: [`在用: ${active.length}`, `闲置/未知: ${idle.length}`, `总工具: ${tools.length}`],
          suggestion: '审查闲置工具: 是否仍需付费？是否可取消订阅？是否功能被其他工具覆盖？',
          detectedAt: checkedAt,
        });
      }

      // 功能重叠检测
      for (const [cat, names] of categories) {
        if (names.length >= 3) {
          findings.push({
            id: `su-overlap-${cat}-${now.getTime()}`, severity: 'warning',
            title: `${cat} 类别下有 ${names.length} 个工具可能重叠`,
            description: `同类工具: ${names.join(', ')}。可能存在功能重叠和冗余订阅。`,
            evidence: [`类别: ${cat}`, `工具: ${names.join(', ')}`],
            suggestion: `审查 ${cat} 类别下的工具: 是否可以合并到 1-2 个？是否有功能重叠？`,
            detectedAt: checkedAt,
          });
        }
      }

      if (idle.length > 0 && tools.length >= 5) {
        findings.push({
          id: `su-idle-${now.getTime()}`, severity: 'warning',
          title: `${idle.length} 个工具使用状态未知或闲置`,
          description: `闲置/未知: ${idle.map(t => t.name).join(', ')}`,
          evidence: idle.map(t => `${t.name}: ${t.status}`),
          suggestion: '确认这些工具是否仍在付费周期内、是否有替代方案。',
          detectedAt: checkedAt,
        });
      }

      return { sentinelId: config.id, ok: true, findings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) {
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true };
    }
  },
};

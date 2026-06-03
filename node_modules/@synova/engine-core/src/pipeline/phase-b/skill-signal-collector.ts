/**
 * pipeline/phase-b/skill-signal-collector.ts — P3-15 M3 技能信号采集
 *
 * 为什么做：技能安装/调用/废弃信号不回流传给框架层 = 引擎永远不学习
 * 对项目意义：连接"生成团队"和"实际运行"，形成闭环
 * 完成标准：事件可记录、可批处理、权重可观测变化
 */

import * as fs from 'fs'; import * as path from 'path'; import * as os from 'os';
import type { SkillFeedbackSignal, FeedbackBatch, SkillUsageStat } from './framework-feedback';
import { processFeedbackBatch } from './framework-feedback';
import { SEED_FRAMEWORKS } from './framework-library';
import { createLogger } from '../../infra/logger';

const log = createLogger('engine-server/pipeline/phase-b/skill-signal-collector');

const SIGNAL_FILE = path.join(os.homedir(), '.claworg', 'harness', 'skill-signals.json');
let _signals: SkillFeedbackSignal[] | null = null;

function loadSignals(): SkillFeedbackSignal[] {
  if (_signals !== null) return _signals;
  try { if (!fs.existsSync(SIGNAL_FILE)) { _signals = []; return []; } _signals = JSON.parse(fs.readFileSync(SIGNAL_FILE, 'utf-8')); return _signals!; }
  catch (err) { log.warn('[skill-signal] 信号文件损坏，重置:', (err as Error).message); _signals = []; return []; }
}

function saveSignals(): void {
  try { const d = path.dirname(SIGNAL_FILE); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); const t = SIGNAL_FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(_signals, null, 2), 'utf-8'); fs.renameSync(t, SIGNAL_FILE); }
  catch (err) { log.error('[skill-signal] 信号持久化失败:', (err as Error).message); }
}

export function recordSkillEvent(event: SkillFeedbackSignal): void {
  const signals = loadSignals(); signals.push(event); _signals = signals; saveSignals();
}

export function aggregateAndProcessFeedback(): FeedbackBatch {
  const all = loadSignals(); const now = new Date().toISOString();
  const bySkill = new Map<string, SkillUsageStat>();
  for (const s of all) {
    const k = `${s.skillName}::${s.sourceFrameworkId}`;
    if (!bySkill.has(k)) bySkill.set(k, { skillName: s.skillName, sourceFrameworkId: s.sourceFrameworkId, totalInstalls: 0, totalInvocations: 0, totalSuccesses: 0, totalFailures: 0, uniqueTeams: 0, successRate: 0, deprecationRate: 0, lastUsed: s.timestamp });
    const st = bySkill.get(k)!;
    if (s.eventType === 'installed') st.totalInstalls++;
    else if (s.eventType === 'invoked') st.totalInvocations += (s.invocationCount || 1);
    else if (s.eventType === 'success') st.totalSuccesses++;
    else if (s.eventType === 'failure') st.totalFailures++;
    if (s.timestamp > st.lastUsed) st.lastUsed = s.timestamp;
  }
  for (const [, st] of bySkill) {
    st.successRate = st.totalInvocations > 0 ? st.totalSuccesses / st.totalInvocations : 0;
    st.uniqueTeams = new Set(all.filter(s => s.skillName === st.skillName).map(s => s.teamId)).size;
    st.deprecationRate = st.totalInstalls > 0 ? all.filter(s => s.skillName === st.skillName && (s.eventType === 'deprecated' || s.eventType === 'uninstalled')).length / st.totalInstalls : 0;
  }
  let ws = now; let we = '1970-01-01';
  for (const s of all) { if (s.timestamp < ws) ws = s.timestamp; if (s.timestamp > we) we = s.timestamp; }
  const batch: FeedbackBatch = { signals: all, windowStart: ws, windowEnd: we, aggregated: Array.from(bySkill.values()) };
  processFeedbackBatch(batch, SEED_FRAMEWORKS);
  _signals = []; saveSignals();
  log.info(`[skill-signal] 批处理: ${all.length} 信号 → ${bySkill.size} 技能`);
  return batch;
}

export function recordSkillInstalled(p: { skillName: string; sourceFrameworkId: string; teamId: string; roleName: string; engineRecommended: boolean }): void {
  recordSkillEvent({ skillName: p.skillName, sourceFrameworkId: p.sourceFrameworkId, eventType: 'installed', timestamp: new Date().toISOString(), teamId: p.teamId, roleName: p.roleName, engineRecommended: p.engineRecommended });
}

export function getPendingSignalCount(): number { return loadSignals().length; }
export function clearSignals(): void { _signals = []; saveSignals(); }

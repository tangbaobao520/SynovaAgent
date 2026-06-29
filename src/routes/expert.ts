/**
 * routes/expert.ts — 行业专家贡献 REST API (SA-01: SQLite持久化)
 *
 * POST /api/expert/contribute — 提交行业知识
 * GET  /api/expert/templates/:id — 查看模板状态
 * GET  /api/expert/mine?expertId=... — 我的贡献列表
 * GET  /api/expert/marketplace?industry=... — 按行业浏览模板
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { TemplateValidator } from '../expert-platform/validator';
import { ExpertStore } from '../expert-platform/store';
import { getDatabase } from '../init/engine-context';

const router = Router();
const log = createLogger('routes/expert');

// SA-01: SQLite持久化 — 进程重启不丢数据
let _store: ExpertStore | null = null;
function getStore(): ExpertStore {
  if (!_store) _store = new ExpertStore(getDatabase());
  return _store;
}
const validator = new TemplateValidator();

// ═══ Routes ═══

/** POST /api/expert/contribute */
router.post('/api/expert/contribute', (req: Request, res: Response) => {
  const { expertId, industry, scenario, description, yearsOfExperience } = req.body;
  if (!expertId || !industry || !scenario || !description) {
    return res.status(400).json({ ok: false, error: '缺少必填字段', code: 'VALIDATION_ERROR' });
  }

  const id = `contrib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const status = description.length > 20 ? 'extracted' : 'submitted';
  const template = status === 'extracted' ? {
    symptom: scenario.replace(/_/g, ' '),
    rootCause: description.slice(0, 60),
    edgeType: 'TRIGGERS',
    confidence: Math.min(0.9, 0.5 + (yearsOfExperience || 0) * 0.02),
  } : null;

  getStore().set({
    id, expertId, industry, scenario, description, status,
    templateJson: template ? JSON.stringify(template) : null,
    submittedAt: new Date().toISOString(),
  });
  log.info({ id, expertId, industry }, '专家贡献已提交 (SQLite)');

  res.json({ ok: true, id, status, template });
});

/** GET /api/expert/templates/:id */
router.get('/api/expert/templates/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const entry = getStore().get(id);
  if (!entry) return res.status(404).json({ ok: false, error: '模板不存在', code: 'NOT_FOUND' });
  const statuses = validator.getAllStatuses();
  res.json({ ok: true, entry, validationStatus: statuses[id] || 'unvalidated' });
});

/** GET /api/expert/mine */
router.get('/api/expert/mine', (req: Request, res: Response) => {
  const expertId = req.query.expertId as string;
  if (!expertId) return res.status(400).json({ ok: false, error: '缺少 expertId 参数' });
  const mine = getStore().getByExpert(expertId);
  res.json({ ok: true, count: mine.length, contributions: mine });
});

/** GET /api/expert/marketplace */
router.get('/api/expert/marketplace', (req: Request, res: Response) => {
  const industry = req.query.industry as string;
  const entries = getStore().getByIndustry(industry || '', 20);
  res.json({ ok: true, industry: industry || 'all', count: entries.length, templates: entries });
});

export default router;

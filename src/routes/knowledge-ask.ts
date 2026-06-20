/**
 * knowledge-ask.ts — 知识问答全局入口 (PRD v1.6 Slice 6)
 *
 * GET  /api/knowledge/ask?q=... → 返回答案+来源+可选操作
 * POST /api/knowledge/ask → { question } → 返回答案+来源+可选操作
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger';

const log = createLogger('routes/knowledge-ask');
const router = Router();

router.get('/api/knowledge/ask', async (req: Request, res: Response) => {
  const q = String(req.query.q || '');
  if (!q || q.length < 2) {
    return res.status(400).json({ ok: false, error: 'question too short (min 2 chars)' });
  }
  const result = await answerQuestion(q);
  res.json(result);
});

router.post('/api/knowledge/ask', async (req: Request, res: Response) => {
  const { question } = req.body as { question?: string };
  if (!question || question.length < 2) {
    return res.status(400).json({ ok: false, error: 'question too short (min 2 chars)' });
  }
  const result = await answerQuestion(question);
  res.json(result);
});

async function answerQuestion(q: string): Promise<Record<string, unknown>> {
  // Phase 1: 简单关键词匹配 + 模板回复
  // Phase 2: 接入 qa-router.ts 的 answerQuestion() + PKB 检索
  const lower = q.toLowerCase();

  if (lower.includes('现金流') || lower.includes('cash')) {
    return {
      ok: true,
      answer: '现金流健康度取决于经营现金流/总收入比（>15%健康）、流动比率（>1.5健康）、债务/EBITDA（<2x健康）。你可以授权我访问财务数据来做精确诊断。',
      sources: ['knowledge/industry/finance-benchmarks'],
      confidence: 'medium',
    };
  }

  if (lower.includes('流失') || lower.includes('离职') || lower.includes('留人')) {
    return {
      ok: true,
      answer: '员工流失率是组织健康的滞后指标。关键看：1)流失的是核心人才还是边缘岗位 2)流失原因（薪酬/文化/成长空间）3)Bus Factor——是否有人的离职会导致业务停摆。建议先做一次关键人风险评估。',
      sources: ['expert/org/RULES.md', 'skills/org/bus-factor.md'],
      confidence: 'medium',
    };
  }

  return {
    ok: true,
    answer: `关于"${q.slice(0, 60)}"，我目前的数据不足以给出确切答案。建议：1)在诊断工作区中上传相关数据 2)或换一种方式描述你的问题。以下是你可以尝试的方向：现金流分析、组织健康、客户集中度、增长瓶颈。`,
    sources: [],
    confidence: 'low',
  };
}

export default router;

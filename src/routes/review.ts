/** routes/review.ts — 人工审核队列 (Batch 3 #12) */
import { Router, type Request, type Response } from 'express';
import Database from 'better-sqlite3';
import { getDatabase } from '../init/engine-context';

const router = Router();

router.post('/api/review/queue', (req: Request, res: Response) => {
  try {
    const { findingId, reason, priority } = req.body;
    if (!findingId) return res.status(400).json({ ok: false, error: 'findingId required' });
    const db = getDatabase();
    db.exec(`CREATE TABLE IF NOT EXISTS review_queue (id TEXT PRIMARY KEY, finding_id TEXT, reason TEXT, priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')))`);
    const id = `review_${Date.now().toString(36)}`;
    db.prepare('INSERT INTO review_queue (id,finding_id,reason,priority) VALUES (?,?,?,?)').run(id, findingId, reason || '', priority || 'medium');
    res.status(201).json({ ok: true, reviewId: id, status: 'pending' });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/api/review/queue', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    db.exec(`CREATE TABLE IF NOT EXISTS review_queue (id TEXT PRIMARY KEY, finding_id TEXT, reason TEXT, priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')))`);
    const items = db.prepare('SELECT * FROM review_queue ORDER BY created_at DESC LIMIT 50').all();
    res.json({ ok: true, items, count: items.length });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

export default router;

<!-- SYNOVA-IMPL-D250 v2.0 | 2026-07-27 | 线程重命名 PATCH + ALTER TABLE -->
# SynovaAgent -- D250 线程重命名 PATCH 端点 v2.0
> v1.0 遗漏: agent_sessions 表无 title 列, 需 ALTER TABLE

## 代码验证
- session-store.ts L68-76: `agent_sessions` 列: id/org_id/user_id/phase/state_json/created_at/updated_at ❌ 无 title
- session-store.ts: 无 `updateTitle()` 方法 ❌
- sessions.ts: GET/POST/GET:id/search/DELETE 6 端点, 无 PATCH ❌

## Q0-Q4
Q0: 补充文档设计线程重命名。agent_sessions 表缺 title 列和 updateTitle 方法。
Q2: 做——ALTER TABLE agent_sessions ADD COLUMN title; session-store 新增 updateTitle(); sessions.ts 新增 PATCH。不做——自动命名(归 D251前端)。
Q3: PATCH /api/sessions/:id/title {title:"xxx"} → updateTitle → 200
Q4: L1×2 + L2a×1

## 改动 (session-store.ts +20行, sessions.ts +20行)

### 1. session-store.ts initSchema() — ALTER TABLE (idempotent)
在 CREATE TABLE 后追加:
```typescript
try { this.db.exec('ALTER TABLE agent_sessions ADD COLUMN title TEXT'); }
catch { /* 列已存在, 跳过 */ }
```

### 2. session-store.ts — updateTitle()
```typescript
updateTitle(sessionId: string, title: string): boolean {
  const stmt = this.db.prepare('UPDATE agent_sessions SET title=?, updated_at=? WHERE id=?');
  return stmt.run(title, new Date().toISOString(), sessionId).changes > 0;
}
```

### 3. sessions.ts — PATCH /api/sessions/:id/title
```typescript
router.patch('/api/sessions/:id/title', (req, res) => {
  const { title } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ ok: false, error: 'title required' });
  }
  const store = getStore();
  const ok = store.updateTitle(req.params.id, title.trim());
  if (!ok) return res.status(404).json({ ok: false, error: 'session not found' });
  res.json({ ok: true, id: req.params.id, title: title.trim() });
});
```

## 测试 (L1×2 + L2a×1)
| # | 测试 | 验证 |
|---|------|------|
| 1 | updateTitle 成功→true | L1 |
| 2 | 不存在 session→false | L1 |
| 3 | PATCH→200 + title 持久化 | L2a |

## 完成标准
title 列存在 + updateTitle 可用 + PATCH 端点。3 tests。tsc零新增。as any=0。

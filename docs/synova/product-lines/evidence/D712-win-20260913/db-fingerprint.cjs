/**
 * db-fingerprint.cjs — 1-7 升级/重装不丢数据的 SQLite 指纹采样器
 *
 * 定位: 纯采样，不改产品代码。用**包内 Electron 的 node 模式**执行（process.execPath + ELECTRON_RUN_AS_NODE=1），
 *       与 electron/backend-spawn.cjs prod 路径同一运行时 → better-sqlite3 ABI 一致（外部 node 必然 ABI 不匹配）。
 *
 * 用法: <app>/SynovaAgent.exe <本文件> <resourcesDir> <dbPath>
 * 输出: stdout 单行 JSON: { ok, db, size, md5, tables[], rows{...}, integrity, error? }
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function md5(p) {
  return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
}

function main() {
  const [, , resourcesDir, dbPath] = process.argv;
  const out = { ok: false, db: dbPath, error: null };
  try {
    const Database = require(path.join(resourcesDir, 'node_modules', 'better-sqlite3'));
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    out.size = fs.statSync(dbPath).size;
    out.md5 = md5(dbPath);
    out.tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => r.name);
    // 表名取自实际 schema（agent_sessions / sentinel_baselines 为真名；旧脚本口径 sessions/sentinel_baseline 不存在）
    const keyTables = ['agent_memory', 'agent_sessions', 'sentinel_baselines', 'storage_kv', 'graph_nodes'];
    out.rows = {};
    for (const t of keyTables) {
      if (out.tables.includes(t)) {
        out.rows[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
      }
    }
    out.integrity = db.pragma('integrity_check', { simple: true });
    db.close();
    out.ok = true;
  } catch (err) {
    out.error = String((err && err.message) || err);
  }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(out.ok ? 0 : 1);
}

main();

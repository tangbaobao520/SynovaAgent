/**
 * db-seed-sentinel.cjs — 1-7 哨兵数据写入器（升级/重装前造真实数据，让「不丢数据」可被证伪）
 *
 * 定位: 纯造数，不改产品代码。与 db-fingerprint.cjs 同一运行时（包内 Electron node 模式）。
 * 用法: <app>/SynovaAgent.exe <本文件> <resourcesDir> <dbPath> [marker]
 * 输出: stdout JSON { inserted:{table:n}, marker }
 */
const path = require('path');

function main() {
  const [, , resourcesDir, dbPath, markerArg] = process.argv;
  const marker = markerArg || 'D712-SENTINEL';
  const Database = require(path.join(resourcesDir, 'node_modules', 'better-sqlite3'));
  const db = new Database(dbPath);
  const inserted = {};
  const tx = db.transaction(() => {
    for (let i = 0; i < 5; i++) {
      inserted.agent_memory = db.prepare(
        `INSERT OR REPLACE INTO agent_memory (id, org_id, key, value, type, source, tags)
         VALUES (?,?,?,?,?,?,?)`
      ).run(`${marker}-mem-${i}`, 'd712-org', `${marker}-key-${i}`, `value-${i}`, 'enterprise_fact', 'manual', '["d712"]').changes;
    }
    for (let i = 0; i < 3; i++) {
      db.prepare(`INSERT OR REPLACE INTO agent_sessions (id, org_id, user_id, phase, state_json)
                  VALUES (?,?,?,?,?)`).run(`${marker}-sess-${i}`, 'd712-org', 'd712-user', i, '{}');
    }
    inserted.agent_sessions = db.prepare(`SELECT COUNT(*) c FROM agent_sessions WHERE id LIKE ?`).get(`${marker}%`).c;
    for (let i = 0; i < 4; i++) {
      db.prepare(`INSERT INTO sentinel_baselines (sentinel_id, finding_count, critical_count, warning_count, checked_at)
                  VALUES (?,?,?,?,datetime('now'))`).run(`${marker}-sent-${i}`, i, 0, i);
    }
    inserted.sentinel_baselines = db.prepare(`SELECT COUNT(*) c FROM sentinel_baselines WHERE sentinel_id LIKE ?`).get(`${marker}%`).c;
    db.prepare(`INSERT OR REPLACE INTO storage_kv (full_key, key, value, namespace) VALUES (?,?,?,?)`)
      .run(`${marker}:probe`, 'probe', marker, 'd712');
    inserted.storage_kv = db.prepare(`SELECT COUNT(*) c FROM storage_kv WHERE full_key LIKE ?`).get(`${marker}%`).c;
  });
  tx();
  inserted.agent_memory = db.prepare(`SELECT COUNT(*) c FROM agent_memory WHERE id LIKE ?`).get(`${marker}%`).c;
  db.close();
  process.stdout.write(JSON.stringify({ marker, inserted }, null, 2) + '\n');
}

main();

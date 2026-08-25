/**
 * tests/electron/upgrade-data-verify.test.ts — D528 升级数据验证脚本契约测试
 *
 * 契约来源: SYNOVA-IMPL-DSH-D528-upgrade-data-retention-20260825.md §5.1/§7
 *   覆盖: ①契约头 @input/@output/@degraded ②set -uo pipefail（不用 -e）
 *         ③--dry-run/幂等清理 ④sqlite3 断言命令（integrity_check/.tables/行数/md5）
 *         ⑤evidence 落盘 ⑥真实 userData 保护（临时目录注入 + 无 cp data/synova.db，铁律 0-4）
 *         ⑦exit 0/1/2 语义 ⑧main.cjs 单实例锁接线
 * red 前提: 脚本不存在 → 全红（脚本新建，首次实现）。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SCRIPT = path.resolve(__dirname, '../../scripts/desktop/upgrade-data-verify.sh');
const MAIN_CJS = path.resolve(__dirname, '../../electron/main.cjs');

describe('D528 upgrade-data-verify.sh 脚本契约', () => {
  const script: string = fs.existsSync(SCRIPT) ? fs.readFileSync(SCRIPT, 'utf-8') : '';

  it('脚本存在且可读', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
    expect(script.length).toBeGreaterThan(500);
  });

  it('① 契约头含 @input/@output/@degraded（铁律 47）', () => {
    expect(script).toContain('@input');
    expect(script).toContain('@output');
    expect(script).toContain('@degraded');
  });

  it('② set -uo pipefail（不用 -e——失败走显式断言路径收集 evidence）', () => {
    expect(script).toContain('set -uo pipefail');
    expect(script).not.toMatch(/^set -euo pipefail$/m);
  });

  it('③ 含 --dry-run 分支 + 幂等清理（cleanup）', () => {
    expect(script).toContain('--dry-run');
    expect(script).toMatch(/cleanup/);
  });

  it('④ 含 sqlite3 物理断言：integrity_check + 表清单 + 行数 + md5', () => {
    expect(script).toContain('integrity_check');
    expect(script).toMatch(/\.tables|sqlite_master/);
    expect(script).toContain('md5');
    expect(script).toContain('COUNT');
  });

  it('⑤ evidence 落盘目录（scripts/golden-scenarios/evidence 或 evidence/upgrade-data-*）', () => {
    expect(script).toMatch(/evidence/);
    expect(script).toMatch(/upgrade-data-/);
  });

  it('⑥ 真实 userData 保护：临时目录注入（mktemp/--user-data）且无 cp data/synova.db（铁律 0-4）', () => {
    expect(script).toMatch(/mktemp|--user-data/);
    // 禁止拷贝真实库（正则允许注释中说明"禁止"，但不得出现实际 cp 命令行）
    expect(script).not.toMatch(/cp\s+[-\w]*\s*(("{0,1})\$REPO_ROOT\/)?data\/synova\.db/);
  });

  it('⑦ exit 0/1/2 语义注释存在', () => {
    expect(script).toMatch(/exit 0/);
    expect(script).toMatch(/exit 1/);
    expect(script).toMatch(/exit 2/);
  });
});

describe('D528 main.cjs 单实例锁接线（生产调用点）', () => {
  it('含 requestSingleInstanceLock + second-instance 聚焦（多实例写同一 db 保护）', () => {
    const main = fs.readFileSync(MAIN_CJS, 'utf-8');
    expect(main).toContain('requestSingleInstanceLock');
    expect(main).toContain("app.on('second-instance'");
    expect(main).toMatch(/app\.quit/);
  });
});

/**
 * tests/electron/mac-install-verify.test.ts — D519 实测脚本契约静态断言
 *
 * 契约（铁律 47）: mac-install-verify.sh → exit {0=四断言全过, 1=断言失败, 2=前置缺失}；
 * 失败路径 echo 具体失败步 + evidence 记录（不静默，铁律 24）。
 *
 * ⚠️ 本文件是脚本契约的静态回归（防漂移），**不替代本机实跑**——DS1 仍需物理实测
 * （D510 F1 红线：静态断言冒充实测 = 审计 F1）。铁律 48: 每条断言有 expect()。
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/desktop/mac-install-verify.sh');
const read = (): string => fs.readFileSync(SCRIPT, 'utf-8');

describe('D519 mac-install-verify.sh — 脚本契约', () => {
  it('脚本存在且可执行（stat mode 含执行位）', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
    const mode = fs.statSync(SCRIPT).mode;
    expect(mode & 0o111).not.toBe(0); // owner/group/other 任一执行位
  });

  it('四断言关键字齐备（pgrep / osascript / healthz / 日志非空）', () => {
    const s = read();
    expect(s).toMatch(/pgrep -f/);
    expect(s).toMatch(/osascript/);
    expect(s).toMatch(/System Events/);
    expect(s).toMatch(/api\/healthz/);
    expect(s).toMatch(/backend\.log/);
  });

  it('exit 语义契约: 0=全过 / 1=断言失败 / 2=前置缺失（注释与实现一致）', () => {
    const s = read();
    // 注释契约声明
    expect(s).toMatch(/exit 0 = 四断言全过/);
    expect(s).toMatch(/exit 1 = 任一断言失败/);
    expect(s).toMatch(/exit 2 = 前置缺失/);
    // 实现对应: die→exit 1, preflight_fail→exit 2, 成功路径 exit 0
    expect(s).toMatch(/cleanup; exit 1/);
    expect(s).toMatch(/preflight_fail\(\) \{ echo[^}]*exit 2/s);
    expect(s).toMatch(/✅ D519 四断言全过[\s\S]*\nexit 0/);
  });

  it('失败不静默（铁律 24）: 失败步 echo + fail.txt evidence 落盘', () => {
    const s = read();
    expect(s).toMatch(/失败步骤: \$1/);
    expect(s).toMatch(/fail\.txt/);
  });

  it('--dry-run / --skip-build / --keep-data 参数解析分支存在', () => {
    const s = read();
    expect(s).toMatch(/--dry-run\) DRY_RUN=1/);
    expect(s).toMatch(/--skip-build\) SKIP_BUILD=1/);
    expect(s).toMatch(/--keep-data\) KEEP_DATA=1/);
    expect(s).toMatch(/未知参数.*exit 2/); // 非法参数走前置缺失路径
  });

  it('清理回收齐备（detach + 删已装 app + userData 条件保留）——幂等防污染', () => {
    const s = read();
    expect(s).toMatch(/hdiutil detach/);
    expect(s).toMatch(/rm -rf "\$INSTALLED_APP"/);
    expect(s).toMatch(/KEEP_DATA/);
    expect(s).toMatch(/rm -rf "\$USER_DATA"/);
  });

  it('宿主 ELECTRON_RUN_AS_NODE 环境坑显式处理（启动 env -u）', () => {
    const s = read();
    expect(s).toMatch(/env -u ELECTRON_RUN_AS_NODE open/);
  });

  it('evidence 六类文件齐: dmg-ls/md5/mount/install(含)/backend.log/window', () => {
    const s = read();
    for (const f of ['dmg-ls.txt', 'md5.txt', 'mount.log', 'install.log', 'backend.log', 'window.txt']) {
      expect(s).toContain(f);
    }
  });
});

describe('D519 founder-demo runbook 接线（WIRE CHECK——铁律 0-2）', () => {
  it('founder-demo-mac.md 4 步 checklist 引用 mac-install-verify.sh 与四断言命令', () => {
    const doc = fs.readFileSync(
      path.join(ROOT, 'docs/synova/runbooks/founder-demo-mac.md'), 'utf-8',
    );
    expect(doc).toMatch(/mac-install-verify\.sh/);
    expect(doc).toMatch(/第 1 步[\s\S]*第 2 步[\s\S]*第 3 步[\s\S]*第 4 步/);
    expect(doc).toMatch(/hdiutil attach/);
    expect(doc).toMatch(/api\/healthz/);
    expect(doc).toMatch(/task-state\/D519\.json/); // 每步证据落点标注
  });

  it('.gitignore 含 evidence/（大文件不入库，摘录进 task-state）', () => {
    const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf-8');
    expect(gi).toMatch(/^evidence\/$/m);
  });
});

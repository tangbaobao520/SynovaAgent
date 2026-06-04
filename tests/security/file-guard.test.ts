/**
 * tests/security/file-guard.test.ts — FileGuard 三层文件安全防御
 *
 * 铁律 0-2: 每个 public 函数 ≥ 2 用例 (happy + sad)
 */
import { describe, it, expect } from 'vitest';
import { FileGuard } from '../../src/security/file-guard';
import * as os from 'os';
import * as path from 'path';

const workDir = path.join(os.tmpdir(), 'synova-test');
const homeDir = os.homedir();

describe('FileGuard.canWrite — write deny list', () => {
  const guard = new FileGuard(workDir);

  it('Given work-dir file, When canWrite, Then allowed=true', () => {
    const result = guard.canWrite(path.join(workDir, 'data.json'));
    expect(result.allowed).toBe(true);
  });

  it('Given work-dir itself, When canWrite, Then allowed=true', () => {
    const result = guard.canWrite(workDir);
    expect(result.allowed).toBe(true);
  });

  it('Given temp dir file, When canWrite, Then allowed=true', () => {
    const result = guard.canWrite(path.join(os.tmpdir(), 'test.txt'));
    expect(result.allowed).toBe(true);
  });

  it('Given synova data dir, When canWrite, Then allowed=true', () => {
    const result = guard.canWrite(path.join(homeDir, '.synova-agent', 'data.db'));
    expect(result.allowed).toBe(true);
  });

  it('Given /etc/passwd, When canWrite, Then allowed=false', () => {
    // On Windows, /etc/passwd path resolves to D:\etc\passwd
    // which falls into "不在工作目录内" (cross-boundary protection)
    const result = guard.canWrite('/etc/passwd');
    expect(result.allowed).toBe(false);
  });

  it('Given ~/.ssh/id_rsa, When canWrite, Then allowed=false', () => {
    const result = guard.canWrite(path.join(homeDir, '.ssh', 'id_rsa'));
    expect(result.allowed).toBe(false);
  });

  it('Given path outside workdir (not whitelisted), When canWrite, Then allowed=false', () => {
    const result = guard.canWrite(path.join(homeDir, 'random-file.txt'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('不在工作目录内');
  });
});

describe('FileGuard.canRead — read deny list', () => {
  const guard = new FileGuard(workDir);

  it('Given normal text file, When canRead, Then allowed=true', () => {
    const result = guard.canRead('/tmp/log.txt');
    expect(result.allowed).toBe(true);
  });

  it('Given .env file, When canRead, Then allowed=false (credential protected)', () => {
    const result = guard.canRead(path.join(workDir, '.env'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('凭据文件');
  });

  it('Given credentials.json, When canRead, Then allowed=false', () => {
    const result = guard.canRead(path.join(workDir, 'credentials.json'));
    expect(result.allowed).toBe(false);
  });

  it('Given .pem key file, When canRead, Then allowed=false', () => {
    const result = guard.canRead('/etc/ssl/private/key.pem');
    expect(result.allowed).toBe(false);
  });
});

describe('FileGuard.setWorkDir', () => {
  it('Given new workdir, When set then canWrite, Then respects new boundary', () => {
    const guard = new FileGuard('/old');
    const newDir = path.join(os.tmpdir(), 'new-work');
    guard.setWorkDir(newDir);
    const result = guard.canWrite(path.join(newDir, 'file.txt'));
    expect(result.allowed).toBe(true);
  });
});

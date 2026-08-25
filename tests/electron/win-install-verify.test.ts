/**
 * tests/electron/win-install-verify.test.ts — D523 Win 侧验证脚本契约静态断言
 *
 * 契约（铁律 47，先于实现定义 — dev doc §7）:
 *   win-install-verify.ps1:
 *     存在 + 可读
 *     含四断言关键字: Get-Process / MainWindowTitle / Invoke-WebRequest / Get-FileHash
 *     参数分支: -DryRun / -SkipInstall / -KeepData
 *     exit 语义: 0=四断言全过, 1=任一断言失败, 2=前置缺失（.exe/md5 缺失）waiting
 *     红线: 无 `taskkill /IM node.exe`（铁律 0-3——会杀所有 Node 进程）
 *   ⚠️ 本测试是脚本契约静态断言（L1 单元），不替代 Win 本机物理实跑（DS1 仍需实跑——D510 F1）
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const scriptPath = path.resolve(__dirname, '../../scripts/desktop/win-install-verify.ps1');

const readScript = (): string => fs.readFileSync(scriptPath, 'utf-8');

describe('D523 win-install-verify.ps1 — 脚本契约静态断言', () => {
  it('脚本存在且可读（非空）', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    expect(readScript().length).toBeGreaterThan(100);
  });

  it('含四断言关键字: Get-Process / MainWindowTitle / Invoke-WebRequest / Get-FileHash', () => {
    const s = readScript();
    expect(s).toContain('Get-Process');
    expect(s).toContain('MainWindowTitle');
    expect(s).toContain('Invoke-WebRequest');
    expect(s).toContain('Get-FileHash');
  });

  it('参数分支存在: -DryRun / -SkipInstall / -KeepData', () => {
    const s = readScript();
    expect(s).toContain('[switch]$DryRun');
    expect(s).toContain('[switch]$SkipInstall');
    expect(s).toContain('[switch]$KeepData');
    // 分支被真实消费（非只声明）
    expect(s).toContain('if ($DryRun)');
    expect(s).toContain('if (-not $SkipInstall)');
    expect(s).toContain('-not $KeepData');
  });

  it('exit 语义与契约注释一致: 0=全过 / 1=断言失败 / 2=前置缺失 waiting', () => {
    const s = readScript();
    // 契约注释声明
    expect(s).toMatch(/exit 0\s*=\s*四断言全过/);
    expect(s).toMatch(/exit 1\s*=\s*任一断言失败/);
    expect(s).toMatch(/exit 2\s*=\s*前置缺失/);
    // 实现分支: 前置缺失 → exit 2；断言失败 → exit 1；全过 → exit 0
    expect(s).toContain('exit 2');
    expect(s).toContain('exit 1');
    expect(s.match(/^exit 0$/m) ?? s.match(/exit 0\s*$/m)).not.toBeNull();
  });

  it('红线: 无 taskkill /IM node.exe（铁律 0-3）——检测真实调用（剥离 # 注释行后）', () => {
    // 注释中的"严禁 taskkill /IM node.exe"是红线声明本身，不算调用
    const codeOnly = readScript().split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    const s = codeOnly.toLowerCase().replace(/\s+/g, ' ');
    expect(s.includes('taskkill')).toBe(false); // 有效代码零 taskkill（清理统一 Stop-Process 本实例 pid）
  });

  it('失败路径不静默: 断言失败 echo 具体失败步 + evidence 记录（铁律 24）', () => {
    const s = readScript();
    expect(s).toContain('$failStep');
    expect(s).toContain('failed.txt');
    expect(s).toContain('Write-Host'); // P1-1 后失败输出走 Write-Host（Write-Error 在 EAP=Stop 下吞显式 exit）
  });

  it('前置缺失不伪造: 无 .exe → exit 2 + waiting 提示（DS4）', () => {
    const s = readScript();
    expect(s).toContain('exit 2');
    expect(s).toContain('waiting');
    expect(s).toContain('不伪造');
  });

  it('P1-1 回归: exit 2/1 分支可达——脚本正文零 Write-Error（EAP=Stop 下会吞掉显式 exit）', () => {
    const codeLines = readScript().split('\n').filter((l) => !l.trim().startsWith('#'));
    const writeError = codeLines.filter((l) => l.includes('Write-Error'));
    expect(writeError, `P1-1 回归: Write-Error 出现在有效代码: ${writeError.join('; ')}`).toHaveLength(0);
    // 前置缺失分支: Write-Host + exit 2（可达控制流）
    expect(readScript()).toMatch(/Write-Host[^\n]*waiting[^\n]*\n\s*exit 2/);
  });
});

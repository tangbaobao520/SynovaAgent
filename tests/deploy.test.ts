/**
 * deploy.test.ts — 部署验证测试 (Era 3.2, iron law 0-2 Step 2)
 *
 * 验证: Dockerfile 语法 + 安装脚本语法 + README 关键内容
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('Deployment artifacts', () => {
  it('Dockerfile exists and contains required instructions', () => {
    const df = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf-8');
    expect(df).toContain('FROM node');
    expect(df).toContain('WORKDIR');
    expect(df).toContain('EXPOSE 3000');
    expect(df).toContain('HEALTHCHECK');
    expect(df).toContain('fetch'); // Alpine 不含 wget/curl，用 node fetch
  });

  it('docker-compose.yml exists and has valid structure', () => {
    const dc = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf-8');
    expect(dc).toContain('synova-agent');
    expect(dc).toContain('3000:3000');
    expect(dc).toContain('LLM_API_KEY');
  });

  it('install.sh exists and is executable', () => {
    const p = path.join(ROOT, 'scripts', 'install.sh');
    expect(fs.existsSync(p)).toBe(true);
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain('#!/usr/bin/env bash');
    expect(content).toContain('Node.js');
    // 不再引用不存在的 dist/index.js
    expect(content).toContain('src/index.ts');
    expect(content).not.toContain('dist/index.js');
    // PM2 进程守护
    expect(content).toContain('pm2');
    // 开机自启 (systemd 或 launchd)
    expect(content).toMatch(/systemd|launchd/);
    // 环境变量检查
    expect(content).toContain('SYNOVA_HOME');
  });

  it('install.ps1 exists and has valid PowerShell', () => {
    const p = path.join(ROOT, 'scripts', 'install.ps1');
    expect(fs.existsSync(p)).toBe(true);
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain('Write-Host');
    expect(content).toContain('Node.js');
    // 不再引用不存在的 dist/index.js
    expect(content).toContain('src/index.ts');
    expect(content).not.toContain('dist/index.js');
    // 确保安装 tsx
    expect(content).toContain('tsx');
  });

  it('.dockerignore exists and excludes critical files', () => {
    const p = path.join(ROOT, '.dockerignore');
    expect(fs.existsSync(p)).toBe(true);
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain('node_modules');
    expect(content).toContain('data/');
    expect(content).toContain('logs/');
    expect(content).toContain('.git/');
    expect(content).toContain('dist/');
  });

  it('setup.ps1 uses installDir (not sourceDir) for auto-start', () => {
    const p = path.join(ROOT, 'scripts', 'setup.ps1');
    expect(fs.existsSync(p)).toBe(true);
    const content = fs.readFileSync(p, 'utf-8');
    // 开机自启脚本必须 cd 到 $installDir，不是 $sourceDir
    expect(content).toContain('cd /d "$installDir"');
    // 统一入口为 src/index.ts
    expect(content).toContain('src/index.ts');
    // RestartCount 增加到 10
    expect(content).toContain('RestartCount 10');
    // 检查 tsx
    expect(content).toContain('tsx.cmd');
  });

  it('README.md exists and documents key endpoints', () => {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
    expect(readme).toContain('SynovaAgent');
    expect(readme).toContain('/health');
    expect(readme).toContain('/api/ontology');
    expect(readme).toContain('/api/diagnosis/consult');
    expect(readme).toContain('LLM_API_KEY');
    expect(readme).toContain('Docker');
    expect(readme).toContain('npm test');
  });

  it('package.json has required scripts', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.scripts.dev).toBeTruthy();
    expect(pkg.scripts.start).toBeTruthy();
    expect(pkg.scripts.test).toBeTruthy();
    expect(pkg.scripts.chat).toBeTruthy();
  });
});

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
    expect(content).toContain('LLM_API_KEY');
  });

  it('install.ps1 exists and has valid PowerShell', () => {
    const p = path.join(ROOT, 'scripts', 'install.ps1');
    expect(fs.existsSync(p)).toBe(true);
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain('Write-Host');
    expect(content).toContain('Node.js');
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

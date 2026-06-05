/**
 * tests/observer-adapters/01-openclaw-skill.test.ts
 *
 * L5: OpenClaw Skill 适配器测试。
 * 验证 observer-adapters/openclaw-skill/ 下的 hooks.json 和 report.py 完整性。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

describe('OpenClaw Skill 适配器', () => {
  const skillDir = path.join(REPO_ROOT, 'observer-adapters/openclaw-skill');

  it('hooks.json 存在且格式正确', () => {
    const file = path.join(skillDir, 'hooks.json');
    expect(fs.existsSync(file)).toBe(true);
    const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(content).toBeDefined();
    console.warn(`⚠ OpenClaw Skill hooks: ${JSON.stringify(content).slice(0, 200)}`);
  });

  it('report.py 存在', () => {
    const file = path.join(skillDir, 'report.py');
    expect(fs.existsSync(file)).toBe(true);
  });
});

describe('Claude Code Hook 适配器', () => {
  const hookDir = path.join(REPO_ROOT, 'observer-adapters/claude-code-hook');

  it('hook.py 存在', () => {
    const file = path.join(hookDir, 'hook.py');
    expect(fs.existsSync(file)).toBe(true);
  });
});

describe('Python SDK 适配器', () => {
  const sdkDir = path.join(REPO_ROOT, 'observer-adapters/python-sdk');

  it('synova_observer 包存在', () => {
    const file = path.join(sdkDir, 'synova_observer/__init__.py');
    expect(fs.existsSync(file)).toBe(true);
  });
});

describe('Hermes Plugin 适配器', () => {
  const pluginDir = path.join(REPO_ROOT, 'observer-adapters/hermes-plugin');

  it('plugin.py 存在', () => {
    const file = path.join(pluginDir, 'plugin.py');
    expect(fs.existsSync(file)).toBe(true);
  });
});

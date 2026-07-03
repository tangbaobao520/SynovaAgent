/**
 * tests/electron/auto-update.test.ts — Phase 5.1 Electron 自动更新测试
 *
 * 测试状态保存/恢复逻辑（纯函数，不依赖 Electron 运行时）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// 待测试的 state 结构
interface AppState {
  activeOrgId?: string;
  lastMsgId?: string;
  unreadCount?: number;
  savedAt: string;
}

const STATE_PATH = path.join(process.cwd(), '.synova-state.json');

function saveState(state: AppState): void {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

function restoreState(): AppState | null {
  try {
    if (!fs.existsSync(STATE_PATH)) return null;
    const raw = fs.readFileSync(STATE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearState(): void {
  try { fs.unlinkSync(STATE_PATH); } catch { /* ignore */ }
}

describe('AppState save/restore', () => {
  beforeEach(() => { clearState(); });

  it('saveState 应写入文件', () => {
    saveState({ activeOrgId: 'org1', lastMsgId: 'msg_001', unreadCount: 3, savedAt: new Date().toISOString() });
    expect(fs.existsSync(STATE_PATH)).toBe(true);
  });

  it('restoreState 应读取保存的状态', () => {
    saveState({ activeOrgId: 'org1', lastMsgId: 'msg_001', unreadCount: 3, savedAt: new Date().toISOString() });
    const state = restoreState();
    expect(state?.activeOrgId).toBe('org1');
    expect(state?.lastMsgId).toBe('msg_001');
    expect(state?.unreadCount).toBe(3);
  });

  it('无状态文件应返回 null', () => {
    const state = restoreState();
    expect(state).toBeNull();
  });

  it('损坏的状态文件应返回 null', () => {
    fs.writeFileSync(STATE_PATH, '{invalid json}', 'utf-8');
    const state = restoreState();
    expect(state).toBeNull();
  });
});

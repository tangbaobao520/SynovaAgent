/**
 * tests/electron/capability.test.ts — D538 L1 纯逻辑契约测试（node env，零 DOM/zustand/lucide）
 *
 * 契约（铁律 47/48，先于实现定义 — dev doc §7.1）:
 *   toggleCap(current, next):
 *     当前 null → 选中 next；当前 === next → 取消选中（返回 null）；当前 !== next → 切换为 next。
 *   canAccessCap(role, cap):
 *     cap === 'ga' → 仅 role === 'ga' 可访问；cap !== 'ga' → 所有人可访问。
 *   capabilityLabel(cap): 返回能力中文名（reach/loops/action/ga）。
 *   badgeColorFor(stats|null):
 *     stats === null（降级）→ null（隐藏角标，不渲染假数字）；
 *     criticalCount > 0 → 'red'；warningCount > 0 → 'orange'；否则 → 'green'。
 *   loopStatusColor(status):
 *     'completed' → 'green'；'failed' → 'red'；'degraded' → 'orange'；其它/未知 → 'grey'（兜底灰）。
 *   CAPABILITY_IDS: 必须含 ['reach','loops','action','ga'] 且无重复。
 *
 * 铁律 48: 每个用例 expect 断言，覆盖 正常（toggle 选中/切换）/ 降级（badge null）/ 边界（未知 status/角色）。
 */
import { describe, it, expect } from 'vitest';
import {
  CAPABILITY_IDS,
  toggleCap,
  canAccessCap,
  capabilityLabel,
  badgeColorFor,
  loopStatusColor,
} from '../../electron-renderer/src/stores/capability';

// ═══ 正常路径：状态机 toggleCap ═══

describe('toggleCap 状态机（正常路径）', () => {
  it('从 null 点击 → 选中该能力项', () => {
    expect(toggleCap(null, 'reach')).toBe('reach');
  });

  it('切换另一项 → 返回新能力项', () => {
    expect(toggleCap('reach', 'loops')).toBe('loops');
  });

  it('再点同一项 → 取消选中回到默认（null）', () => {
    expect(toggleCap('reach', 'reach')).toBeNull();
  });

  it('全能力项均可作为切换目标（无遗漏分支）', () => {
    for (const id of CAPABILITY_IDS) {
      expect(toggleCap(null, id)).toBe(id);
    }
  });
});

// ═══ 正常路径：权限矩阵 canAccessCap ═══

describe('canAccessCap 权限矩阵', () => {
  it('ga 角色访问 ga 能力 → 放行', () => {
    expect(canAccessCap('ga', 'ga')).toBe(true);
  });

  it('ga 角色访问非 ga 能力 → 同样放行', () => {
    expect(canAccessCap('ga', 'reach')).toBe(true);
  });

  it('非 ga 角色访问 ga 能力 → 拦截', () => {
    expect(canAccessCap('admin', 'ga')).toBe(false);
    expect(canAccessCap('manager', 'ga')).toBe(false);
    expect(canAccessCap('staff', 'ga')).toBe(false);
    expect(canAccessCap('liaison', 'ga')).toBe(false);
  });

  it('非 ga 角色访问非 ga 能力 → 对所有人可见', () => {
    expect(canAccessCap('staff', 'reach')).toBe(true);
    expect(canAccessCap('admin', 'loops')).toBe(true);
    expect(canAccessCap('liaison', 'action')).toBe(true);
  });
});

// ═══ 边界：未知角色兜底 ═══

describe('canAccessCap 边界（未知角色）', () => {
  it('未知角色访问 ga → 拦截（fail-closed）', () => {
    expect(canAccessCap('unknown-role', 'ga')).toBe(false);
  });

  it('未知角色访问非 ga → 放行', () => {
    expect(canAccessCap('unknown-role', 'loops')).toBe(true);
  });
});

// ═══ 完整性：CAPABILITY_IDS ═══

describe('CAPABILITY_IDS 完整性', () => {
  it('含全部 4 个能力 id', () => {
    expect(CAPABILITY_IDS).toContain('reach');
    expect(CAPABILITY_IDS).toContain('loops');
    expect(CAPABILITY_IDS).toContain('action');
    expect(CAPABILITY_IDS).toContain('ga');
  });

  it('恰好 4 个且无重复', () => {
    expect(CAPABILITY_IDS).toHaveLength(4);
    expect(new Set(CAPABILITY_IDS).size).toBe(4);
  });
});

// ═══ 契约：capabilityLabel ═══

describe('capabilityLabel 契约', () => {
  it('每个能力 id 都有中文标签（渲染不显示裸 id）', () => {
    for (const id of CAPABILITY_IDS) {
      const label = capabilityLabel(id);
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
      // 标签不应是裸 id，也不会出现 "FDE"（术语统一 GA，验收 #8）
      expect(label).not.toBe(id);
      expect(label).not.toMatch(/FDE/);
    }
  });

  it('主动触达 / 五循环状态 / Action 闭环 / GA 协同', () => {
    expect(capabilityLabel('reach')).toBe('主动触达');
    expect(capabilityLabel('loops')).toBe('五循环状态');
    expect(capabilityLabel('action')).toBe('Action 闭环');
    expect(capabilityLabel('ga')).toBe('GA 协同');
  });
});

// ═══ 降级路径：badgeColorFor（正常计数 vs 降级 null） ═══

describe('badgeColorFor 角标色（正常 + 降级）', () => {
  it('criticalCount > 0 → 红', () => {
    expect(badgeColorFor({ criticalCount: 2, warningCount: 1 })).toBe('red');
  });

  it('无 critical 但 warningCount > 0 → 橙', () => {
    expect(badgeColorFor({ criticalCount: 0, warningCount: 3 })).toBe('orange');
  });

  it('critical 与 warning 均为 0 → 绿', () => {
    expect(badgeColorFor({ criticalCount: 0, warningCount: 0 })).toBe('green');
  });

  it('降级（null）→ null，隐藏角标，不渲染假数字', () => {
    // 铁律 24/31: 接口失败 → 角标隐藏，而非显示 0 假计数
    expect(badgeColorFor(null)).toBeNull();
  });
});

// ═══ 边界 + 状态灯：loopStatusColor（含未知兜底） ═══

describe('loopStatusColor 状态灯（边界 + 未知兜底）', () => {
  it('completed → 绿', () => {
    expect(loopStatusColor('completed')).toBe('green');
  });

  it('failed → 红', () => {
    expect(loopStatusColor('failed')).toBe('red');
  });

  it('degraded → 橙', () => {
    expect(loopStatusColor('degraded')).toBe('orange');
  });

  it('pending → 灰', () => {
    expect(loopStatusColor('pending')).toBe('grey');
  });

  it('未知枚举值 → 灰（防御式兜底，不抛）', () => {
    expect(loopStatusColor('weird-unknown')).toBe('grey');
    expect(loopStatusColor('')).toBe('grey');
  });
});

/**
 * tests/agent/tool-profiles.test.ts — E2 Tool Profiles 测试
 */
import { describe, it, expect } from 'vitest';
import {
  TOOL_PROFILES,
  getProfileForRole,
  filterToolsByProfile,
  getGuardLevelForRole,
} from '../../src/agent/tool-profiles';

describe('Tool Profiles', () => {
  describe('TOOL_PROFILES', () => {
    it('Given minimal profile, Then has strict guard and 1 max round', () => {
      const profile = TOOL_PROFILES.minimal;
      expect(profile.guardLevel).toBe('strict');
      expect(profile.maxRounds).toBe(1);
      expect(profile.allowedTools.length).toBeGreaterThan(0);
      expect(profile.allowedTools).not.toContain('*');
    });

    it('Given diagnosis profile, Then has moderate guard and 3 max rounds', () => {
      const profile = TOOL_PROFILES.diagnosis;
      expect(profile.guardLevel).toBe('moderate');
      expect(profile.maxRounds).toBe(3);
    });

    it('Given full profile, Then has permissive guard and wildcard tools', () => {
      const profile = TOOL_PROFILES.full;
      expect(profile.guardLevel).toBe('permissive');
      expect(profile.maxRounds).toBe(10);
      expect(profile.allowedTools).toContain('*');
    });
  });

  describe('getProfileForRole()', () => {
    it('Given admin role, Then returns full profile', () => {
      const profile = getProfileForRole('admin');
      expect(profile).toBe(TOOL_PROFILES.full);
    });

    it('Given FDE role, Then returns diagnosis profile', () => {
      const profile = getProfileForRole('FDE');
      expect(profile).toBe(TOOL_PROFILES.diagnosis);
    });

    it('Given manager role, Then returns diagnosis profile', () => {
      const profile = getProfileForRole('manager');
      expect(profile).toBe(TOOL_PROFILES.diagnosis);
    });

    it('Given employee role, Then returns minimal profile', () => {
      const profile = getProfileForRole('employee');
      expect(profile).toBe(TOOL_PROFILES.minimal);
    });

    it('Given viewer role, Then returns minimal profile', () => {
      const profile = getProfileForRole('viewer');
      expect(profile).toBe(TOOL_PROFILES.minimal);
    });

    it('Given unknown role, Then returns minimal profile', () => {
      const profile = getProfileForRole('unknown-role');
      expect(profile).toBe(TOOL_PROFILES.minimal);
    });
  });

  describe('filterToolsByProfile()', () => {
    it('Given full profile, When filtered, Then returns all tools', () => {
      const tools = ['tool_a', 'tool_b', 'tool_c'];
      const filtered = filterToolsByProfile(tools, TOOL_PROFILES.full);
      expect(filtered).toEqual(tools);
    });

    it('Given minimal profile, When filtered, Then returns only allowed', () => {
      const tools = ['web_search', 'exec', 'query_ontology', 'gateway'];
      const filtered = filterToolsByProfile(tools, TOOL_PROFILES.minimal);
      expect(filtered).toContain('web_search');
      expect(filtered).toContain('query_ontology');
      expect(filtered).not.toContain('exec');
      expect(filtered).not.toContain('gateway');
    });

    it('Given empty tool list, When filtered, Then returns empty', () => {
      const filtered = filterToolsByProfile([], TOOL_PROFILES.minimal);
      expect(filtered).toHaveLength(0);
    });
  });

  describe('getGuardLevelForRole()', () => {
    it('Given admin, Then returns permissive', () => {
      expect(getGuardLevelForRole('admin')).toBe('permissive');
    });

    it('Given employee, Then returns strict', () => {
      expect(getGuardLevelForRole('employee')).toBe('strict');
    });
  });
});

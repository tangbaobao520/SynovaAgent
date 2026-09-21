/**
 * tests/invariants/index.test.ts — 不变量模块入口 + Phase 6 契约镜像单测（D865 组2）
 *
 * 镜像: src/invariants/index.ts（路径严格镜像，pre-commit 组2 硬要求）
 * 定位: **声明面**（首批伴生清单）与 **启动面**（createRuntimeInvariantsPhase 契约、
 * 一致性断言、幂等重跑）。深度链路（真实 provider 出站、Bootstrap fatal 回滚全链、
 * HTTP 探针、e2e 500）留在 tests/sentinel/invariants.test.ts 与 tests/integration/。
 *
 * D865 组4 相关: installRuntimeInvariants 已退回模块内部（无真实外部调用方）；
 * 本文件经 **生产真路径**（bootstrap 注册的 Phase 6）验证安装结果，不做虚假引用。
 *
 * 契约（铁律 47/48）:
 *   @input  — 无（模块清单为常量；Phase 由 bootstrap 注册）
 *   @output — Phase 6 执行后单例 registered === RUNTIME_INVARIANT_COMPANIONS.length
 *   @degraded — 无（Phase fatal，注册不全 = 启动失败）
 *   @error  — registered !== expected → execute 抛错（fail-closed）→ bootstrap aborted
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  invariantRegistry,
  RUNTIME_INVARIANT_COMPANIONS,
  createRuntimeInvariantsPhase,
} from '../../src/invariants';
import { Bootstrap } from '../../src/deploy/bootstrap';

const originalGlobalFetch = globalThis.fetch;

afterEach(() => {
  invariantRegistry.uninstallAll();
  globalThis.fetch = originalGlobalFetch;
});

// ═══ 1. 声明面：首批伴生清单 ═══

describe('声明面：RUNTIME_INVARIANT_COMPANIONS', () => {
  it('恰好 3 条，code 唯一且符合 INV- 前缀，owner 归属 squad-b', () => {
    expect(RUNTIME_INVARIANT_COMPANIONS).toHaveLength(3);
    const codes = RUNTIME_INVARIANT_COMPANIONS.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(['INV-TOOL-SCHEMA-SENT', 'INV-TOOL-CALL-PAIRING', 'INV-DEGRADED-STICKY']);
    for (const c of RUNTIME_INVARIANT_COMPANIONS) {
      expect(c.code).toMatch(/^INV-[A-Z-]+$/);
      expect(c.owner).toBe('squad-b/coding');
    }
  });

  it('每条显式声明非空 notChecked（总纲 §9.4）且 install 为同步函数', () => {
    for (const c of RUNTIME_INVARIANT_COMPANIONS) {
      expect(c.notChecked.length).toBeGreaterThan(0);
      for (const n of c.notChecked) expect(n.trim().length).toBeGreaterThan(0);
      expect(typeof c.install).toBe('function');
    }
  });
});

// ═══ 2. 启动面：Phase 6 定义与执行 ═══

describe('启动面：Phase 6（runtime-invariants）', () => {
  it('定义契约：id=6 / name / fatal / rollbackOnFail / timeoutMs', () => {
    const phase = createRuntimeInvariantsPhase();
    expect(phase.id).toBe(6);
    expect(phase.name).toBe('runtime-invariants');
    expect(phase.fatal).toBe(true);
    expect(phase.rollbackOnFail).toBe(true);
    expect(phase.timeoutMs).toBe(10_000);
    expect(typeof phase.rollback).toBe('function');
  });

  it('真实 Bootstrap 执行 Phase 6 → 单例装齐清单（真路径接线，非虚假引用）', async () => {
    const boot = new Bootstrap({ skipDefaultPhases: true });
    boot.registerPhase(createRuntimeInvariantsPhase());
    const result = await boot.run();
    expect(result.ok).toBe(true);
    expect(invariantRegistry.registered).toBe(RUNTIME_INVARIANT_COMPANIONS.length);
    expect(invariantRegistry.snapshot().invariants.map((i) => i.code))
      .toEqual(RUNTIME_INVARIANT_COMPANIONS.map((c) => c.code));
  });

  it('幂等：Phase 重跑不叠加注册；卸载后 wrap 全部还原（无残留监听）', async () => {
    const boot = new Bootstrap({ skipDefaultPhases: true });
    boot.registerPhase(createRuntimeInvariantsPhase());
    await boot.run();
    await boot.run();
    expect(invariantRegistry.registered).toBe(RUNTIME_INVARIANT_COMPANIONS.length);
    invariantRegistry.uninstallAll();
    expect(invariantRegistry.registered).toBe(0);
    expect(globalThis.fetch).toBe(originalGlobalFetch);
  });

  it('一致性断言：installAll 空转 → 启动失败且错误含 expected==清单数（守卫构造可达）', async () => {
    const boot = new Bootstrap({ skipDefaultPhases: true });
    boot.registerPhase(createRuntimeInvariantsPhase());
    const originalInstallAll = invariantRegistry.installAll;
    invariantRegistry.installAll = (): void => { /* 桩：空转（模拟伴生清单丢失/被替身） */ };
    try {
      const result = await boot.run();
      expect(result.aborted).toBe(true);
      expect(result.ok).toBe(false);
      const failed = result.phaseResults.find((r) => r.name === 'runtime-invariants');
      expect(failed?.status).toBe('failed');
      expect(failed?.errors[0]).toContain('registered==0');
      expect(failed?.errors[0]).toContain(`expected==${RUNTIME_INVARIANT_COMPANIONS.length}`);
    } finally {
      invariantRegistry.installAll = originalInstallAll;
    }
  });
});

/**
 * tests/invariants/registry.test.ts — InvariantRegistry 单元契约镜像单测（D865 组2）
 *
 * 镜像: src/invariants/registry.ts（路径严格镜像，pre-commit 组2 硬要求）
 * 定位: **只测注册表本体**的四条契约面——拒绝面 / 回滚面 / 记账面 / 快照面。
 * 深度链路（真实 provider 出站、真实 Bootstrap Phase、HTTP 探针、e2e fail-closed）
 * 留在 tests/sentinel/invariants.test.ts 与 tests/integration/——本文件不重复、不弱化。
 *
 * 契约（对齐 registry.ts 头注释，铁律 47/48）:
 *   @input  — InvariantCompanion { code, owner, packageName, notChecked, install }
 *   @output — install/installAll 同步注册；snapshot/statusOf 只读视图
 *   @degraded — 无（本机制自身 fail-closed：注册失败 = 启动失败）
 *   @error  — 重名 code / 空白 code / 空 notChecked / install 抛错 → 抛出并释放本次注册
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InvariantRegistry, InvariantError } from '../../src/invariants/registry';
import type { InvariantCompanion, InvariantContext } from '../../src/invariants/registry';

/** 最小合法伴生（各用例按需覆盖 install 行为） */
function companion(code: string, over: Partial<InvariantCompanion> = {}): InvariantCompanion {
  return {
    code,
    owner: 'squad-b/coding',
    packageName: '@synova/agent',
    notChecked: ['本测试不检查真实业务链路（单元契约面专用）'],
    install: (): void => { /* no-op */ },
    ...over,
  };
}

/** 注册后把伴生 install 收到的 ctx 取出来（运行期违约/记账路径用） */
function captureCtx(registry: InvariantRegistry, code: string): InvariantContext {
  let captured: InvariantContext | undefined;
  registry.install(companion(code, { install: (ctx) => { captured = ctx; } }));
  if (captured === undefined) throw new Error('用例夹具失败：未捕获 InvariantContext');
  return captured;
}

// ═══ 1. 拒绝面 ═══

describe('拒绝面：不合规伴生不得进入注册表', () => {
  let registry: InvariantRegistry;
  beforeEach(() => { registry = new InvariantRegistry(); });

  it('重名 code 拒绝（DSH 范式），先注册的那条不被污染', () => {
    registry.install(companion('INV-DUP'));
    expect(() => registry.install(companion('INV-DUP'))).toThrow(/already registered/);
    expect(registry.registered).toBe(1);
    expect(registry.statusOf('INV-DUP')?.lastFailure).toBeNull();
  });

  it('空串 / 含空白 code 拒绝（防匿名不变量混进探针）', () => {
    expect(() => registry.install(companion(''))).toThrow(/non-blank/);
    expect(() => registry.install(companion('INV BAD'))).toThrow(/non-blank/);
    expect(registry.registered).toBe(0);
  });

  it('notChecked 为空数组拒绝（总纲 §9.4：必须显式声明不检查什么）', () => {
    expect(() => registry.install(companion('INV-NAKED', { notChecked: [] }))).toThrow(/notChecked/);
    expect(registry.registered).toBe(0);
  });
});

// ═══ 2. 回滚面 ═══

describe('回滚面：失败不得留半注册状态', () => {
  it('install 自身抛错 → 本次注册释放 + 已登记 onRollback 逆序执行（LIFO）', () => {
    const registry = new InvariantRegistry();
    const order: string[] = [];
    const bomb = companion('INV-BOOM', {
      install: (ctx: InvariantContext): void => {
        ctx.onRollback(() => order.push('first'));
        ctx.onRollback(() => order.push('second'));
        throw new Error('注入：组装 wrap 时失败');
      },
    });
    expect(() => registry.install(bomb)).toThrow('注入：组装 wrap 时失败');
    expect(registry.registered).toBe(0);
    expect(order).toEqual(['second', 'first']); // wrap 叠加序逆序撤销
    expect(registry.snapshot().invariants).toHaveLength(0);
  });

  it('installAll 第 2 条失败 → 第 1 条原子回滚（registered=0 + 其 wrap 已撤销）', () => {
    const registry = new InvariantRegistry();
    const rolled: string[] = [];
    const first = companion('INV-A', {
      install: (ctx: InvariantContext): void => { ctx.onRollback(() => rolled.push('A')); },
    });
    const second = companion('INV-B', {
      install: (): void => { throw new Error('注入：第 2 条 install 失败'); },
    });
    expect(() => registry.installAll([first, second])).toThrow('注入：第 2 条 install 失败');
    expect(registry.registered).toBe(0);
    expect(rolled).toEqual(['A']);
    expect(registry.statusOf('INV-A')).toBeUndefined();
  });

  it('uninstall 幂等：已卸载的 code 再次 uninstall 不重复执行回滚', () => {
    const registry = new InvariantRegistry();
    let rollbackRuns = 0;
    registry.install(companion('INV-ONCE', {
      install: (ctx: InvariantContext): void => { ctx.onRollback(() => { rollbackRuns += 1; }); },
    }));
    registry.uninstall('INV-ONCE');
    registry.uninstall('INV-ONCE');
    expect(rollbackRuns).toBe(1);
    expect(registry.registered).toBe(0);
  });

  it('uninstallAll 逆安装序撤销全部（LIFO），并清空注册表级异常累积', () => {
    const registry = new InvariantRegistry();
    const order: string[] = [];
    let ctxOfFirst: InvariantContext | undefined;
    for (const code of ['INV-1', 'INV-2']) {
      registry.install(companion(code, {
        install: (ctx: InvariantContext): void => {
          if (code === 'INV-1') ctxOfFirst = ctx;
          ctx.onRollback(() => order.push(code));
        },
      }));
    }
    ctxOfFirst?.flagAnomaly('回滚遇替换（先累积，uninstallAll 须清空）');
    expect(registry.snapshot().anomalies).toHaveLength(1);
    registry.uninstallAll();
    expect(order).toEqual(['INV-2', 'INV-1']);
    expect(registry.registered).toBe(0);
    expect(registry.snapshot().anomalies).toEqual([]);
  });
});

// ═══ 3. 记账面 ═══

describe('记账面：fail / hit / flagAnomaly 的探针可见语义', () => {
  let registry: InvariantRegistry;
  beforeEach(() => { registry = new InvariantRegistry(); });

  it('fail() 抛带 code/owner/packageName 的 InvariantError，并记 hitCount + lastFailure', () => {
    const ctx = captureCtx(registry, 'INV-FAIL');
    let thrown: unknown;
    try {
      ctx.fail('注入违约：tools schema 丢失');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(InvariantError);
    const e = thrown as InvariantError;
    expect(e.code).toBe('INV-FAIL');
    expect(e.owner).toBe('squad-b/coding');
    expect(e.packageName).toBe('@synova/agent');
    expect(e.message).toContain('注入违约：tools schema 丢失');
    const status = registry.statusOf('INV-FAIL');
    expect(status?.hitCount).toBe(1);
    expect(status?.lastFailure).toBe('注入违约：tools schema 丢失');
  });

  it('hit() 只计数不违约；多次 fail() 覆盖 lastFailure 且 hitCount 累加', () => {
    const ctx = captureCtx(registry, 'INV-HIT');
    ctx.hit();
    ctx.hit();
    expect(registry.statusOf('INV-HIT')?.lastFailure).toBeNull();
    expect(registry.statusOf('INV-HIT')?.hitCount).toBe(2);
    expect(() => ctx.fail('第一次')).toThrow(InvariantError);
    expect(() => ctx.fail('第二次')).toThrow(InvariantError);
    expect(registry.statusOf('INV-HIT')?.hitCount).toBe(4);
    expect(registry.statusOf('INV-HIT')?.lastFailure).toBe('第二次');
  });

  it('flagAnomaly 记条目级 + 注册表级；uninstall 后注册表级仍可见（防静默失效假绿）', () => {
    const ctx = captureCtx(registry, 'INV-ANOM');
    ctx.flagAnomaly('回滚时 globalThis.fetch 已被他人替换');
    expect(registry.statusOf('INV-ANOM')?.anomalies).toEqual(['回滚时 globalThis.fetch 已被他人替换']);
    expect(registry.snapshot().anomalies).toEqual(['[INV-ANOM] 回滚时 globalThis.fetch 已被他人替换']);
    registry.uninstall('INV-ANOM');
    expect(registry.snapshot().registered).toBe(0);
    expect(registry.snapshot().anomalies).toHaveLength(1); // 条目卸载后注册表级仍在
    expect(registry.snapshot().anomalies[0]).toContain('INV-ANOM');
  });
});

// ═══ 4. 快照/视图面 ═══

describe('快照面：只读视图的字段契约', () => {
  it('snapshot 暴露 registered + 每条 code/owner/packageName/hitCount/lastFailure/anomalies', () => {
    const registry = new InvariantRegistry();
    registry.install(companion('INV-SNAP', { owner: 'squad-b/test', packageName: '@synova/unit' }));
    const snap = registry.snapshot();
    expect(snap.registered).toBe(1);
    expect(snap.invariants).toHaveLength(1);
    const one = snap.invariants[0];
    expect(one?.code).toBe('INV-SNAP');
    expect(one?.owner).toBe('squad-b/test');
    expect(one?.packageName).toBe('@synova/unit');
    expect(one?.hitCount).toBe(0);
    expect(one?.lastFailure).toBeNull();
    expect(one?.anomalies).toEqual([]);
  });

  it('statusOf 未注册 code → undefined；快照递增计数与 entries 一致', () => {
    const registry = new InvariantRegistry();
    expect(registry.statusOf('INV-NONE')).toBeUndefined();
    expect(registry.snapshot().registered).toBe(0);
    registry.install(companion('INV-X'));
    registry.install(companion('INV-Y'));
    expect(registry.snapshot().registered).toBe(2);
    expect(registry.snapshot().invariants.map((i) => i.code)).toEqual(['INV-X', 'INV-Y']);
  });
});

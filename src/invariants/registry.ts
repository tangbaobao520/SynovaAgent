/**
 * src/invariants/registry.ts — P-2 运行期不变量注册表（D831）
 *
 * 范式锚点（读源码自研，零代码依赖 — G1 守卫，铁律 46）:
 *   @deepseek-ai/dsh-invariants/lib/index.js（123 行，逐行读全文）
 *   借鉴范式: InvariantError 带 code+packageName；register 重名拒绝；
 *   install 失败释放注册（不留半注册状态）；伴生以 companion 形式注册检查。
 *
 * 机制定位（总纲前提清单 P-2）: 运行期"违约必炸 + 知道是谁的锅"。
 * 静态门禁（check-architecture.sh）看不见运行期接线——本注册表让
 * D819 类"schema 丢掉 / 配对断裂 / 降级被抹掉"在生产运行期 fail-closed。
 *
 * 契约（铁律 47）:
 *   @input  — InvariantCompanion: { code, owner, packageName, notChecked, install }
 *             install 为**同步 void**（异步纪律：伴生 install 不得返回 Promise——
 *             启动序列不允许"注册中"中间态）；ctx = { fail, hit, onRollback }
 *   @output — install/installAll 同步完成注册；snapshot() 供健康探针读取
 *   @degraded — 无（本机制自身 fail-closed：注册失败 = 启动失败，不降级）
 *   @error  — 重名 code / install 抛错 → 抛出且释放本次注册（DSH 范式）；
 *             installAll 任一失败 → 撤销本次已装全部伴生（原子回滚）
 */

import { createLogger } from '@synova/logger';

const log = createLogger('invariants/registry');

// ═══ Types ═══

/** 违约错误：带稳定 code + 归属（owner + packageName），HTTP 层映射 5xx 语义 */
export class InvariantError extends Error {
  /** 稳定机器可读不变量失败码 */
  readonly code: string;
  /** 归属人/域（如 "squad-b/coding"） */
  readonly owner: string;
  /** 归属包名 */
  readonly packageName: string;

  constructor(code: string, owner: string, packageName: string, message: string) {
    super(`invariant ${code} violated by "${packageName}" (owner: ${owner}): ${message}`);
    this.name = 'InvariantError';
    this.code = code;
    this.owner = owner;
    this.packageName = packageName;
  }
}

/** 伴生安装上下文：fail = 违约必炸；hit = 检查点命中计数；onRollback = 注册回滚钩子 */
export interface InvariantContext {
  /** 声明违约：记录 lastFailure 后抛 InvariantError（fail-closed，不许 WARN） */
  fail(message: string): never;
  /** 检查点被执行一次（正向/负向都计——探针用"注册了且活着"口径） */
  hit(): void;
  /** 登记回滚回调（撤销本伴生装上的 wrap/监听；原子回滚用） */
  onRollback(fn: () => void): void;
}

/**
 * 不变量伴生定义。
 * notChecked（总纲 §9.4 硬要求）: 显式声明**本不变量不检查什么**——
 * 防止"断言存在但给人虚假安全感"。
 * install 签名限定 void：伴生安装不得返回 Promise（启动序列无"注册中"中间态）。
 */
export interface InvariantCompanion {
  code: string;
  owner: string;
  packageName: string;
  /** 本不变量不检查什么（显式清单，总纲 §9.4） */
  notChecked: readonly string[];
  install: (ctx: InvariantContext) => void;
}

/** 单条不变量的运行期状态（健康探针暴露面） */
export interface InvariantStatus {
  code: string;
  owner: string;
  packageName: string;
  hitCount: number;
  /** 最近一次违约描述；null = 从未违约（正向口径） */
  lastFailure: string | null;
}

/** 注册表快照 */
export interface InvariantSnapshot {
  registered: number;
  invariants: InvariantStatus[];
}

/** 内部登记项 */
interface Entry {
  def: InvariantCompanion;
  hitCount: number;
  lastFailure: string | null;
  rollbacks: Array<() => void>;
}

// ═══ Registry ═══

/**
 * 运行期不变量注册表。
 * 生命周期：bootstrap Phase（fatal）installAll → 进程运行期检查点触发 →
 * 原子回滚仅发生在启动失败路径（撤销已装 wrap，进程退出）。
 */
export class InvariantRegistry {
  private entries = new Map<string, Entry>();

  /** 已注册不变量条数 */
  get registered(): number {
    return this.entries.size;
  }

  /**
   * 注册并安装一个伴生。
   * @throws code 为空/含空白、重名注册、install 抛错（此时释放本次注册，
   *         已登记的 onRollback 回调全部执行——DSH"失败释放注册"范式）
   */
  install(companion: InvariantCompanion): void {
    if (
      typeof companion.code !== 'string' || companion.code.length === 0
      || companion.code.trim() !== companion.code || /\s/.test(companion.code)
    ) {
      throw new Error(`invariants: code must be non-blank and contain no whitespace, got ${JSON.stringify(companion.code)}`);
    }
    if (this.entries.has(companion.code)) {
      throw new Error(`invariants: code "${companion.code}" is already registered`);
    }
    if (!Array.isArray(companion.notChecked) || companion.notChecked.length === 0) {
      // 总纲 §9.4 硬要求：无"不检查什么"清单的不变量拒绝注册
      throw new Error(`invariants: companion "${companion.code}" must declare non-empty notChecked (总纲 §9.4)`);
    }
    const entry: Entry = { def: companion, hitCount: 0, lastFailure: null, rollbacks: [] };
    this.entries.set(companion.code, entry);
    try {
      companion.install({
        fail: (message: string): never => {
          entry.hitCount += 1;
          entry.lastFailure = message;
          log.error({ code: companion.code, owner: companion.owner }, `不变量违约: ${message}`);
          throw new InvariantError(companion.code, companion.owner, companion.packageName, message);
        },
        hit: () => {
          entry.hitCount += 1;
        },
        onRollback: (fn: () => void) => {
          entry.rollbacks.push(fn);
        },
      });
    } catch (err) {
      // 失败释放注册：不留半注册状态（DSH 范式）
      this.entries.delete(companion.code);
      this.runRollbacks(entry);
      throw err;
    }
  }

  /**
   * 原子安装一批伴生：任一失败 → 撤销本次已装全部（含各自的 wrap 回滚）→ 重抛。
   * 启动序列（bootstrap fatal Phase）唯一入口。
   */
  installAll(companions: readonly InvariantCompanion[]): void {
    const installedCodes: string[] = [];
    try {
      for (const c of companions) {
        this.install(c);
        installedCodes.push(c.code);
      }
    } catch (err) {
      for (const code of installedCodes.reverse()) {
        this.uninstall(code);
      }
      throw err;
    }
  }

  /** 卸载单个伴生（执行其回滚钩子；幂等） */
  uninstall(code: string): void {
    const entry = this.entries.get(code);
    if (entry === undefined) return;
    this.entries.delete(code);
    this.runRollbacks(entry);
  }

  /** 卸载全部（原子回滚 / 测试隔离用）——wrap 叠加是 LIFO，必须逆安装序撤销 */
  uninstallAll(): void {
    const codes = [...this.entries.keys()];
    for (const code of codes.reverse()) {
      this.uninstall(code);
    }
  }

  /** 健康探针快照 */
  snapshot(): InvariantSnapshot {
    const invariants: InvariantStatus[] = [];
    for (const entry of this.entries.values()) {
      invariants.push({
        code: entry.def.code,
        owner: entry.def.owner,
        packageName: entry.def.packageName,
        hitCount: entry.hitCount,
        lastFailure: entry.lastFailure,
      });
    }
    return { registered: this.entries.size, invariants };
  }

  /** 读单条（测试/探针用；未注册 → undefined） */
  statusOf(code: string): InvariantStatus | undefined {
    const entry = this.entries.get(code);
    if (entry === undefined) return undefined;
    return {
      code: entry.def.code,
      owner: entry.def.owner,
      packageName: entry.def.packageName,
      hitCount: entry.hitCount,
      lastFailure: entry.lastFailure,
    };
  }

  private runRollbacks(entry: Entry): void {
    for (const fn of entry.rollbacks.reverse()) {
      try {
        fn();
      } catch (err: unknown) {
        // 铁律 24: 回滚失败不静默
        log.warn({ err: err instanceof Error ? err.message : String(err), code: entry.def.code }, '不变量回滚钩子失败 — 残留风险，需人工核查');
      }
    }
    entry.rollbacks.length = 0;
  }
}

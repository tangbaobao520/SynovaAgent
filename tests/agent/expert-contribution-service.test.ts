/**
 * tests/agent/expert-contribution-service.test.ts — L2 专家贡献服务（D603 簇3）配对测试
 *
 * 契约（铁律 47）—— src/agent/expert-contribution-service.ts：
 *   @input  getExpertStore() 惰性单例 / createTemplateValidator() 工厂
 *   @output ExpertStore（SQLite 持久化）/ TemplateValidator 实例
 *   @degraded getDatabase() 抛错 → getExpertStore 原样传播且不缓存失败（下次调用重试，
 *             与修复前 routes/expert.ts:19-23 惰性单例语义逐字节一致）
 *
 * 覆盖矩阵（铁律 48）：[降级] 首调 db 抛错传播且失败不缓存 / [正常] 恢复后构造且单例复用 /
 * [边界] 工厂两次调用独立实例 / [回归] 类型出口
 * （单例为模块级状态——降级用例必须先于构造用例执行，本文件按声明序保证）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { getExpertStore, createTemplateValidator, type ExpertStore } from '../../src/agent/expert-contribution-service';
import { getDatabase } from '../../src/init/engine-context';
import { ExpertStore as RealExpertStore } from '../../src/expert-platform/store';

const memDb = new Database(':memory:');

vi.mock('../../src/init/engine-context', () => ({
  getDatabase: vi.fn(),
}));

const mockedGetDatabase = vi.mocked(getDatabase);

beforeEach(() => {
  mockedGetDatabase.mockImplementation(() => memDb);
});

afterEach(() => {
  mockedGetDatabase.mockImplementation(() => memDb);
});

describe('expert-contribution-service — 装配下沉（routes/expert 前身语义）', () => {
  it('[降级→正常] 首调 db 抛错原样传播且失败不缓存；恢复后构造成功且后续复用单例', () => {
    // ① 降级：db 未初始化 → 抛错（惰性单例尚未构造）
    mockedGetDatabase.mockImplementation(() => {
      throw new Error('数据库未初始化，请先调用 initEngineContext()');
    });
    expect(() => getExpertStore()).toThrow(/未初始化/);

    // ② 失败未缓存：恢复 db 后重试构造成功
    mockedGetDatabase.mockImplementation(() => memDb);
    const store = getExpertStore();
    expect(store).toBeInstanceOf(RealExpertStore);

    // ③ 惰性单例：后续调用复用同一实例（构造仅 1 次——T5b 同语义）
    expect(getExpertStore()).toBe(store);
  });

  it('[边界] createTemplateValidator 工厂：产品可用且两次调用独立实例', () => {
    const v1 = createTemplateValidator();
    const v2 = createTemplateValidator();

    expect(typeof v1.register).toBe('function');
    expect(typeof v1.recordValidation).toBe('function');
    expect(v1).not.toBe(v2);
  });

  it('[回归] 类型出口：ExpertStore 类型可从本模块导入（L1 零 expert-platform 路径依赖的依据）', () => {
    const probe: ExpertStore | undefined = undefined;
    expect(probe).toBeUndefined();
  });
});

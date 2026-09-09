/**
 * agent/expert-contribution-service.ts — 专家贡献服务 (L2)
 * @state: real
 *
 * D603 跨层修复（扫描报告 §三 簇3 + §2.1 #9/#10 修复路径）: routes/expert 的
 * TemplateValidator / ExpertStore 装配从 L1 下沉到本 L2 服务层（铁律 39: L1→L2→L3）。
 * ExpertStore 惰性单例语义与修复前 expert.ts:19-23 逐字节一致
 * （首次构造成功后缓存复用；构造抛错不缓存，下次请求重试）。
 *
 * L1→L2 ✅ | L2→L3(expert-platform)/L5(init) ✅
 */

import { TemplateValidator } from '../expert-platform/validator';
import { ExpertStore } from '../expert-platform/store';
import { getDatabase } from '../init/engine-context';

export type { ExpertStore, TemplateValidator };

let store: ExpertStore | null = null;

/**
 * getExpertStore — 惰性单例 ExpertStore（SA-01 SQLite 持久化）。
 * @degraded getDatabase() 未初始化 → 抛出且不缓存单例 → 下次调用重试（修复前同语义）。
 */
export function getExpertStore(): ExpertStore {
  if (!store) store = new ExpertStore(getDatabase());
  return store;
}

/**
 * createTemplateValidator — 模板校验器工厂（无状态，等价修复前模块级 new）。
 */
export function createTemplateValidator(): TemplateValidator {
  return new TemplateValidator();
}

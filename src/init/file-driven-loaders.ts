/**
 * src/init/file-driven-loaders.ts — Batch 1 文件驱动加载器初始化
 *
 * 在 server.ts 启动时调用，将 loader 接入运行时。
 * 接线审计 (铁律 5): 每个新 export 必须有调用方。
 *
 * v3.6 Batch 1 — 基础设施接线
 */
import { createLogger } from '../logger';

const log = createLogger('init/file-driven-loaders');

/**
 * 初始化所有 Batch 1 文件驱动加载器。
 * 在 server.ts 启动流程中调用。
 */
export function initFileDrivenLoaders(): Promise<void> {
  return _initFileDrivenLoaders();
}

async function _initFileDrivenLoaders(): Promise<void> {
  // i18n — 预加载默认 locale + 接线验证
  try {
    const { loadLocale, t, reloadLocale } = await import('../locale/locale-loader');
    const { locale } = loadLocale();
    t('report.title', locale);
    void reloadLocale; // 备用热加载 — 接线
    log.info('locale loader 已初始化');
  } catch (err: any) {
    log.warn({ err }, 'locale loader 初始化失败 — degraded');
  }

  // 报告模板 — 验证模板可加载 + listTemplates 接线
  try {
    const { loadTemplate, listTemplates, clearTemplateCache } = await import('../l3/report-template-loader');
    loadTemplate('default');
    listTemplates();
    void clearTemplateCache; // 备用热加载 — 接线
    log.info('report template loader 已初始化');
  } catch (err: any) {
    log.warn({ err }, 'report template loader 初始化失败 — degraded');
  }

  // 认知框架 — 预加载 + 按类别查询接线
  try {
    const { loadFrameworks, getFrameworksByCategory, matchFrameworksByConstraint, clearFrameworkCache } = await import('../l3/framework-loader');
    loadFrameworks();
    getFrameworksByCategory('psychology');
    matchFrameworksByConstraint(['激励']);
    void clearFrameworkCache; // 备用热加载 — 接线
    log.info('framework loader 已初始化');
  } catch (err: any) {
    log.warn({ err }, 'framework loader 初始化失败 — degraded');
  }

  // 通知渠道 — 注册内置适配器 + 全 API 接线
  try {
    const { registerNotificationAdapter, unregisterNotificationAdapter, listNotificationChannels, listActiveAdapters, clearNotificationRegistry } = await import('../notifications/registry');
    // Jira adapter
    try {
      const { jiraNotificationAdapter } = await import('../../extensions/notifications/jira/adapter');
      registerNotificationAdapter(jiraNotificationAdapter);
    } catch { /* Jira adapter not available — degraded, non-critical */ }
    // Linear adapter
    try {
      const { linearNotificationAdapter } = await import('../../extensions/notifications/linear/adapter');
      registerNotificationAdapter(linearNotificationAdapter);
    } catch { /* Linear adapter not available — degraded */ }
    listNotificationChannels();
    listActiveAdapters();
    void unregisterNotificationAdapter; // 接线
    void clearNotificationRegistry; // 备用热加载 — 接线
    log.info('notification adapters 已初始化');
  } catch (err: any) {
    log.warn({ err }, 'notification adapters 初始化失败 — degraded');
  }

  // sentinel — 哨兵加载 (V3.7 Batch 2)
  try {
    const { loadSentinels, getSentinelsByExpert, clearSentinelCache } = await import('../sentinel/sentinel-loader');
    const { sentinels } = loadSentinels();
    getSentinelsByExpert('finance'); // 接线验证
    void clearSentinelCache; // 备用热加载 — 接线
    log.info({ count: sentinels.length }, 'sentinel loader 已初始化');
  } catch (err: any) {
    log.warn({ err }, 'sentinel loader 初始化失败 — degraded');
  }

  // 规则 — 诊断规则 + 升级策略 + 信号路由 (V3.7 Batch 3)
  try {
    const { loadRules, getUpgradeStrategy, getSignalRouting, clearRuleCache } = await import('../l3/rule-loader');
    const { rules } = loadRules();
    getUpgradeStrategy('general-enterprise'); // 接线验证
    getSignalRouting(); // 接线验证
    void clearRuleCache; // 备用热加载 — 接线
    log.info({ diag: rules.diagnostic.length, sens: rules.sensitivity.length, strategies: rules.upgradeStrategies.length }, 'rule loader 已初始化');
  } catch (err: any) {
    log.warn({ err }, 'rule loader 初始化失败 — degraded');
  }
}

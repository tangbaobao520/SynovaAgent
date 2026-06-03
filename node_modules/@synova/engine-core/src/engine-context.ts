/**
 * EngineContext — 外部依赖注入接口
 *
 * 所有 engine-core 模块通过 getEngineContext() 获取外部服务，
 * 默认使用 stub 实现（console logger + no-op 安全/市场/数据库/协议）。
 * Novis 启动时调用 setEngineContext() 注入真实实现。
 */

import type { AppLogger } from './infra/logger';
import { createLogger } from './infra/logger';

export interface SkillSecurityReport {
  score: number;
  level: string;
  findings: Array<{ severity: string; description: string }>;
  installable: boolean;
}

export interface SecurityAuditReport {
  score: number;
  level: string;
  summary: string;
  checkedAt: string;
  items: any[];
}

export interface MarketplaceService {
  search(query: string, type: string, signal?: AbortSignal): Promise<{ skills?: any[] } | null>;
  publishSkill(req: any, signal?: AbortSignal): Promise<{ success: boolean } | null>;
}

export class CircuitOpenError extends Error {
  public readonly endpoint: string;
  public readonly opensAt: string;
  constructor(endpoint: string, opensAt: string) {
    super(`[CircuitBreaker] ${endpoint} open since ${opensAt}`);
    this.name = 'CircuitOpenError';
    this.endpoint = endpoint;
    this.opensAt = opensAt;
  }
}

export interface CircuitBreakerLike {
  call<T>(fn: () => Promise<T>): Promise<T>;
  getStatus(): { state: string; failures: number; lastFailure?: string; opensAt?: string };
}

export interface EngineContext {
  logger: AppLogger;
  securityAudit: {
    auditSkillContent(name: string, content: string): SkillSecurityReport;
    auditExtension(type: string, content: string, name: string): SecurityAuditReport;
  };
  marketplace: MarketplaceService;
  database: {
    getDb(): any;
  };
  protocol: {
    createRuleEngine(): any;
  };
  circuitBreaker: {
    createBreaker(endpoint: string, config?: { threshold?: number; cooldownMs?: number; onTrip?: (endpoint: string, failures: number, lastFailure: string) => void }): CircuitBreakerLike;
  };
  alerting: {
    notifyCircuitBreakerTrip(endpoint: string, failures: number, lastFailure: string): Promise<void>;
  };
  filePaths: {
    skillBlocklistPath: string;
    skillRegistryPath: string;
  };
  personal?: {
    publish: (blueprint: import('./types').BlueprintDTO, options?: import('./pipeline/personal-publisher').PublishOptions) => import('./pipeline/personal-publisher').PublishResult;
    listAgents: (solohubDir?: string) => import('./pipeline/personal-publisher').ManifestEntry[];
    getAgent: (blueprintId: string, solohubDir?: string) => { synovaYml: string; blueprint: import('./types').BlueprintDTO } | null;
  };
}

function defaultSkillReport(name: string): SkillSecurityReport {
  return {
    score: 85,
    level: 'benign',
    findings: [],
    installable: true,
  };
}

function defaultAuditReport(name: string): SecurityAuditReport {
  return {
    score: 85,
    level: 'safe',
    summary: `Stub audit for ${name} — no real security engine available`,
    checkedAt: new Date().toISOString(),
    items: [],
  };
}

const defaultContext: EngineContext = {
  logger: createLogger('engine-core'),

  securityAudit: {
    auditSkillContent(name: string, _content: string) {
      return defaultSkillReport(name);
    },
    auditExtension(_type: string, _content: string, name: string) {
      return defaultAuditReport(name);
    },
  },

  marketplace: {
    async search(_query: string, _type: string) {
      return { skills: [] };
    },
    async publishSkill(_req: any) {
      return { success: false };
    },
  },

  database: {
    getDb() {
      throw new Error('Database not injected — call setEngineContext() with a real database');
    },
  },

  protocol: {
    createRuleEngine() {
      throw new Error('RuleEngine not injected — call setEngineContext() with a real protocol engine');
    },
  },

  circuitBreaker: {
    createBreaker(_endpoint: string, _config?: any): CircuitBreakerLike {
      return {
        async call<T>(fn: () => Promise<T>): Promise<T> { return fn(); },
        getStatus() { return { state: 'CLOSED', failures: 0 }; },
      };
    },
  },

  alerting: {
    async notifyCircuitBreakerTrip(_endpoint: string, _failures: number, _lastFailure: string) {
      // no-op in vendor package
    },
  },

  filePaths: {
    skillBlocklistPath: '',
    skillRegistryPath: '',
  },
};

let _ctx: EngineContext = defaultContext;

export function setEngineContext(ctx: Partial<EngineContext>): void {
  _ctx = { ...defaultContext, ...ctx };
}

export function getEngineContext(): EngineContext {
  return _ctx;
}

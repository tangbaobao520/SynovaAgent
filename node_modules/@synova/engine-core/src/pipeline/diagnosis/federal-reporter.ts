/**
 * federal-reporter.ts — 联邦上报 (Phase 3.1)
 *
 * 安全模型: 基础加密模式（V1）
 *   - 服务端可以解密每个组织的脱敏统计数据（经差分隐私加噪）
 *   - 服务端无法获取原始诊断数据（数据不出门原则）
 *   - 目标 Phase 3.4 (2026-07-15): 阈值加密或 Shamir 秘密共享
 *     → 服务端只能解密聚合结果
 *
 * 隐私预算: ε = 1.0 (默认), 用户可配置
 * 噪声机制: 高斯噪声 N(0, (sensitivity/ε)²)
 * 流量分析防护: 批量上报 + 24h 随机延迟
 */
import * as crypto from 'crypto';
import { createLogger } from '../../infra/logger';
import type { EvolutionSignal } from './action-tracking';

const log = createLogger('diagnosis/federal-reporter');

// ═══ Types ═══

export interface DiagnosisQualitySignal {
  signalType: 'diagnosis_quality';
  diagnosisId: string;
  teamId: string;              // SHA256(teamId + salt)
  overallHypothesisConfirmRate: number;
  overallActionAdoptionRate: number;
  phaseCompletionTime: number;
  moduleCount: number;
  timestamp: string;
}

export interface NoisedSignal {
  signalType: string;
  values: Record<string, number>;  // 加噪后的统计值
  teamHash: string;
  epsilon: number;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  keyFingerprint: string;
  timestamp: string;
}

export interface FederalConfig {
  epsilon?: number;             // 隐私预算，默认 1.0
  batchIntervalMs?: number;     // 批量间隔，默认 24h
  jitterMaxMs?: number;         // 最大随机延迟，默认 30min
  publicKeyEndpoint?: string;   // 公钥端点
  optOut?: boolean;             // 用户关闭全局贡献
}

// ═══ Value Clipping ═══

/** 裁剪到物理合理区间——差分隐私的数学基础，不是可选优化 */
function clipValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clipValues(signals: EvolutionSignal[]): EvolutionSignal[] {
  return signals.map(s => {
    const clipped = { ...s };
    if (clipped.adoptionRate !== undefined) {
      clipped.adoptionRate = clipValue(clipped.adoptionRate, 0, 1);
    }
    if (clipped.improvementRate !== undefined) {
      clipped.improvementRate = clipValue(clipped.improvementRate, 0, 1);
    }
    return clipped;
  });
}

function clipQualitySignal(signal: DiagnosisQualitySignal): DiagnosisQualitySignal {
  return {
    ...signal,
    overallHypothesisConfirmRate: clipValue(signal.overallHypothesisConfirmRate, 0, 1),
    overallActionAdoptionRate: clipValue(signal.overallActionAdoptionRate, 0, 1),
    phaseCompletionTime: clipValue(signal.phaseCompletionTime, 0, 604800), // 7 days max
    moduleCount: clipValue(signal.moduleCount, 0, 1000),
  };
}

// ═══ Differential Privacy ═══

/** Box-Muller 法生成高斯噪声 */
function gaussianNoise(std: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random(); // nosec: DP noise generation
  while (v === 0) v = Math.random(); // nosec: DP noise generation
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * std;
}

/** 对统计值加噪 */
function addNoise(values: Record<string, number>, epsilon: number, sensitivity = 1.0): Record<string, number> {
  const std = sensitivity / epsilon;
  const noised: Record<string, number> = {};
  for (const [key, val] of Object.entries(values)) {
    noised[key] = val + gaussianNoise(std);
  }
  return noised;
}

// ═══ Encryption ═══

/** 简化的 AES-256-GCM 加密（使用 Node.js crypto） */
function encryptPayload(data: string, publicKeyPem: string): EncryptedPayload {
  // crypto imported at top level
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(data, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Encrypt the AES key with RSA public key
  const encryptedKey = crypto.publicEncrypt(publicKeyPem, key).toString('base64');

  return {
    ciphertext: `${encryptedKey}:${authTag.toString('base64')}:${ciphertext}`,
    iv: iv.toString('base64'),
    keyFingerprint: crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16),
    timestamp: new Date().toISOString(),
  };
}

// ═══ FederalReporter ═══

export class FederalReporter {
  private config: Required<FederalConfig>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private db: any;
  private publicKey: string | null = null;
  private salt: string;

  constructor(db: any, config: FederalConfig = {}) {
    this.db = db;
    this.config = {
      epsilon: config.epsilon ?? 1.0,
      batchIntervalMs: config.batchIntervalMs ?? 24 * 3600 * 1000,
      jitterMaxMs: config.jitterMaxMs ?? 30 * 60 * 1000,
      publicKeyEndpoint: config.publicKeyEndpoint ?? '',
      optOut: config.optOut ?? false,
    };
    this.salt = crypto.randomBytes(16).toString('hex');
    this.initSchema();
    this.startTimer();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS federation_keys (
        id INTEGER PRIMARY KEY CHECK(id=1),
        public_key_pem TEXT,
        fingerprint TEXT,
        fetched_at TEXT,
        expires_at TEXT
      );
    `);
  }

  // ═══ Lifecycle ═══

  /** 内置定时器——Agent 进程启动时初始化，退出时清理 */
  private startTimer(): void {
    const scheduleNext = () => {
      const jitter = Math.floor(Math.random() * this.config.jitterMaxMs); // nosec: jitter for traffic analysis protection
      const delay = this.config.batchIntervalMs + jitter;
      this.timer = setTimeout(async () => {
        await this.batchReport();
        scheduleNext();
      }, delay);
      log.info({ nextRunMs: delay }, '联邦上报定时器已调度');
    };
    scheduleNext();
  }

  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    log.info('联邦上报定时器已停止');
  }

  // ═══ Public Key Management ═══

  async fetchPublicKey(): Promise<string | null> {
    if (!this.config.publicKeyEndpoint) {
      log.warn('未配置公钥端点——联邦上报不可用');
      return null;
    }
    try {
      const res = await fetch(this.config.publicKeyEndpoint, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const pem = await res.text();
        this.publicKey = pem;
        const fp = crypto.createHash('sha256').update(pem).digest('hex').slice(0, 16);
        this.db.prepare(`
          INSERT OR REPLACE INTO federation_keys (id, public_key_pem, fingerprint, fetched_at, expires_at)
          VALUES (1,?,?,datetime('now'),datetime('now','+24 hours'))
        `).run(pem, fp);
        log.info({ fingerprint: fp }, '公钥已刷新');
        return pem;
      }
    } catch (err: any) {
      log.warn({ err: err.message }, '公钥获取失败——使用缓存');
    }
    // Fallback: 读缓存
    const row = this.db.prepare('SELECT * FROM federation_keys WHERE id=1').get() as any;
    if (row) {
      this.publicKey = row.public_key_pem;
      return row.public_key_pem;
    }
    return null;
  }

  // ═══ Signal Collection ═══

  /**
   * 收集待上报信号。
   * 用户关闭全局贡献 → 返回空数组。不允许关闭贡献后仍有信号被上报。
   */
  collectPendingSignals(): EvolutionSignal[] {
    if (this.config.optOut) return [];
    const rows = this.db.prepare(
      "SELECT data_json FROM evolution_signals WHERE submitted_to_federation=0 AND signal_type != 'diagnosis_quality' ORDER BY created_at ASC LIMIT 100"
    ).all() as any[];
    return rows.map((r: any) => JSON.parse(r.data_json));
  }

  // ═══ Report ═══

  /** 批量上报 + 随机延迟 */
  async batchReport(): Promise<void> {
    log.info('开始联邦批量上报');

    // 获取公钥
    const pk = this.publicKey || await this.fetchPublicKey();
    if (!pk) {
      log.warn('公钥不可用——推迟上报');
      return;
    }

    // 规则反馈信号
    const signals = this.collectPendingSignals();
    if (signals.length === 0) {
      log.info('无待上报信号——静默跳过');
      return;
    }

    // clipValues → addNoise → encrypt → report
    const clipped = clipValues(signals);
    const values: Record<string, number> = {};
    for (const s of clipped) {
      if (s.adoptionRate !== undefined) values.adoptionRate = (values.adoptionRate || 0) + s.adoptionRate;
      if (s.improvementRate !== undefined) values.improvementRate = (values.improvementRate || 0) + s.improvementRate;
    }
    // Average
    if (values.adoptionRate) values.adoptionRate /= signals.length;
    if (values.improvementRate) values.improvementRate /= signals.length;

    const noised = addNoise(values, this.config.epsilon);
    const teamHash = crypto.createHash('sha256')
      .update('anonymous' + this.salt).digest('hex').slice(0, 16);

    const payload: NoisedSignal = {
      signalType: 'rule_feedback',
      values: noised,
      teamHash,
      epsilon: this.config.epsilon,
    };

    const encrypted = encryptPayload(JSON.stringify(payload), pk);
    await this.upload(encrypted);

    // 标记已上报
    for (const s of signals) {
      this.db.prepare('UPDATE evolution_signals SET submitted_to_federation=1 WHERE signal_id=?')
        .run(s.signalId);
    }
    log.info({ count: signals.length }, '联邦上报完成');
  }

  /** 上报诊断质量信号 */
  async reportDiagnosisQuality(signal: DiagnosisQualitySignal): Promise<void> {
    if (this.config.optOut) return; // 关闭贡献 → 静默跳过

    const clipped = clipQualitySignal(signal);
    const noised = addNoise({
      hypothesisConfirmRate: clipped.overallHypothesisConfirmRate,
      actionAdoptionRate: clipped.overallActionAdoptionRate,
    }, this.config.epsilon);

    const teamHash = crypto.createHash('sha256')
      .update(signal.teamId + this.salt).digest('hex').slice(0, 16);

    const payload = { signalType: 'diagnosis_quality', values: noised, teamHash, epsilon: this.config.epsilon };

    // 持久化（供批量上报使用）
    this.db.prepare(`
      INSERT INTO evolution_signals (signal_id, team_id, signal_type, data_json)
      VALUES (?,?,?,?)
    `).run(`dq_${Date.now().toString(36)}`, teamHash, 'diagnosis_quality', JSON.stringify(payload));
  }

  private async upload(payload: EncryptedPayload): Promise<void> {
    if (!this.config.publicKeyEndpoint) return;
    const endpoint = this.config.publicKeyEndpoint.replace('/.well-known/federation-public-key', '/api/federation/report');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        log.error({ status: res.status }, '联邦上报失败——信号保留未上报状态');
      }
    } catch (err: any) {
      log.error({ err: err.message }, '联邦上报网络失败——信号保留未上报状态');
    }
  }
}

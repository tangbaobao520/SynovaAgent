/**
 * l2-interfaces/diagnosis-engine.ts — L2 编排层的诊断引擎接口
 *
 * 铁律 39: L2 只通过此接口调用诊断引擎，不知道底层是 engine-core 还是 mock。
 * 接口定义在 synova-agent 内, engine-core 通过适配器实现。
 *
 * 五层架构: L2(编排) → DiagnosisEngine(接口) → Adapter → engine-core(L3)
 */

/** 诊断事件 (L2→L1, 前端通过 SSE 消费) */
export interface DiagnosisEvent {
  type: string;
  phase: number;
  label?: string;
  message?: string;
  findings?: Array<{ moduleId: string; summary: string; confidence?: number }>;
  confidence?: number;
  nodesCreated?: number;
  edgesCreated?: number;
  /** GNS v2.0: 右边栏状态更新 — 前端渲染目标/告警/遗留问题 */
  rightColumn?: {
    goals: Array<{ id: string; name: string; progress: number; status: string }>;
    alerts: Array<{ id: string; description: string; priority: 'high' | 'medium' | 'low'; confidence: number; raisedAt: string }>;
    obstacles: Array<{ id: string; description: string; status: 'tracking' | 'resolved' | 'stale'; updatedAt: string }>;
  };
}

/** 诊断结果 */
export interface ConsultationResult {
  teamId: string;
  report: unknown;
  totalDurationMs: number;
  degradedModules: string[];
}

/** 诊断引擎接口 — L2 只依赖此接口, 不依赖 engine-core 实现 */
export interface DiagnosisEngine {
  /** 运行六阶段诊断 */
  runConsultation(
    teamId: string,
    initiator: { role: string; name: string; teamId: string; concerns: string[] },
    onEvent?: (event: DiagnosisEvent) => void,
  ): Promise<ConsultationResult>;
}

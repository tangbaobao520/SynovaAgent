/**
 * l2-interfaces/diagnosis-engine.ts — L2 编排层的诊断引擎接口
 *
 * 铁律 39: L2 只通过此接口调用诊断引擎，不知道底层是 engine-core 还是 mock。
 * 接口定义在 synova-agent 内, engine-core 通过适配器实现。
 *
 * 五层架构: L2(编排) → DiagnosisEngine(接口) → Adapter → engine-core(L3)
 */

/** 诊断事件 (L2 内部类型, 对 L1 暴露, L1-P0: 增强字段支持前端差异化渲染) */
export interface DiagnosisEvent {
  type: string;
  phase: number;
  label?: string;
  message?: string;
  /** 中间发现列表 — 前端渲染为发现卡片 */
  findings?: Array<{ moduleId: string; summary: string; confidence?: number }>;
  /** 整体置信度 — 前端渲染为可信度标签 */
  confidence?: number;
  /** 图更新计数 — 前端显示"团队全景图已更新" */
  nodesCreated?: number;
  edgesCreated?: number;
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

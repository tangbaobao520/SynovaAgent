/**
 * agent/conversation.ts — AgentConversation 兼容层 (Slice 1.1)
 *
 * @deprecated P3-05: 纯委托层，无独立逻辑。调用方应直接使用 ConversationEngine。
 * 迁移被 TUI/CLI/MCP 阻塞，完成后删除此文件。
 * 详见 TECH_DEBT.md #P3-05。
 *
 * 委托给纯逻辑 ConversationEngine。
 * 保持与原有调用方 (TUI/CLI/Web) 的 API 兼容。
 * 零 UI 依赖 — ConversationEngine 内部不 import neo-blessed/readline。
 */
import type { LLMProvider, LLMMessage } from '../providers/types';
import { ToolRegistry } from './tools';
import { ConversationEngine } from './conversation-engine';
import type { EngineConfig, ProcessResult, EngineState, DiagnosisEvent, ConsultationResult } from './conversation-engine';

// Re-export types for backward compatibility
export type { ProcessResult };
export type ConversationState = EngineState;

/**
 * AgentConversation — 兼容层，委托给 ConversationEngine。
 *
 * 所有对话逻辑（状态机、LLM 调用、工具循环）在 ConversationEngine 中。
 * 此类保持原有构造函数签名和 API 形状，现有调用方无感迁移。
 */
export class AgentConversation {
  private engine: ConversationEngine;

  constructor(provider: LLMProvider, config: EngineConfig = {}) {
    this.engine = new ConversationEngine(provider, config);
  }

  // ═══ Public API (delegates to engine) ═══

  getPhase(): number {
    return this.engine.getPhase();
  }

  getOrgId(): string {
    return this.engine.getOrgId();
  }

  setOrgId(id: string): void {
    this.engine.setOrgId(id);
  }

  advancePhase(): void {
    this.engine.advancePhase();
  }

  getMessages(): LLMMessage[] {
    return this.engine.getMessages();
  }

  getToolRegistry(): ToolRegistry {
    return this.engine.getToolRegistry();
  }

  /** Process a user message synchronously */
  async processMessage(userInput: string): Promise<ProcessResult> {
    return this.engine.processMessage(userInput);
  }

  /** Process a user message with streaming token output */
  async processMessageStream(
    userInput: string,
    onToken: (token: string) => void,
  ): Promise<ProcessResult> {
    return this.engine.processMessageStream(userInput, onToken);
  }

  // ═══ Serialization ═══

  serialize(): EngineState {
    return this.engine.serialize();
  }

  /** Start diagnosis pipeline after Phase 0 (Slice 3.2) */
  async startDiagnosis(
    initiatorRole: string,
    initiatorName: string,
    onEvent?: (event: DiagnosisEvent) => void,
  ): Promise<ConsultationResult | null> {
    return this.engine.startDiagnosis(initiatorRole, initiatorName, onEvent);
  }

  static fromState(provider: LLMProvider, state: EngineState): AgentConversation {
    const conv = new AgentConversation(provider);
    conv.engine = ConversationEngine.fromState(provider, state);
    return conv;
  }
}

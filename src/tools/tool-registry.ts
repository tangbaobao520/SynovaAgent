/**
 * src/tools/tool-registry.ts — D65 Tool 注册表单例
 *
 * 轻量级 Tool 注册表，管理与调用工具函数。
 * 与 src/agent/tools.ts 的 ToolRegistry 不同：
 * 后者是对话引擎的工具系统（有 execute/toOpenAITools/executeParallel），
 * 前者是纯工具定义注册表（register/get/invoke）。
 * 两者独立运行，Phase 2 考虑整合。
 *
 * 设计:
 *   - Map 存储，O(1) 查找
 *   - invoke() 按名称查找并调用注册的工具函数
 *   - invoke() 对未注册的工具返回 null 而非抛出异常
 *   - 单例模式
 */

// ═══ Types ═══

export interface ToolDef {
  name: string;
  version: string;
  description: string;
  /** 工具执行函数（接收 params 返回结果） */
  fn: (params: Record<string, unknown>) => unknown;
  /** 输入参数 schema（字段名 → 类型描述） */
  inputSchema: Record<string, string>;
  /** 输出类型描述 */
  outputType: string;
}

// ═══ Registry ═══

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  /** 注册一个工具定义。同名时覆盖已有。 */
  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  /** 按名称获取工具定义。不存在时返回 undefined。 */
  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  /** 按名称注销工具。返回 true 表示实际删除。 */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /** 返回全部已注册工具。 */
  list(): ToolDef[] {
    return [...this.tools.values()];
  }

  /**
   * 调用已注册的工具。
   *
   * @param name - 工具名称
   * @param params - 输入参数
   * @returns 工具执行结果，或 null（工具不存在时）
   */
  invoke(name: string, params: Record<string, unknown>): unknown {
    const tool = this.tools.get(name);
    if (!tool) return null;
    return tool.fn(params);
  }
}

/** 全局单例实例 */
export const toolRegistry = new ToolRegistry();

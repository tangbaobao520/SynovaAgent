export class ExpertPipeline { register(defs: unknown[], opts: unknown): void; run(aggregated: Record<string, unknown>, content: string): Promise<{ results: unknown[]; degradedModules: string[] }>; }

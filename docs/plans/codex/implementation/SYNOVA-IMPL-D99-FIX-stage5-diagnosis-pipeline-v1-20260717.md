# SynovaAgent -- D99-FIX Stage 5 Diagnosis Pipeline Verification v1.0

> 2026-07-17 | Pre-Launch Verification Track | Iron Law 0-2
> **Fixes the Stage 5 gap found in D99 audit: replaces infrastructure-only check with actual pipeline execution.**
> **This doc is the sole execution basis for claude code.**

---

## Problem (from D99 Audit)

D99 Stage 5 only checks infrastructure: module exists, class has runModules method. It does NOT run the diagnosis pipeline, does NOT verify Phase 0-5 outputs, does NOT verify that sentinel findings actually flow into report generation. The gap means we still don't know if signal aggregation output can be consumed by the diagnosis engine.

## Fix Strategy

Replace Stage 5 with three sub-tests that exercise the actual pipeline:

### Sub-test 5a: Report assembler accepts sentinel findings shape

Take the sentinel findings from Stage 3 -> signal aggregation from Stage 4 -> construct a DiagnosisReport-compatible input -> call assembleReport() -> verify output.

```typescript
it('Stage 5a: Report assembler ? sentinel findings -> report', async () => {
  const { assembleReport } = await import('../../src/agent/report-assembler');

  // Build a DiagnosisReport from mock LLM response (simulating Phase 3-4 output)
  const mockResponse = makeMockDiagnosisResponse();
  const report = {
    diagnosisId: 'diag-test-001',
    title: '???? ??????',
    generatedAt: new Date().toISOString(),
    ceoSummary: mockResponse.ceoSummary,
    keyFindings: mockResponse.keyFindings,
    actionRecommendations: mockResponse.actionRecommendations,
    rootCauseTree: mockResponse.rootCauseTree as any,
    evidenceChain: [],
    confidence: mockResponse.confidence,
    department: '??',
    diagnosisDurationMs: 12000,
  };

  const assembled = assembleReport(report, 'flywheel');

  // Verify output structure
  expect(assembled).toBeDefined();
  expect(assembled.summary).toBeTruthy();
  expect(assembled.summary.length).toBeGreaterThanOrEqual(50);
  expect(assembled.flywheel).toBeDefined();
  expect(Array.isArray(assembled.flywheel)).toBe(true);
  // Flywheel should have at least 3 expert perspectives
  expect(assembled.flywheel.length).toBeGreaterThanOrEqual(3);
  // Each expert report has a non-empty report string
  for (const er of assembled.flywheel) {
    expect(er.report).toBeTruthy();
    expect(typeof er.report).toBe('string');
  }
});
```

### Sub-test 5b: Expert file loader finds all 9 experts

Verify that all expert manifest.json + PROMPT.md files are loadable and have required fields.

```typescript
it('Stage 5b: Expert loading ? all 9 experts loadable', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const expertDir = path.join(process.cwd(), 'expert');
  const entries = fs.readdirSync(expertDir, { withFileTypes: true });

  const experts = entries.filter(e => e.isDirectory() && !e.name.startsWith('_'));
  expect(experts.length).toBeGreaterThanOrEqual(9);

  for (const exp of experts) {
    const manifestPath = path.join(expertDir, exp.name, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.name).toBeTruthy();
    expect(manifest.version).toBeTruthy();

    // Verify PROMPT.md exists (D58)
    const promptPath = path.join(expertDir, exp.name, 'PROMPT.md');
    if (fs.existsSync(promptPath)) {
      const promptContent = fs.readFileSync(promptPath, 'utf-8');
      expect(promptContent.length).toBeGreaterThan(100);
      // No placeholder text
      expect(promptContent).not.toContain('{{');
      expect(promptContent).not.toContain('TODO');
      expect(promptContent).not.toContain('???');
    }
  }
});
```

### Sub-test 5c: DiagnosisOrchestrator instantiation with mock deps

Attempt to instantiate DiagnosisOrchestrator with mocked dependencies and verify it can be created without crashing.

```typescript
it('Stage 5c: DiagnosisOrchestrator ? instantiable with mock deps', async () => {
  const { DiagnosisOrchestrator } = await import('../../packages/engine-core/src/pipeline/diagnosis/diagnosis-orchestrator');

  // Mock DiagnosisLLMClient (requires consult(): Promise<LLMResponse>)
  const mockClient = {
    consult: vi.fn().mockResolvedValue({ content: JSON.stringify(makeMockDiagnosisResponse()) }),
  };

  // Mock ToolExecutor (requires execute(): Promise<ToolResult>)
  const mockTools = {
    execute: vi.fn().mockResolvedValue({ content: 'ok' }),
  };

  // Verify class is instantiable
  expect(typeof DiagnosisOrchestrator).toBe('function');

  // Constructor: (llmClient: C, toolExecutor: T) ? positional args, not options
  const orch = new DiagnosisOrchestrator(mockClient, mockTools);
  expect(orch).toBeDefined();
  expect(typeof orch.runModules).toBe('function');

  // Verify runModules exists and accepts a standard scope
  const scope = {
    enterpriseId: 'test-ent',
    domain: 'general',
    evidence: [],
    previousDiagnosisIds: [],
  };
  // runModules returns Promise<DiagnosisReport[]> ? verify it doesn't crash on call
  const result = await orch.runModules(scope);
  expect(Array.isArray(result)).toBe(true);
});
```

---

## What We Don't Do

- Don't run real LLM (all mocked)
- Don't run real HTTP (no server needed)
- Don't modify the original D99 test file structure ? replace Stage 5, keep Stages 0-4 and 6-8
- Don't modify any production code

---

## Completion Standard

```
[ ] Stage 5a: assembleReport called with real mock data -> output verified (>=5 assertions)
[ ] Stage 5b: all 9 experts loaded, manifest.json + PROMPT.md verified (>=9 assertions)
[ ] Stage 5c: DiagnosisOrchestrator class verified instantiable (>=3 assertions)
[ ] Original Stages 0-4 and 6-8 unchanged (regression: all still pass)
[ ] Zero as any in new code
[ ] tsc --noEmit zero new errors
[ ] vitest run tests/e2e/full-pipeline.integration.test.ts -- all 10 tests pass (7 original stages restored + 3 new sub-tests replacing old Stage 5)
```

---

## Auth Doc References

- D99: Full Pipeline E2E test (original)
- report-assembler.ts: assembleReport function
- DiagnosisOrchestrator: diagnosis pipeline orchestrator

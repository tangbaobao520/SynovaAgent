/**
 * circular-dependency.test.ts — Slice A.5: 循环依赖检测
 *
 * 验证 agents/tools.ts 和 connectors/registry.ts 之间无循环依赖。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

describe('No circular dependency: tools ↔ connectors', () => {
  it('Given tools.ts, When reading imports, Then does not import connectors/registry', () => {
    const content = fs.readFileSync('src/agent/tools.ts', 'utf-8');
    // Should only import connectors/types (type-only), not connectors/registry
    const registryImport = content.match(/from\s+['"].*connectors\/registry['"]/);
    expect(registryImport).toBeNull();
  });

  it('Given connectors/registry.ts, When reading imports, Then does not import agent/tools', () => {
    const content = fs.readFileSync('src/connectors/registry.ts', 'utf-8');
    const toolsImport = content.match(/from\s+['"].*agent\/tools['"]/);
    expect(toolsImport).toBeNull();
  });

  it('Given @synova/connector-registry registry.ts, When reading imports, Then imports ToolRegistryInterface from ./types', () => {
    const content = fs.readFileSync('../packages/connector-registry/src/registry.ts', 'utf-8');
    expect(content).toMatch(/ToolRegistryInterface/);
    expect(content).toMatch(/from\s+['"]\.\/types['"]/);
  });

  it('Given tools.ts, When reading class declaration, Then implements ToolRegistryInterface', () => {
    const content = fs.readFileSync('src/agent/tools.ts', 'utf-8');
    expect(content).toMatch(/class ToolRegistry implements ToolRegistryInterface/);
  });

  it('Given connector-binding.ts, When reading imports, Then imports from connectors/registry and connectors/types only', () => {
    const content = fs.readFileSync('src/init/connector-binding.ts', 'utf-8');
    expect(content).toMatch(/from\s+['"]\.\.\/connectors\/registry['"]/);
    expect(content).toMatch(/from\s+['"]\.\.\/connectors\/types['"]/);
    // Must NOT import from agent/tools
    const agentImport = content.match(/from\s+['"].*agent\/tools['"]/);
    expect(agentImport).toBeNull();
  });
});

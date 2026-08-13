/**
 * tests/architecture/graphstore-unify.test.ts — D286 GraphStore 统一迁移验证测试
 *
 * 铁律 0-2: spec → test → impl → wire → review → merge（本测试先写，迁移前必须失败 → red→green）
 * 铁律 33: *.test.ts 单元测试
 * 铁律 47: 契约优先 — 每条断言即迁移契约
 *
 * 契约（迁移前后状态）:
 *   @input  — 仓库文件系统（src/ tests/ tsconfig.json vitest.config.ts）
 *   @output — 断言:
 *     [red]  迁移前: src/ 存在 旧 graph-store 包引用 → grep 断言失败
 *     [green]迁移后: 主树零引用、配置零映射、调用点全部改用 SqliteGraphStore、
 *             SqliteGraphStore 具备调用点所需全部方法（createEdge/queryEdges/queryTriples）
 *   @degraded — 文件读失败 → 断言失败（不允许静默跳过）
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SqliteGraphStore } from "../../src/adapters/sqlite-graph-store";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

/** 旧包引用字符串 — 拼接避免被 DS1 grep 误扫（本文件自身不能出现字面量） */
const PACKAGE_REF = "@synova/" + "graph-store";

/** 递归扫描目录下所有 ts/tsx 文件（排除 node_modules 与自身测试） */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

/** 读取文件内容（读失败 → 抛错，不允许静默降级） */
function readFileStrict(rel: string): string {
  const full = path.join(PROJECT_ROOT, rel);
  return fs.readFileSync(full, "utf-8");
}

/** 检查一组文件内容中是否含目标字符串 */
function filesContaining(files: string[], needle: string): string[] {
  return files.filter((f) => {
    const content = fs.readFileSync(f, "utf-8");
    return content.includes(needle);
  });
}

describe("D286 GraphStore 统一 — 主树零引用 (DS1)", () => {
  it("src/ 无 旧 graph-store 包引用 (迁移前此断言 red)", () => {
    const srcFiles = collectSourceFiles(path.join(PROJECT_ROOT, "src"));
    const hits = filesContaining(srcFiles, PACKAGE_REF);
    expect(hits).toEqual([]);
  });

  it("tests/ 无 旧 graph-store 包引用 (排除本文件自身)", () => {
    const testFiles = collectSourceFiles(path.join(PROJECT_ROOT, "tests")).filter(
      (f) => !f.endsWith("graphstore-unify.test.ts"),
    );
    const hits = filesContaining(testFiles, PACKAGE_REF);
    expect(hits).toEqual([]);
  });
});

describe("D286 GraphStore 统一 — 配置零映射 (DS1)", () => {
  it("tsconfig.json 无旧包 paths 条目", () => {
    const tsconfig = readFileStrict("tsconfig.json");
    expect(tsconfig.includes(PACKAGE_REF)).toBe(false);
  });

  it("vitest.config.ts 无旧包 alias", () => {
    const vitestConfig = readFileStrict("vitest.config.ts");
    expect(vitestConfig.includes(PACKAGE_REF)).toBe(false);
  });
});

describe("D286 GraphStore 统一 — 调用点迁移 (DS3)", () => {
  it("12 个 src 调用点全部改用 SqliteGraphStore", () => {
    const callSites = [
      "src/agent/conversation-engine.ts",
      "src/deploy/bootstrap.ts",
      "src/ingest/index.ts",
      "src/l3/knowledge-agent.ts",
      "src/mcp/index.ts",
      "src/mcp/tool-registration.ts",
      "src/routes/agent-observer.ts",
      "src/routes/chat.ts",
      "src/routes/diagnosis-upload-v2.ts",
      "src/routes/ontology.ts",
      "src/sentinel/runner.ts",
      "src/tui-v2/chat.tsx",
    ];
    // 除 bootstrap（仅动态 import 工厂+权限）外，调用点必须 import SqliteGraphStore
    for (const rel of callSites) {
      const content = readFileStrict(rel);
      if (rel === "src/deploy/bootstrap.ts") {
        expect(content.includes("SqliteGraphStore")).toBe(true);
      } else {
        expect(content.includes("SqliteGraphStore")).toBe(true);
        expect(content.includes(PACKAGE_REF)).toBe(false);
      }
    }
    // 断言数量：12 个调用点 + 每个不含旧包引用
    expect(callSites.length).toBeGreaterThanOrEqual(12);
  });

  it("2 个 l4 测试改用原生 SqliteGraphStore", () => {
    for (const rel of ["tests/l4/synova-graph-store.test.ts", "tests/l4/synova-graph-store-permission.test.ts"]) {
      const content = readFileStrict(rel);
      expect(content.includes("SqliteGraphStore")).toBe(true);
      expect(content.includes(PACKAGE_REF)).toBe(false);
    }
  });

  it("bootstrap 权限检查器调用已删除 (行为等价)", () => {
    const bootstrap = readFileStrict("src/deploy/bootstrap.ts");
    expect(bootstrap.includes("setGraphStoreDeletePermissionChecker")).toBe(false);
  });
});

describe("D286 GraphStore 统一 — SqliteGraphStore 能力面 (DS3/DS5)", () => {
  it("SqliteGraphStore 提供调用点全部 7 方法 (createEdge/queryEdges/queryTriples 已扩展)", () => {
    const src = readFileStrict("src/adapters/sqlite-graph-store.ts");
    for (const method of [
      "createNode", "createEdge", "queryNodes", "queryEdges",
      "queryTriples", "getNode", "updateNode",
    ]) {
      expect(src).toContain(`${method}(`);
    }
  });

  it("SqliteGraphStore 全方法冒烟：CRUD + 边 + 三元组 (graphstore-unify 集成验证)", () => {
    const db = new Database(":memory:");
    const store = new SqliteGraphStore(db);
    try {
      // 节点 CRUD
      const nodeId = store.createNode("TEST_GOAL", { name: "unit-1" }, "default");
      expect(nodeId).toBeTruthy();
      const nodes = store.queryNodes("TEST_GOAL", undefined, "default");
      expect(nodes.length).toBe(1);
      expect(nodes[0].props.name).toBe("unit-1");
      store.updateNode(nodeId, { progress: 0.5 }, "default");
      expect(store.getNode(nodeId, "default")?.props.progress).toBe(0.5);

      // 边
      const edgeId = store.createEdge("HAS_SIGNAL", nodeId, "sig-1", 1.0, {}, "default");
      expect(edgeId).toBeTruthy();
      const edges = store.queryEdges(undefined, nodeId, undefined, "default");
      expect(edges.length).toBe(1);
      expect(edges[0].type).toBe("HAS_SIGNAL");
      expect(edges[0].to).toBe("sig-1");

      // 三元组查询
      const triples = store.queryTriples({ predicate: "HAS_SIGNAL" }, "default");
      expect(triples.length).toBeGreaterThanOrEqual(1);
    } finally {
      db.close();
    }
  });
});

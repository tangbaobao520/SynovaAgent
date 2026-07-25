/**
 * tests/adapters/sqlite-graph-store.test.ts — SqliteGraphStore 适配器单元测试
 *
 * 覆盖: createNode / queryNodes / getNode / updateNode / JSON 属性过滤 / 降级
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { SqliteGraphStore } from "../../src/adapters/sqlite-graph-store";

let db: Database.Database;
let store: SqliteGraphStore;

beforeAll(() => {
  db = new Database(":memory:");
  store = new SqliteGraphStore(db);
});

afterAll(() => {
  db.close();
});

describe("SqliteGraphStore", () => {
  it("createNode returns a valid node ID starting with node-", () => {
    const id = store.createNode("TEST", { name: "alpha" });
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
    expect(id.startsWith("node-")).toBe(true);
  });

  it("queryNodes by type returns all nodes of that type", () => {
    store.createNode("TYPE_A", { value: 1 });
    store.createNode("TYPE_A", { value: 2 });
    store.createNode("TYPE_B", { value: 3 });

    const typeA = store.queryNodes("TYPE_A");
    expect(typeA.length).toBe(2);
    expect(typeA[0].type).toBe("TYPE_A");
  });

  it("queryNodes with graph filter", () => {
    store.createNode("G_TEST", { x: 1 }, "graph-x");
    store.createNode("G_TEST", { x: 2 }, "graph-y");

    const x = store.queryNodes("G_TEST", undefined, "graph-x");
    expect(x.length).toBe(1);
    expect(x[0].props.x).toBe(1);
  });

  it("queryNodes with JSON property filter", () => {
    store.createNode("FILTER_TEST", { email: "a@test.com", role: "admin" });
    store.createNode("FILTER_TEST", { email: "b@test.com", role: "staff" });

    const admins = store.queryNodes("FILTER_TEST", { role: "admin" });
    expect(admins.length).toBe(1);
    expect(admins[0].props.email).toBe("a@test.com");
  });

  it("getNode returns null for non-existent ID", () => {
    const node = store.getNode("non-existent");
    expect(node).toBeNull();
  });

  it("getNode returns correct node by ID", () => {
    const id = store.createNode("GET_TEST", { hello: "world" });
    const node = store.getNode(id);
    expect(node).not.toBeNull();
    expect(node!.id).toBe(id);
    expect(node!.props.hello).toBe("world");
  });

  it("updateNode merges new properties with existing", () => {
    const id = store.createNode("UPDATE_TEST", { a: 1, b: 2 });
    store.updateNode(id, { b: 99, c: 3 });

    const node = store.getNode(id);
    expect(node!.props.a).toBe(1);
    expect(node!.props.b).toBe(99);
    expect(node!.props.c).toBe(3);
  });
});

#!/usr/bin/env npx tsx
/**
 * scripts/control-tower/enterprise-fact-store.ts — 企业事实文件 CRUD (D240)
 *
 * 模块二补丁: agent_memory 表 type: enterprise_fact -> .codex/enterprise/facts/{category}/{key}.md
 * 文件格式: YAML front matter + Markdown body
 *
 * 契约:
 *   @input  — category + key + content + metadata
 *   @output — .md 文件 + front matter
 *   @degraded — 文件写入失败 -> log.warn + SQL 回退
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join, dirname, resolve } from "path";
import { createLogger } from "@synova/logger";

const log = createLogger("ct/enterprise-fact-store");

// ═══ 常量 ═══

// SYNO_FACTS_ROOT 环境变量覆盖（测试隔离用）；默认 .codex/enterprise/facts
export const FACTS_ROOT = process.env.SYNO_FACTS_ROOT
  ? resolve(process.env.SYNO_FACTS_ROOT)
  : join(process.cwd(), ".codex", "enterprise", "facts");

export type FactStatus = "pending" | "active" | "rejected" | "conflicted";

export interface FactMetadata {
  key: string;
  category: string;
  status: FactStatus;
  confidence: number;
  source: string;
  version: number;
  supersededBy?: string | null;
  changeReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseFact {
  metadata: FactMetadata;
  content: string;
}

// ═══ EnterpriseFactStore ═══

export class EnterpriseFactStore {
  private root: string;

  constructor(root?: string) {
    this.root = root ?? FACTS_ROOT;
  }

  /**
   * 创建或更新一条企业事实文件（链头写入）
   *
   * 契约（D568 版本链）:
   *   @input  — category + key + content + metadata（Partial<FactMetadata>）
   *   @output — 链头文件路径 {root}/{category}/{key}.md；version 递增
   *   @degraded — 无既有条目 → 写入 v1 链头；有既有条目 → 旧条目归档 {key}.v{N}.md
   *               并回填 supersededBy={key}#v{新版本}（不覆盖、可追溯），链头写新版本
   */
  createFact(
    category: string,
    key: string,
    content: string,
    metadata?: Partial<FactMetadata>,
  ): string {
    const dirPath = join(this.root, category);
    mkdirSync(dirPath, { recursive: true });

    const filePath = join(dirPath, `${key}.md`);
    const now = new Date().toISOString();
    const existing = this.readFact(category, key);

    const version = existing ? existing.metadata.version + 1 : 1;

    const fullMeta: FactMetadata = {
      key,
      category,
      status: metadata?.status || "pending",
      confidence: metadata?.confidence ?? 0.7,
      source: metadata?.source || "manual",
      version,
      supersededBy: metadata?.supersededBy ?? null,
      changeReason: metadata?.changeReason || (existing ? "Updated" : "Initial creation"),
      createdAt: existing?.metadata.createdAt || now,
      updatedAt: now,
    };

    if (metadata?.approvedBy) fullMeta.approvedBy = metadata.approvedBy;
    if (metadata?.approvedAt) fullMeta.approvedAt = metadata.approvedAt;
    if (metadata?.rejectedReason) fullMeta.rejectedReason = metadata.rejectedReason;

    // D568: 版本链 — 旧条目不覆盖：归档为 {key}.v{N}.md 并回填 supersededBy={key}#v{新版本}，
    // {key}.md 恒为链头，历史经 readFactVersion/listFactVersions 追溯（注释与实现一致化）
    if (existing) {
      const archivedMeta: FactMetadata = {
        ...existing.metadata,
        supersededBy: `${key}#v${version}`,
      };
      const archivedMd = this.formatFile(archivedMeta, existing.content);
      writeFileSync(this.versionFilePath(category, key, existing.metadata.version), archivedMd, "utf-8");
      log.info(
        { category, key, archivedVersion: existing.metadata.version, supersededBy: archivedMeta.supersededBy },
        "企业事实旧版本已归档（supersededBy 回填）",
      );
    }

    const md = this.formatFile(fullMeta, content);
    writeFileSync(filePath, md, "utf-8");
    log.info({ category, key, version, status: fullMeta.status }, "企业事实已写入");
    return filePath;
  }

  /** 读取一条企业事实 */
  readFact(category: string, key: string): EnterpriseFact | null {
    const filePath = join(this.root, category, `${key}.md`);
    if (!existsSync(filePath)) return null;

    const raw = readFileSync(filePath, "utf-8");
    return this.parseFile(raw);
  }

  /** 按状态列出事实 */
  listFacts(status?: FactStatus): EnterpriseFact[] {
    const result: EnterpriseFact[] = [];
    const categories = this.listCategories();

    for (const cat of categories) {
      const dirPath = join(this.root, cat);
      if (!existsSync(dirPath)) continue;
      // D568: 只列链头文件，过滤 {key}.v{N}.md 历史版本
      const files = readdirSync(dirPath).filter((f) => f.endsWith(".md") && !this.isVersionFileName(f));

      for (const file of files) {
        const raw = readFileSync(join(dirPath, file), "utf-8");
        const fact = this.parseFile(raw);
        if (!fact) continue;
        if (status && fact.metadata.status !== status) continue;
        result.push(fact);
      }
    }

    return result;
  }

  /** 列出所有 category 目录 */
  listCategories(): string[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  /**
   * 删除事实文件（链头 + 全部历史版本）
   *
   * 契约（D568）:
   *   @input  — category + key
   *   @output — true=已删除链头及 {key}.v{N}.md 全部历史；false=链头不存在
   *   @degraded — 历史清理失败不阻断链头删除（逐文件 try 隔离，log.warn）
   */
  deleteFact(category: string, key: string): boolean {
    const dirPath = join(this.root, category);
    const filePath = join(dirPath, `${key}.md`);
    if (!existsSync(filePath)) return false;
    unlinkSync(filePath);
    // D568: 链头删除后历史不可达 — 同步清理历史版本（防孤儿/复活）
    if (existsSync(dirPath)) {
      for (const f of readdirSync(dirPath)) {
        if (!this.isVersionFileName(f, key)) continue;
        try {
          unlinkSync(join(dirPath, f));
        } catch (err: unknown) {
          log.warn({ err: err instanceof Error ? err.message : String(err), file: f }, "历史版本清理失败 — 跳过（链头已删除）");
        }
      }
    }
    log.info({ category, key }, "企业事实已删除（含历史版本）");
    return true;
  }

  /**
   * 读取指定历史版本 — D568 版本链追溯
   *
   * 契约:
   *   @input  — category + key + version
   *   @output — 该版本 EnterpriseFact（version 为链头时返回链头）；不存在 → null
   *   @degraded — 版本文件缺失 → null（正常未发生路径，非错误）
   */
  readFactVersion(category: string, key: string, version: number): EnterpriseFact | null {
    const head = this.readFact(category, key);
    if (head && head.metadata.version === version) return head;
    const p = this.versionFilePath(category, key, version);
    if (!existsSync(p)) return null;
    return this.parseFile(readFileSync(p, "utf-8"));
  }

  /**
   * 列出某事实全部版本号（升序，含链头）— D568 版本链追溯
   *
   * 契约:
   *   @input  — category + key
   *   @output — 版本号升序数组（如 [1,2,3]）；key 不存在 → []
   *   @degraded — 目录不可读 → []（正常未创建路径，非错误）
   */
  listFactVersions(category: string, key: string): number[] {
    const dirPath = join(this.root, category);
    if (!existsSync(dirPath)) return [];
    const versions = new Set<number>();
    const head = this.readFact(category, key);
    if (head) versions.add(head.metadata.version);
    const prefix = `${key}.v`;
    for (const f of readdirSync(dirPath)) {
      if (!this.isVersionFileName(f, key)) continue;
      const n = parseInt(f.slice(prefix.length, -3), 10);
      if (Number.isFinite(n)) versions.add(n);
    }
    return [...versions].sort((a, b) => a - b);
  }

  /** 更新事实状态（直接修改文件 front matter） */
  updateStatus(category: string, key: string, status: FactStatus, extra?: Record<string, string>): boolean {
    const fact = this.readFact(category, key);
    if (!fact) return false;

    fact.metadata.status = status;
    fact.metadata.updatedAt = new Date().toISOString();
    if (extra?.approvedBy) fact.metadata.approvedBy = extra.approvedBy;
    if (extra?.approvedAt) fact.metadata.approvedAt = extra.approvedAt;
    if (extra?.rejectedReason) fact.metadata.rejectedReason = extra.rejectedReason;

    const md = this.formatFile(fact.metadata, fact.content);
    writeFileSync(join(this.root, category, `${key}.md`), md, "utf-8");
    return true;
  }

  // ═══ 文件解析/格式化 ═══

  /** {key}.v{N}.md 历史版本文件路径（D568 版本链） */
  private versionFilePath(category: string, key: string, version: number): string {
    return join(this.root, category, `${key}.v${version}.md`);
  }

  /** 文件名是否为 {key}.v{N}.md 历史版本文件（D568）；传入 key 时仅匹配该 key 的版本文件 */
  private isVersionFileName(name: string, key?: string): boolean {
    if (!name.endsWith(".md")) return false;
    const stem = name.slice(0, -3);
    const at = stem.lastIndexOf(".v");
    if (at === -1 || !/^\d+$/.test(stem.slice(at + 2))) return false;
    return key ? stem.slice(0, at) === key : true;
  }

  private formatFile(meta: FactMetadata, content: string): string {
    const lines = ["---"];
    for (const [k, v] of Object.entries(meta)) {
      if (v === null || v === undefined) continue;
      // CamelCase -> snake_case for YAML
      const key = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      lines.push(`${key}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
    }
    lines.push("---", "", content.trim());
    return lines.join("\n") + "\n";
  }

  private parseFile(raw: string): EnterpriseFact | null {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const yamlBlock = match[1];
    const content = match[2].trim();
    const meta: Record<string, unknown> = {};
    const parseBool = (v: string): boolean => v === "true" || v === "True";

    for (const line of yamlBlock.split("\n")) {
      const sep = line.indexOf(": ");
      if (sep === -1) continue;
      const k = line.slice(0, sep).trim();
      const v = line.slice(sep + 2).trim();

      // snake_case -> camelCase
      const key = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      try { meta[key] = JSON.parse(v); }
      catch { meta[key] = v; } // swallow-ok: front matter 值非 JSON 时按字符串保留（正常解析路径，非错误）
    }

    return {
      metadata: {
        key: String(meta.key || ""),
        category: String(meta.category || ""),
        status: (meta.status as FactStatus) || "pending",
        confidence: typeof meta.confidence === "number" ? meta.confidence : 0.7,
        source: String(meta.source || "manual"),
        version: typeof meta.version === "number" ? meta.version : 1,
        supersededBy: meta.supersededBy ? String(meta.supersededBy) : null,
        changeReason: meta.changeReason ? String(meta.changeReason) : undefined,
        approvedBy: meta.approvedBy ? String(meta.approvedBy) : undefined,
        approvedAt: meta.approvedAt ? String(meta.approvedAt) : undefined,
        rejectedReason: meta.rejectedReason ? String(meta.rejectedReason) : undefined,
        createdAt: String(meta.createdAt || new Date().toISOString()),
        updatedAt: String(meta.updatedAt || new Date().toISOString()),
      },
      content,
    };
  }
}

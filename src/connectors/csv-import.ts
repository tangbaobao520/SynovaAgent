/**
 * src/connectors/csv-import.ts — CSV 文件导入连接器 (D221)
 *
 * 第一个真实数据连接器（非 Mock）。读取 CSV 文件 → 解析行 →
 * 创建 RESOURCE_MONEY GraphStore 节点。
 *
 * Gate 3 数据管道接通条件:
 *   - 含真实 API 调用（fs.readFileSync / GraphStore.createNode）
 *   - GraphStore 中近 30 天有 >=1 条新 RESOURCE_MONEY 节点
 *
 * 铁律 24+31: 文件不存在/异常 -> degraded + log.warn
 * 铁律 38: 零 as any
 */
import { createLogger } from '@synova/logger';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { NodeType } from '@synova/ontology';

const log = createLogger('connectors/csv-import');

export interface CSVRow {
  date: string;
  amount: number;
  category: string;
  description?: string;
}

export interface ImportResult {
  imported: number;
  nodeIds: string[];
  degraded: boolean;
  warnings: string[];
}

export interface GraphBridgeLike {
  createNode(type: string, props: Record<string, unknown>, graph: string): string;
}

export class CsvImportConnector {
  private graphBridge: GraphBridgeLike;
  private graph: string;

  constructor(graphBridge: GraphBridgeLike, graph: string = 'enterprise') {
    this.graphBridge = graphBridge;
    this.graph = graph;
  }

  import(filePath: string): ImportResult {
    const resolvedPath = resolve(filePath);
    if (!existsSync(resolvedPath)) {
      return { imported: 0, nodeIds: [], degraded: true, warnings: ['File not found: ' + resolvedPath] };
    }
    let raw: string;
    try {
      raw = readFileSync(resolvedPath, 'utf-8');
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "文件读取失败");
      try {
        const iconv = require('iconv-lite') as { decode(b: Buffer, enc: string): string };
        raw = iconv.decode(readFileSync(resolvedPath), 'gbk');
      } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : String(err) }, "iconv 模块加载");
        raw = readFileSync(resolvedPath, 'utf-8');
      }
    }
    return this.importData(raw);
  }

  importData(csvContent: string): ImportResult {
    const warnings: string[] = [];
    const nodeIds: string[] = [];

    if (!csvContent || csvContent.trim().length === 0) {
      return { imported: 0, nodeIds: [], degraded: true, warnings: ['Empty content'] };
    }

    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      return { imported: 0, nodeIds: [], degraded: true, warnings: ['No data rows'] };
    }

    const header = this.parseCSVLine(lines[0]);
    const colMap = this.mapColumns(header);
    if (colMap.date === undefined || colMap.amount === undefined) {
      return { imported: 0, nodeIds: [], degraded: true, warnings: ['Missing required columns: date, amount'] };
    }

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      try {
        const row = this.parseCSVLine(lines[i]);
        const record: CSVRow = {
          date: row[colMap.date] || '',
          amount: parseFloat(row[colMap.amount]) || 0,
          category: colMap.category !== undefined ? (row[colMap.category] || 'uncategorized') : 'uncategorized',
          description: colMap.description !== undefined ? row[colMap.description] : undefined,
        };
        if (!record.date || record.amount === 0) continue;
        const nodeId = this.graphBridge.createNode(NodeType.RESOURCE_MONEY, {
          date: record.date, amount: record.amount, category: record.category,
          description: record.description || '', source: 'csv-import',
          importedAt: new Date().toISOString(),
        }, this.graph);
        nodeIds.push(nodeId);
        imported++;
      } catch (rowErr) {
        log.warn({ err: rowErr instanceof Error ? rowErr.message : String(rowErr) }, "CSV 行解析");
        warnings.push('Row ' + (i + 1) + ' skipped');
      }
    }

    return { imported, nodeIds, degraded: imported === 0, warnings };
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  }

  private mapColumns(header: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    header.forEach((h, i) => {
      const lc = h.toLowerCase().trim();
      if (lc === 'date' || lc === '日期' || lc === '时间') map.date = i;
      else if (lc === 'amount' || lc === '金额' || lc === '数额') map.amount = i;
      else if (lc === 'category' || lc === '分类' || lc === '类别') map.category = i;
      else if (lc === 'description' || lc === '描述' || lc === '备注') map.description = i;
    });
    return map;
  }
}

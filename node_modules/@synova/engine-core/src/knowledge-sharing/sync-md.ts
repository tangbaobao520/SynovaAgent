/**
 * knowledge-sharing/sync-md.ts — SYNC.md 自动维护 (GAP-4: KnowledgeSharing Phase 1)
 *
 * Generates and updates the team's product index file (default: SYNC.md)
 * with entries for each role's output contracts: what they produce, who consumes it,
 * current status, and last update time.
 */

import type { OutputContract } from '../types';

export interface SyncIndexEntry {
  roleId: string;
  roleName: string;
  outputs: Array<{
    path: string;
    format: string;
    consumedBy: string[];
    status: 'active' | 'stale' | 'deprecated';
    lastUpdated?: string;
  }>;
}

/**
 * Generate a SYNC.md string from output contracts.
 */
export function generateSyncMd(contracts: OutputContract[]): string {
  const now = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    '# SYNC.md — Team Output Index',
    '',
    `> Auto-generated: ${now}`,
    '> This file is maintained by the Synova Engine. Do not edit manually.',
    '',
    '## Output Contracts',
    '',
  ];

  for (const contract of contracts) {
    lines.push(`### ${contract.roleName} (\`${contract.roleId}\`)`, '');
    lines.push(`Status: **${contract.status}**`, '');
    lines.push('| Output | Format | Consumed By | Status |');
    lines.push('|--------|--------|-------------|--------|');

    for (const path of contract.produces ?? []) {
      const consumers = (contract.consumedBy ?? []).join(', ') || '—';
      lines.push(`| ${path} | ${guessFormat(path)} | ${consumers} | ${contract.status} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*Index regenerated on each output change by the Synova KnowledgeSharing engine.*');

  return lines.join('\n');
}

/**
 * Update the SYNC.md index — returns the updated markdown content.
 * In Phase 1 this is a pure function that generates the index.
 * Phase 2 will write it to the filesystem at the teamOutputDir.
 */
export function updateSyncIndex(contracts: OutputContract[]): string {
  return generateSyncMd(contracts);
}

function guessFormat(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    md: '.md', csv: '.csv', xlsx: '.xlsx', json: '.json',
    txt: '.txt', yml: '.yml', yaml: '.yml', ts: '.ts',
    js: '.js', html: '.html', css: '.css', pdf: '.pdf',
  };
  return ext && map[ext] ? map[ext] : ext || 'unknown';
}

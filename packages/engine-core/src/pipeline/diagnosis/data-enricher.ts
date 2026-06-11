/**
 * diagnosis/data-enricher.ts — 诊断数据富化引擎
 *
 * 从本地和可选的外部数据源富化诊断上下文。
 * 插件化架构，每源独立、失败不阻断。
 *
 * P2 — FDE 引擎内化
 */

import { execSync } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import type {
  EnrichedData,
  LocalGitMetrics,
  SoftwareEnrichment,
  GitHubMetrics,
  EnricherPlugin,
} from './types';
import { getEngineContext } from '../../engine-context';

// ====================================================================
// Plugin: local-git
// ====================================================================

function detectRepoPath(): string | null {
  // Try common locations
  const candidates = [
    process.cwd(),
    process.env.CLAWORG_DATA_DIR ?? '',
    path.join(os.homedir(), 'ClawOrg'),
    path.join(os.homedir(), 'novis'),
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      const gitDir = path.join(dir, '.git');
      if (fs.existsSync(gitDir)) return dir;
    } catch { /* skip */ }
  }
  return null;
}

function collectLocalGit(repoPath: string): LocalGitMetrics {
  const run = (cmd: string): number => {
    try {
      const output = execSync(cmd, { cwd: repoPath, timeout: 5000, encoding: 'utf-8' });
      return parseInt(output.trim(), 10) || 0;
    } catch {
      return 0;
    }
  };

  const commitsLast30Days = run('git log --since="30 days ago" --oneline 2>/dev/null | wc -l');
  const activeBranches = run('git branch -a 2>/dev/null | wc -l');
  const uniqueAuthors = run('git shortlog -sn --since="30 days ago" 2>/dev/null | wc -l');
  const mergesLast30Days = run('git log --merges --since="30 days ago" --oneline 2>/dev/null | wc -l');

  // Average files changed per commit (last 30 days)
  let avgCommitSize = 0;
  try {
    const stats = execSync(
      'git log --since="30 days ago" --pretty=format: --shortstat 2>/dev/null',
      { cwd: repoPath, timeout: 5000, encoding: 'utf-8' },
    );
    const changed = stats.match(/(\d+) files? changed/g);
    if (changed && changed.length > 0) {
      const total = changed.reduce((sum, m) => sum + (parseInt(m.match(/\d+/)![0], 10) || 0), 0);
      avgCommitSize = commitsLast30Days > 0 ? Math.round(total / commitsLast30Days) : 0;
    }
  } catch {
    // best-effort metric, repo may not have shortstat output
    getEngineContext().logger.debug('[diagnosis/enricher] git avgCommitSize 计算失败');
    avgCommitSize = 0;
  }

  return {
    repoPath,
    commitsLast30Days,
    activeBranches,
    uniqueAuthors,
    mergeFrequency: Math.round((mergesLast30Days / 4.3) * 10) / 10, // per week
    avgCommitSize,
  };
}

// ====================================================================
// Plugin: software
// ====================================================================

interface SoftwareCategory {
  name: string;
  tools: string[];
}

const KNOWN_CATEGORIES: SoftwareCategory[] = [
  { name: 'AI Agent 平台', tools: ['claude', 'cursor', 'windsurf', 'copilot', 'chatgpt', 'gemini'] },
  { name: '版本控制', tools: ['git', 'svn', 'mercurial'] },
  { name: '通信协作', tools: ['slack', 'discord', 'teams', 'zoom', '飞书', '钉钉', '企业微信'] },
  { name: 'CI/CD', tools: ['github actions', 'gitlab ci', 'jenkins', 'circleci'] },
  { name: '项目管理', tools: ['jira', 'linear', 'notion', 'trello', 'asana', '飞书文档'] },
  { name: '文档知识库', tools: ['notion', 'confluence', '语雀', '飞书知识库', 'obsidian', 'logseq'] },
  { name: '数据库', tools: ['mysql', 'postgresql', 'mongodb', 'redis', 'sqlite', 'supabase'] },
  { name: '开发工具', tools: ['vscode', 'jetbrains', 'vim', 'neovim', 'emacs'] },
];

const TOOL_TO_CATEGORY = new Map<string, string>();
for (const cat of KNOWN_CATEGORIES) {
  for (const tool of cat.tools) {
    TOOL_TO_CATEGORY.set(tool, cat.name);
  }
}

function scanInstalledSoftware(): { tools: string[]; categories: Record<string, string[]> } {
  const found = new Set<string>();
  const categories: Record<string, string[]> = {};

  // Scan common executable directories + PATH
  try {
    const pathDirs = (process.env.PATH ?? '').split(path.delimiter);
    for (const dir of pathDirs) {
      try {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          const lower = entry.toLowerCase();
          for (const cat of KNOWN_CATEGORIES) {
            for (const tool of cat.tools) {
              if (lower.includes(tool)) {
                found.add(tool);
                const catName = TOOL_TO_CATEGORY.get(tool) ?? '其他';
                if (!categories[catName]) categories[catName] = [];
                if (!categories[catName].includes(tool)) {
                  categories[catName].push(tool);
                }
              }
            }
          }
        }
      } catch { /* skip inaccessible dirs */ }
    }
  } catch { /* skip */ }

  // Scan common install directories (Windows)
  if (process.platform === 'win32') {
    const programDirs = [
      process.env['ProgramFiles'] ?? 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
      path.join(os.homedir(), 'AppData', 'Local'),
      path.join(os.homedir(), 'AppData', 'Roaming'),
    ];
    for (const base of programDirs) {
      try {
        const entries = fs.readdirSync(base);
        for (const entry of entries) {
          const lower = entry.toLowerCase();
          for (const cat of KNOWN_CATEGORIES) {
            for (const tool of cat.tools) {
              if (lower.includes(tool)) {
                found.add(tool);
                const catName = TOOL_TO_CATEGORY.get(tool) ?? '其他';
                if (!categories[catName]) categories[catName] = [];
                if (!categories[catName].includes(tool)) {
                  categories[catName].push(tool);
                }
              }
            }
          }
        }
      } catch { /* skip */ }
    }
  }

  return { tools: [...found], categories };
}

function detectIntegrationGaps(tools: string[], categories: Record<string, string[]>): string[] {
  const gaps: string[] = [];
  const toolSet = new Set(tools);

  // Check for common integration gaps
  if (toolSet.has('jira') && !toolSet.has('线性集成')) {
    gaps.push('Jira 已安装但未配置 API 集成 — 诊断任务无法自动创建 Jira Issue');
  }
  if (toolSet.has('linear') && !toolSet.has('线性集成')) {
    gaps.push('Linear 已安装但未配置 API 集成 — 诊断任务无法自动创建 Linear Issue');
  }
  if ((toolSet.has('slack') || toolSet.has('discord') || toolSet.has('飞书')) && !toolSet.has('消息通知')) {
    gaps.push('团队通信工具已检测到但未配置通知集成 — 诊断结果需手动分享');
  }
  if (toolSet.has('github') && !toolSet.has('git集成')) {
    gaps.push('Git 仓库已检测到但未配置 GitHub API — 无法自动采集 PR/Issue 指标');
  }
  if (!toolSet.has('notion') && !toolSet.has('confluence') && !toolSet.has('语雀') && !toolSet.has('obsidian')) {
    gaps.push('未检测到知识库工具 — 团队知识可能散落在聊天记录中，难以系统化管理');
  }
  if (!toolSet.has('jira') && !toolSet.has('linear') && !toolSet.has('trello') && !toolSet.has('asana')) {
    gaps.push('未检测到项目管理工具 — 任务追踪可能依赖人工记忆，建议引入工具');
  }

  return gaps;
}

// ====================================================================
// Plugin: github-api (optional)
// ====================================================================

function getGitHubConfig(): { token: string; repo: string } | null {
  const token = process.env.GITHUB_TOKEN ?? '';
  const repo = process.env.GITHUB_REPO ?? '';
  if (!token || !repo) return null;
  return { token, repo };
}

async function fetchGitHubMetrics(owner: string, repo: string, token: string): Promise<GitHubMetrics | null> {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Synova-Engine/2.0',
  };

  try {
    // Fetch PRs
    const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=100`, { headers });
    const prs = await prRes.json() as Array<Record<string, unknown>>;
    const openPRs = prs.filter((p: Record<string, unknown>) => p.state === 'open').length;

    // Merged PRs in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const mergedPRs = prs.filter((p: Record<string, unknown>) =>
      p.merged_at && (p.merged_at as string) >= thirtyDaysAgo,
    );

    // Issues
    const issueRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&since=${thirtyDaysAgo}`,
      { headers },
    );
    const issues = await issueRes.json() as Array<Record<string, unknown>>;
    const openIssues = issues.filter((i: Record<string, unknown>) => i.state === 'open' && !i.pull_request).length;
    const closedIssuesLast30Days = issues.filter((i: Record<string, unknown>) =>
      i.state === 'closed' && !i.pull_request && i.closed_at && (i.closed_at as string) >= thirtyDaysAgo,
    ).length;
    const totalIssuesInPeriod = issues.filter((i: Record<string, unknown>) => !i.pull_request).length;
    const issueCloseRate = totalIssuesInPeriod > 0
      ? Math.round((closedIssuesLast30Days / totalIssuesInPeriod) * 100) / 100
      : 0;

    return {
      openPRs,
      mergedPRsLast30Days: mergedPRs.length,
      avgReviewTurnaroundHours: 0, // Requires PR timeline API per PR — skipped for now
      openIssues,
      closedIssuesLast30Days,
      issueCloseRate,
    };
  } catch {
    return null;
  }
}

// ====================================================================
// Plugin interface + built-in plugins
// ====================================================================

const builtinPlugins: EnricherPlugin[] = [
  {
    id: 'local-git',
    label: '本地 Git 仓库指标',
    fetch: async (_teamId: string) => {
      const repoPath = detectRepoPath();
      if (!repoPath) return null;
      return collectLocalGit(repoPath) as unknown as Record<string, unknown>;
    },
  },
  {
    id: 'software',
    label: '软件生态检测',
    fetch: async (_teamId: string) => {
      const { tools, categories } = scanInstalledSoftware();
      const integrationGaps = detectIntegrationGaps(tools, categories);
      return { installedTools: tools, categories, integrationGaps } as unknown as Record<string, unknown>;
    },
  },
  {
    id: 'github-api',
    label: 'GitHub API 指标',
    fetch: async (_teamId: string) => {
      const config = getGitHubConfig();
      if (!config) return null;
      const [owner, repo] = config.repo.split('/');
      if (!owner || !repo) return null;
      return fetchGitHubMetrics(owner, repo, config.token) as Promise<Record<string, unknown> | null>;
    },
  },
];

// ====================================================================
// Main entry point
// ====================================================================

/**
 * Enrich a diagnosis with external data sources.
 * Each plugin runs independently; failures are isolated and logged.
 */
export async function enrichDiagnosis(teamId: string): Promise<EnrichedData> {
  const log = getEngineContext().logger;
  const degradedModules: string[] = [];

  let localGit: LocalGitMetrics | null = null;
  let software: SoftwareEnrichment | null = null;
  let github: GitHubMetrics | null = null;

  for (const plugin of builtinPlugins) {
    try {
      const result = await plugin.fetch(teamId);
      if (!result) continue;

      switch (plugin.id) {
        case 'local-git':
          localGit = result as unknown as LocalGitMetrics;
          break;
        case 'software':
          software = result as unknown as SoftwareEnrichment;
          break;
        case 'github-api':
          github = result as unknown as GitHubMetrics;
          break;
      }
    } catch (err) {
      log.warn({ err, teamId, pluginId: plugin.id }, '[diagnosis/enricher] 插件失败');
      degradedModules.push(`enricher/${plugin.id}`);
    }
  }

  return {
    teamId,
    generatedAt: new Date().toISOString(),
    localGit,
    software,
    github,
    degradedModules,
  };
}

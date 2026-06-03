/**
 * diagnosis/task-integration.ts — FDE 任务集成
 *
 * 将 ActionPlan 的 ImprovementActionItem push 到外部任务系统。
 * 支持 Jira REST API 和 Linear GraphQL API。
 *
 * 设计原则：
 *   1. 幂等创建：先查后建，避免重复
 *   2. 配置驱动：API keys 从 FinancialBaseline 扩展字段或环境变量读取
 *   3. 独立失败：单个任务创建失败不影响其他
 */

import type { ImprovementActionItem, TaskIntegrationResult } from './types';
import { loadFinancialBaseline } from './financial-impact';
import { createLogger } from '../../infra/logger';

const log = createLogger('engine-server/pipeline/diagnosis/task-integration');

// ====================================================================
// Integration config (from env or FinancialBaseline extra fields)
// ====================================================================

interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  issueTypeId?: string; // default: 'Task'
}

interface LinearConfig {
  apiKey: string;
  teamId: string;
}

function getJiraConfig(teamId: string): JiraConfig | null {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  const projectKey = process.env.JIRA_PROJECT_KEY;

  if (!baseUrl || !email || !apiToken || !projectKey) {
    // Try from FinancialBaseline extra fields
    try {
      const baseline = loadFinancialBaseline(teamId);
      const extra = (baseline as unknown as Record<string, unknown> | null)?.jiraConfig as JiraConfig | undefined;
      if (extra?.baseUrl && extra?.email && extra?.apiToken && extra?.projectKey) {
        return extra;
      }
    } catch { /* no baseline */ }
    return null;
  }

  return { baseUrl, email, apiToken, projectKey };
}

function getLinearConfig(teamId: string): LinearConfig | null {
  const apiKey = process.env.LINEAR_API_KEY;
  const teamIdEnv = process.env.LINEAR_TEAM_ID;

  if (!apiKey) {
    try {
      const baseline = loadFinancialBaseline(teamId);
      const extra = (baseline as unknown as Record<string, unknown> | null)?.linearConfig as LinearConfig | undefined;
      if (extra?.apiKey) return extra;
    } catch { /* no baseline */ }
    return null;
  }

  return { apiKey, teamId: teamIdEnv ?? '' };
}

// ====================================================================
// Public API
// ====================================================================

/**
 * 将 action plan 中的选定项 push 到外部任务系统。
 *
 * @param teamId 团队 ID
 * @param items 要 push 的 action items（只处理 targetSystem !== 'manual' 的项）
 * @returns 集成结果（created / failed / skipped）
 */
export async function pushActionItems(
  teamId: string,
  items: ImprovementActionItem[],
): Promise<TaskIntegrationResult> {
  const result: TaskIntegrationResult = {
    created: [],
    failed: [],
    skipped: [],
  };

  const jiraConfig = getJiraConfig(teamId);
  const linearConfig = getLinearConfig(teamId);

  for (const item of items) {
    // Skip manual items
    if (item.targetSystem === 'manual') {
      result.skipped.push({ localId: item.id, reason: 'manual task — no external system' });
      continue;
    }

    // Skip already-created items
    if (item.status === 'created' && item.externalId) {
      result.skipped.push({ localId: item.id, reason: `already created: ${item.externalId}` });
      continue;
    }

    try {
      switch (item.targetSystem) {
        case 'jira': {
          if (!jiraConfig) {
            result.skipped.push({ localId: item.id, reason: 'Jira not configured' });
            continue;
          }
          // Check for existing issue first
          const existingId = await findExistingJiraIssue(jiraConfig, item.title);
          if (existingId) {
            item.externalId = existingId;
            item.status = 'created';
            result.skipped.push({ localId: item.id, reason: `already exists: ${existingId}` });
            continue;
          }
          const extId = await createJiraIssue(jiraConfig, item);
          item.externalId = extId;
          item.status = 'created';
          result.created.push({ localId: item.id, externalId: extId, system: 'jira' });
          break;
        }
        case 'linear': {
          if (!linearConfig) {
            result.skipped.push({ localId: item.id, reason: 'Linear not configured' });
            continue;
          }
          const existingId = await findExistingLinearIssue(linearConfig, item.title);
          if (existingId) {
            item.externalId = existingId;
            item.status = 'created';
            result.skipped.push({ localId: item.id, reason: `already exists: ${existingId}` });
            continue;
          }
          const extId = await createLinearIssue(linearConfig, item);
          item.externalId = extId;
          item.status = 'created';
          result.created.push({ localId: item.id, externalId: extId, system: 'linear' });
          break;
        }
      }
    } catch (err) {
      log.warn({ err, itemId: item.id, system: item.targetSystem }, '[task-integration] failed to create issue');
      result.failed.push({ localId: item.id, reason: (err as Error).message });
    }
  }

  return result;
}

// ====================================================================
// Jira REST API
// ====================================================================

async function createJiraIssue(config: JiraConfig, item: ImprovementActionItem): Promise<string> {
  const priorityMap: Record<string, string> = {
    critical: 'Highest',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };

  const res = await fetch(`${config.baseUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`,
    },
    body: JSON.stringify({
      fields: {
        project: { key: config.projectKey },
        summary: `[Synova] ${item.title}`,
        description: {
          type: 'doc',
          version: 1,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: item.description }] },
            { type: 'paragraph', content: [] },
            { type: 'paragraph', content: [{ type: 'text', text: `💡 ${item.suggestion}` }] },
            { type: 'paragraph', content: [] },
            { type: 'paragraph', content: [{ type: 'text', text: `来源: Synova 诊断引擎 / ${item.sourceModule} / ${item.sourceDimension}`, marks: [{ type: 'em' }] }] },
          ],
        },
        issuetype: { name: 'Task' },
        priority: { name: priorityMap[item.priority] || 'Medium' },
        labels: ['synova-diagnosis', item.sourceDimension],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jira API 错误 (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  return data['key'] as string;
}

async function findExistingJiraIssue(config: JiraConfig, title: string): Promise<string | null> {
  try {
    const jql = `summary ~ "\\[Synova\\] ${title.replace(/"/g, '\\"')}"`;
    const res = await fetch(
      `${config.baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=1`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`,
        },
      },
    );

    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const issues = data['issues'] as Array<Record<string, unknown>> | undefined;
    if (issues && issues.length > 0) return issues[0]['key'] as string;
  } catch { /* lookup failed — proceed to create */ }
  return null;
}

// ====================================================================
// Linear GraphQL API
// ====================================================================

async function createLinearIssue(config: LinearConfig, item: ImprovementActionItem): Promise<string> {
  const priorityMap: Record<string, number> = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
  };

  const mutation = `
    mutation CreateIssue {
      issueCreate(input: {
        title: ${JSON.stringify(`[Synova] ${item.title}`)},
        description: ${JSON.stringify(`${item.description}\n\n💡 ${item.suggestion}\n\n_来源: Synova 诊断引擎 / ${item.sourceModule}_`)},
        priority: ${priorityMap[item.priority] || 3},
        teamId: ${JSON.stringify(config.teamId)},
      }) {
        success
        issue {
          id
          identifier
        }
      }
    }
  `;

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': config.apiKey,
    },
    body: JSON.stringify({ query: mutation }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Linear API 错误 (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const issueCreate = data['data'] as Record<string, unknown> | undefined;
  const issue = issueCreate?.['issueCreate'] as Record<string, unknown> | undefined;
  const issueData = issue?.['issue'] as Record<string, unknown> | undefined;
  const identifier = issueData?.['identifier'] as string;

  if (!identifier) {
    throw new Error('Linear API 返回数据缺少 identifier');
  }

  return identifier;
}

async function findExistingLinearIssue(config: LinearConfig, title: string): Promise<string | null> {
  try {
    const query = `
      query SearchIssues {
        issues(filter: { title: { contains: ${JSON.stringify(title)} } }, first: 1) {
          nodes {
            id
            identifier
          }
        }
      }
    `;

    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.apiKey,
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const issuesData = data['data'] as Record<string, unknown> | undefined;
    const issues = issuesData?.['issues'] as Record<string, unknown> | undefined;
    const nodes = issues?.['nodes'] as Array<Record<string, unknown>> | undefined;
    if (nodes && nodes.length > 0) return nodes[0]['identifier'] as string;
  } catch { /* lookup failed — proceed to create */ }
  return null;
}

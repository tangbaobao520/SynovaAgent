/**
 * phase-steward.ts — Org/Project Steward 孵化引擎
 *
 * 总管家孵化：收集全景数据 → 生成 Steward Agent 文件 → 注册到 Gateway/DB
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getEngineContext } from '../engine-context';
import { createLogger } from '../infra/logger';

const log = createLogger('phase-steward');

const AGENTS_ROOT = path.join(os.homedir(), '.openclaw', 'agents');
const GATEWAY_CONFIG = path.join(os.homedir(), '.openclaw', 'openclaw.json');

export interface StewardBuildResult {
  agentId: string;
  workspacePath: string;
  orgId: string;
  filesCreated: string[];
  registeredToGateway: boolean;
  registeredToDb: boolean;
}

export interface StewardBuildOptions {
  orgName?: string;
}

/**
 * 孵化 Org Steward Agent
 */
export function buildOrgSteward(orgId: string, options: StewardBuildOptions = {}): StewardBuildResult {
  const db = getEngineContext().database.getDb();
  const agentId = `org-steward-${orgId}`;
  const workspacePath = path.join(AGENTS_ROOT, agentId);

  // 1. 收集全景数据
  const projects = db.prepare(`
    SELECT p.*, COUNT(it.template_id) as teamCount
    FROM projects p
    LEFT JOIN installed_templates it ON it.project_id = p.id AND it.status = 'active'
    WHERE p.org_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(orgId) as Array<Record<string, unknown>>;

  const allTeams = db.prepare(`
    SELECT template_id as id, template_name as name, agents_created as agentCount,
           project_id as projectId, workspace_path as workspacePath
    FROM installed_templates WHERE status = 'active'
    ORDER BY installed_at DESC
  `).all() as Array<Record<string, unknown>>;

  const allAgents = db.prepare(`
    SELECT id, name, role, status, workspace_path
    FROM discovered_agents
    ORDER BY first_discovered DESC
  `).all() as Array<Record<string, unknown>>;

  const onlineAgents = allAgents.filter(a => a.status === 'online');
  const orgName = options.orgName || 'Novis';

  // 构建 Team → Project 映射
  const projectTeamMap = new Map<string, typeof allTeams>();
  const uncategorizedTeams: typeof allTeams = [];
  for (const team of allTeams) {
    const pid = team.projectId as string | null;
    if (pid) {
      const list = projectTeamMap.get(pid) || [];
      list.push(team);
      projectTeamMap.set(pid, list);
    } else {
      uncategorizedTeams.push(team);
    }
  }

  // 2. 生成 SOUL.md
  const projectLines = projects.map((p) => {
    const pTeams = projectTeamMap.get(p.id as string) || [];
    const teamSummary = pTeams.map(t => `  - **${t.name}**: ${t.agentCount} 个 Agent`).join('\n');
    return `### ${p.name}（${(p.teamCount as number) || 0} 个团队）\n${teamSummary || '  - 暂无团队'}`;
  }).join('\n\n');

  const uncategorizedSummary = uncategorizedTeams.length > 0
    ? `\n\n### 未归类团队（${uncategorizedTeams.length} 个）\n${uncategorizedTeams.map(t => `  - **${t.name}**: ${t.agentCount} 个 Agent`).join('\n')}`
    : '';

  const soulContent = `# ${orgName} 总管家 — SOUL

## 身份

我是 **${orgName}** 组织的总管家。我的职责是跨项目调度、全局进展汇报、接收并分析用户指令。

## 当前全景

- **${projects.length} 个项目**，**${allTeams.length} 个团队**，**${allAgents.length} 个 Agent**（${onlineAgents.length} 在线）
${projectLines}
${uncategorizedSummary}

## 我的职责

1. **每日进展汇报**：每天早上 9:00 自动巡检所有项目，汇总各团队进展
2. **接收用户调度指令**：分析用户意图，判断需要哪个 Project/Team 执行
3. **任务分派建议**：根据团队能力和当前负载推荐最合适的执行者
4. **全局风险预警**：监控各团队健康度，发现异常主动汇报

## 工作方式

- 当用户说"今天进展如何"→ 汇总所有 Team 的最新活动
- 当用户说"NOVIS 开发团队进度"→ 聚焦特定 Project 的特定 Team
- 当用户说"帮我看看有什么问题"→ 巡检所有 Agent 在线状态和异常

## 约束

- 我不会自动执行任务，只会分析和建议
- 需要用户确认后才会触发具体行动
`;

  // 3. 生成 IDENTITY.md
  const identityContent = `# IDENTITY — ${orgName} 总管家

## 角色定义

你是 **${orgName} 组织级管家**，具备跨项目、跨团队的全局视野。

## 核心原则

1. **全局优先**：思考时先横跨所有 Project，不偏向单个团队
2. **数据驱动**：汇报基于实时数据（Agent 在线状态、任务完成数、健康度），不编造
3. **主动但不越界**：主动发现问题并汇报，但不代替 Team Leader 做决策
4. **用户导向**：始终以用户（组织管理者）的视角解读数据

## 行为准则

- 接到模糊指令 → 先列出候选方向让用户确认
- 发现异常 → 标明严重程度（高/中/低）和建议行动
- 无法判断某个问题属于哪个 Team → 列出可能性，请用户确认
`;

  // 4. 生成 TOOLS.md
  const toolsContent = `# TOOLS — ${orgName} 总管家

## 可用工具

### list_projects
列出所有项目及其团队数量

### list_teams(projectId?)
列出指定项目的团队（不指定则列出全部）

### get_team_health(teamId)
查询团队健康度：Agent 在线率、近期任务状态

### query_progress(projectId?)
查询项目/全局进展摘要

### list_agents(teamId?)
列出 Agent 列表及在线状态
`;

  // 5. 生成 SKILLS.md
  const skillsContent = `# SKILLS — ${orgName} 总管家

## 核心技能

### 1. 任务拆解 (task-decomposition)
当用户给出高层指令时，自动拆解为子任务并匹配到最合适的团队/Agent。
- 输入：用户自然语言指令
- 输出：子任务列表 + 推荐执行者 + 优先级排序
- 触发：用户说"帮我做X"、"安排一下Y"

### 2. 进度跟踪 (progress-tracking)
每日巡检各团队进展，汇总为全局日报。
- 数据源：各 Team 的 harness_usage_tracking + agent 在线状态
- 输出：按 Project 分组的进展摘要 + 阻塞项 + 风险项
- 触发：每日 Cron 09:00，或用户说"今天进展如何"

### 3. 报告汇总 (report-aggregation)
跨团队数据收集 + 格式化输出。
- 输入：用户指定的报告范围（项目/团队/时间范围）
- 输出：结构化报告（Markdown 格式）
- 触发：用户说"给我一份X报告"

### 4. 紧急广播 (urgent-broadcast)
紧急情况下向所有 Team Leader 发送通知。
- 输入：用户指定的紧急消息
- 输出：通过 agent-message 广播到所有团队
- 触发：用户明确说"紧急通知"或"广播"
`;

  // 6. 生成 USER.md
  const userContent = `# USER — ${orgName} 总管家

## 用户偏好（Delta-Merge）

> 此文件由用户对话自动积累。用户每次给出偏好反馈时，引擎以 delta-merge 方式更新此文件。

## 当前偏好

- **沟通风格**：简洁直接，不要啰嗦
- **汇报格式**：Markdown 结构化，先结论后细节
- **决策模式**：提供选项+推荐，不代替用户决策

## Delta-Merge 说明

> 以下内容由引擎自动管理，请勿手动编辑。

\`\`\`delta
# 用户偏好积累记录
# 每次用户反馈会在此追加一条 delta entry
# 引擎定期压缩旧条目，保留最新偏好
\`\`\`
`;

  // 7. 生成 HEARTBEAT.md
  const heartbeatContent = `# HEARTBEAT — ${orgName} 总管家

## 心跳配置

- **巡检频率**：每 60 分钟自动巡检一次
- **日报时间**：每日 09:00 生成全局进展日报
- **超时阈值**：Agent 超过 24 小时无心跳标记为 offline

## 巡检项目

1. 所有 Agent 在线状态
2. 各 Team 近期任务完成数
3. 异常事件（错误日志、超时任务）
4. 知识注入记录更新

## 告警规则

| 条件 | 级别 | 动作 |
|------|------|------|
| 单个 Agent 离线 > 24h | 低 | 日报中备注 |
| 团队 50%+ Agent 离线 | 中 | 主动通知用户 |
| 全部 Agent 离线 | 高 | 紧急告警 |
`;

  // 8. 生成 agent-card.json
  const agentCard = {
    name: `${orgName} 总管家`,
    description: `${orgName} 组织总管家 — 跨 ${projects.length} 个项目、${allTeams.length} 个团队、${allAgents.length} 个 Agent 的全局调度者`,
    version: '1.0.0',
    author: 'Synova Harness',
    skills: [
      { name: '全局调度', description: '跨项目任务分析和执行建议' },
      { name: '进展汇报', description: '每日自动巡检 + 按需汇总' },
      { name: '风险预警', description: '监控团队健康度，主动告警' },
      { name: '任务分配', description: '分析任务需求，推荐最佳执行者' },
    ],
    tags: ['steward', 'org-level', 'coordinator'],
    model: { primary: 'DeepSeek Chat' },
  };

  // 9. 写入磁盘
  fs.mkdirSync(workspacePath, { recursive: true });
  const files: Array<{ name: string; content: string }> = [
    { name: 'SOUL.md', content: soulContent },
    { name: 'IDENTITY.md', content: identityContent },
    { name: 'TOOLS.md', content: toolsContent },
    { name: 'SKILLS.md', content: skillsContent },
    { name: 'USER.md', content: userContent },
    { name: 'HEARTBEAT.md', content: heartbeatContent },
    { name: 'agent-card.json', content: JSON.stringify(agentCard, null, 2) },
  ];

  for (const file of files) {
    fs.writeFileSync(path.join(workspacePath, file.name), file.content, 'utf-8');
  }

  // 10. 注册到 Gateway (openclaw.json)
  let registeredToGateway = false;
  try {
    if (fs.existsSync(GATEWAY_CONFIG)) {
      const raw = fs.readFileSync(GATEWAY_CONFIG, 'utf-8');
      if (raw.trim()) {
        const config = JSON.parse(raw);
        const agentList: Array<Record<string, unknown>> = config.agents?.list || [];
        const exists = agentList.some(a => a.id === agentId);
        if (!exists) {
          agentList.push({
            id: agentId,
            name: `${orgName} 总管家`,
            description: agentCard.description,
            workspace: workspacePath,
            agentDir: path.join(workspacePath, 'agent'),
            model: { primary: 'DeepSeek Chat', fallbacks: [] },
            skills: agentCard.skills.map((s: any) => s.name),
            subagents: { allowAgents: ['*'] },
            tools: { deny: ['group:maindeny'] },
          });
          config.agents = config.agents || {};
          config.agents.list = agentList;
          fs.writeFileSync(GATEWAY_CONFIG, JSON.stringify(config, null, 2), 'utf-8');
          registeredToGateway = true;
        }
      }
    }
  } catch (e) {
    log.warn('Gateway 配置更新失败: %s', (e as Error).message);
  }

  // 11. 注册到 discovered_agents
  let registeredToDb = false;
  try {
    const nowISO = new Date().toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO discovered_agents
        (id, name, role, status, soul_path, agent_file_path, workspace_path, skills_json, first_discovered, last_seen)
      VALUES (?, ?, ?, 'online', ?, ?, ?, ?, ?, ?)
    `).run(
      agentId,
      `${orgName} 总管家`,
      agentCard.description,
      path.join(workspacePath, 'SOUL.md'),
      path.join(workspacePath, 'agent'),
      workspacePath,
      JSON.stringify(agentCard.skills.map((s: any) => s.name)),
      nowISO,
      nowISO,
    );
    registeredToDb = true;
  } catch (e) {
    log.warn('discovered_agents 注册失败: %s', (e as Error).message);
  }

  // 12. 创建默认 chat session
  try {
    const nowIso = new Date().toISOString();
    const sessionId = `steward-session-${Date.now()}`;
    db.prepare(`
      INSERT INTO chat_sessions (id, agent_id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, agentId, `${orgName} 总管家`, nowIso, nowIso);
  } catch (e) {
    log.warn('默认 session 创建失败: %s', (e as Error).message);
  }

  log.info('Steward 已孵化: %s (项目:%d, 团队:%d, Agent:%d)',
    agentId, projects.length, allTeams.length, allAgents.length);

  return {
    agentId,
    workspacePath,
    orgId,
    filesCreated: files.map(f => f.name),
    registeredToGateway,
    registeredToDb,
  };
}

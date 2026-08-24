/**
 * tests/tools/org-expert-tools.test.ts — D482 org-expert-tools 连接器声称对齐
 *
 * 契约（铁律 47，依据 src/connectors/index.ts 物理现实 + D357 创始人裁决 B）：
 * - build_org_graph dataSource 契约不变（feishu/dingtalk/wecom/manual 枚举保留，降级提示而非拒绝）。
 * - manual 分支：nextStep 提及飞书（唯一已接入），不出现「授权飞书/钉钉/企微」旧声称。
 * - feishu 分支：status=pending，message 含「已就绪」（唯一真实接入，声称保留）。
 * - dingtalk/wecom 分支：status=pending（不新造状态），message 含「待接入」（连接器未实现）。
 * - ORG_EXPERT_TOOLS ≥4 工具且结构完整（接线守卫——builtin-tools.ts L299 依赖此数组注册）。
 */
import { describe, it, expect } from 'vitest';
import { buildOrgGraphTool, ORG_EXPERT_TOOLS } from '../../src/tools/org-expert-tools';

/** handler 返回收窄（铁律 38：内联类型替代 as any） */
interface OrgGraphResult {
  orgId?: string;
  dataSource?: string;
  status?: string;
  message?: string;
  nextStep?: string;
}

describe('D482 — buildOrgGraphTool 连接器声称对齐', () => {
  it('① manual 分支：nextStep 含飞书，不含钉钉/企微自动拉取旧声称', async () => {
    const result = await buildOrgGraphTool.handler({ orgId: 'org-x', dataSource: 'manual' }) as OrgGraphResult;
    expect(result.nextStep).toBeDefined();
    expect(result.nextStep).toContain('飞书');
    expect(result.nextStep).not.toContain('授权飞书/钉钉/企微');
    expect(result.nextStep).not.toContain('钉钉/企微连接器自动拉取');
  });

  it('② feishu 分支：message 含已就绪（唯一真实接入，声称保留）', async () => {
    const result = await buildOrgGraphTool.handler({ orgId: 'org-x', dataSource: 'feishu' }) as OrgGraphResult;
    expect(result.status).toBe('pending');
    expect(result.message).toContain('已就绪');
  });

  it('③ dingtalk 分支：message 含待接入（降级声称），status 保持 pending 不新造状态', async () => {
    const result = await buildOrgGraphTool.handler({ orgId: 'org-x', dataSource: 'dingtalk' }) as OrgGraphResult;
    expect(result.status).toBe('pending');
    expect(result.message).toContain('待接入');
    expect(result.message).not.toContain('已就绪');
  });

  it('④ ORG_EXPERT_TOOLS 接线守卫：≥4 工具且结构完整', () => {
    expect(ORG_EXPERT_TOOLS.length).toBeGreaterThanOrEqual(4);
    for (const tool of ORG_EXPERT_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    }
  });
});

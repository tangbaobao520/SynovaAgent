/**
 * api-coverage/computes/api-availability.ts — API 可达率计算
 *
 * 从 TOOL 节点中筛选含 URL/endpoint 的节点，统计 HTTP 可达比例。
 * 纯函数: 输入节点列表，输出可达率。
 */
export interface ApiAvailabilityResult {
  rate: number;
  reachableNames: string[];
  unreachableDetails: string[];
  totalTools: number;
  degraded: boolean;
}

export async function computeApiAvailability(
  tools: Array<{ id: string; name: string; url?: string }>
): Promise<ApiAvailabilityResult> {
  const withEndpoint = tools.filter(t => t.url);
  if (withEndpoint.length === 0) {
    return { rate: 1, reachableNames: [], unreachableDetails: [], totalTools: 0, degraded: true };
  }

  const reachableNames: string[] = [];
  const unreachableDetails: string[] = [];

  for (const tool of withEndpoint) {
    try {
      const url = tool.url!.startsWith('http') ? tool.url! : `https://${tool.url!}`;
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(to);
      if (resp.ok) {
        reachableNames.push(tool.name);
      } else {
        unreachableDetails.push(`${tool.name} (HTTP ${resp.status})`);
      }
    } catch (err: unknown) {
      const errMsg = (err as Error)?.message || String(err);
      unreachableDetails.push(`${tool.name} (不可达)`);
      console.warn(`[api-availability] HEAD 请求失败: ${tool.name} — ${errMsg}`);
    }
  }

  const total = withEndpoint.length;
  const rate = total > 0 ? reachableNames.length / total : 1;

  return { rate, reachableNames, unreachableDetails, totalTools: total, degraded: false };
}

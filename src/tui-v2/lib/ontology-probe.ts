/**
 * tui-v2/lib/ontology-probe.ts — TUI cron 本体 API 探测（D862/P-1）
 *
 * 契约（铁律 47/48）：
 * - @input  — url: 本进程 loopback 本体 API 地址（`http://localhost:<port>/api/ontology/graph/<orgId>`）。
 * - @output — `probeOntologyGraph(url)`: Promise<void>。成功消费即返回；
 *             探测结果当前仅用于就绪性观察（调用方无消费者时不改变行为）。
 * - @degraded — 出站失败（本体 API 未就绪 / 出口分类错误）→ log.warn 后正常返回
 *              （探测性降级，铁律 24/31：日志可见，不抛出到 cron 调度器）。
 * - @error  — 无抛出路径（探测语义：失败 = 未就绪，是数据不是错误）。
 *
 * 出站纪律：一律经唯一出口 `outboundFetch`（loopback 恒绕过代理——出口冻结契约）。
 * 守卫：tests/tui-v2/ontology-probe.test.ts（mock 出口 seam + chat.tsx 接线断言，
 * 回退裸 fetch 必红）。
 */
import { outboundFetch } from '../../providers/http-exit';
import { createLogger } from '@synova/logger';

const log = createLogger('tui-v2/ontology-probe');

export async function probeOntologyGraph(url: string): Promise<void> {
  try {
    const response = await outboundFetch(url);
    if (response.ok) {
      // 消费 body 释放连接；探测结果就绪性观察用（nodeCount 暂无下游消费者）
      await response.json();
    }
  } catch (err: unknown) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, '[cron] 本体 API 未就绪');
  }
}

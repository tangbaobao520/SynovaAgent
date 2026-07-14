/**
 * src/growth/dnd-engine.ts — 免打扰规则引擎 (D74)
 *
 * 第13份权威文档第四章 §4 规则矩阵实现。
 * 判定告警是否应在当前时间点投递/展示。
 *
 * 规则:
 *   - P0 告警 → 始终推送（不受免打扰限制）
 *   - P1 告警 → 周推 1 次（同一 Goal+同一哨兵在 7 天内不重复）
 *   - P2 告警 → 周汇总（不单独推送，出现在周报摘要中）
 *   - 用户自定义免打扰时段 → 延迟推送
 *   - 已被用户 dismiss 的告警 → 7 天内不重复推送同一类型
 *
 * 契约:
 *   @input  — WorkspaceAlert + DNDConfig + 可选当前时间
 *   @output — boolean (true=应该投递, false=应抑制)
 *   @degraded — 无异常路径，纯同步函数
 */
import type { WorkspaceAlert, DNDConfig } from './workspace-types';
import { DEFAULT_DND_CONFIG } from './workspace-types';

/**
 * 判定告警是否应在当前时间投递。
 *
 * @param alert        — 待判定告警
 * @param config       — 免打扰配置（使用默认值填充未指定字段）
 * @param now          — 当前时间（可选，默认 Date.now()，便于测试）
 * @returns true=应该投递, false=应抑制
 */
export function shouldDeliver(
  alert: WorkspaceAlert,
  config?: DNDConfig,
  now?: Date,
): boolean {
  const cfg: DNDConfig = { ...DEFAULT_DND_CONFIG, ...config };
  const currentTime = now ?? new Date();

  // 规则 1: P0 告警始终推送
  if (alert.dndCategory === 'P0') {
    return true;
  }

  // 规则 5: 已消除告警 — 7 天内不重复
  if (alert.dismissed && alert.dismissedAt) {
    const dismissedTime = new Date(alert.dismissedAt).getTime();
    const suppressMs = (cfg.dismissedSuppressHours ?? 168) * 60 * 60 * 1000;
    if (currentTime.getTime() - dismissedTime < suppressMs) {
      return false;
    }
  }

  // 规则 2: P1 告警 — 周推 1 次
  if (alert.dndCategory === 'P1') {
    if (alert.lastDeliveredAt) {
      const lastDelivered = new Date(alert.lastDeliveredAt).getTime();
      const intervalMs = (cfg.p1MinIntervalHours ?? 168) * 60 * 60 * 1000;
      if (currentTime.getTime() - lastDelivered < intervalMs) {
        return false;
      }
    }
    // 检查是否在免打扰时段内
    if (isInQuietHours(currentTime, cfg.quietHours)) {
      return false;
    }
    return true;
  }

  // 规则 3: P2 告警 — 周汇总，不单独推送
  if (alert.dndCategory === 'P2') {
    return false;
  }

  // 默认: 放行
  return true;
}

/**
 * 检查当前时间是否在免打扰时段内。
 */
function isInQuietHours(
  now: Date,
  quietHours?: DNDConfig['quietHours'],
): boolean {
  if (!quietHours || quietHours.length === 0) return false;

  const dayOfWeek = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const qh of quietHours) {
    if (qh.dayOfWeek !== dayOfWeek) continue;
    const startParts = qh.start.split(':').map(Number);
    const endParts = qh.end.split(':').map(Number);
    if (startParts.length !== 2 || endParts.length !== 2) continue;
    const startMinutes = startParts[0] * 60 + startParts[1];
    const endMinutes = endParts[0] * 60 + endParts[1];

    if (startMinutes <= endMinutes) {
      // 正常时段 (如 22:00-08:00 是同一天内？不，跨天)
      // 跨天处理: 如果 end < start，说明跨天
      if (endMinutes < startMinutes) {
        // 跨天: 当前时间在 [start, 24:00) 或在 [00:00, end)
        if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
          return true;
        }
      } else {
        // 同天: 当前时间在 [start, end]
        if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
          return true;
        }
      }
    } else {
      // endMinutes < startMinutes 跨天
      if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
        return true;
      }
    }
  }

  return false;
}

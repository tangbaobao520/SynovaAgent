/**
 * lib/api.ts — D504 renderer API 基础路径统一封装
 *
 * 问题: 生产态 main.cjs loadFile 加载 renderer 产物（file:// 协议）后，
 * 相对路径 fetch('/api/...') 失效（相对 file:// 而非后端源）。
 *
 * 契约（铁律 47）:
 *   @input  无（读 window.electronAPI.getServerUrl()——preload.cjs 已暴露）
 *   @output API 基础 URL 字符串:
 *           Electron 环境 → serverUrl（如 http://localhost:18790，带尾部斜杠剥除）
 *           非 Electron（浏览器 dev，走 vite proxy）→ ''（相对路径 + proxy 18790）
 *   @degraded — electronAPI 缺失/异常 → 返回 ''（dev 态正常路径，非静默错误）
 *   @error    — 不抛
 */

// D517 修复: 原本此文件独立声明 window.electronAPI?: ElectronServerApi（仅 getServerUrl），
// 与 ipc/bridge.ts 的 ElectronAPI 全局声明冲突（tsc 取前者 → bridge.ts 全部方法 TS2339，
// electron-renderer `npm run build` 失败 → D517 构建链/CI 无法产出安装包）。
// 修复 = 单一类型源: 统一复用 bridge.ts 的完整 ElectronAPI（getServerUrl/getConfig 等全量）。
import type { ElectronAPI } from '../ipc/bridge';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export function getApiBase(): string {
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.getServerUrl) {
      const url = window.electronAPI.getServerUrl();
      return url ? url.replace(/\/$/, '') : '';
    }
  } catch (err) {
    // 铁律 24: 不静默——降级到相对路径（dev proxy），console.warn 留痕
    console.warn('[api] getServerUrl 失败 — 降级相对路径:', err instanceof Error ? err.message : String(err));
  }
  return '';
}

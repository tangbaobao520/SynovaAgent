<!-- SYNOVA-IMPL-D265 v2.0 | 2026-07-29 | 权威17 §四 Phase 0 -->
# SynovaAgent -- D265 资源监控模块 v2.0
> v1.0 错误: 使用 os.loadavg() — Windows 永远返回 [0,0,0], CPU=0% ❌
> v2.0 修正: psutil (权威17 §四明确指定), 跨平台 CPU+内存+磁盘

## 权威17 引用
> §四.4: "资源监控模块 | src/services/resource-monitor.ts | 新建——psutil 获取内存/磁盘/CPU"

## 代码验证
- src/services/resource-monitor.ts 不存在 ❌
- psutil 是否可用: 需 `npm install psutil` (或 `pip install psutil` for Python)

## Q0-Q4
Q0: product-health.py 需要获取服务器资源状态。权威17 指定 psutil。
Q2: 做——新建 resource-monitor.ts, psutil 采集 CPU/内存/磁盘, 返回 ResourceSnapshot。
Q3: product-health.py → getResourceSnapshot() → healthy/degraded/critical

## 改动 (resource-monitor.ts 新建, ~60行)

### src/services/resource-monitor.ts
```typescript
import * as psutil from 'psutil'; // npm install psutil
export interface ResourceSnapshot { cpuPercent: number; memPercent: number; diskPercent: number; timestamp: string }
export function getResourceSnapshot(): ResourceSnapshot {
  return {
    cpuPercent: psutil.cpu_percent(1),
    memPercent: psutil.virtual_memory().percent,
    diskPercent: psutil.disk_usage('/').percent,
    timestamp: new Date().toISOString()
  };
}
```

## 测试 (L1×2)
| # | 测试 |
|---|------|
| 1 | getResourceSnapshot 返回 3 项 >=0 的百分比 |
| 2 | psutil 不可用 → 降级返回全 0 + log.warn |

## 完成标准
getResourceSnapshot() 可用, psutil 跨平台, 降级安全。

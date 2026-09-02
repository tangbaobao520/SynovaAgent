# D569 — dsh 仪表盘 collector 改 git 权威读取（治数据陈旧）

> 派单: CTO 自办 | 2026-09-02 | 类型: DSH 插件基础设施修复
> 来源: 创始人反馈任务看板数据陈旧（主工作区 119 提交落后，collector 读盘拿到 8-28 旧数据）
> #CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
dsh/plugins/synova-dashboards 三仪表盘（完成度/任务/健康）。collector 原本全读磁盘（readFile），而主工作区长期是陈旧 checkout（多 session 共享、119 落后）→ 数据停在陈旧提交。治本：数据源改 git 追踪的 origin/main（D334「main 是唯一真相」同源）。

### b) 文件审计
- dsh/plugins/synova-dashboards/lib/collect.js：readText/readJson/mtimeIso + collectProduct/collectTasks/collectHealth/collectDashboards

### c) 决策
git 优先读（git show / ls-tree -r）+ 磁盘回退（降级）；fetch 60s 冷却；mtime 改 git 提交时间；audit_status 映射 audit.verdict。

## Q1: 调研
D334 main 唯一真相；铁律 24/31（每 section 独立降级）；D316 环境（离线 git 回退磁盘）。

## Q2: 范围
做什么：
- 修改 dsh/plugins/synova-dashboards/lib/collect.js：git 优先读取层 + 调用点切换 + audit_status→verdict
不做什么：
- 不改 client.js/index.js（渲染层零变化）
- 不改 scripts/audit/：审计红线

## Q3: 验收
入口：node 独立跑 collectDashboards → product/tasks/health 全 ok + 数据含最新任务
结果：states 含 D568+ 最新任务；product pct=11；无 git 环境回退磁盘不崩

## 架构层:

DSH 插件（dsh/plugins/，非 L1-L5 产品层）

## Done 标准
- [x] collector 语法 verify: node --check dsh/plugins/synova-dashboards/lib/collect.js
- [x] git 优先接线 verify: grep -c "gitShow\|gitLs" dsh/plugins/synova-dashboards/lib/collect.js | xargs test 2 -ge
- [x] 实测新鲜 verify: node -e "import('./dsh/plugins/synova-dashboards/lib/collect.js').then(async m=>{const d=await m.collectDashboards(process.cwd());console.log(d.tasks.states.length, d.product.product_progress_pct)})" | xargs test 100 -le

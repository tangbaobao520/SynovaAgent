// lib/client.js — @synova/dsh-dashboards Client 半（浏览器端「项目总览」中央面板）
// 以 __ModuleLoader__.load 工厂格式手写（无需构建）：factory 内 require 仅用
// 静态种子模块（react / react/jsx-runtime）。
//
// 挂载点（官方全局面板协议，两个槽位成对、id 相同）：
//   sidebar.panellist（root list） 入口行 —— { id, order, label }；组件是纯图标，收 { size, active }
//   main（root keyed）            中央面板 —— { key }；选中入口行时由 layout 派发到这里
//   零核心补丁、顺序无关；必须先注册 main 再注册入口行（未注册的 main key 会抛错）。
// 数据源（两条只读 GET，各自独立降级）：
//   /synova/pm/ledger        账本（三数 / 26 线 / 阻塞 / 执行看板 / 时间轴，含 source 标注）
//   /synova/dashboards/data  健康区（bypass 计数 / 提交失败 / M 模式）
// 实时性: 60s 轮询 + visibilitychange 回源 + 手动刷新。
// 入口唯一: D794 起右栏三仪表盘（shell.overlay）已并入本面板并删除，不再维护第二个入口。
window.__ModuleLoader__.load({
	id: "@synova/dsh-dashboards",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		const { useState, useEffect, useCallback } = react;
		const { jsx } = react_jsx_runtime;

		// ── 样式（主题变量随 DSH 主题走） ───────────────────────────────────────
		const CSS = [
			".spo-spin{width:12px;height:12px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-label-primary);border-radius:50%;animation:spo-spin .8s linear infinite}",
			"@keyframes spo-spin{to{transform:rotate(360deg)}}",
			// ── 「项目总览」中央面板（main keyed cell）——全部 spo- 前缀 ──
			// 高度策略：父容器有确定高度时 height:100% 生效；无确定高度时退回 min-height:60vh，
			// 两种情形都可用（不依赖 position:absolute，避免误覆盖整个 frame）。
			".spo-root{height:100%;min-height:60vh;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}",
			".spo-head{flex:none;display:flex;align-items:center;gap:8px;padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".spo-title{font-size:15px;font-weight:600;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".spo-body{flex:1;min-height:0;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:14px}",
			".spo-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}",
			".spo-stat{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:2px;min-width:0}",
			".spo-statNum{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".spo-statLabel{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".spo-sec{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;overflow:hidden}",
			".spo-secHead{display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:12px;font-weight:600;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
			".spo-spacer{flex:1;min-width:0}",
			".spo-line{display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid var(--dsw-alias-border-l1);cursor:pointer;font-size:12px}",
			".spo-line:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".spo-lineName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}",
			".spo-dot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}",
			".spo-dot-green{background:#16a34a}.spo-dot-yellow{background:#d97706}.spo-dot-red{background:#dc2626}.spo-dot-gray{background:#6b7280}",
			".spo-num{flex:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}",
			".spo-tag{flex:none;font-size:10px;font-weight:600;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-secondary)}",
			".spo-tag-red{background:#dc2626;color:#fff}",
			".spo-detail{padding:8px 12px 10px;border-top:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:6px}",
			".spo-assert{display:flex;gap:8px;font-size:11px;line-height:16px;align-items:baseline}",
			".spo-assertMark{flex:none;font-weight:700}",
			".spo-ok{color:#16a34a}.spo-no{color:var(--dsw-alias-label-tertiary)}",
			".spo-assertText{flex:1;min-width:0;color:var(--dsw-alias-label-secondary)}",
			".spo-blocked{display:flex;flex-direction:column;gap:3px;padding:8px 12px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px}",
			".spo-blockedHead{display:flex;align-items:baseline;gap:8px;min-width:0}",
			".spo-blockedReason{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".spo-muted{color:var(--dsw-alias-label-tertiary);font-size:11px}",
			".spo-empty{padding:14px 12px;color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center}",
			".spo-degraded{padding:9px 12px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}",
			".spo-warn{padding:8px 12px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 14%,transparent);color:var(--dsw-alias-state-warn-primary,#d97706);font-size:11px;line-height:17px}",
			".spo-iconBtn{width:26px;height:26px;flex:none;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;display:grid;place-items:center;font-size:13px;line-height:1}",
			".spo-iconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".spo-stats3{grid-template-columns:repeat(3,1fr)}",
			".spo-tag-green{background:#16a34a;color:#fff}.spo-tag-amber{background:#d97706;color:#fff}.spo-tag-blue{background:#2563eb;color:#fff}.spo-tag-gray{background:#6b7280;color:#fff}",
			".spo-item{display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px;min-width:0}",
			".spo-itemTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}",
			".spo-id{flex:none;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}"
		].join("");

		// ── 小工具 ─────────────────────────────────────────────────────────────
		function esc(s) {
			return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
		}
		function badgeFor(status) {
			const s = String(status ?? "").toLowerCase();
			if (/verified|done|completed|impl_done|closed|audited|green/.test(s)) return "green";
			if (/fail|rejected|blocked|red|p0/.test(s)) return "red";
			if (/pending|stale|warn|amber|audit|p1|claimed/.test(s)) return "amber";
			if (/spec|running|impl|in_progress|dispatched|blue/.test(s)) return "blue";
			return "gray";
		}
		/** status → .spo-tag-* 类名（颜色与 badgeFor 同源，供标签样式复用）。 */
		function tagClass(status) {
			return "spo-tag spo-tag-" + badgeFor(status);
		}
		function statusText(status) {
			const map = {
				impl_done: "实现完成", done: "已完成", completed: "已完成", closed: "已关闭",
				spec: "规格中", in_progress: "进行中", running: "进行中",
				audit: "审计中", audited: "已审计", pending_k3: "待K3", failed: "失败", rejected: "被拒",
				uncommitted: "未提交", stale: "过期", verified: "已验证",
				claimed: "已认领", dispatched: "已派单",
				unknown: "未知"
			};
			return map[String(status ?? "").toLowerCase()] ?? String(status ?? "");
		}

		// ── 「项目总览」中央面板（只读；两条 GET，各自独立降级） ──────────────────
		// 契约（铁律 47）：
		//   @input A GET /synova/pm/ledger
		//             成功 → 账本对象 + 顶层 source 字段（"worktree" | "origin/main"）
		//             降级 → { ok:false, degraded:true, error }   （路由级：工作区与 origin/main 都取不到）
		//   @input B GET /synova/dashboards/data（健康区，复用既有收集器，不新增第二真相源）
		//   @output 五区块：① 顶部四数 ② 26 线总览（可展开断言明细）③ 阻塞清单
		//                   ④ 执行看板（ledger.tasks：D#/状态/owner/停滞天数）
		//                   ⑤ 健康（bypass 计数 / 提交失败 / M 模式）⑥ 时间轴
		//   @degraded 四态，均显式呈现、不白屏、不抛错（铁律 24/31）：
		//             ① 网络/HTTP 失败    → error 横幅
		//             ② 路由级 ok:false   → degraded 横幅（工作区与 origin/main 都无账本时的正常态）
		//             ③ 账本级 degraded   → 部分降级警告 + degraded_sources 列表
		//             ④ 健康路由失败/ok:false → 健康区独立降级文案（不影响其余区块）
		//   @write  零写入：只 GET，不写工作区/仓库/localStorage（D794 红线）
		const LEDGER_URL = "/synova/pm/ledger";
		const DASH_URL = "/synova/dashboards/data";

		function pct1(n, d) {
			if (!d || d <= 0) return null;
			return Math.round((Number(n) || 0) / d * 1000) / 10;
		}
		function freshColor(f) {
			if (!f) return "gray";
			if ((f.red ?? 0) > 0) return "red";
			if ((f.yellow ?? 0) > 0) return "yellow";
			if ((f.green ?? 0) > 0) return "green";
			return "gray";
		}
		function sumFresh(lines) {
			const acc = { green: 0, yellow: 0, red: 0 };
			for (const l of lines) {
				const f = l && l.freshness;
				if (!f) continue;
				acc.green += Number(f.green) || 0;
				acc.yellow += Number(f.yellow) || 0;
				acc.red += Number(f.red) || 0;
			}
			return acc;
		}
		function verifyText(v) {
			if (!v) return "";
			if (typeof v === "string") return v;
			return String(v.kind ?? v.type ?? JSON.stringify(v));
		}

		function StatCard({ num, label, tone }) {
			return jsx("div", { className: "spo-stat", children: [
				jsx("div", { className: "spo-statNum", style: tone ? { color: tone } : undefined, children: num }),
				jsx("div", { className: "spo-statLabel", children: label })
			] });
		}

		function LinesSection({ lines }) {
			const [openId, setOpenId] = useState(null);
			if (lines.length === 0) {
				return jsx("div", { className: "spo-sec", children: [
					jsx("div", { className: "spo-secHead", children: "26 线总览" }),
					jsx("div", { className: "spo-empty", children: "ledger 无 lines 数据（待 D795）" })
				] });
			}
			return jsx("div", { className: "spo-sec", children: [
				jsx("div", { className: "spo-secHead", children: [
					jsx("span", { children: "26 线总览" }),
					jsx("span", { className: "spo-spacer" }),
					jsx("span", { className: "spo-muted", children: lines.length + " 条线 · 点行看断言明细" })
				] }),
				...lines.map((l) => {
					const id = String(l.id ?? l.name ?? "");
					const open = openId === id;
					const blocked = Array.isArray(l.blocked) ? l.blocked : [];
					const assertions = Array.isArray(l.assertions) ? l.assertions : [];
					const passed = Number(l.v1_passed) || 0;
					const total = Number(l.v1_total) || 0;
					const nodes = [jsx("div", {
						className: "spo-line",
						key: "r" + id,
						onClick: () => setOpenId(open ? null : id),
						title: esc(l.name),
						children: [
							jsx("span", { className: "spo-lineName", children: "线" + id + " · " + (l.name ?? "") }),
							blocked.length > 0 ? jsx("span", { className: "spo-tag spo-tag-red", children: "阻塞 " + blocked.length }) : null,
							jsx("span", { className: "spo-dot spo-dot-" + freshColor(l.freshness), title: "保鲜" }),
							jsx("span", { className: "spo-num", children: "V1 " + passed + "/" + total }),
							jsx("span", { className: "spo-num", style: { color: "var(--dsw-alias-label-tertiary)" }, children: open ? "▾" : "▸" })
						]
					})];
					if (open) {
						nodes.push(jsx("div", { className: "spo-detail", key: "d" + id, children: assertions.length === 0
							? [jsx("div", { className: "spo-muted", key: "e", children: "该线暂无断言明细（ledger.assertions 为空）" })]
							: assertions.map((a, i) => jsx("div", { className: "spo-assert", key: a.id ?? i, children: [
								jsx("span", { className: "spo-assertMark " + (a.ok ? "spo-ok" : "spo-no"), children: a.ok ? "✓" : "✗" }),
								jsx("span", { className: "spo-assertText", children: (a.id ? a.id + " " : "") + (a.text ?? "") }),
								jsx("span", { className: "spo-muted", children: verifyText(a.verify) + (a.age_days === null || a.age_days === undefined ? "" : " · " + a.age_days + "d") })
							]}))
						}));
					}
					return nodes;
				}).flat()
			] });
		}

		function BlockedSection({ blocked }) {
			return jsx("div", { className: "spo-sec", children: [
				jsx("div", { className: "spo-secHead", children: [
					jsx("span", { children: "阻塞清单" }),
					jsx("span", { className: "spo-spacer" }),
					jsx("span", { className: "spo-muted", children: blocked.length + " 项" })
				] }),
				blocked.length === 0
					? jsx("div", { className: "spo-empty", children: "无阻塞（blocked 为空）" })
					: blocked.map((b, i) => jsx("div", { className: "spo-blocked", key: b.id ?? i, children: [
						jsx("div", { className: "spo-blockedHead", children: [
							b.id ? jsx("span", { className: "spo-tag", children: b.id }) : null,
							jsx("span", { className: "spo-blockedReason", title: esc(b.reason), children: b.reason ?? "(无原因)" }),
							jsx("span", { className: "spo-num", style: { color: "#dc2626", fontWeight: 600 }, children: "已卡 " + (b.days ?? "?") + " 天" })
						] }),
						jsx("div", { className: "spo-muted", children: "起始 " + (b.since ?? "—") + " · 需要 " + (b.needs ?? "—") })
					]}))
			] });
		}

		function TimelineSection({ timeline }) {
			return jsx("div", { className: "spo-sec", children: [
				jsx("div", { className: "spo-secHead", children: "时间轴（里程碑泳道 / 计划×实际）" }),
				timeline.length === 0
					? jsx("div", { className: "spo-empty", children: "待数据（D795）" })
					: timeline.map((t, i) => jsx("div", { className: "spo-blocked", key: (t.line ?? "") + "-" + (t.milestone ?? i), children: [
						jsx("div", { className: "spo-blockedHead", children: [
							jsx("span", { className: "spo-tag", children: "线" + (t.line ?? "?") }),
							jsx("span", { className: "spo-blockedReason", children: t.milestone ?? "(未命名里程碑)" }),
							jsx("span", { className: "spo-num", children: t.planned_week ?? "未排期" })
						] }),
						jsx("div", { className: "spo-muted", children: t.actual
							? "实际：派单 " + (t.actual.dispatched ?? "—") + " · 首提交 " + (t.actual.first_commit ?? "—") + " · 合并 " + (t.actual.merged ?? "—") + " · 审计 " + (t.actual.audited ?? "—")
							: "实际：—" })
					]}))
			] });
		}

		/**
		 * 执行看板：数据源 ledger.tasks（D795 由 task-state/*.json 派生，含 owner/stale_days）。
		 * 全区只读；任务多（200+）时按停滞天数降序取前 12 + 状态分布标签，避免长列表压垮面板。
		 */
		function TasksSection({ tasks }) {
			if (tasks.length === 0) {
				return jsx("div", { className: "spo-sec", children: [
					jsx("div", { className: "spo-secHead", children: "执行看板" }),
					jsx("div", { className: "spo-empty", children: "ledger 无 tasks 数据（待 D795）" })
				] });
			}
			const byStatus = {};
			for (const t of tasks) {
				const k = String((t && t.status) ?? "unknown");
				byStatus[k] = (byStatus[k] ?? 0) + 1;
			}
			const top = tasks.slice()
				.sort((a, b) => (Number(b.stale_days) || 0) - (Number(a.stale_days) || 0))
				.slice(0, 12);
			return jsx("div", { className: "spo-sec", children: [
				jsx("div", { className: "spo-secHead", children: [
					jsx("span", { children: "执行看板" }),
					jsx("span", { className: "spo-spacer" }),
					jsx("span", { className: "spo-muted", children: tasks.length + " 个任务 · 按停滞降序取前 " + top.length })
				] }),
				jsx("div", { className: "spo-item", style: { borderTop: "none", flexWrap: "wrap", gap: "6px" }, children: Object.keys(byStatus).sort().map((k) =>
					jsx("span", { className: tagClass(k), key: k, children: statusText(k) + " " + byStatus[k] })
				) }),
				...top.map((t) => jsx("div", { className: "spo-item", key: t.id, children: [
					jsx("span", { className: "spo-id", children: t.id }),
					jsx("span", { className: "spo-itemTitle", title: esc(t.title), children: t.title ?? "" }),
					jsx("span", { className: tagClass(t.status), children: statusText(t.status) }),
					jsx("span", { className: "spo-num", style: { flex: "none" }, children: (t.owner ?? "—") + " · 停滞 " + (t.stale_days ?? "?") + " 天" })
				] }))
			] });
		}

		/**
		 * 健康区：复用既有 GET /synova/dashboards/data 的 health（不新增第二真相源）。
		 * 与其余区块独立降级——健康路由失败/ok:false 只影响本区，且必须显式可见（铁律 24/31）。
		 */
		function HealthSection({ dash, error }) {
			const h = dash && dash.health;
			if (error !== null || !h || h.ok === false) {
				return jsx("div", { className: "spo-sec", children: [
					jsx("div", { className: "spo-secHead", children: "健康" }),
					jsx("div", { className: "spo-empty", children: "⚠ 健康区降级：" + (error ?? (h && h.error) ?? "路由无响应") })
				] });
			}
			const b = h.bypass ?? {};
			const counts = b.counts ?? {};
			const f = h.precommit_failures ?? {};
			const m = Array.isArray(h.m_patterns) ? h.m_patterns : [];
			const bypass = Number(counts["detected-bypass"] ?? 0);
			const blocked = Number(counts.BLOCKED ?? 0);
			return jsx("div", { className: "spo-sec", children: [
				jsx("div", { className: "spo-secHead", children: [
					jsx("span", { children: "健康" }),
					jsx("span", { className: "spo-spacer" }),
					h.cto_verdict ? jsx("span", { className: "spo-muted", title: esc(h.cto_verdict), children: String(h.cto_verdict).slice(0, 40) }) : null
				] }),
				jsx("div", { className: "spo-stats spo-stats3", style: { padding: "8px 12px" }, children: [
					jsx(StatCard, { num: String(bypass), label: "真绕过（detected-bypass）", tone: bypass > 0 ? "#dc2626" : undefined }),
					jsx(StatCard, { num: String(blocked), label: "门禁拒绝（BLOCKED）", tone: blocked > 0 ? "#d97706" : undefined }),
					jsx(StatCard, { num: String(f.count ?? 0), label: "提交失败（pre-commit）" })
				] }),
				m.length > 0 ? jsx("div", { className: "spo-item", style: { flexWrap: "wrap", gap: "6px" }, children: [
					jsx("span", { className: "spo-muted", style: { flex: "none" }, children: "M 模式复发 " + m.length + " 类：" }),
					...m.map((p) => jsx("span", {
						className: "spo-tag" + (p.again ? " spo-tag-red" : ""),
						key: p.id,
						title: esc(p.name),
						children: p.id + (p.again ? " 复发" : "")
					}))
				] }) : jsx("div", { className: "spo-empty", children: "无 M 模式记录" })
			] });
		}

		function ProjectOverviewPanel(props) {
			const onBack = props && props.onBack;
			const [data, setData] = useState(null);
			const [error, setError] = useState(null);
			const [dash, setDash] = useState(null);
			const [dashError, setDashError] = useState(null);
			const [busy, setBusy] = useState(false);
			const [at, setAt] = useState(null);

			const load = useCallback(async () => {
				setBusy(true);
				// 两条只读 GET 各自独立降级：账本失败不影响健康区，反之亦然（铁律 31）。
				const [ledgerRes, dashRes] = await Promise.allSettled([
					fetch(LEDGER_URL, { cache: "no-store" }).then((r) => {
						if (!r.ok) throw new Error("HTTP " + r.status);
						return r.json();
					}),
					fetch(DASH_URL, { cache: "no-store" }).then((r) => {
						if (!r.ok) throw new Error("HTTP " + r.status);
						return r.json();
					})
				]);
				if (ledgerRes.status === "fulfilled") {
					setData(ledgerRes.value);
					setError(null);
				} else {
					setData(null);
					const e = ledgerRes.reason;
					setError(String(e && e.message ? e.message : e));
				}
				if (dashRes.status === "fulfilled") {
					setDash(dashRes.value);
					setDashError(null);
				} else {
					setDash(null);
					const e = dashRes.reason;
					setDashError(String(e && e.message ? e.message : e));
				}
				setAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
				setBusy(false);
			}, []);

			useEffect(() => {
				load();
				const timer = setInterval(load, 60000);
				const onVis = () => {
					if (document.visibilityState === "visible") load();
				};
				document.addEventListener("visibilitychange", onVis);
				return () => {
					clearInterval(timer);
					document.removeEventListener("visibilitychange", onVis);
				};
			}, [load]);

			const routeDegraded = data !== null && data.ok === false;
			const degradeMsg = error ?? (routeDegraded ? (data.error ?? "ledger 不可用") : null);
			const usable = data !== null && data.ok !== false;
			const lines = usable && Array.isArray(data.lines) ? data.lines : [];
			const blockedTop = usable && Array.isArray(data.blocked) ? data.blocked : [];
			const timeline = usable && Array.isArray(data.timeline) ? data.timeline : [];
			const tasks = usable && Array.isArray(data.tasks) ? data.tasks : [];
			const totals = usable && data.totals ? data.totals : null;
			// 取数来源标注（验收 b）：worktree（工作区文件）| origin/main（git 权威回退）
			const source = usable && typeof data.source === "string" ? data.source : null;

			const v1Total = totals?.v1_total ?? lines.reduce((s, l) => s + (Number(l.v1_total) || 0), 0);
			const v1Passed = totals?.v1_passed ?? lines.reduce((s, l) => s + (Number(l.v1_passed) || 0), 0);
			const v1Verified = totals?.v1_verified ?? lines.reduce((s, l) => s + (Number(l.v1_verified) || 0), 0);
			const fresh = totals?.freshness ?? sumFresh(lines);
			const blockedCount = totals?.blocked_count ?? blockedTop.length;
			const deliveryPct = totals?.delivery_pct ?? pct1(v1Passed, v1Total);
			const verifyPct = totals?.verify_pct ?? pct1(v1Verified, v1Passed);

			const body = [];
			if (degradeMsg) {
				body.push(jsx("div", { className: "spo-degraded", key: "deg", children: "⚠ 降级：" + degradeMsg + "（面板仍可用，数据源未就绪）" }));
			}
			if (usable && data.degraded === true) {
				const srcs = Array.isArray(data.degraded_sources) ? data.degraded_sources : [];
				body.push(jsx("div", { className: "spo-warn", key: "warn", children: "部分数据源降级" + (srcs.length > 0 ? "：" + srcs.join("、") : "") }));
			}
			body.push(jsx("div", { className: "spo-stats", key: "stats", children: [
				jsx(StatCard, { num: deliveryPct === null ? "—" : deliveryPct + "%", label: "交付度 · V1 断言 " + v1Passed + "/" + v1Total }),
				jsx(StatCard, { num: verifyPct === null ? "—" : verifyPct + "%", label: "验证率 · K3 已复核 " + v1Verified + "/" + v1Passed }),
				jsx(StatCard, { num: String(fresh.red ?? 0), label: "保鲜红灯 · 🟢" + (fresh.green ?? 0) + " 🟡" + (fresh.yellow ?? 0), tone: (fresh.red ?? 0) > 0 ? "#dc2626" : undefined }),
				jsx(StatCard, { num: String(blockedCount), label: "阻塞数", tone: blockedCount > 0 ? "#dc2626" : undefined })
			] }));
			body.push(jsx(LinesSection, { key: "lines", lines }));
			body.push(jsx(BlockedSection, { key: "blocked", blocked: blockedTop }));
			body.push(jsx(TasksSection, { key: "tasks", tasks }));
			body.push(jsx(HealthSection, { key: "health", dash, error: dashError }));
			body.push(jsx(TimelineSection, { key: "timeline", timeline }));

			return jsx("div", { className: "spo-root", children: [
				jsx("div", { className: "spo-head", children: [
					jsx("div", { className: "spo-title", children: "项目总览" }),
					source ? jsx("span", { className: "spo-tag" + (source === "worktree" ? "" : " spo-tag-blue"), title: "账本取数来源：worktree = 工作区文件；origin/main = git 权威回退", children: "源 " + source }) : null,
					usable && data.generated_at ? jsx("span", { className: "spo-muted", children: "账本 " + data.generated_at + (data.git_head ? " · " + String(data.git_head).slice(0, 8) : "") }) : null,
					busy ? jsx("div", { className: "spo-spin" }) : null,
					jsx("button", { type: "button", className: "spo-iconBtn", title: "刷新", onClick: load, children: "↻" }),
					onBack ? jsx("button", { type: "button", className: "spo-iconBtn", title: "返回会话", onClick: onBack, children: "»" }) : null
				] }),
				jsx("div", { className: "spo-body", children: body }),
				jsx("div", { className: "spo-head", style: { borderTop: "1px solid var(--dsw-alias-border-l1)", borderBottom: "none", padding: "6px 18px" }, children: [
					jsx("span", { className: "spo-muted", children: "只读视图 · 真相在 git（ledger.json 为派生物）· 更新 " + (at ?? "—") }),
					jsx("span", { className: "spo-spacer" }),
					jsx("span", { className: "spo-muted", children: degradeMsg ? "降级" : "60s 自动刷新" })
				] })
			] });
		}

		/** 侧栏入口图标：sidebar.panellist owner props = { size, active }（官方全局面板行）。 */
		function ProjectOverviewIcon(props) {
			const size = (props && props.size) || 16;
			return jsx("span", {
				style: { fontSize: Math.round(size * 0.9), lineHeight: 1 },
				title: "项目总览"
			}, "📊");
		}

		// ── 插件体 ────────────────────────────────────────────────────────────
		const inject = ["slots", "layout"];

		// 官方全局面板协议（见 @deepseek-ai/dsh-client-ui-sidebar README §全局面板入口）：
		//   sidebar.panellist（root 作用域 list）注册 { id, order?, label? }，组件是**图标**，
		//   收 owner props { size, active }；**同一个 id** 寻址 root 作用域 main（keyed）的组件。
		//   官方明确：选择未注册的 main key 会抛错并保留旧选中态 ⇒ 必须先注册 main，再注册入口行。
		const PANEL_ID = "synova-project-overview";

		function apply(ctx) {
			const slots = ctx.slots;
			// 样式注入：先移除本插件此前注入的所有 <style>，再插当前一份。
			// 这样每次 apply 的样式表都恰好等于当前 CSS —— HMR 热更后不会残留旧规则
			// （旧版按固定 key 判重会拒绝重注入，导致改过 CSS 仍跑旧样式）。
			if (typeof document !== "undefined") {
				for (const stale of document.querySelectorAll('style[data-plugin="@synova/dsh-dashboards"]')) stale.remove();
				const tag = document.createElement("style");
				tag.dataset.plugin = "@synova/dsh-dashboards";
				tag.textContent = CSS;
				document.head.appendChild(tag);
			}
			// ① 先注册 main keyed cell（选中入口行时由 layout 派发到此）
			ctx.effect(() => slots.inject("main", () => slots.register(
				{ name: "main", key: PANEL_ID },
				() => jsx(ProjectOverviewPanel, { onBack: () => ctx.layout.selectPanel(null) })
			)), "synova-project-overview: main cell");
			// ② 再注册左栏入口行（与「任务看板」同区：sidebar.panellist）
			ctx.effect(() => slots.inject("sidebar.panellist", () => slots.register(
				{ name: "sidebar.panellist", id: PANEL_ID, order: 50, label: "项目总览" },
				ProjectOverviewIcon
			)), "synova-project-overview: sidebar entry");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

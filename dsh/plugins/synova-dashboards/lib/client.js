// lib/client.js — @synova/dsh-dashboards Client 半（浏览器端右栏仪表盘）
// 以 __ModuleLoader__.load 工厂格式手写（无需构建）：factory 内 require 仅用
// 静态种子模块（react / react/jsx-runtime），其余数据全部来自
// GET /synova/dashboards/data（Host 半注册，同源）。
//
// 挂载点: shell.overlay 插槽（layout 已声明为 list，root 作用域）——
//   零核心补丁、顺序无关。右缘 52px rail ↔ 372px 面板双态。
// 实时性: 15s 轮询 + visibilitychange 回源 + 手动刷新。
// 避让: MutationObserver 监听 AppFrame 的 data-details-collapsed——
//   工具详情列打开时自动收窄为 rail，不遮挡详情。
window.__ModuleLoader__.load({
	id: "@synova/dsh-dashboards",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		const { useState, useEffect, useCallback, useMemo } = react;
		const { jsx, Fragment } = react_jsx_runtime;

		// ── 样式（主题变量随 DSH 主题走） ───────────────────────────────────────
		const CSS = [
			".sdash-rail{position:absolute;top:0;right:0;bottom:0;width:52px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:8px;padding-top:12px;background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-base));border-left:1px solid var(--dsw-alias-border-l2);z-index:20;color:var(--dsw-alias-label-secondary)}",
			".sdash-railBtn{width:36px;height:36px;border:none;border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;display:grid;place-items:center;font-size:16px;line-height:1}",
			".sdash-railBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".sdash-railLabel{writing-mode:vertical-rl;font-size:11px;letter-spacing:2px;color:var(--dsw-alias-label-tertiary);margin-top:6px;user-select:none}",
			".sdash-panel{position:absolute;top:0;right:0;bottom:0;width:372px;display:flex;flex-direction:column;background:var(--dsw-specific-menu,var(--dsw-alias-bg-base));border-left:1px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-shadow-lv3,none);z-index:20;min-width:0}",
			".sdash-head{flex:none;display:flex;align-items:center;gap:8px;padding:10px 12px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".sdash-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".sdash-iconBtn{width:26px;height:26px;flex:none;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;display:grid;place-items:center;font-size:13px;line-height:1}",
			".sdash-iconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".sdash-tabs{flex:none;display:flex;gap:2px;padding:6px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".sdash-tab{flex:1;min-width:0;padding:5px 4px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:12px;font-weight:500;white-space:nowrap}",
			".sdash-tab:hover{color:var(--dsw-alias-label-secondary)}",
			".sdash-tab[data-active]{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}",
			".sdash-body{flex:1;min-height:0;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px}",
			".sdash-foot{flex:none;display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px}",
			".sdash-footErr{color:var(--dsw-alias-state-error-primary)}",
			".sdash-degraded{padding:6px 10px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px}",
			".sdash-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;background:var(--dsw-alias-bg-elevated,transparent)}",
			".sdash-big{display:flex;align-items:baseline;gap:8px}",
			".sdash-bigNum{font-size:30px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}",
			".sdash-bigSub{font-size:12px;color:var(--dsw-alias-label-tertiary)}",
			".sdash-bar{height:6px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden;margin-top:8px}",
			".sdash-barFill{height:100%;border-radius:999px;background:var(--dsw-static-deepseek-500,var(--dsw-alias-button-info-fill))}",
			".sdash-row{display:flex;align-items:center;gap:8px;min-width:0}",
			".sdash-rowName{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".sdash-rowPct{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);flex:none}",
			".sdash-minibar{flex:none;width:64px;height:4px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}",
			".sdash-minibarFill{height:100%;border-radius:999px;background:var(--dsw-static-deepseek-500,var(--dsw-alias-button-info-fill))}",
			".sdash-task{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:4px}",
			".sdash-taskHead{display:flex;align-items:center;gap:6px;min-width:0}",
			".sdash-taskId{flex:none;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}",
			".sdash-taskTitle{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".sdash-badge{flex:none;font-size:10px;font-weight:600;padding:1px 6px;border-radius:999px;color:#fff}",
			".sdash-badge-green{background:#16a34a}.sdash-badge-amber{background:#d97706}.sdash-badge-red{background:#dc2626}.sdash-badge-blue{background:#2563eb}.sdash-badge-gray{background:#6b7280}",
			".sdash-taskMeta{font-size:11px;color:var(--dsw-alias-label-tertiary);display:flex;gap:8px;flex-wrap:wrap}",
			".sdash-statGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}",
			".sdash-stat{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:2px}",
			".sdash-statNum{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}",
			".sdash-statLabel{font-size:10px;color:var(--dsw-alias-label-tertiary)}",
			".sdash-event{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:16px;display:flex;gap:6px;min-width:0}",
			".sdash-eventAt{flex:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-caption)}",
			".sdash-eventTxt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".sdash-mRow{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);min-width:0}",
			".sdash-mId{flex:none;font-weight:700;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}",
			".sdash-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center;padding:18px 0}",
			".sdash-spin{width:12px;height:12px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-label-primary);border-radius:50%;animation:sdash-spin .8s linear infinite}",
			"@keyframes sdash-spin{to{transform:rotate(360deg)}}"
		].join("");

		// ── 小工具 ─────────────────────────────────────────────────────────────
		function esc(s) {
			return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
		}
		function readOpenPref() {
			try {
				const v = localStorage.getItem("synova.dashboards.open");
				if (v !== null) return v === "1";
			} catch {}
			return (window.innerWidth ?? 1280) >= 1200;
		}
		function writeOpenPref(open) {
			try {
				localStorage.setItem("synova.dashboards.open", open ? "1" : "0");
			} catch {}
		}
		function badgeFor(status) {
			const s = String(status ?? "").toLowerCase();
			if (/verified|done|completed|impl_done|closed|green/.test(s)) return "green";
			if (/fail|rejected|blocked|red|p0/.test(s)) return "red";
			if (/pending|stale|warn|amber|audit|p1/.test(s)) return "amber";
			if (/spec|running|impl|in_progress|blue/.test(s)) return "blue";
			return "gray";
		}
		function statusText(status) {
			const map = {
				impl_done: "实现完成", done: "已完成", completed: "已完成", closed: "已关闭",
				spec: "规格中", in_progress: "进行中", running: "进行中",
				audit: "审计中", pending_k3: "待K3", failed: "失败", rejected: "被拒",
				uncommitted: "未提交", stale: "过期", verified: "已验证",
				unknown: "未知"
			};
			return map[String(status ?? "").toLowerCase()] ?? String(status ?? "");
		}

		// ── 视图组件 ──────────────────────────────────────────────────────────
		function Bar({ pct }) {
			const w = Math.max(0, Math.min(100, Number(pct) || 0));
			return jsx("div", { className: "sdash-bar", children: jsx("div", { className: "sdash-barFill", style: { width: w + "%" } }) });
		}
		function MiniBar({ pct }) {
			const w = Math.max(0, Math.min(100, Number(pct) || 0));
			return jsx("div", { className: "sdash-minibar", children: jsx("div", { className: "sdash-minibarFill", style: { width: w + "%" } }) });
		}

		function ProductView({ p }) {
			if (!p || p.ok === false) return jsx("div", { className: "sdash-empty", children: p?.error ?? "产品数据不可用" });
			const lines = (p.lines ?? []).slice().sort((a, b) => (a.progress_pct ?? 0) - (b.progress_pct ?? 0));
			return jsx(Fragment, { children: [
				jsx("div", { className: "sdash-card", children: [
					jsx("div", { className: "sdash-big", children: [
						jsx("div", { className: "sdash-bigNum", children: String(p.product_progress_pct ?? 0) + "%" }),
						jsx("div", { className: "sdash-bigSub", children: "总体完成度 · " + (p.total_lines ?? lines.length) + " 条产品线" })
					] }),
					jsx(Bar, { pct: p.product_progress_pct }),
					jsx("div", { className: "sdash-event", style: { marginTop: 6 }, children: [
						jsx("span", { className: "sdash-eventAt", children: "生成" }),
						jsx("span", { className: "sdash-eventTxt", children: p.generated_at ?? "未知" })
					] })
				] }),
				jsx("div", { className: "sdash-event", children: [
					jsx("span", { children: "按进度升序（最落后在前）" })
				] }),
				...lines.map((l) => jsx("div", { className: "sdash-row", key: "p" + l.id, children: [
					jsx("div", { className: "sdash-rowName", title: esc(l.name), children: "线" + l.id + " · " + l.name }),
					jsx(MiniBar, { pct: l.progress_pct }),
					jsx("div", { className: "sdash-rowPct", children: (l.progress_pct ?? 0) + "%" }),
					jsx("div", { className: "sdash-eventTxt", style: { flex: "none", color: "var(--dsw-alias-label-tertiary)", fontSize: 10 }, children: "✓" + (l.verified ?? 0) + "/" + (l.total ?? 0) })
				] }))
			] });
		}

		function TasksView({ t }) {
			if (!t || t.ok === false) return jsx("div", { className: "sdash-empty", children: t?.error ?? "任务数据不可用" });
			const states = t.states ?? [];
			return jsx(Fragment, { children: [
				jsx("div", { className: "sdash-event", children: [
					jsx("span", { className: "sdash-eventAt", children: "在途任务" }),
					jsx("span", { className: "sdash-eventTxt", children: states.length + " 个（task-state/）" })
				] }),
				...(states.length === 0 ? [jsx("div", { className: "sdash-empty", key: "e", children: "无在途任务" })] : []),
				...states.map((s) => jsx("div", { className: "sdash-task", key: s.task_id, children: [
					jsx("div", { className: "sdash-taskHead", children: [
						jsx("span", { className: "sdash-taskId", children: s.task_id }),
						jsx("span", { className: "sdash-taskTitle", title: esc(s.title), children: s.title }),
						jsx("span", { className: "sdash-badge sdash-badge-" + badgeFor(s.status), children: statusText(s.status) })
					] }),
					jsx("div", { className: "sdash-taskMeta", children: [
						jsx("span", { children: "更新 " + (s.updated_at ?? "—") }),
						jsx("span", { children: s.updated_by ?? "" }),
						s.impl_commit ? jsx("span", { children: "提交 " + String(s.impl_commit).slice(0, 10) }) : null,
						s.audit_status ? jsx("span", { children: "审计 " + s.audit_status }) : null,
						s.fix_task_id ? jsx("span", { children: "修复 " + s.fix_task_id }) : null
					] })
				] })),
				(t.recent && t.recent.length > 0) ? jsx(Fragment, { children: [
					jsx("div", { className: "sdash-event", style: { marginTop: 4 }, children: [
						jsx("span", { className: "sdash-eventAt", children: "最近任务" }),
						jsx("span", { className: "sdash-eventTxt", children: "（DASHBOARD-CN.md 派生）" })
					] }),
					...t.recent.slice(0, 8).map((r) => jsx("div", { className: "sdash-mRow", key: r.id, children: [
						jsx("span", { className: "sdash-mId", children: r.id }),
						jsx("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: esc(r.title), children: r.title }),
						jsx("span", { className: "sdash-badge sdash-badge-" + badgeFor(r.status), children: r.status })
					] }))
				] }) : null
			] });
		}

		function HealthView({ h }) {
			if (!h || h.ok === false) return jsx("div", { className: "sdash-empty", children: h?.error ?? "健康数据不可用" });
			const b = h.bypass ?? {};
			const counts = b.counts ?? {};
			const f = h.precommit_failures ?? {};
			const m = h.m_patterns ?? [];
			const recentEvents = b.recent ?? [];
			return jsx(Fragment, { children: [
				h.cto_verdict ? jsx("div", { className: "sdash-card", children: [
					jsx("div", { className: "sdash-row", children: [
						jsx("span", { className: "sdash-rowName", children: "CTO 健康判定" }),
						jsx("span", { className: "sdash-rowPct", style: { fontSize: 12 }, children: h.cto_verdict })
					] })
				] }) : null,
				jsx("div", { className: "sdash-statGrid", children: [
					jsx("div", { className: "sdash-stat", children: [
						jsx("div", { className: "sdash-statNum", style: { color: (counts["detected-bypass"] ?? 0) > 0 ? "var(--dsw-alias-state-error-primary)" : undefined }, children: String(counts["detected-bypass"] ?? 0) }),
						jsx("div", { className: "sdash-statLabel", children: "真绕过" })
					] }),
					jsx("div", { className: "sdash-stat", children: [
						jsx("div", { className: "sdash-statNum", style: { color: (counts["BLOCKED"] ?? 0) > 0 ? "var(--dsw-alias-state-warn-primary, #d97706)" : undefined }, children: String(counts["BLOCKED"] ?? 0) }),
						jsx("div", { className: "sdash-statLabel", children: "门禁拒绝" })
					] }),
					jsx("div", { className: "sdash-stat", children: [
						jsx("div", { className: "sdash-statNum", children: String(f.count ?? 0) }),
						jsx("div", { className: "sdash-statLabel", children: "提交失败" })
					] })
				] }),
				m.length > 0 ? jsx(Fragment, { children: [
					jsx("div", { className: "sdash-event", children: [
						jsx("span", { className: "sdash-eventAt", children: "M 模式复发" }),
						jsx("span", { className: "sdash-eventTxt", children: m.length + " 类（审计台账）" })
					] }),
					...m.map((p) => jsx("div", { className: "sdash-mRow", key: p.id, children: [
						jsx("span", { className: "sdash-mId", children: p.id }),
						jsx("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: esc(p.name), children: p.name }),
						p.again ? jsx("span", { className: "sdash-badge sdash-badge-red", children: "复发" }) : null
					] }))
				] }) : null,
				recentEvents.length > 0 ? jsx(Fragment, { children: [
					jsx("div", { className: "sdash-event", children: [
						jsx("span", { className: "sdash-eventAt", children: "门禁事件" }),
						jsx("span", { className: "sdash-eventTxt", children: "最近 " + recentEvents.length + " 条" })
					] }),
					...recentEvents.map((e, i) => jsx("div", { className: "sdash-event", key: i, children: [
						jsx("span", { className: "sdash-eventAt", children: String(e.at ?? "").slice(11, 19) }),
						jsx("span", { className: "sdash-eventTxt", children: [e.outcome, e.task ? " · " + e.task : "", e.agent ? " · " + e.agent : ""].join("") })
					] }))
				] }) : null
			] });
		}

		// ── 面板组件 ──────────────────────────────────────────────────────────
		const TABS = [
			{ id: 0, label: "完成度" },
			{ id: 1, label: "任务" },
			{ id: 2, label: "健康" }
		];

		function DashboardPanel() {
			const [open, setOpen] = useState(readOpenPref);
			const [tab, setTab] = useState(0);
			const [data, setData] = useState(null);
			const [error, setError] = useState(null);
			const [lastUpdated, setLastUpdated] = useState(null);
			const [busy, setBusy] = useState(false);

			const fetchData = useCallback(async () => {
				setBusy(true);
				try {
					const res = await fetch("/synova/dashboards/data", { cache: "no-store" });
					if (!res.ok) throw new Error("HTTP " + res.status);
					const json = await res.json();
					setData(json);
					setError(json && json.degraded ? (json.error ?? "数据降级") : null);
					setLastUpdated(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
				} catch (e) {
					setError(String(e && e.message ? e.message : e));
				} finally {
					setBusy(false);
				}
			}, []);

			useEffect(() => {
				fetchData();
				const timer = setInterval(fetchData, 15000);
				const onVis = () => {
					if (document.visibilityState === "visible") fetchData();
				};
				document.addEventListener("visibilitychange", onVis);
				return () => {
					clearInterval(timer);
					document.removeEventListener("visibilitychange", onVis);
				};
			}, [fetchData]);

			// 工具详情列打开 → 自动收窄为 rail，避免遮挡详情
			useEffect(() => {
				const layer = document.querySelector("[data-shell-overlay]");
				const frame = layer ? layer.parentElement : null;
				if (!frame) return;
				const obs = new MutationObserver(() => {
					if (!frame.hasAttribute("data-details-collapsed")) setOpen(false);
				});
				obs.observe(frame, { attributes: true, attributeFilter: ["data-details-collapsed"] });
				return () => obs.disconnect();
			}, []);

			const toggle = useCallback(() => {
				setOpen((prev) => {
					writeOpenPref(!prev);
					return !prev;
				});
			}, []);

			if (!open) {
				return jsx("div", { className: "sdash-rail", children: [
					jsx("button", { type: "button", className: "sdash-railBtn", title: "打开 Synova 全局跟踪仪表盘", onClick: toggle, children: "📊" }),
					jsx("div", { className: "sdash-railLabel", children: "全局跟踪" })
				] });
			}

			const view =
				tab === 0 ? jsx(ProductView, { p: data && data.product }) :
				tab === 1 ? jsx(TasksView, { t: data && data.tasks }) :
				jsx(HealthView, { h: data && data.health });

			return jsx("div", { className: "sdash-panel", children: [
				jsx("div", { className: "sdash-head", children: [
					jsx("div", { className: "sdash-title", children: "Synova 全局跟踪" }),
					busy ? jsx("div", { className: "sdash-spin" }) : null,
					jsx("button", { type: "button", className: "sdash-iconBtn", title: "刷新", onClick: fetchData, children: "↻" }),
					jsx("button", { type: "button", className: "sdash-iconBtn", title: "收起（保留为窄栏）", onClick: toggle, children: "»" })
				] }),
				jsx("div", { className: "sdash-tabs", children: TABS.map((t) => jsx("button", {
					type: "button", key: t.id, className: "sdash-tab", "data-active": tab === t.id || undefined,
					onClick: () => setTab(t.id), children: t.label
				})) }),
				jsx("div", { className: "sdash-body", children: [
					error ? jsx("div", { className: "sdash-degraded", children: "⚠ " + error }) : null,
					!data && !error ? jsx("div", { className: "sdash-empty", children: "加载中…" }) : view
				] }),
				jsx("div", { className: "sdash-foot", children: [
					jsx("span", { children: "更新 " + (lastUpdated ?? "—") }),
					jsx("span", { style: { flex: 1 } }),
					jsx("span", { className: error ? "sdash-footErr" : undefined, children: error ? "降级" : "15s 自动刷新" })
				] })
			] });
		}

		// ── 插件体 ────────────────────────────────────────────────────────────
		const inject = ["slots", "layout"];

		function apply(ctx) {
			const slots = ctx.slots;
			if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=sdash]") === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "@synova/dsh-dashboards";
				tag.dataset.pluginCss = "sdash";
				tag.textContent = CSS;
				document.head.appendChild(tag);
			}
			ctx.effect(() => {
				const dispose = slots.register({
					name: "shell.overlay",
					id: "synova-dashboards",
					order: 200
				}, DashboardPanel);
				return dispose;
			}, "synova-dashboards: right rail");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

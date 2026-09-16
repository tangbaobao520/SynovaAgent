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
			"@keyframes sdash-spin{to{transform:rotate(360deg)}}",
			// ── 「项目总览」中央面板（main keyed cell）——spo- 前缀，与右栏 sdash- 互不影响 ──
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
			".spo-iconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}"
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

		// ── 「项目总览」中央面板（只读；数据源 GET /synova/pm/ledger） ────────────
		// 契约（铁律 47）：
		//   @input  GET /synova/pm/ledger
		//             成功 → ledger.json 原样（schema/generated_at/totals/lines/blocked/timeline）
		//             降级 → { ok:false, degraded:true, error }        （路由级，Host 读不到/坏 JSON）
		//   @output 四区块：① 顶部四数 ② 26 线总览（可展开断言明细）③ 阻塞清单 ④ 时间轴
		//   @degraded 三态，均显式呈现、不白屏、不抛错（铁律 24/31）：
		//             ① 网络/HTTP 失败  → error 横幅
		//             ② ok:false        → 路由级 degraded 横幅（D795 未产出时的正常态）
		//             ③ degraded:true   → ledger 内的部分降级警告 + degraded_sources 列表
		//   @write  零写入：只 GET，不写工作区/仓库/localStorage（D794 红线）
		const LEDGER_URL = "/synova/pm/ledger";

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

		function ProjectOverviewPanel(props) {
			const onBack = props && props.onBack;
			const [data, setData] = useState(null);
			const [error, setError] = useState(null);
			const [busy, setBusy] = useState(false);
			const [at, setAt] = useState(null);

			const load = useCallback(async () => {
				setBusy(true);
				try {
					const res = await fetch(LEDGER_URL, { cache: "no-store" });
					if (!res.ok) throw new Error("HTTP " + res.status);
					const json = await res.json();
					setData(json);
					setError(null);
					setAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
				} catch (e) {
					setData(null);
					setError(String(e && e.message ? e.message : e));
				} finally {
					setBusy(false);
				}
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
			const totals = usable && data.totals ? data.totals : null;

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
			body.push(jsx(TimelineSection, { key: "timeline", timeline }));

			return jsx("div", { className: "spo-root", children: [
				jsx("div", { className: "spo-head", children: [
					jsx("div", { className: "spo-title", children: "项目总览" }),
					usable && data.generated_at ? jsx("span", { className: "spo-muted", children: "账本 " + data.generated_at + (data.git_head ? " · " + String(data.git_head).slice(0, 8) : "") }) : null,
					busy ? jsx("div", { className: "sdash-spin" }) : null,
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

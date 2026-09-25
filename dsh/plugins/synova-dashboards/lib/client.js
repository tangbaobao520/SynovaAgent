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
			// 浮动面板：定位/尺寸由内联 style 驱动（拖动/缩放），见 PANEL_GEO_KEY
			".spo-root{position:fixed;z-index:40;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:var(--dsw-shadow-lv3,0 8px 32px rgba(0,0,0,.28))}",
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
			// ── 修裁切/重叠根因：flex 子项默认 flex-shrink:1，长列表会把各区块压扁 → 显式 flex:none ──
			".spo-body>*{flex:none}",
			".spo-sec{flex:none}",
			// 列表类区块自身滚动（外层 .spo-body 仍保留滚动）
			".spo-list{max-height:40vh;overflow-y:auto}",
			// 拖动/缩放/折叠交互
			".spo-grip{cursor:grab;user-select:none;touch-action:none}",
			".spo-grip:active{cursor:grabbing}",
			".spo-resize{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 0 55%,var(--dsw-alias-border-l3,#9ca3af) 55% 62%,transparent 62% 74%,var(--dsw-alias-border-l3,#9ca3af) 74% 81%,transparent 81%)}",
			".spo-fold{flex:none;width:18px;height:18px;padding:0;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:11px;line-height:1;display:grid;place-items:center}",
			".spo-fold:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".spo-stats3{grid-template-columns:repeat(3,1fr)}",
			".spo-tag-green{background:#16a34a;color:#fff}.spo-tag-amber{background:#d97706;color:#fff}.spo-tag-blue{background:#2563eb;color:#fff}.spo-tag-gray{background:#6b7280;color:#fff}",
			".spo-item{display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px;min-width:0}",
			".spo-itemTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}",
			".spo-id{flex:none;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}",
			// ── 「宪章三问」中央面板（D963）——scg- 前缀 ──
			".scg-root{position:fixed;z-index:40;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:var(--dsw-shadow-lv3,0 8px 32px rgba(0,0,0,.28))}",
			".scg-body{flex:1;min-height:0;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:12px}",
			".scg-body>*{flex:none}",
			".scg-grid{display:grid;grid-template-columns:minmax(120px,1.4fr) repeat(3,minmax(90px,1fr));gap:0;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;font-size:12px}",
			".scg-cell{padding:6px 10px;border-top:1px solid var(--dsw-alias-border-l1);border-left:1px solid var(--dsw-alias-border-l1);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".scg-cellHead{font-weight:600;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);border-top:none}",
			".scg-cell:nth-child(-n+4){border-top:none}",
			".scg-cell:nth-child(4n+1){border-left:none}",
			".scg-rowName{color:var(--dsw-alias-label-secondary);font-weight:600}",
			".scg-pill{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;padding:1px 7px;border-radius:999px}",
			".scg-pill-green{background:#16a34a;color:#fff}.scg-pill-blue{background:#2563eb;color:#fff}.scg-pill-amber{background:#d97706;color:#fff}.scg-pill-red{background:#dc2626;color:#fff}.scg-pill-gray{background:#6b7280;color:#fff}",
			".scg-legend{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".scg-note{font-size:10px;color:var(--dsw-alias-label-tertiary)}"
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

		/**
		 * 区块外壳：统一「折叠开关(▸/▾) + 标题 + 右侧摘要 + 内容容器」。
		 * 内容容器默认 `.spo-list`（max-height:40vh + 自身滚动）——长列表不再把区块撑爆/裁切；
		 * 折叠后整块内容不渲染（省 DOM，也让「折叠」在测试里可断言）。
		 */
		function Section({ id, title, extra, collapsed, onToggle, children }) {
			return jsx("div", { className: "spo-sec", children: [
				jsx("div", { className: "spo-secHead", children: [
					jsx("button", {
						type: "button",
						className: "spo-fold",
						"data-section": id,
						"aria-expanded": collapsed ? "false" : "true",
						title: collapsed ? "展开" : "折叠",
						onClick: () => onToggle(id),
						children: collapsed ? "▸" : "▾"
					}),
					jsx("span", { children: title }),
					jsx("span", { className: "spo-spacer" }),
					extra ?? null
				] }),
				collapsed ? null : jsx("div", { className: "spo-list", children })
			] });
		}

		function LinesSection({ lines, collapsed, onToggle }) {
			const [openId, setOpenId] = useState(null);
			if (lines.length === 0) {
				return jsx(Section, { id: "lines", title: "26 线总览", collapsed, onToggle,
					children: jsx("div", { className: "spo-empty", children: "ledger 无 lines 数据（待 D795）" }) });
			}
			return jsx(Section, {
				id: "lines", title: "26 线总览", collapsed, onToggle,
				extra: jsx("span", { className: "spo-muted", children: lines.length + " 条线 · 点行看断言明细" }),
				children: lines.map((l) => {
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
			});
		}

		function BlockedSection({ blocked, collapsed, onToggle }) {
			return jsx(Section, {
				id: "blocked", title: "阻塞清单", collapsed, onToggle,
				extra: jsx("span", { className: "spo-muted", children: blocked.length + " 项" }),
				children: blocked.length === 0
					? jsx("div", { className: "spo-empty", children: "无阻塞（blocked 为空）" })
					: blocked.map((b, i) => jsx("div", { className: "spo-blocked", key: b.id ?? i, children: [
						jsx("div", { className: "spo-blockedHead", children: [
							b.id ? jsx("span", { className: "spo-tag", children: b.id }) : null,
							jsx("span", { className: "spo-blockedReason", title: esc(b.reason), children: b.reason ?? "(无原因)" }),
							jsx("span", { className: "spo-num", style: { color: "#dc2626", fontWeight: 600 }, children: "已卡 " + (b.days ?? "?") + " 天" })
						] }),
						jsx("div", { className: "spo-muted", children: "起始 " + (b.since ?? "—") + " · 需要 " + (b.needs ?? "—") })
					]}))
			});
		}

		function TimelineSection({ timeline, collapsed, onToggle }) {
			return jsx(Section, {
				id: "timeline", title: "时间轴（里程碑泳道 / 计划×实际）", collapsed, onToggle,
				children: timeline.length === 0
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
			});
		}

		/**
		 * 执行看板：数据源 ledger.tasks（D795 由 task-state/*.json 派生，含 owner/stale_days）。
		 * 全区只读；任务多（200+）时按停滞天数降序取前 12 + 状态分布标签，避免长列表压垮面板。
		 */
		function TasksSection({ tasks, collapsed, onToggle }) {
			if (tasks.length === 0) {
				return jsx(Section, { id: "tasks", title: "执行看板", collapsed, onToggle,
					children: jsx("div", { className: "spo-empty", children: "ledger 无 tasks 数据（待 D795）" }) });
			}
			const byStatus = {};
			for (const t of tasks) {
				const k = String((t && t.status) ?? "unknown");
				byStatus[k] = (byStatus[k] ?? 0) + 1;
			}
			const top = tasks.slice()
				.sort((a, b) => (Number(b.stale_days) || 0) - (Number(a.stale_days) || 0))
				.slice(0, 12);
			return jsx(Section, {
				id: "tasks", title: "执行看板", collapsed, onToggle,
				extra: jsx("span", { className: "spo-muted", children: tasks.length + " 个任务 · 按停滞降序取前 " + top.length }),
				children: [
					jsx("div", { className: "spo-item", style: { borderTop: "none", flexWrap: "wrap", gap: "6px" }, children: Object.keys(byStatus).sort().map((k) =>
						jsx("span", { className: tagClass(k), key: k, children: statusText(k) + " " + byStatus[k] })
					) }),
					...top.map((t) => jsx("div", { className: "spo-item", key: t.id, children: [
						jsx("span", { className: "spo-id", children: t.id }),
						jsx("span", { className: "spo-itemTitle", title: esc(t.title), children: t.title ?? "" }),
						jsx("span", { className: tagClass(t.status), children: statusText(t.status) }),
						jsx("span", { className: "spo-num", style: { flex: "none" }, children: (t.owner ?? "—") + " · 停滞 " + (t.stale_days ?? "?") + " 天" })
					] }))
				]
			});
		}

		/**
		 * 健康区：复用既有 GET /synova/dashboards/data 的 health（不新增第二真相源）。
		 * 与其余区块独立降级——健康路由失败/ok:false 只影响本区，且必须显式可见（铁律 24/31）。
		 */
		function HealthSection({ dash, error, collapsed, onToggle }) {
			const h = dash && dash.health;
			if (error !== null || !h || h.ok === false) {
				return jsx(Section, { id: "health", title: "健康", collapsed, onToggle,
					children: jsx("div", { className: "spo-empty", children: "⚠ 健康区降级：" + (error ?? (h && h.error) ?? "路由无响应") }) });
			}
			const b = h.bypass ?? {};
			const counts = b.counts ?? {};
			const f = h.precommit_failures ?? {};
			const m = Array.isArray(h.m_patterns) ? h.m_patterns : [];
			const bypass = Number(counts["detected-bypass"] ?? 0);
			const blocked = Number(counts.BLOCKED ?? 0);
			return jsx(Section, {
				id: "health", title: "健康", collapsed, onToggle,
				extra: h.cto_verdict ? jsx("span", { className: "spo-muted", title: esc(h.cto_verdict), children: String(h.cto_verdict).slice(0, 40) }) : null,
				children: [
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
				]
			});
		}

		// ── 面板几何（拖动/缩放）与折叠偏好 ────────────────────────────────────
		// 存储键带版本号：将来看结构变更时可直接换键，不会读到脏数据。
		const PANEL_GEO_KEY = "synova.pm.panel.v1";
		const PANEL_COLLAPSE_KEY = "synova.pm.collapse.v1";
		const PANEL_MIN_W = 720;
		const PANEL_MIN_H = 480;
		const PANEL_MARGIN = 32;
		// 拖动/缩放过程中的起点。面板同时只存在一个实例（main keyed cell），故用模块级变量
		// 而非 useRef —— 也避免污染 hook 顺序。
		let dragOrigin = null;
		let resizeOrigin = null;
		let lastGeo = null;

		/** 统一 pointer capture：不支持时静默跳过（拖动/缩放仍可用）。 */
		function capturePointer(e) {
			const el = e && e.currentTarget;
			if (!el || typeof el.setPointerCapture !== "function" || e.pointerId === undefined) return;
			try {
				el.setPointerCapture(e.pointerId);
			} catch (err) {
				console.warn("[项目总览] setPointerCapture 失败（拖动/缩放仍可用）: " + (err && err.message ? err.message : err));
			}
		}

		function clampNum(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
		function viewportW() { return (typeof window !== "undefined" && window.innerWidth) || 1280; }
		function viewportH() { return (typeof window !== "undefined" && window.innerHeight) || 800; }

		/** 默认几何：视口内居中，四周留 PANEL_MARGIN。 */
		function defaultGeo() {
			const vw = viewportW(), vh = viewportH();
			const width = clampNum(1100, PANEL_MIN_W, Math.max(PANEL_MIN_W, vw - PANEL_MARGIN));
			const height = clampNum(760, PANEL_MIN_H, Math.max(PANEL_MIN_H, vh - PANEL_MARGIN));
			return { left: Math.max(0, Math.round((vw - width) / 2)), top: Math.max(0, Math.round((vh - height) / 2)), width, height };
		}

		/** 读偏好。localStorage 不可用（隐私模式/配额）或内容非法 → 返回 null 走默认，不抛错、不白屏。 */
		function readJSONPref(storageKey) {
			try {
				const raw = localStorage.getItem(storageKey);
				if (!raw) return null;
				const v = JSON.parse(raw);
				return v !== null && typeof v === "object" ? v : null;
			} catch (err) {
				console.warn("[项目总览] 偏好读取失败，本区降级为默认值: " + storageKey + " — " + (err && err.message ? err.message : err));
				return null;
			}
		}
		/** 写偏好。失败只记 console（不静默），不影响面板可用性。 */
		function writeJSONPref(storageKey, value) {
			try {
				localStorage.setItem(storageKey, JSON.stringify(value));
			} catch (err) {
				console.warn("[项目总览] 偏好写入失败，本次不记忆: " + storageKey + " — " + (err && err.message ? err.message : err));
			}
		}

		/** 几何归一化：任何来源（默认/记忆/拖动/缩放）都必须落在 min/max 之间且不出视口。 */
		function normalizeGeo(g) {
			const vw = viewportW(), vh = viewportH();
			const width = clampNum(Number(g.width) || 0, PANEL_MIN_W, Math.max(PANEL_MIN_W, vw - PANEL_MARGIN));
			const height = clampNum(Number(g.height) || 0, PANEL_MIN_H, Math.max(PANEL_MIN_H, vh - PANEL_MARGIN));
			const left = clampNum(Number(g.left) || 0, 0, Math.max(0, vw - width));
			const top = clampNum(Number(g.top) || 0, 0, Math.max(0, vh - height));
			return { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) };
		}
		/** 启动几何：有合法记忆用记忆（并归一化），否则用默认。 */
		function readGeo() {
			const saved = readJSONPref(PANEL_GEO_KEY);
			const usable = saved && Number.isFinite(Number(saved.width)) && Number.isFinite(Number(saved.height));
			return normalizeGeo(usable ? saved : defaultGeo());
		}
		/** 折叠态：默认全部展开。 */
		function readCollapsed() {
			return Object.assign({ lines: false, blocked: false, tasks: false, health: false, timeline: false }, readJSONPref(PANEL_COLLAPSE_KEY) ?? {});
		}

		function ProjectOverviewPanel(props) {
			const onBack = props && props.onBack;
			const [data, setData] = useState(null);
			const [error, setError] = useState(null);
			const [dash, setDash] = useState(null);
			const [dashError, setDashError] = useState(null);
			const [busy, setBusy] = useState(false);
			const [at, setAt] = useState(null);
			// 位置/尺寸（localStorage 记忆）与四+区块折叠态（localStorage 记忆）
			const [geo, setGeo] = useState(readGeo);
			const [collapsed, setCollapsed] = useState(readCollapsed);

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

			// 折叠切换：写回 localStorage（折叠态记忆）
			const toggleSection = useCallback((id) => {
				const next = Object.assign({}, collapsed, { [id]: !collapsed[id] });
				setCollapsed(next);
				writeJSONPref(PANEL_COLLAPSE_KEY, next);
			}, [collapsed]);

			// 拖动：标题栏 pointerdown → move → up。移动期间只改 state，松手才落盘。
			const onDragStart = useCallback((e) => {
				dragOrigin = { x: e.clientX, y: e.clientY, left: geo.left, top: geo.top };
				lastGeo = geo;
				capturePointer(e);
			}, [geo]);
			const onDragMove = useCallback((e) => {
				if (dragOrigin === null) return;
				const next = normalizeGeo({
					width: geo.width,
					height: geo.height,
					left: dragOrigin.left + (e.clientX - dragOrigin.x),
					top: dragOrigin.top + (e.clientY - dragOrigin.y)
				});
				lastGeo = next;
				setGeo(next);
			}, [geo.width, geo.height]);
			const onDragEnd = useCallback(() => {
				if (dragOrigin === null) return;
				dragOrigin = null;
				writeJSONPref(PANEL_GEO_KEY, lastGeo ?? geo);
			}, [geo]);

			// 缩放：右下角手柄，同样松手落盘；min 720×480，max 视口-32px（由 normalizeGeo 保证）
			const onResizeStart = useCallback((e) => {
				resizeOrigin = { x: e.clientX, y: e.clientY, width: geo.width, height: geo.height };
				lastGeo = geo;
				capturePointer(e);
			}, [geo]);
			const onResizeMove = useCallback((e) => {
				if (resizeOrigin === null) return;
				const next = normalizeGeo({
					left: geo.left,
					top: geo.top,
					width: resizeOrigin.width + (e.clientX - resizeOrigin.x),
					height: resizeOrigin.height + (e.clientY - resizeOrigin.y)
				});
				lastGeo = next;
				setGeo(next);
			}, [geo.left, geo.top]);
			const onResizeEnd = useCallback(() => {
				if (resizeOrigin === null) return;
				resizeOrigin = null;
				writeJSONPref(PANEL_GEO_KEY, lastGeo ?? geo);
			}, [geo]);

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
			body.push(jsx(LinesSection, { key: "lines", lines, collapsed: collapsed.lines, onToggle: toggleSection }));
			body.push(jsx(BlockedSection, { key: "blocked", blocked: blockedTop, collapsed: collapsed.blocked, onToggle: toggleSection }));
			body.push(jsx(TasksSection, { key: "tasks", tasks, collapsed: collapsed.tasks, onToggle: toggleSection }));
			body.push(jsx(HealthSection, { key: "health", dash, error: dashError, collapsed: collapsed.health, onToggle: toggleSection }));
			body.push(jsx(TimelineSection, { key: "timeline", timeline, collapsed: collapsed.timeline, onToggle: toggleSection }));

			return jsx("div", {
				className: "spo-root",
				style: { left: geo.left + "px", top: geo.top + "px", width: geo.width + "px", height: geo.height + "px" },
				children: [
				jsx("div", {
					className: "spo-head spo-grip",
					title: "拖动标题栏移动面板",
					onPointerDown: onDragStart,
					onPointerMove: onDragMove,
					onPointerUp: onDragEnd,
					onPointerCancel: onDragEnd,
					children: [
					jsx("div", { className: "spo-title", children: "项目总览" }),
					source ? jsx("span", { className: "spo-tag" + (source === "worktree" ? "" : " spo-tag-blue"), title: "账本取数来源：worktree = 工作区文件；origin/main = git 权威回退", children: "源 " + source }) : null,
					usable && data.generated_at ? jsx("span", { className: "spo-muted", children: "账本 " + data.generated_at + (data.git_head ? " · " + String(data.git_head).slice(0, 8) : "") }) : null,
					busy ? jsx("div", { className: "spo-spin" }) : null,
					jsx("button", { type: "button", className: "spo-iconBtn", title: "刷新", onClick: load, children: "↻" }),
					onBack ? jsx("button", { type: "button", className: "spo-iconBtn", title: "返回会话", onClick: onBack, children: "»" }) : null
				] }),
				jsx("div", { className: "spo-body", children: body }),
				jsx("div", { className: "spo-head spo-foot", style: { borderTop: "1px solid var(--dsw-alias-border-l1)", borderBottom: "none", padding: "6px 18px" }, children: [
					jsx("span", { className: "spo-muted", children: "只读视图 · 真相在 git（ledger.json 为派生物）· 更新 " + (at ?? "—") }),
					jsx("span", { className: "spo-spacer" }),
					jsx("span", { className: "spo-muted", children: degradeMsg ? "降级" : "60s 自动刷新" })
				] }),
				jsx("div", {
					className: "spo-resize",
					title: "拖动缩放面板",
					onPointerDown: onResizeStart,
					onPointerMove: onResizeMove,
					onPointerUp: onResizeEnd,
					onPointerCancel: onResizeEnd
				})
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

		// ── 「宪章三问」中央面板（D963；只读一条 GET，独立降级） ──────────────────
		// 契约（铁律 47）：
		//   @input GET /synova/charter/grid
		//            成功 → { ...grid, ok:true, source } 其中 grid = {
		//              questions: string[3]（加了吗/接上了吗/生效了吗）,
		//              rows: [{ id, name, cells: [{ status, note }] }]（16 行 × 3 列 = 48 格）
		//            }
		//            降级 → { ok:false, degraded:true, error, missing }（文件未产出是当前正常态）
		//   @output 48 格矩阵 + 四色图例（绿=通过 / 蓝=进行中 / 黄=待核 / 红=失败 / 灰=待办）
		//   @degraded 三态显式（铁律 24/31）：网络失败 → error 横幅；路由 ok:false →
		//            「数据源未就绪（缺 宪章三问-48格.json）」横幅；面板结构始终在场不白屏。
		//   @X27 铁律：空/缺失/未知 status 一律渲染为「待办」（灰），绝不着绿/显示为通过。
		//   @write  零写入：只 GET。
		const CHARTER_URL = "/synova/charter/grid";

		/**
		 * 格子状态归一化（X27）：只有显式已知的通过词才给绿；
		 * 空/undefined/未知词一律「待办」灰 —— 缺数据永不冒充通过。
		 */
		function charterCell(status) {
			const s = String(status ?? "").trim().toLowerCase();
			if (/^(done|yes|verified|effective|complete[d]?|passed|ok)$/.test(s)) return { tone: "green", text: "通过" };
			if (/^(partial|in_progress|running|impl|wired|dispatched|claimed|spec)$/.test(s)) return { tone: "blue", text: s === "partial" ? "部分" : "进行中" };
			if (/^(warn|stale|audit|pending_k3|degraded)$/.test(s)) return { tone: "amber", text: "待核" };
			if (/^(fail|failed|no|red|blocked|rejected)$/.test(s)) return { tone: "red", text: "失败" };
			return { tone: "gray", text: "待办" };
		}

		function CharterGridPanel(props) {
			const onBack = props && props.onBack;
			const [data, setData] = useState(null);
			const [error, setError] = useState(null);
			const [busy, setBusy] = useState(false);
			const [at, setAt] = useState(null);

			const load = useCallback(async () => {
				setBusy(true);
				try {
					const r = await fetch(CHARTER_URL, { cache: "no-store" });
					if (!r.ok) throw new Error("HTTP " + r.status);
					const j = await r.json();
					setData(j);
					setError(null);
				} catch (err) {
					setData(null);
					setError(String(err && err.message ? err.message : err));
					console.warn("[宪章三问] 取数失败: " + (err && err.message ? err.message : err));
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
			const usable = data !== null && data.ok !== false;
			const questions = usable && Array.isArray(data.questions) && data.questions.length === 3
				? data.questions : ["加了吗", "接上了吗", "生效了吗"];
			const rows = usable && Array.isArray(data.rows) ? data.rows : [];
			const source = usable && typeof data.source === "string" ? data.source : null;

			// 四色统计（矩阵图例 + 顶部概览）
			const toneCount = { green: 0, blue: 0, amber: 0, red: 0, gray: 0 };
			for (const row of rows) {
				const cells = Array.isArray(row.cells) ? row.cells : [];
				for (let q = 0; q < 3; q++) {
					toneCount[charterCell(cells[q] && cells[q].status).tone]++;
				}
			}

			const body = [];
			if (routeDegraded) {
				body.push(jsx("div", { className: "spo-degraded", key: "deg", children: "⚠ 数据源未就绪（缺 " + (data.missing ?? "宪章三问-48格.json") + "）——" + (data.error ?? "") }));
			} else if (error !== null) {
				body.push(jsx("div", { className: "spo-degraded", key: "err", children: "⚠ 降级：" + error + "（面板仍可用，稍后自动重试）" }));
			}
			body.push(jsx("div", { className: "scg-legend", key: "legend", children: [
				jsx("span", { children: "四色：" }),
				jsx("span", { className: "scg-pill scg-pill-green", children: "通过 " + toneCount.green }),
				jsx("span", { className: "scg-pill scg-pill-blue", children: "进行中 " + toneCount.blue }),
				jsx("span", { className: "scg-pill scg-pill-amber", children: "待核 " + toneCount.amber }),
				jsx("span", { className: "scg-pill scg-pill-red", children: "失败 " + toneCount.red }),
				jsx("span", { className: "scg-pill scg-pill-gray", children: "待办 " + toneCount.gray }),
				jsx("span", { children: "· " + rows.length + " 个扩展点 × 3 问" })
			] }));
			body.push(jsx("div", { className: "scg-grid", key: "grid", children: [
				jsx("div", { className: "scg-cell scg-cellHead", key: "h0", children: "扩展点" }),
				...questions.map((q, i) => jsx("div", { className: "scg-cell scg-cellHead", key: "h" + (i + 1), children: q })),
				...rows.flatMap((row, ri) => {
					const cells = Array.isArray(row.cells) ? row.cells : [];
					const nodes = [jsx("div", { className: "scg-cell scg-rowName", key: "r" + ri, title: esc(row.name), children: (row.id ? row.id + " · " : "") + (row.name ?? "") })];
					for (let q = 0; q < 3; q++) {
						const c = charterCell(cells[q] && cells[q].status);
						const note = cells[q] && cells[q].note ? String(cells[q].note) : "";
						nodes.push(jsx("div", { className: "scg-cell", key: "r" + ri + "c" + q, title: esc(note), children: [
							jsx("span", { className: "scg-pill scg-pill-" + c.tone, children: c.text }),
							note ? jsx("span", { className: "scg-note", children: " " + note }) : null
						] }));
					}
					return nodes;
				})
			] }));
			if (usable && rows.length === 0) {
				body.push(jsx("div", { className: "spo-empty", key: "empty", children: "数据已就绪但 rows 为空（等宪章 48 格产出方补数）" }));
			}

			return jsx("div", { className: "scg-root", style: { left: "160px", top: "90px", width: "880px", height: "600px" }, children: [
				jsx("div", { className: "spo-head", children: [
					jsx("div", { className: "spo-title", children: "宪章三问" }),
					source ? jsx("span", { className: "spo-tag" + (source === "worktree" ? "" : " spo-tag-blue"), children: "源 " + source }) : null,
					jsx("span", { className: "spo-muted", children: "加了吗 / 接上了吗 / 生效了吗 —— 16 扩展点 × 3 问" }),
					busy ? jsx("div", { className: "spo-spin" }) : null,
					jsx("button", { type: "button", className: "spo-iconBtn", title: "刷新", onClick: load, children: "↻" }),
					onBack ? jsx("button", { type: "button", className: "spo-iconBtn", title: "返回会话", onClick: onBack, children: "»" }) : null
				] }),
				jsx("div", { className: "scg-body", children: body }),
				jsx("div", { className: "spo-head", style: { borderTop: "1px solid var(--dsw-alias-border-l1)", borderBottom: "none", padding: "6px 18px" }, children: [
					jsx("span", { className: "spo-muted", children: "只读视图 · 数据源 docs/synova/coordination/宪章三问-48格.json · 更新 " + (at ?? "—") }),
					jsx("span", { className: "spo-spacer" }),
					jsx("span", { className: "spo-muted", children: routeDegraded || error !== null ? "降级" : "60s 自动刷新" })
				] })
			] });
		}

		/** 侧栏入口图标（宪章三问）。 */
		function CharterGridIcon(props) {
			const size = (props && props.size) || 16;
			return jsx("span", {
				style: { fontSize: Math.round(size * 0.9), lineHeight: 1 },
				title: "宪章三问"
			}, "🧭");
		}

		// ── 插件体 ────────────────────────────────────────────────────────────
		const inject = ["slots", "layout"];

		// 官方全局面板协议（见 @deepseek-ai/dsh-client-ui-sidebar README §全局面板入口）：
		//   sidebar.panellist（root 作用域 list）注册 { id, order?, label? }，组件是**图标**，
		//   收 owner props { size, active }；**同一个 id** 寻址 root 作用域 main（keyed）的组件。
		//   官方明确：选择未注册的 main key 会抛错并保留旧选中态 ⇒ 必须先注册 main，再注册入口行。
		const PANEL_ID = "synova-project-overview";

		// ── 框架态显式降级（D963；依据 DSH 锚定仓实读，禁猜 API）─────────────────
		// 探测依据（file:line 为 DSH 仓 /Users/wane/src/deepseek-harness-017）：
		//   · slots.inject 对未声明 slot **静默不执行回调**（packages/client/ui-renderer/src/client/registry.ts
		//     inject(): reconcile `if (spec === undefined) return` —— 永不声明则回调永不跑、不报错）
		//     → 插件必须在 apply 时用 specDynamic/spec 主动探测并显式 warn，否则静默无面板。
		//   · slots.register 到未声明 slot **同步抛错**（packages/client/ui-slots/src/index.ts:1206
		//     `slot "X" is not declared`）→ inject 回调内必须 try/catch，禁让异常穿透拖垮宿主 fiber。
		//   · ctx.slots 上的 spec/specDynamic 是 SlotCore 公共查询面
		//     （packages/extensions/cordis-client-runner/src/client/api-catalog.ts SlotCore 声明；
		//     guard.ts:127 框架自身也用 slots.spec(slot) 探测），插件可安全调用。
		//   · 插件 inject 声明的 service 缺失（DSH 版本不足/宿主未提供）→ apply 挂起等待、
		//     根本不执行（cordis-client-runner/src/client/runtime.ts:393 waitingFor）→ 该态框架侧
		//     已投影，插件无法自报（apply 没跑，无代码执行点）；apply 内能做的只剩防御性探测
		//     ctx.slots 形状，覆盖「apply 被调用但 API 面缺失」的旧版本宿主。
		//   · 「插件未装」态：插件代码不在运行，无任何执行点，逻辑上不可能由插件自报（框架侧）。
		const TAG = "[synova-dashboards]";
		function frameworkWarn(msg) {
			// 铁律 24/31：禁静默——框架态降级必须留痕且可见（console.warn 是插件在
			// 面板注册失败时唯一剩余的表达面；面板/入口不存在时无 UI 可挂）。
			console.warn(TAG + " " + msg);
		}
		/** 探测 slot 是否已声明：specDynamic/spec 任一可用则查询；两者皆缺 → 无法探测(null)。 */
		function slotDeclared(slots, key) {
			try {
				const probe = typeof slots.specDynamic === "function" ? slots.specDynamic
					: typeof slots.spec === "function" ? slots.spec : null;
				if (!probe) return null;
				return probe.call(slots, key) !== undefined;
			} catch (err) {
				console.warn(TAG + " slot 声明探测失败(" + key + ")：" + (err && err.message ? err.message : err));
				return null;
			}
		}
		/** inject 回调包装：register 对未声明 slot 同步抛错 → 捕获 + 显式 warn，禁穿透宿主。 */
		function guardedRegister(slotKey, label, doRegister) {
			try {
				return doRegister();
			} catch (err) {
				frameworkWarn(label + " 注册失败（slot \"" + slotKey + "\" 未声明？DSH 版本可能过旧）：" + (err && err.message ? err.message : err));
				return () => {};
			}
		}

		function apply(ctx) {
			const slots = ctx && ctx.slots;
			// 降级态①：DSH 版本不足——apply 被调用但 slots 服务/API 面缺失（防御性探测；
			// service 整体缺失时 apply 不会跑，属框架侧 waitingFor 投影，见上方注释）。
			if (!slots || typeof slots.inject !== "function" || typeof slots.register !== "function") {
				frameworkWarn("DSH 版本不足或宿主异常：ctx.slots 不可用（inject=" + typeof (slots && slots.inject) + ", register=" + typeof (slots && slots.register) + "），两块面板均未注册。此态插件无法在 UI 内自报，请升级 DSH。");
				return;
			}
			// 降级态②：slot 不存在——inject 对未声明 slot 静默不执行回调（registry.ts reconcile），
			// 这里主动探测并显式 warn（注入仍保留：声明稍后出现时回调会照常运行）。
			for (const key of ["main", "sidebar.panellist"]) {
				const declared = slotDeclared(slots, key);
				if (declared === false) {
					frameworkWarn("slot \"" + key + "\" 当前未声明——slots.inject 将等待声明（回调暂不执行）。若 DSH 版本过旧导致该 slot 永不存在，面板将不出现且此处是唯一提示。");
				}
			}
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
			// ① 先注册 main keyed cell（选中入口行时由 layout 派发到此）；register 对未声明
			// slot 同步抛错 → guardedRegister 捕获 + 显式 warn（铁律 24/31，禁穿透宿主 fiber）
			ctx.effect(() => slots.inject("main", () => guardedRegister("main", "项目总览 main cell", () => slots.register(
				{ name: "main", key: PANEL_ID },
				() => jsx(ProjectOverviewPanel, { onBack: () => ctx.layout.selectPanel(null) })
			))), "synova-project-overview: main cell");
			// ② 再注册左栏入口行（与「任务看板」同区：sidebar.panellist）
			ctx.effect(() => slots.inject("sidebar.panellist", () => guardedRegister("sidebar.panellist", "项目总览 sidebar 入口", () => slots.register(
				{ name: "sidebar.panellist", id: PANEL_ID, order: 50, label: "项目总览" },
				ProjectOverviewIcon
			))), "synova-project-overview: sidebar entry");
		// ③ 「宪章三问」第二面板（D963）：同样成对注册，先 main 后入口行；order 60 与项目总览(50)错开
		const CHARTER_PANEL_ID = "synova-charter-grid";
		ctx.effect(() => slots.inject("main", () => guardedRegister("main", "宪章三问 main cell", () => slots.register(
			{ name: "main", key: CHARTER_PANEL_ID },
			() => jsx(CharterGridPanel, { onBack: () => ctx.layout.selectPanel(null) })
		))), "synova-charter-grid: main cell");
		ctx.effect(() => slots.inject("sidebar.panellist", () => guardedRegister("sidebar.panellist", "宪章三问 sidebar 入口", () => slots.register(
			{ name: "sidebar.panellist", id: CHARTER_PANEL_ID, order: 60, label: "宪章三问" },
			CharterGridIcon
		))), "synova-charter-grid: sidebar entry");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

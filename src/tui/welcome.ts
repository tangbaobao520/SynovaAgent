/**
 * tui/welcome.ts — Synova Welcome 内容
 *
 * formatWelcome: 纯文本生成（单栏纵向，无 blessed 依赖）
 * showWelcome:  全屏覆盖页（需 blessed，按 Enter 消失）
 */
import blessed from 'neo-blessed';
import { getCurrentVersion } from '../services/update-checker';

const VERSION = getCurrentVersion();

const B = '\x1b[1m';
const D = '\x1b[2m';
const C = '\x1b[36m';
const G = '\x1b[32m';
const Y = '\x1b[33m';
const M = '\x1b[35m';
const W = '\x1b[37m';
const R = '\x1b[0m';

export interface WelcomeConfig {
  providerName: string;
  model: string;
  workDir: string;
  healthy: boolean;
}

/** 生成 Welcome 纯文本（单栏纵向，直接放进对话区） */
export function formatWelcome(config: WelcomeConfig): string {
  const cwd = config.workDir || process.cwd();
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const shortDir = cwd.replace(home, '~').replace(/\\/g, '/');
  const icon = config.healthy ? '✅' : '⚠️';

  return [
    `${C}   ███████╗ ██╗   ██╗ ███╗   ██╗  ██████╗  ██╗   ██╗  █████╗   ${R}`,
    `${C}   ██╔════╝ ╚██╗ ██╔╝ ████╗  ██║ ██╔═══██╗ ██║   ██║ ██╔══██╗  ${R}`,
    `${C}   ███████╗  ╚████╔╝  ██╔██╗ ██║ ██║   ██║ ██║   ██║ ███████║  ${R}  ${D}v${VERSION}${R}`,
    `${C}   ╚════██║   ╚██╔╝   ██║╚██╗██║ ██║   ██║ ╚██╗ ██╔╝ ██╔══██║  ${R}`,
    `${C}   ███████║    ██║    ██║ ╚████║ ╚██████╔╝  ╚████╔╝  ██║  ██║  ${R}`,
    `${C}   ╚═════╝    ╚═╝    ╚═╝  ╚═══╝  ╚═════╝    ╚═══╝   ╚═╝  ╚═╝  ${R}`,
    '',
    `  ${B}${W}组织增长导航系统${R}`,
    `  ${D}7×24 驻扎在企业内部 · 不说话时安静采集数据 · 说话时给你答案${R}`,
    '',
    `  ${D}──────────────────────────────────────────────────────${R}`,
    `   ${G}◈${R} 设定增长目标，持续跟踪进度      ${G}◈${R} 6 位 AI 专家并行分析`,
    `   ${G}◈${R} 多源数据交叉验证，发现增长障碍   ${G}◈${R} 每日 19:00 简报推送`,
    `   ${G}◈${R} 每条结论有来源、有置信度、有替代方案`,
    `  ${D}──────────────────────────────────────────────────────${R}`,
    '',
    `   ${D}模型:${R} ${config.model}  ${D}│${R}  ${D}Provider:${R} ${config.providerName} ${icon}  ${D}│${R}  ${D}工作区:${R} ${shortDir}  ${D}│${R}  ${D}最近:${R} 权限管理 · PKB`,
    '',
    `   ${Y}💡${R} 直接输入增长目标即可开始    ${D}/setup${R} 配置 LLM    ${D}/help${R} 全部命令`,
  ].join('\n');
}

/** 全屏 Welcome 覆盖页（保留，供未来使用）*/
export async function showWelcome(
  screen: blessed.Widgets.Screen,
  config: WelcomeConfig,
): Promise<void> {
  return new Promise((resolve) => {
    const cwd = config.workDir || process.cwd();
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const shortDir = cwd.replace(home, '~').replace(/\\/g, '/');
    const icon = config.healthy ? '✅' : '⚠️';

    // 左栏：Logo + 状态
    const left = [
      `${C}   ███████╗ ██╗   ██╗ ███╗   ██╗  ██████╗  ██╗   ██╗  █████╗   ${R}`,
      `${C}   ██╔════╝ ╚██╗ ██╔╝ ████╗  ██║ ██╔═══██╗ ██║   ██║ ██╔══██╗  ${R}`,
      `${C}   ███████╗  ╚████╔╝  ██╔██╗ ██║ ██║   ██║ ██║   ██║ ███████║  ${R}  ${D}v${VERSION}${R}`,
      `${C}   ╚════██║   ╚██╔╝   ██║╚██╗██║ ██║   ██║ ╚██╗ ██╔╝ ██╔══██║  ${R}`,
      `${C}   ███████║    ██║    ██║ ╚████║ ╚██████╔╝  ╚████╔╝  ██║  ██║  ${R}`,
      `${C}   ╚═════╝    ╚═╝    ╚═╝  ╚═══╝  ╚═════╝    ╚═══╝   ╚═╝  ╚═╝  ${R}`,
      '',
      `  ${D}模型:${R} ${config.model}`,
      `  ${D}Provider:${R} ${config.providerName} ${icon}`,
      `  ${D}工作区:${R} ${shortDir}`,
    ].join('\n');

    // 右栏：介绍 + 能力
    const right = [
      `${B}${W}SynovaAgent${R}  ${D}组织增长导航系统${R}`,
      '',
      `${D}7×24 驻扎在企业内部${R}`,
      `${D}不说话时安静采集数据，说话时给你答案${R}`,
      '',
      `${D}─── 核心能力 ─────────────────────────${R}`,
      ` ${G}◈${R} 设定增长目标，持续跟踪进度`,
      ` ${G}◈${R} 6 位 AI 专家并行分析，交叉验证`,
      ` ${G}◈${R} 多源数据发现增长障碍`,
      ` ${G}◈${R} 每日 19:00 简报推送`,
      ` ${G}◈${R} 每条结论有来源、有置信度`,
      '',
      `${D}─── 最近更新 ─────────────────────────${R}`,
      ` ${G}06-06${R} 权限管理 · PKB 148条种子知识`,
      ` ${G}06-04${R} 知识Agent · 飞书 · IMA`,
      ` ${G}06-02${R} TUI 三栏 · 流式对话`,
      '',
      ` ${Y}💡${R} 直接输入增长目标即可开始`,
      ` ${D}/setup${R} 配置 LLM   ${D}/help${R} 全部命令`,
    ].join('\n');

    // 合并两栏（简单拼接，左边补空格对齐）
    const leftLines = left.split('\n');
    const rightLines = right.split('\n');
    const maxLines = Math.max(leftLines.length, rightLines.length);
    const lines: string[] = [];
    for (let i = 0; i < maxLines; i++) {
      const l = leftLines[i] || '';
      const r = rightLines[i] || '';
      // ANSI 颜色会干扰宽度计算，用固定间距
      lines.push(`  ${l}${' '.repeat(Math.max(0, 44 - stripAnsi(l).length))}  ${r}`);
    }

    const content = [
      '',
      ...lines,
      '',
      `${B}${G}                        按 Enter 开始${R} ${D}──→${R}`,
    ].join('\n');

    const welcomeBox = blessed.box({
      top: 0, left: 0, width: '100%', height: '100%',
      content,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' }, fg: 'white', bg: 'black' },
      tags: false,
    });
    screen.append(welcomeBox);

    // 闪烁提示
    let blinkOn = true;
    const blink = setInterval(() => {
      const all = content.split('\n');
      const last = all.length - 1;
      all[last] = blinkOn
        ? `${B}${G}                        按 Enter 开始${R} ${D}──→${R}`
        : `${D}                        按 Enter 开始${R} ${D}──→${R}`;
      welcomeBox.setContent(all.join('\n'));
      screen.render();
      blinkOn = !blinkOn;
    }, 600);

    const onEnter = () => {
      clearInterval(blink);
      screen.remove(welcomeBox);
      (welcomeBox as { detach?: () => void }).detach?.();
      screen.removeListener('keypress', keyHandler);
      resolve();
    };

    const keyHandler = (_ch: any, key: any) => {
      if (key.name === 'enter' || key.name === 'return') onEnter();
      if (key.name === 'c' && key.ctrl) { clearInterval(blink); screen.destroy(); process.exit(0); }
    };

    screen.on('keypress', keyHandler);
    screen.render();
  });
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

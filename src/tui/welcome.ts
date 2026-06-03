/**
 * tui/welcome.ts — SynovaAgent Welcome 过渡页
 *
 * 对标 Claude Code 的启动仪式感：六边形 Logo + 版本 + 工作区 + 更新日志。
 * 用户按 Enter 后进入对话。
 */
import blessed from 'neo-blessed';
import { getCurrentVersion } from '../services/update-checker';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const WHITE = '\x1b[37m';
const RESET = '\x1b[0m';

const VERSION = getCurrentVersion();

interface WelcomeConfig {
  providerName: string;
  model: string;
  workDir: string;
}

export async function showWelcome(
  screen: blessed.Widgets.Screen,
  config: WelcomeConfig,
): Promise<void> {
  return new Promise((resolve) => {
    const logo = [
      `${DIM}                 ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲${RESET}`,
      `${DIM}                ╱                                                ╲${RESET}`,
      `${DIM}               ╱          ${YELLOW}◯  ◯  ◯  ◯  ◯  ◯${DIM}          ╲${RESET}`,
      `${DIM}              ╱         ${YELLOW}╱                    ╲${DIM}         ╲${RESET}`,
      `${DIM}             ╱         ${YELLOW}╱${BOLD}${WHITE}      S Y N O V A      ${RESET}${YELLOW}╲${DIM}         ╲${RESET}`,
      `${DIM}            ╱          ${YELLOW}╲${DIM}    组织数字孪生诊断    ${YELLOW}╱${DIM}          ╲${RESET}`,
      `${DIM}           ╱           ${YELLOW}╲                        ╱${DIM}           ╲${RESET}`,
      `${DIM}          ╱             ${YELLOW}╲    ${GREEN}六阶诊断引擎${RESET}    ${YELLOW}╱${DIM}             ╲${RESET}`,
      `${DIM}         ╱               ${YELLOW}╲  ${CYAN}本体图谱 · 根因分析${RESET}  ${YELLOW}╱${DIM}               ╲${RESET}`,
      `${DIM}        ╱                 ${YELLOW}╲  ${CYAN}交叉验证 · 持续监测${RESET}  ${YELLOW}╱${DIM}                 ╲${RESET}`,
      `${DIM}       ╱                   ${YELLOW}╲                        ╱${DIM}                   ╲${RESET}`,
      `${DIM}      ╱                     ${YELLOW}╲   ${MAGENTA}专家团队就绪${RESET}   ${YELLOW}╱${DIM}                     ╲${RESET}`,
      `${DIM}     ╱                       ${YELLOW}╲  ${DIM}战略 · 组织 · 财务${RESET}  ${YELLOW}╱${DIM}                       ╲${RESET}`,
      `${DIM}    ╱                         ${YELLOW}╲  ${DIM}技术 · 营销 · 行动${RESET}  ${YELLOW}╱${DIM}                         ╲${RESET}`,
      `${DIM}   ╱                           ${YELLOW}╲                        ╱${DIM}                           ╲${RESET}`,
      `${DIM}  ╱                             ${YELLOW}╲${DIM}────────────────────${YELLOW}╱${DIM}                             ╲${RESET}`,
      `${DIM} ╱                               ${YELLOW}◯────────────────────◯${DIM}                               ╲${RESET}`,
      `${DIM}╱                                                                                                ╲${RESET}`,
    ].join('\n');

    // ═══ 构建内容 ═══

    const cwd = config.workDir || process.cwd();
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const shortDir = cwd.replace(home, '~').replace(/\\/g, '/');

    const info = [
      `${BOLD}${WHITE}SynovaAgent${RESET} ${DIM}v${VERSION}${RESET}`,
      '',
      `${DIM}模型:${RESET} ${config.model || 'deepseek-v4-flash'}    ${DIM}Provider:${RESET} ${config.providerName || 'deepseek'}    ${DIM}工作区:${RESET} ${shortDir}`,
      '',
      `${DIM}─── 更新日志 ─────────────────────────────────────────────${RESET}`,
      `${GREEN}2026-06-02${RESET}  TUI 三栏布局 · 流式对话 · 六阶段诊断 · 本体图谱实时监测`,
      `${GREEN}2026-06-01${RESET}  26 专家工具链 · Cron 自主巡检 · 会话持久化`,
      `${GREEN}2026-05-31${RESET}  LLM Provider 多通道 · DeepSeek / OpenAI 兼容 / Gateway`,
      '',
      `${DIM}💡 首次使用请直接输入组织名称，Agent 会引导你完成诊断访谈${RESET}`,
      `${DIM}   Ctrl+C 退出  /help 查看命令  /status 查看状态${RESET}`,
      '',
      `${BOLD}${GREEN}                       按 Enter 开始诊断${RESET} ${DIM}──→${RESET}`,
    ].join('\n');

    const content = [logo, '', info].join('\n');

    // ═══ 创建全屏 Welcome Box ═══
    const welcomeBox = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      content,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        fg: 'white',
        bg: 'black',
      },
      tags: false,
    });

    screen.append(welcomeBox);

    // ═══ 闪烁提示 ═══
    let blinkOn = true;
    const blinkInterval = setInterval(() => {
      if (!welcomeBox) return;
      const lines = content.split('\n');
      const lastLineIdx = lines.length - 1;
      const promptLine = lines[lastLineIdx];
      if (blinkOn) {
        lines[lastLineIdx] = promptLine;
      } else {
        lines[lastLineIdx] = promptLine.replace('按 Enter 开始诊断', `${DIM}按 Enter 开始诊断${RESET}`);
      }
      welcomeBox.setContent(lines.join('\n'));
      screen.render();
      blinkOn = !blinkOn;
    }, 600);

    // ═══ Enter 键处理 ═══
    const onEnter = () => {
      clearInterval(blinkInterval);
      screen.remove(welcomeBox);
      // blessed Box.detach 未在类型定义中声明
      (welcomeBox as { detach?: () => void }).detach?.();
      screen.removeListener('keypress', keyHandler);
      resolve();
    };

    const keyHandler = (_ch: any, key: any) => {
      if (key.name === 'enter' || key.name === 'return') {
        onEnter();
      }
      if (key.name === 'c' && key.ctrl) {
        clearInterval(blinkInterval);
        screen.destroy();
        process.exit(0);
      }
    };

    screen.on('keypress', keyHandler);
    screen.render();
  });
}

/**
 * security/pii-scrubber.ts — PII 脱敏引擎 (BP 4级敏感度 + 参与者主权)
 *
 * 铁律 32: 错误分类强制。PII 泄露是不可恢复错误 → PII_LEAK 类型。
 * BP 要求: 4 级敏感度(S1-S4)、参与者主权(opt-out删除)、角色掩盖。
 *
 * S1 公开: 公司名、团队名、职位
 * S2 内部: 姓名、邮箱、IM 账号
 * S3 受限: 手机号、身份证号、薪资、绩效
 * S4 禁止: 密码、Token、私钥 — 不回显、不存储、不传输
 */
import { createLogger } from '@synova/logger';

const log = createLogger('security/pii-scrubber');

export type SensitivityLevel = 'S1' | 'S2' | 'S3' | 'S4';

export interface PIIMatch {
  type: string;
  value: string;
  level: SensitivityLevel;
  start: number;
  end: number;
}

export interface ScrubResult {
  cleaned: string;
  matches: PIIMatch[];
  degraded: boolean;
}

export class PIIScrubber {
  private optOutSet = new Set<string>();
  private roleMaskMap = new Map<string, string>();

  // ═══ S4: 禁止 — 绝不对 LLM 暴露 ═══
  private readonly S4_PATTERNS: Array<{ type: string; regex: RegExp }> = [
    { type: 'api_key', regex: /\b(sk-[a-zA-Z0-9]{32,})\b/g },
    { type: 'token', regex: /\b(ghp_[a-zA-Z0-9]{36})\b/g },
    { type: 'jwt', regex: /\b(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g },
    { type: 'private_key', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[^]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g },
    { type: 'password_in_url', regex: /https?:\/\/[^:]+:([^@]+)@/g },
  ];

  // ═══ S3: 受限 — 脱敏后输出 ═══
  private readonly S3_PATTERNS: Array<{ type: string; regex: RegExp }> = [
    // 中国大陆手机号
    { type: 'phone_cn', regex: /\b1[3-9]\d{9}\b/g },
    // 中国大陆身份证号 (18位)
    { type: 'id_card_cn', regex: /\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g },
    // 邮箱地址
    { type: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
    // 薪资信息 (数字+k/w/万 上下文)
    { type: 'salary_hint', regex: /(?:薪资|工资|月薪|年薪|base|package)[:：]?\s*\d{2,6}[kK万wW]?/g },
    // 银行卡号 (16-19位数字)
    { type: 'bank_card', regex: /\b\d{16,19}\b/g },
  ];

  // ═══ S2: 内部 — 脱敏后输出 ═══
  private readonly S2_PATTERNS: Array<{ type: string; regex: RegExp }> = [
    // 中文姓名 (2-4字, 常见姓氏 + 百家姓)
    { type: 'chinese_name', regex: /(?:[王李张刘陈杨黄赵周吴徐孙马胡朱郭何罗高林郑梁谢唐许冯宋韩邓彭曹曾田萧潘袁蔡蒋余于杜叶程魏苏吕丁任卢姚沈钟姜崔谭陆范汪廖石金韦贾夏付方白邹熊孟秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤温康施文牛樊葛邢安齐易乔]|[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮下齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄麴家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴鬱胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍卻璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查後荆红游竺权逮盍益桓公])[一-鿿]{1,3}/g },
    // 英文姓名 (FirstName LastName)
    { type: 'english_name', regex: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g },
  ];

  // ═══ S1: 公开 — 不脱敏 (仅记录) ═══

  /**
   * Scrub a text string, removing/replacing PII at all sensitivity levels.
   * S4 (禁止): completely removed — "[已移除]"
   * S3 (受限): replaced with type label — "[手机号]"
   * S2 (内部): replaced with role label or "[姓名]"
   * S1 (公开): kept but logged
   */
  scrub(text: string, level: SensitivityLevel = 'S2'): ScrubResult {
    const matches: PIIMatch[] = [];
    let cleaned = text;

    // S4: 绝对移除 — Token/Key 类
    for (const { type, regex } of this.S4_PATTERNS) {
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(cleaned)) !== null) {
        matches.push({ type, value: m[0], level: 'S4', start: m.index, end: m.index + m[0].length });
      }
      cleaned = cleaned.replace(regex, (_match, p1) => {
        // For password_in_url, keep URL structure but mask password
        if (type === 'password_in_url') return _match.replace(p1, '[密码已移除]');
        return '[已移除]';
      });
    }

    // S3: 受限 — 脱敏
    for (const { type, regex } of this.S3_PATTERNS) {
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(cleaned)) !== null) {
        matches.push({ type, value: m[0], level: 'S3', start: m.index, end: m.index + m[0].length });
      }
      const labels: Record<string, string> = {
        phone_cn: '[手机号]', id_card_cn: '[身份证号]', email: '[邮箱]',
        salary_hint: '[薪资]', bank_card: '[银行卡号]',
      };
      cleaned = cleaned.replace(regex, labels[type] || '[已脱敏]');
    }

    // S2: 内部 — 脱敏 (如果 level >= S2)
    if (level === 'S2' || level === 'S3') {
      for (const { type, regex } of this.S2_PATTERNS) {
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(cleaned)) !== null) {
          // Check if this name is in the opt-out list
          if (this.optOutSet.has(m[0])) {
            matches.push({ type, value: m[0], level: 'S2', start: m.index, end: m.index + m[0].length });
            cleaned = cleaned.replace(m[0], '[已删除-用户请求]');
            continue;
          }
          // Check if a role mask is registered for this name
          const roleMask = this.roleMaskMap.get(m[0]);
          if (roleMask) {
            cleaned = cleaned.replace(m[0], roleMask);
          } else {
            matches.push({ type, value: m[0], level: 'S2', start: m.index, end: m.index + m[0].length });
            cleaned = cleaned.replace(m[0], type === 'chinese_name' ? '[姓名]' : '[Name]');
          }
        }
      }
    }

    if (matches.length > 0) {
      log.debug({ matchCount: matches.length, levels: [...new Set(matches.map(m => m.level))] }, 'PII 脱敏完成');
    }

    return { cleaned, matches, degraded: false };
  }

  /** Register a person for opt-out deletion (参与者主权) */
  optOut(name: string): void {
    this.optOutSet.add(name);
    log.info({ name }, 'PII opt-out 已注册');
  }

  /** Register a role mask — e.g. "张三" → "技术总监" */
  registerRoleMask(name: string, roleLabel: string): void {
    this.roleMaskMap.set(name, roleLabel);
  }

  /** Bulk register role masks from a map */
  registerRoleMasks(masks: Map<string, string>): void {
    for (const [name, role] of masks) {
      this.roleMaskMap.set(name, role);
    }
    log.info({ count: masks.size }, '角色掩盖已批量注册');
  }

  /**
   * D42: 检测PII但不脱敏。返回匹配列表供PreUploadValidator判断。
   * 与 scrub() 共享同一个模式库，但仅扫描不替换。
   * @param text — 待检测文本
   * @param level — 最低敏感度级别（默认 S2 = 检测 S2+S3+S4）
   */
  detectOnly(text: string, level: SensitivityLevel = 'S2'): PIIMatch[] {
    const matches: PIIMatch[] = [];
    const levelOrder: SensitivityLevel[] = ['S1', 'S2', 'S3', 'S4'];
    const minIdx = levelOrder.indexOf(level);
    if (minIdx === -1) return matches;

    const collect = (patterns: ReadonlyArray<{ type: string; regex: RegExp }>, patternLevel: SensitivityLevel): void => {
      if (levelOrder.indexOf(patternLevel) < minIdx) return;
      for (const { type, regex } of patterns) {
        // 克隆 regex 避免 lastIndex 干扰
        const re = new RegExp(regex.source, regex.flags);
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          matches.push({ type, value: m[0], level: patternLevel, start: m.index, end: m.index + m[0].length });
          if (m.index === re.lastIndex) re.lastIndex++; // 防止零长度匹配死循环
        }
      }
    };

    collect(this.S4_PATTERNS, 'S4');
    collect(this.S3_PATTERNS, 'S3');
    collect(this.S2_PATTERNS, 'S2');
    return matches;
  }
}

// Singleton
let _instance: PIIScrubber | null = null;
export function getPIIScrubber(inject?: PIIScrubber): PIIScrubber {
  if (inject) { _instance = inject; return inject; }
  if (!_instance) _instance = new PIIScrubber();
  return _instance;
}

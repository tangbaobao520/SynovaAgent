#!/usr/bin/env python3
"""Translate RESEARCH-Silence-Alpha-20260704.html from EN to ZH.
Applies exact string replacements on HTML source. All HTML tags preserved."""
import sys

INPUT = r"D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\nci-research\RESEARCH-Silence-Alpha-20260704.html"

with open(INPUT, "r", encoding="utf-8") as f:
    source = f.read()

# Translation map: all translations in order (longer strings first)
T = []

def t(en, zh):
    T.append((en, zh))

# ===== SECTION 0: Methodology =====
t("0. Research Methodology", "0. 研究方法")
t("Paradigm: Literature-Driven Taxonomy Construction", "范式：文献驱动分类法构建")
t("This study does not rely on primary field data. It systematically reviews classic theories of \"silence\" and \"voice\" from organizational behavior, management psychology, and political science to construct a computable classification framework embeddable in SynovaAgent's ontological diagnosis pipeline (L3 Insight Layer -> SignalAggregator -> ExpertRouter).",
  "本研究不依赖原始田野数据，而是系统梳理组织行为学、管理心理学和政治学中关于\"沉默\"与\"建言\"的经典理论，构建一套可计算的分类框架，嵌入 SynovaAgent 本体诊断管线（L3 洞察层 -> SignalAggregator -> ExpertRouter）。")

t("0.1 Core Literature Anchors", "0.1 核心文献锚点")
t("0.2 Supplementary Theoretical References", "0.2 补充理论参考文献")
t("0.3 Embedding Methodology", "0.3 嵌入方法论")

# Table headers
t("<th style=\"width:22%\">Source</th>", "<th style=\"width:22%\">来源</th>")
t("<th style=\"width:32%\">Core Contribution</th>", "<th style=\"width:32%\">核心贡献</th>")
t("<th>Role in This Study</th>", "<th>本研究中的角色</th>")
t("<th style=\"width:30%\">Source</th>", "<th style=\"width:30%\">来源</th>")
t("<th>Core Insight</th>", "<th>核心洞见</th>")
t("<th>Application</th>", "<th>应用</th>")

# Hirschman
t("Signal mechanism of organizational decline: when quality drops, members choose between exit and voice. Loyalty delays exit, making voice more likely. Core insight: silence is the absence of voice -- and the absence of voice is itself a signal.",
  "组织衰退的信号机制：当质量下降时，成员在退出与建言之间做出选择。忠诚延迟退出，使建言更可能发生。核心洞见：沉默是建言的缺失——而建言的缺失本身就是一种信号。")
t("<strong>Analytical starting point.</strong>", "<strong>分析起点。</strong>")
t("The entire framework is anchored on \"non-consensus signal = voice behavior\". Core question: when members choose silence between exit and voice -- what structural conditions correspond to each cause?",
  "整个框架锚定于\"非共识信号 = 建言行为\"。核心问题：当成员在退出与建言之间选择沉默时——每种原因对应什么样的结构性条件？")

# Morrison & Milliken
t("First systematic definition of \"organizational silence\": a collective phenomenon where employees withhold concerns about organizational problems. Two root causes: (1) managerial implicit beliefs -- \"employees are self-interested\", \"management knows best\", \"unity signals health\"; (2) organizational structure and policies -- centralized decision-making, absence of formal feedback channels. Silence is systemic, not individual.",
  "首次系统定义\"组织沉默\"：员工对组织问题保留关切的集体现象。两个根本原因：(1) 管理者的隐性信念——\"员工是自利的\"、\"管理层最懂\"、\"团结就是健康\"；(2) 组织结构与政策——集中决策、缺乏正式反馈渠道。沉默是系统性的，而非个人性的。")
t("<strong>Taxonomy foundation.</strong>", "<strong>分类基础。</strong>")
t("\"Power Suppression\" directly inherits the \"managerial beliefs -> climate of silence\" chain. \"Cognitive Blind Spot\" inherits the \"management knows best\" implicit assumption. The methodology of analyzing silence as a systemic rather than individual phenomenon is also adopted.",
  "\"权力压制\"直接继承\"管理者信念 → 沉默氛围\"链条。\"认知盲区\"继承\"管理层最懂\"的隐性假设。将沉默作为系统性而非个人性现象来分析的方法论同样被采纳。")

# Kish-Gephart
t("Subdivides silence into \"fear-based silence\". Three fear sources: personal consequences (career retaliation), relational fear (exclusion), professional fear (being labeled a troublemaker). Key finding: fear-driven silence is <strong>contagious</strong> -- one person's silence reduces others' willingness to speak up, creating a positive feedback loop.",
  "将沉默细分为\"基于恐惧的沉默\"。三种恐惧来源：个人后果（职业报复）、关系恐惧（排斥）、职业恐惧（被贴上麻烦制造者标签）。关键发现：恐惧驱动的沉默具有<strong>传染性</strong>——一个人的沉默会降低他人发声的意愿，形成正反馈循环。")
t("<strong>Refined fear mechanism.</strong>", "<strong>细化恐惧机制。</strong>")
t("Provides psychological grounding for \"Power Suppression -> Defensive Silence\" subtype, especially the detection of \"silence contagion\" propagation chains. Provides analytical tools to distinguish direct veto (single observable punishment event) from defensive silence (no single event but collective voice rate decline).",
  "为\"权力压制 → 防御性沉默\"子类型提供心理学基础，特别是检测\"沉默传染\"传播链。提供分析工具以区分直接否决（单一可观察惩罚事件）与防御性沉默（无单次事件但集体建言率下降）。")

# Detert & Edmondson
t("Proposes \"implicit voice theories\": employees do not need to be explicitly told to stay quiet -- they self-censor through observation and subtle organizational cues. Five implicit beliefs: don't challenge authority, don't convey bad news, don't bypass the hierarchy, don't oppose in public, don't speak on matters where you aren't the expert. These beliefs form within 6-12 months of joining.",
  "提出\"隐性建言理论\"：员工无需被明确告知保持沉默——他们通过观察和微妙组织线索进行自我审查。五种隐性信念：不挑战权威、不传递坏消息、不越级、不当众反对、不是专家的事不说。这些信念在入职6-12个月内形成。")
t("<strong>Theoretical anchor for \"Political Correctness\" type.</strong>", "<strong>\"政治正确\"类型的理论锚点。</strong>")
t("Self-censorship requires no overt punishment -- only implicit cultural signals. This is the hardest of the five causes to detect, because the signal was never raised by anyone; it can only be inferred through absence against an external baseline.",
  "自我审查不需要显性惩罚——仅需隐性文化信号。这是五因中最难检测的，因为信号从未被任何人提出；只能通过与外部基线对比的\"缺席\"来推断。")

# Edmondson
t("Psychological safety: the shared belief that the team is safe for interpersonal risk-taking. High psychological safety teams exhibit higher error reporting rates, more help-seeking, more novel idea generation. Psychological safety is a team-level property -- different teams in the same organization can vary significantly.",
  "心理安全：团队成员共享的信念，即团队在人际冒险方面是安全的。高心理安全团队表现出更高的错误报告率、更多的求助行为、更多的新颖想法产出。心理安全是团队级属性——同一组织内不同团队可能差异显著。")
t("<strong>Counterfactual verification anchor.</strong>", "<strong>反事实验证锚点。</strong>")
t("If psychological safety measures high but specific signals remain silent -> rule out Power Suppression, classify as Cognitive Blind Spot or Resource Scarcity. This is the discriminant logic for Adversarial Boundary Condition (b).",
  "如果心理安全测量值高但特定信号仍然沉默 → 排除权力压制，归类为认知盲区或资源稀缺。这是对抗边界条件 (b) 的判别逻辑。")

# 0.2 supplementary
t("Excessive cohesion suppresses critical thinking. Eight symptoms: illusion of invulnerability, collective rationalization, unquestioned morality, stereotyped out-groups, direct pressure on dissenters, self-censorship, illusion of unanimity, self-appointed \"mindguards\".",
  "过度凝聚力压制批判性思维。八种症状：无懈可击幻觉、集体合理化、无可置疑的道德、刻板化外群体、对异议者的直接压力、自我审查、一致同意幻觉、自命的\"思想警卫\"。")
t("Supports \"Political Correctness -> Cohesion Trap\" subtype -- not fear, but \"we're family, so there shouldn't be disagreement\".",
  "支撑\"政治正确 → 凝聚力陷阱\"子类型——不是恐惧，而是\"我们是一家人，所以不应该有分歧\"。")
t("Decision-makers have limited attention and can only process bounded information. \"Attention economy\" concept: the scarce resource in organizations is not information but attention to process it.",
  "决策者注意力有限，只能处理有界信息。\"注意力经济\"概念：组织中稀缺的资源不是信息，而是处理信息的注意力。")
t("Supports \"Resource Scarcity -> Attention Competition\" subtype and the signal-to-noise ratio determination logic in \"Noise Interference\".",
  "支撑\"资源稀缺 → 注意力竞争\"子类型和\"噪声干扰\"中的信噪比判定逻辑。")
t("Organizations depend on external resources; decision rights are not fully internal. External controllers' preferences determine what internal actions are possible.",
  "组织依赖外部资源；决策权不完全内在于组织。外部控制者的偏好决定哪些内部行动是可能的。")
t("Supports \"Resource Scarcity -> External Dependency Lock\" subtype -- signal is correct but cannot be executed because resources are controlled by external entities.",
  "支撑\"资源稀缺 → 外部依赖锁定\"子类型——信号正确但无法执行，因为资源被外部实体控制。")
t("Organizational defensive routines: organizations develop systematic \"skilled incompetence\" to avoid embarrassment and threat. Defensive routines make people avoid discussing \"undiscussable\" issues -- and these undiscussables are themselves the biggest problem.",
  "组织防御性惯例：组织发展出系统性的\"熟练无能\"来避免尴尬和威胁。防御性惯例使人们回避讨论\"不可讨论\"的问题——而这些不可讨论的问题本身就是最大的问题。")
t("Supports the intersection zone between \"Power Suppression\" and \"Political Correctness\" -- organizational defensive routines blur the line between power-driven suppression and self-censorship.",
  "支撑\"权力压制\"与\"政治正确\"之间的交叉区域——组织防御性惯例模糊了权力驱动的压制与自我审查之间的界限。")
t("The second face of power: power is exercised not only in making decisions but in \"deciding what can be discussed\" (nondecision-making). Certain issues never appear on the agenda -- not because they were rejected, but because they were preemptively excluded.",
  "权力的第二张面孔：权力不仅体现于做出决策，更体现于\"决定什么可以被讨论\"（非决策）。某些议题从未出现在议程上——不是因为被否决，而是因为被预先排除。")
t("Provides the political science anchor for \"Political Correctness -> Unspeakable\" -- signal absence is not due to suppression but because the topic never entered the discussable space.",
  "为\"政治正确 → 不可言说\"提供政治学锚点——信号缺失不是因为压制，而是因为话题从未进入可讨论空间。")

# 0.3
t("The classifier produced by this study is designed for embedding into SynovaAgent's L3 Insight Layer. Specific path:",
  "本研究产生的分类器设计用于嵌入 SynovaAgent 的 L3 洞察层。具体路径：")
t("<strong>Signal Aggregation Layer (SignalAggregator)</strong>", "<strong>信号聚合层（SignalAggregator）</strong>")
t("consumes Sentinel findings, then a new", "消费 Sentinel 发现，然后一个新的")
t("<code>SilenceClassifier</code>", "<code>SilenceClassifier</code>")
t("module takes AggregatedSignal[] and relevant SOG subgraphs as input, producing SilenceCause (five-cause enum) + confidence + evidence chain.",
  "模块以 AggregatedSignal[] 和相关 SOG 子图为输入，产出 SilenceCause（五因枚举）+ 置信度 + 证据链。")
t("<strong>16 SOG edge types</strong>", "<strong>16 种 SOG 边类型</strong>")
t("provide structural features as classification input -- each cause corresponds to different edge weight / edge presence / edge delta patterns (see detection signal tables under each cause in Section 1).",
  "提供结构性特征作为分类输入——每个原因对应不同的边权重 / 边存在性 / 边变化模式（见第1节各原因下的检测信号表）。")
t("<strong>Expert routing update:</strong>", "<strong>专家路由更新：</strong>")
t("Silence cause -> recommended expert mapping (Power Suppression -> org + strategy; Cognitive Blind Spot -> strategy + knowledge; Resource Scarcity -> finance + strategy; Noise Interference -> action + tech; Political Correctness -> org + business_model).",
  "沉默原因 → 推荐专家映射（权力压制 → org + strategy；认知盲区 → strategy + knowledge；资源稀缺 → finance + strategy；噪声干扰 → action + tech；政治正确 → org + business_model）。")
t("<strong>Adversarial boundary conditions (Section 2)</strong>", "<strong>对抗边界条件（第2节）</strong>")
t("are embedded as", "嵌入为")
t("<em>deterministic rules</em>", "<em>确定性规则</em>")
t("in the classifier, not LLM judgment -- ensuring decisions are auditable, reproducible, and correctable. Rules use if-else logic chains, not prompt engineering.",
  "在分类器中，而非 LLM 判断——确保决策可审计、可复现、可纠正。规则使用 if-else 逻辑链，而非提示工程。")
t("<strong>Ablation validation (Section 3)</strong>", "<strong>消融验证（第3节）</strong>")
t("serves as the classifier's existence proof -- demonstrating that removing the five-cause classification leads to systematic misclassification.",
  "作为分类器的存在性证明——证明移除五因分类会导致系统性误分类。")
t("<strong>Honesty boundary (Section 4)</strong>", "<strong>诚实边界（第4节）</strong>")
t("declares conditions under which the classifier is unreliable -- preventing the system from outputting \"I know\" when it should output \"I don't know\".",
  "声明分类器不可靠的条件——防止系统在应该说\"我不知道\"时输出\"我知道\"。")

print(f"Total translation entries: {len(T)}")

# ===== Apply translations =====
translated = source
applied = 0
for en, zh in T:
    if en in translated:
        translated = translated.replace(en, zh)
        applied += 1
    else:
        print(f"WARNING - NOT FOUND: {en[:100]}...")

print(f"Applied: {applied}/{len(T)}")

# ===== Write output =====
OUTPUT = INPUT  # overwrite
with open(OUTPUT, "w", encoding="utf-8") as f:
    f.write(translated)

print(f"Written to: {OUTPUT}")
print("Phase 1 complete.")

# Reference Map

| 符号 | 文件 | 行 | 内容 |
|------|------|-----|------|

## renderOnePager
| `renderOnePager` | *(无引用)* | — | — |

## executive_summary（D480 消费对象 — 👀 不改但要注意）
| `executive_summary` | src/l3/report-templates.ts | L5/L117 | 模板定义+注册（DS3 零改动） |
| `executive_summary` | *(消费方)* | — | **零渲染调用（闲置资产）→ D480 renderOnePager 成为首个消费者** |

## assembleReport（👀 不改但要注意 — 回归守护对象）
| `assembleReport` | src/agent/report-assembler.ts | L98 | 定义（四层组装，零行为改动） |
| `assembleReport` | src/routes/diagnosis.ts | L244-245 | 生产调用（完成块，本任务并列追加 onePager 块） |
| `assembleReport` | tests/e2e/full-pipeline.integration.test.ts | L171/L189 | Stage 5a 回归断言（CI 排除 e2e，本地验证） |

## getReportTemplateRegistry（👀 复用模式参考）
| `getReportTemplateRegistry` | src/l3/report-templates.ts | L181 | 定义（inject seam — 测试③注入点） |
| `getReportTemplateRegistry` | src/l3/briefing-generator.ts | L14/L125 | 既有消费先例（每次调用时获取 — renderOnePager 同款） |

## D480 审查结论（写前）
- ✅ renderOnePager：全新符号零引用 — 新建无断裂面
- 👀 report-templates.ts / registry：只消费不修改（DS3，G12c 漂移规避）
- 👀 assembleReport 四层行为冻结：仅尾部追加新函数，回归用例⑤守护

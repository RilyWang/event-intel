# 数据库 Schema（第④步产物 · 锁定文件）

> 引用：02-需求清单.md（R-01..R-08）、03-事件状态机定义.md（状态与权重枚举）。
> 被引用：后续子 PRD、测试用例、后端 `schema.sql`。
> 本文件为锁定文件：改动须人工确认，并同步状态机定义与测试用例。

## 1. 总则

- 表名/字段名 snake_case；主键 `id INTEGER` 自增；业务编码 `*_code TEXT` 唯一。
- 时间一律 TEXT，ISO8601（`YYYY-MM-DD HH:MM:SS`）；可空表示"原文未提及"。
- 金额 REAL（元）；比率与权重 INTEGER（0~100）。
- 枚举 INTEGER/TEXT 取值见 §4；结构化子内容以 TEXT 存 JSON。
- 数据库：SQLite/D1（单文件可携带，便于 48h 部署与演示）。

## 2. 四个时间戳（题目重点，必须在表结构中体现）

| 时间戳 | 字段 | 落在哪张表 | 含义 |
| --- | --- | --- | --- |
| **事件发生时间** | `event_time` | event | 事情实际发生的时间（可空/可模糊，原文提及才填） |
| **披露时间** | `disclose_time` | raw_document | 该文档对外发布/披露的时间（时间线主排序键） |
| **抓取时间** | `crawl_time` | raw_document | 平台获取到该文档的时间 |
| **更新时间** | `update_time` | event / event_version | 平台最近一次重新处理/更新该事件的时间 |

规则：时间线按 `disclose_time` 排序；`event_time` 用于展示"事情何时发生"；`crawl_time` 与 `disclose_time` 的差值反映**信息滞后**（如"披露后 3 天才被抓取"）；`update_time` 用于"最近更新"标记与增量处理。

## 3. 表定义（10 张）

### T1 target（关注标的）
| 字段 | 类型 | 必填 | 口径 |
| --- | --- | --- | --- |
| id | INTEGER | PK | |
| target_code | TEXT | 是 | UNIQUE，如 600519.SH |
| target_name | TEXT | 是 | 标的名称 |
| market | TEXT | 是 | A / HK / US |
| alias | TEXT | 否 | JSON 数组，用于事件主体匹配（简称、曾用名） |
| active | INTEGER | 是 | 1 关注中 / 0 已取消 |

### T2 raw_document（原始文档 = 证据来源）
| 字段 | 类型 | 必填 | 口径 |
| --- | --- | --- | --- |
| id | INTEGER | PK | |
| doc_code | TEXT | 是 | UNIQUE，DOC-nnnn |
| source_type | TEXT | 是 | announcement/news/report/interaction/industry/public_other |
| source_name | TEXT | 是 | 来源名称（如"上交所公告"） |
| source_level | INTEGER | 是 | 权威等级 1~5（状态机 P8 用） |
| title | TEXT | 是 | 标题 |
| content | TEXT | 是 | 原文全文/快照（留存原文，**不可变**） |
| url | TEXT | 否 | 原文链接 |
| disclose_time | TEXT | 否 | 披露时间 |
| crawl_time | TEXT | 是 | 抓取时间 |
| fetched_via | TEXT | 是 | ifind_mcp / public_web / manual |
| hash | TEXT | 是 | 内容哈希，用于去重 |

### T3 event（事件主表）
| 字段 | 类型 | 必填 | 口径 |
| --- | --- | --- | --- |
| id | INTEGER | PK | |
| event_code | TEXT | 是 | UNIQUE，EVT-yyyy-nnnn |
| title | TEXT | 是 | 事件标题 |
| event_type | TEXT | 是 | guidance/contract/penalty/…（见 §4） |
| subject_name | TEXT | 是 | 事件主体（公司名） |
| subject_code | TEXT | 否 | 关联标的编码（可空，未上市主体为空） |
| key_elements | TEXT | 否 | JSON：金额/对象/数量等关键要素 |
| event_time | TEXT | 否 | **事件发生时间** |
| status | TEXT | 是 | 6 状态之一，见 §4 |
| event_confidence | INTEGER | 是 | 0~100（状态机 P9） |
| first_source_doc_id | INTEGER | 否 | → T2.id，**事件最初来源** |
| created_time | TEXT | 是 | 平台首次识别该事件的时间 |
| update_time | TEXT | 是 | **更新时间**（最近一次重算） |

### T4 event_document（文档↔事件 归并关系）
| 字段 | 类型 | 必填 | 口径 |
| --- | --- | --- | --- |
| id | INTEGER | PK | |
| event_id | INTEGER | 是 | → T3.id |
| doc_id | INTEGER | 是 | → T2.id |
| merge_reason | TEXT | 是 | **归并理由**（主体一致/要素一致/来源引用关系） |
| merge_confidence | INTEGER | 是 | 0~100 |
| merged_by | TEXT | 是 | rule / llm / human |
| linked_time | TEXT | 是 | |

约束：UNIQUE(event_id, doc_id)。

### T5 evidence（证据条目 = 文档抽取出的断言）
| 字段 | 类型 | 必填 | 口径 |
| --- | --- | --- | --- |
| id | INTEGER | PK | |
| evidence_code | TEXT | 是 | UNIQUE，EVD-nnnn |
| event_id | INTEGER | 是 | → T3.id |
| doc_id | INTEGER | 是 | → T2.id（**溯源锚点**） |
| content | TEXT | 是 | 结构化后的断言内容 |
| quote | TEXT | 是 | **原文片段**（可点回原文的关键依据） |
| evidence_type | TEXT | 是 | fact/opinion/speculation/rumor |
| source_level | INTEGER | 是 | 从 T2 带入 |
| weight | INTEGER | 是 | 0~100（状态机 P8 公式） |
| weight_detail | TEXT | 是 | JSON `{w_source, c_type, d_time}`，权重可解释 |
| evidence_time | TEXT | 否 | 证据对应的时间 |
| created_time | TEXT | 是 | |

### T6 event_version（版本演化 · 旧版本不覆盖）
| 字段 | 类型 | 必填 | 口径 |
| --- | --- | --- | --- |
| id | INTEGER | PK | |
| event_id | INTEGER | 是 | → T3.id |
| version_no | INTEGER | 是 | 同一事件内递增 |
| change_type | TEXT | 是 | initial/update/deny/correct/expire |
| change_summary | TEXT | 是 | 本次变更摘要（"公司公告否认收购传闻"） |
| trigger_doc_id | INTEGER | 否 | → T2.id，触发本次变更的文档 |
| snapshot | TEXT | 是 | JSON：本版本的结论快照（方向/置信度/证据集） |
| update_time | TEXT | 是 | **更新时间** |

### T7 event_state_log（状态机变更日志）
| 字段 | 类型 | 必填 | 口径 |
| --- | --- | --- | --- |
| id | INTEGER | PK | |
| event_id | INTEGER | 是 | → T3.id |
| from_status | TEXT | 否 | 变更前状态 |
| to_status | TEXT | 是 | 变更后状态 |
| rule_code | TEXT | 是 | 触发的规则编号（P1~P6），**可解释** |
| reason | TEXT | 是 | 中文可读的变更原因 |
| evidence_ids | TEXT | 否 | JSON 数组，依据哪些证据 |
| changed_time | TEXT | 是 | |

### T8 conclusion（结论 · 事件 × 标的）
| 字段 | 类型 | 必填 | 口径 |
| --- | --- | --- | --- |
| id | INTEGER | PK | |
| event_id | INTEGER | 是 | → T3.id |
| target_code | TEXT | 是 | → T1.target_code |
| direction | TEXT | 是 | positive/negative/neutral/uncertain |
| confidence | INTEGER | 是 | 0~100 |
| summary | TEXT | 是 | 结论摘要（不含任何买卖建议） |
| evidence_ids | TEXT | 是 | JSON 数组，结论依据（**可追溯**） |
| is_current | INTEGER | 是 | 1 当前有效 / 0 已被取代 |
| version_no | INTEGER | 是 | 对应 T6.version_no |
| created_time | TEXT | 是 | |

### T9 notification（通知）
| 字段 | 类型 | 必填 | 口径 |
| --- | --- | --- | --- |
| id | INTEGER | PK | |
| event_id | INTEGER | 是 | → T3.id |
| trigger_rule | TEXT | 是 | 状态机 P12 的触发编号 1~4 |
| title | TEXT | 是 | 通知标题 |
| body | TEXT | 是 | **必须说明改了什么、为什么** |
| change_detail | TEXT | 否 | JSON：新旧状态/方向/置信度对比 |
| is_read | INTEGER | 是 | 0/1 |
| created_time | TEXT | 是 | |

### T10 impact_metric（影响验证 · 行情/财务快照）
| 字段 | 类型 | 必填 | 口径 |
| --- | --- | --- | --- |
| id | INTEGER | PK | |
| event_id | INTEGER | 是 | → T3.id |
| target_code | TEXT | 是 | → T1.target_code |
| metric_date | TEXT | 是 | 数据日期 |
| close_price | REAL | 否 | 收盘价 |
| pct_change | REAL | 否 | 涨跌幅 |
| volume | REAL | 否 | 成交量 |
| source | TEXT | 是 | ifind_mcp / fuyao / public |
| anchor | TEXT | 是 | pre_event（事件前）/ post_event（事件后）/ baseline（基准） |

用途：展示"事件披露前后标的的行情变化"作为**影响的客观参考**，不构成因果断言，不构成投资建议。

## 4. 枚举值（全局唯一）

| 字段 | 取值 |
| --- | --- |
| raw_document.source_type | announcement / news / report / interaction / industry / public_other |
| raw_document.fetched_via | ifind_mcp / public_web / manual |
| event.event_type | guidance（业绩预告快报）/ contract（重大合同中标）/ penalty（监管处罚问询）/ equity（增减持股权）/ ma（并购重组）/ other |
| event.status | rumor / disclosed / confirmed / denied / corrected / expired |
| event_version.change_type | initial / update / deny / correct / expire |
| evidence.evidence_type | fact / opinion / speculation / rumor |
| conclusion.direction | positive / negative / neutral / uncertain |
| notification.trigger_rule | 1（否认更正）/ 2（方向翻转）/ 3（置信度越阈值）/ 4（冲突证据） |

## 5. 界面 → 表 倒推对照

| 界面区域 | 对应表 |
| --- | --- |
| 事件时间线（按披露时间排） | event_version + raw_document |
| 证据对照区（冲突并排） | evidence（type/weight/quote） |
| 事件头部（状态/置信度/最初来源） | event + event_state_log |
| 结论卡与变更历史 | conclusion（按 version_no 列历史） |
| 关注标的与影响验证 | target + impact_metric |
| 通知中心 | notification |

## 6. 变更规则

改任何表/字段/枚举 → 必须同步：03-事件状态机定义.md（若涉及状态与权重）、后续子 PRD、09-测试用例.md；全部经人工确认后生效。

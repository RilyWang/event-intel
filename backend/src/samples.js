// 样例数据：全部为虚构公司/虚构事件，用于演示主链路（不含任何真实主体信息）。
export const TARGETS = [
  { target_code: '600001.SH', target_name: '示例食品', market: 'A', alias: JSON.stringify(['示例食品股份有限公司']), active: 1 },
  { target_code: '600002.SH', target_name: '示例科技', market: 'A', alias: JSON.stringify(['示例智联']), active: 1 },
];

// 按 disclose_time 时序排列，用于演示事件演化
export const DOCUMENTS = [
  {
    doc_code: 'DOC-0001', source_type: 'news', source_name: '股吧·社交媒体', source_level: 1,
    title: '网传示例食品拟收购华南乳业',
    content: '据传，示例食品拟收购华南乳业60%股权，交易金额约8亿元，消息未经证实。',
    disclose_time: '2026-08-05 09:12:00', crawl_time: '2026-08-05 09:40:00', fetched_via: 'public_web',
    url: 'https://example.com/rumor/1',
  },
  {
    doc_code: 'DOC-0002', source_type: 'news', source_name: '财经自媒体', source_level: 2,
    title: '示例食品或将收购华南乳业',
    content: '示例食品或将收购华南乳业，预计交易金额不超过8亿元。',
    disclose_time: '2026-08-07 14:03:00', crawl_time: '2026-08-07 14:30:00', fetched_via: 'public_web',
    url: 'https://example.com/news/2',
  },
  {
    doc_code: 'DOC-0003', source_type: 'announcement', source_name: '上交所公告', source_level: 5,
    title: '示例食品关于筹划收购华南乳业股权的公告',
    content: '公司正在筹划以现金方式收购华南乳业60%股权，交易金额不超过8亿元。本次交易尚需履行审批程序。',
    disclose_time: '2026-08-12 08:00:00', crawl_time: '2026-08-13 09:05:00', fetched_via: 'ifind_mcp',
    url: 'https://example.com/announcement/3',
  },
  {
    doc_code: 'DOC-0004', source_type: 'report', source_name: '券商研报', source_level: 3,
    title: '研报：示例食品收购华南乳业点评',
    content: '我们看好本次收购对渠道的协同效应，维持对示例食品的盈利预测，预计增厚利润。',
    disclose_time: '2026-08-13 16:00:00', crawl_time: '2026-08-13 18:20:00', fetched_via: 'ifind_mcp',
    url: 'https://example.com/report/4',
  },
  {
    doc_code: 'DOC-0005', source_type: 'announcement', source_name: '公司公告', source_level: 5,
    title: '示例食品关于媒体报道的澄清公告',
    content: '针对相关媒体报道，公司澄清：公司未筹划上述收购事项，相关传闻不属实。',
    disclose_time: '2026-08-20 07:30:00', crawl_time: '2026-08-20 08:10:00', fetched_via: 'ifind_mcp',
    url: 'https://example.com/announcement/5',
  },

  {
    doc_code: 'DOC-0006', source_type: 'announcement', source_name: '公司公告', source_level: 5,
    title: '示例智联关于中标智慧城市项目的公告',
    content: '示例智联中标某市智慧城市项目，中标金额3.2亿元，项目已签署合同。',
    disclose_time: '2026-08-10 08:00:00', crawl_time: '2026-08-10 08:30:00', fetched_via: 'ifind_mcp',
    url: 'https://example.com/announcement/6',
  },
  {
    doc_code: 'DOC-0007', source_type: 'announcement', source_name: '公司公告', source_level: 5,
    title: '示例科技关于智慧城市项目合同生效的公告',
    content: '上述智慧城市项目合同已完成签署并生效，项目金额3.2亿元。',
    disclose_time: '2026-08-11 08:00:00', crawl_time: '2026-08-11 08:25:00', fetched_via: 'ifind_mcp',
    url: 'https://example.com/announcement/7',
  },
  {
    doc_code: 'DOC-0008', source_type: 'announcement', source_name: '公司公告', source_level: 5,
    title: '示例科技关于中标金额的更正公告',
    content: '原公告中智慧城市项目中标金额3.2亿元有误，现更正为2.3亿元。',
    disclose_time: '2026-08-18 08:00:00', crawl_time: '2026-08-18 08:40:00', fetched_via: 'ifind_mcp',
    url: 'https://example.com/announcement/8',
  },

  {
    doc_code: 'DOC-0009', source_type: 'announcement', source_name: '公司公告', source_level: 5,
    title: '示例食品2025年度业绩预告',
    content: '预计2025年度净利润同比增长30%至40%。',
    disclose_time: '2026-02-20 08:00:00', crawl_time: '2026-02-20 08:30:00', fetched_via: 'ifind_mcp',
    url: 'https://example.com/announcement/9',
  },

  {
    doc_code: 'DOC-0010', source_type: 'news', source_name: '一般媒体', source_level: 2,
    title: '行业要闻：快消品零售景气度回升',
    content: '近期快消品零售景气度有所回升，行业整体向好，未提及具体公司事项。',
    disclose_time: '2026-08-22 10:00:00', crawl_time: '2026-08-22 10:30:00', fetched_via: 'public_web',
    url: 'https://example.com/news/10',
  },
];

// 影响验证用行情快照（公开来源示例数据）
export const IMPACT = [
  { target_code: '600001.SH', anchor: 'pre_event', metric_date: '2026-08-04', close_price: 42.10, pct_change: 0.5, volume: 1200000, source: 'public' },
  { target_code: '600001.SH', anchor: 'post_event', metric_date: '2026-08-13', close_price: 45.80, pct_change: 3.2, volume: 2600000, source: 'public' },
  { target_code: '600001.SH', anchor: 'post_event', metric_date: '2026-08-21', close_price: 43.05, pct_change: -2.1, volume: 1800000, source: 'public' },
  { target_code: '600002.SH', anchor: 'pre_event', metric_date: '2026-08-07', close_price: 18.60, pct_change: -0.3, volume: 800000, source: 'public' },
  { target_code: '600002.SH', anchor: 'post_event', metric_date: '2026-08-12', close_price: 20.15, pct_change: 4.1, volume: 1500000, source: 'public' },
  { target_code: '600002.SH', anchor: 'post_event', metric_date: '2026-08-19', close_price: 19.40, pct_change: -1.6, volume: 1100000, source: 'public' },
];

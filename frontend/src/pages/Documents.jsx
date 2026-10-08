import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, message, Alert } from 'antd';
import { svc } from '../api.js';
import { LEVEL_CN } from '../constants.js';

const SRC_CN = {
  announcement: '公告', news: '新闻', report: '研报',
  interaction: '互动易', industry: '行业资讯', public_other: '其它公开材料',
};

export default function Documents() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setRows(await svc.documents());
      } catch (e) {
        message.error(`加载文档失败：${e.message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const columns = [
    { title: '文档编码', dataIndex: 'doc_code', width: 110 },
    { title: '来源类型', dataIndex: 'source_type', width: 90, render: (v) => SRC_CN[v] || v },
    { title: '来源', dataIndex: 'source_name', width: 120 },
    { title: '权威等级', dataIndex: 'source_level', width: 110, render: (v) => <Tag>{LEVEL_CN[v] || `L${v}`}</Tag> },
    {
      title: '标题 / 原文', dataIndex: 'title',
      render: (t, r) => (
        <div>
          {t}
          <div className="quote">{r.content.slice(0, 90)}{r.content.length > 90 ? '…' : ''}</div>
          {r.url && <div className="small"><a href={r.url} target="_blank" rel="noreferrer">原文链接</a></div>}
        </div>
      ),
    },
    { title: '披露时间', dataIndex: 'disclose_time', width: 150, render: (v) => <span className="small">{v}</span> },
    { title: '抓取时间', dataIndex: 'crawl_time', width: 150, render: (v) => <span className="small">{v}</span> },
    { title: '获取方式', dataIndex: 'fetched_via', width: 110, render: (v) => <Tag color={v === 'ifind_mcp' ? 'blue' : 'default'}>{v}</Tag> },
    {
      title: '归属', dataIndex: 'event_code', width: 150,
      render: (v, r) => (r.unstructured ? <Tag color="orange">未结构化（未匹配到主体，已保留）</Tag> : <Tag color="green">{v}</Tag>),
    },
  ];

  return (
    <Card title="数据源与原文（每条可追溯）" size="small">
      <Alert type="info" showIcon style={{ marginBottom: 10 }}
        message="iFinD MCP 与扶摇未接入；当前数据来自 public_web 与样例适配器。未匹配到主体的文档不丢弃，标记为「未结构化」保留。" />
      <Table size="small" rowKey="doc_code" loading={loading} columns={columns} dataSource={rows} pagination={false} />
    </Card>
  );
}

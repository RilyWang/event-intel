import React, { useEffect, useState } from 'react';
import { Card, Tabs, Tag, Descriptions, Timeline, Table, Button, Space, Alert, Spin, Empty, message, Typography, Divider } from 'antd';
import { svc } from '../api.js';
import { STATUS_COLOR, EVIDENCE_COLOR, LEVEL_CN, CHANGE_CN, TRIGGER_CN, CONF_COLOR } from '../constants.js';

const { Paragraph, Text } = Typography;

export default function EventDetail({ code, meta, onBack }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await svc.event(code);
        if (alive) setD(data);
      } catch (e) {
        message.error(`加载事件详情失败：${e.message}`);
        if (alive) setD(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [code]);

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
  if (!d) return <Card><Empty description="事件不存在或加载失败，请返回列表" /><div style={{ textAlign: 'center', marginTop: 12 }}><Button onClick={onBack}>返回列表</Button></div></Card>;

  const ev = d.event;
  const current = d.conclusions.find((c) => c.is_current === 1) || d.conclusions[0];

  const tsGrid = (
    <div className="ts-grid" style={{ marginTop: 12 }}>
      <div className="ts-box"><div className="k">事件发生时间</div><div className="v">{ev.event_time || '原文未提及'}</div></div>
      <div className="ts-box"><div className="k">披露时间（首次来源）</div><div className="v">{d.first_source?.disclose_time || '-'}</div></div>
      <div className="ts-box"><div className="k">抓取时间（首次来源）</div><div className="v">{d.first_source?.crawl_time || '-'}</div></div>
      <div className="ts-box"><div className="k">更新时间（平台处理）</div><div className="v">{ev.update_time}</div></div>
    </div>
  );

  const timelineItems = d.timeline.map((t) => ({
    color: EVIDENCE_COLOR[t.evidence_type] === 'green' ? 'green' : undefined,
    children: (
      <div>
        <Space wrap size={6}>
          <b>{t.disclose_time}</b>
          <Tag>{LEVEL_CN[t.source_level] || `L${t.source_level}`}</Tag>
          {t.evidence_type && <Tag color={EVIDENCE_COLOR[t.evidence_type]}>{meta?.evidence_type?.[t.evidence_type] || t.evidence_type}</Tag>}
          {t.weight != null && <Tag color="red">权重 {t.weight}</Tag>}
          <span className="small">{t.doc_code}</span>
        </Space>
        <div style={{ marginTop: 4 }}>{t.title}</div>
        {t.quote && <div className="quote">原文：{t.quote}</div>}
        <div className="small" style={{ marginTop: 4 }}>
          来源：{t.source_name}　抓取：{t.crawl_time}　获取方式：{t.fetched_via}
          {t.url && <>　<a href={t.url} target="_blank" rel="noreferrer">原文链接</a></>}
        </div>
        <div className="small">归并理由：{t.merge_reason}（置信度 {t.merge_confidence}）</div>
      </div>
    ),
  }));

  const evidenceCols = [
    { title: '证据编号', dataIndex: 'evidence_code', width: 110 },
    { title: '类型', dataIndex: 'evidence_type', width: 80, render: (v) => <Tag color={EVIDENCE_COLOR[v]}>{meta?.evidence_type?.[v] || v}</Tag> },
    { title: '权重', dataIndex: 'weight', width: 70, render: (v) => <b style={{ color: CONF_COLOR(v) }}>{v}</b> },
    {
      title: '权重构成（可解释）', dataIndex: 'weight_detail', width: 200,
      render: (v) => { const j = JSON.parse(v); return <span className="small">来源系数 {j.w_source} × 类型系数 {j.c_type} × 时效 {j.d_time}{j.days != null ? `（${j.days}天）` : ''}</span>; },
    },
    { title: '来源', dataIndex: 'source_name', width: 110 },
    { title: '原文片段', dataIndex: 'quote', render: (v) => <span className="small">{v}</span> },
  ];

  const versionCols = [
    { title: '版本', dataIndex: 'version_no', width: 60, render: (v) => `v${v}` },
    { title: '变更类型', dataIndex: 'change_type', width: 100, render: (v) => <Tag>{CHANGE_CN[v] || v}</Tag> },
    { title: '变更摘要', dataIndex: 'change_summary' },
    { title: '更新时间', dataIndex: 'update_time', width: 150, render: (v) => <span className="small">{v}</span> },
  ];

  const logCols = [
    { title: '从', dataIndex: 'from_status', width: 80, render: (v) => (v ? (meta?.status?.[v] || v) : '（新建）') },
    { title: '到', dataIndex: 'to_status', width: 80, render: (v) => <Tag color={STATUS_COLOR[v]}>{meta?.status?.[v] || v}</Tag> },
    { title: '规则', dataIndex: 'rule_code', width: 60 },
    { title: '原因', dataIndex: 'reason' },
    { title: '时间', dataIndex: 'changed_time', width: 150, render: (v) => <span className="small">{v}</span> },
  ];

  const impactCols = [
    { title: '日期', dataIndex: 'metric_date', width: 110 },
    { title: '锚点', dataIndex: 'anchor', width: 100, render: (v) => ({ pre_event: '事件前', post_event: '事件后', baseline: '基准' }[v] || v) },
    { title: '收盘价', dataIndex: 'close_price', width: 90 },
    { title: '涨跌幅', dataIndex: 'pct_change', width: 90, render: (v) => <span style={{ color: v >= 0 ? '#c8161d' : '#389e0d' }}>{v}%</span> },
    { title: '成交量', dataIndex: 'volume', width: 110 },
    { title: '来源', dataIndex: 'source', render: (v) => <Tag>{v === 'public' ? '公开行情' : v}</Tag> },
  ];

  return (
    <>
      <Card
        size="small"
        title={<Space><Button size="small" onClick={onBack}>← 返回</Button><span>{ev.event_code}</span></Space>}
        extra={<Space>
          <Tag color={STATUS_COLOR[ev.status]}>{meta?.status?.[ev.status] || ev.status}</Tag>
          <span>置信度 <b style={{ color: CONF_COLOR(ev.event_confidence) }}>{ev.event_confidence}</b></span>
        </Space>}
      >
        <h3 style={{ margin: '0 0 10px' }}>{ev.title}</h3>
        <Descriptions size="small" column={3} items={[
          { key: 'sub', label: '事件主体', children: `${ev.subject_name}（${ev.subject_code || '未关联标的'}）` },
          { key: 'type', label: '事件类型', children: meta?.event_type?.[ev.event_type] || ev.event_type },
          { key: 'first', label: '最初来源', children: d.first_source ? `${d.first_source.source_name} · ${d.first_source.doc_code}` : '-' },
        ]} />
        {tsGrid}
        <div className="small" style={{ marginTop: 8 }}>
          四个时间戳含义：事件发生时间=事情本身何时发生；披露时间=该文档对外发布的时间（时间线排序依据）；
          抓取时间=平台获取该文档的时间；更新时间=平台最近一次重新处理该事件的时间。
        </div>
      </Card>

      <Card size="small" style={{ marginTop: 12 }}>
        <Tabs
          items={[
            {
              key: 'timeline', label: `证据时间线（${d.timeline.length}）`,
              children: timelineItems.length ? <Timeline items={timelineItems} /> : <Empty description="暂无文档" />,
            },
            {
              key: 'evidence', label: `证据与权重（${d.evidence.length}）`,
              children: (
                <>
                  <Alert type="info" showIcon style={{ marginBottom: 10 }}
                    message="事实 / 观点 / 推测 / 传闻分开呈现；权重由「来源权威 × 证据类型 × 时效」规则计算，可解释、可复现。" />
                  <Table size="small" rowKey="evidence_code" columns={evidenceCols} dataSource={d.evidence} pagination={false} />
                </>
              ),
            },
            {
              key: 'conclusion', label: '结论与变更历史',
              children: (
                <>
                  {current && (
                    <Card size="small" style={{ marginBottom: 12 }} title="当前结论">
                      <Space size={16} wrap>
                        <span>状态：<Tag color={STATUS_COLOR[ev.status]}>{meta?.status?.[ev.status]}</Tag></span>
                        <span>影响方向：<b>{meta?.direction?.[current.direction] || current.direction}</b></span>
                        <span>置信度：<b style={{ color: CONF_COLOR(current.confidence) }}>{current.confidence}</b></span>
                      </Space>
                      <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>{current.summary}</Paragraph>
                      <div className="small">依据证据：{JSON.parse(current.evidence_ids).join('、')}　结论版本：v{current.version_no}</div>
                    </Card>
                  )}
                  <Divider>状态规则触发记录（可解释）</Divider>
                  <Table size="small" rowKey="id" columns={logCols} dataSource={d.state_logs} pagination={false} style={{ marginBottom: 14 }} />
                  <Divider>版本演化（旧版本不覆盖）</Divider>
                  <Table size="small" rowKey="id" columns={versionCols} dataSource={[...d.versions].reverse()} pagination={false} />
                  <Divider>历史结论（保留，仅一条当前有效）</Divider>
                  <Table size="small" rowKey="id" pagination={false} dataSource={d.conclusions}
                    columns={[
                      { title: '版本', dataIndex: 'version_no', width: 60, render: (v) => `v${v}` },
                      { title: '方向', dataIndex: 'direction', width: 90, render: (v) => meta?.direction?.[v] || v },
                      { title: '置信度', dataIndex: 'confidence', width: 80 },
                      { title: '是否当前', dataIndex: 'is_current', width: 90, render: (v) => (v ? <Tag color="green">当前</Tag> : <Tag>已被取代</Tag>) },
                      { title: '摘要', dataIndex: 'summary' },
                    ]} />
                </>
              ),
            },
            {
              key: 'impact', label: `影响验证（${d.impact.length}）`,
              children: d.impact.length ? (
                <>
                  <Alert type="warning" showIcon style={{ marginBottom: 10 }}
                    message="仅呈现事件披露前后的行情数据作为客观参考，不构成因果结论，也不构成投资建议。" />
                  <Table size="small" rowKey="id" columns={impactCols} dataSource={d.impact} pagination={false} />
                </>
              ) : <Empty description="暂无行情数据（数据源未接入，见 README 已知边界）" />,
            },
            {
              key: 'notify', label: `事件通知（${d.notifications.length}）`,
              children: d.notifications.length ? (
                <Timeline items={d.notifications.map((n) => ({
                  children: (
                    <div>
                      <Space><Tag color="red">{TRIGGER_CN[n.trigger_rule] || n.trigger_rule}</Tag><b>{n.title}</b><span className="small">{n.created_time}</span></Space>
                      <div style={{ marginTop: 4 }}>{n.body}</div>
                    </div>
                  ),
                }))} />
              ) : <Empty description="本事件暂无通知" />,
            },
          ]}
        />
      </Card>
    </>
  );
}

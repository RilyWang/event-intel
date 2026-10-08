import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Select, Input, Space, Button, message } from 'antd';
import { svc } from '../api.js';
import { STATUS_COLOR, CONF_COLOR } from '../constants.js';

export default function EventList({ meta, onOpen, readonly }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [kw, setKw] = useState('');

  async function load() {
    setLoading(true);
    try {
      const qs = [];
      if (status) qs.push(`status=${status}`);
      if (kw) qs.push(`q=${encodeURIComponent(kw)}`);
      setRows(await svc.events(qs.length ? `?${qs.join('&')}` : ''));
    } catch (e) {
      message.error(`加载事件失败：${e.message}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [status, kw]);

  async function rerun() {
    if (readonly) {
      message.info('当前为只读快照演示版，不支持在线重跑；页面数据即由 kimi-k2.6 真实抽取生成，完整流水线请按 README 本地运行。');
      return;
    }
    try {
      await svc.runPipeline();
      message.success('已重跑主链路（采集→抽取→归并→分级→状态→结论）');
      load();
    } catch (e) {
      message.error(`重跑失败：${e.message}`);
    }
  }

  const columns = [
    { title: '事件编码', dataIndex: 'event_code', width: 130 },
    {
      title: '事件标题', dataIndex: 'title',
      render: (t, r) => (
        <div>
          <a onClick={() => onOpen(r.event_code)}>{t}</a>
          <div className="small">主体：{r.subject_name}　类型：{meta?.event_type?.[r.event_type] || r.event_type}</div>
        </div>
      ),
    },
    { title: '状态', dataIndex: 'status', width: 90, render: (s) => <Tag color={STATUS_COLOR[s]}>{meta?.status?.[s] || s}</Tag> },
    { title: '置信度', dataIndex: 'event_confidence', width: 90, render: (v) => <b style={{ color: CONF_COLOR(v) }}>{v}</b> },
    { title: '证据', dataIndex: 'evidence_count', width: 60 },
    { title: '文档', dataIndex: 'doc_count', width: 60 },
    { title: '最近更新', dataIndex: 'update_time', width: 150, render: (v) => <span className="small">{v}</span> },
  ];

  return (
    <Card
      title="事件列表"
      size="small"
      extra={
        <Space>
          <Select
            placeholder="按状态筛选" allowClear style={{ width: 140 }}
            value={status || undefined} onChange={(v) => setStatus(v || '')}
            options={Object.entries(meta?.status || {}).map(([k, v]) => ({ value: k, label: v }))}
          />
          <Input.Search placeholder="搜索标题 / 主体" style={{ width: 200 }} onSearch={setKw} allowClear />
          <Button onClick={rerun}>重跑主链路</Button>
        </Space>
      }
    >
      <Table
        size="small" rowKey="event_code" loading={loading}
        columns={columns} dataSource={rows}
        pagination={false}
        locale={{ emptyText: '暂无匹配事件（试试点「重跑主链路」生成演示数据）' }}
      />
    </Card>
  );
}

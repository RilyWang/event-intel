import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Space, message, Alert } from 'antd';
import { svc } from '../api.js';
import { STATUS_COLOR, TRIGGER_CN } from '../constants.js';

export default function Notifications({ meta, onOpen, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setRows(await svc.notifications());
    } catch (e) {
      message.error(`加载通知失败：${e.message}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function markRead(id) {
    try {
      await svc.readNotification(id);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_read: 1 } : r)));
      onChanged && onChanged();
    } catch (e) {
      message.error(`标记失败：${e.message}`);
    }
  }

  const columns = [
    { title: '触发规则', dataIndex: 'trigger_rule', width: 150, render: (v) => <Tag color="red">{TRIGGER_CN[v] || v}</Tag> },
    { title: '事件', dataIndex: 'event_code', width: 130, render: (v, r) => <a onClick={() => onOpen(r.event_code)}>{v}</a> },
    { title: '事件状态', dataIndex: 'status', width: 90, render: (v) => <Tag color={STATUS_COLOR[v]}>{meta?.status?.[v] || v}</Tag> },
    {
      title: '通知内容（说明改了什么、为什么）', dataIndex: 'body',
      render: (v, r) => (<div><b>{r.title}</b><div className="small" style={{ marginTop: 2 }}>{v}</div></div>),
    },
    { title: '时间', dataIndex: 'created_time', width: 150, render: (v) => <span className="small">{v}</span> },
    {
      title: '状态', dataIndex: 'is_read', width: 100,
      render: (v, r) => (v ? <Tag>已读</Tag> : <Button size="small" type="primary" onClick={() => markRead(r.id)}>标记已读</Button>),
    },
  ];

  return (
    <Card title="通知中心" size="small">
      <Alert type="info" showIcon style={{ marginBottom: 10 }}
        message="仅在四种情形通知：状态变为否认/更正、影响方向翻转、置信度显著变化、存在冲突证据。每条通知都说明变更内容与原因。" />
      <Table size="small" rowKey="id" loading={loading} columns={columns} dataSource={rows} pagination={false}
        locale={{ emptyText: '暂无通知' }} />
    </Card>
  );
}

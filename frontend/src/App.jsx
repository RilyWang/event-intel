import React, { useEffect, useState } from 'react';
import { Layout, Menu, Row, Col, Card, Statistic, Badge, Alert, Spin, message } from 'antd';
import { svc } from './api.js';
import EventList from './pages/EventList.jsx';
import EventDetail from './pages/EventDetail.jsx';
import Notifications from './pages/Notifications.jsx';
import Documents from './pages/Documents.jsx';

const { Sider, Content } = Layout;

export default function App() {
  const [view, setView] = useState('events');
  const [code, setCode] = useState(null);
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  async function refresh() {
    try {
      const [s, m] = await Promise.all([svc.stats(), svc.meta()]);
      setStats(s);
      setMeta(m);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const goDetail = (c) => { setCode(c); setView('detail'); };
  const backToList = () => { setCode(null); setView('events'); refresh(); };

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>;

  return (
    <Layout className="app">
      <Sider className="side" width={220} theme="light">
        <div className="brand">
          <div className="dot">证</div>
          <div>
            <b>事件情报雷达</b>
            <span>投资事件 · 证据时间线</span>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[view === 'detail' ? 'events' : view]}
          onClick={(e) => { if (e.key !== 'detail') { setCode(null); setView(e.key); } }}
          items={[
            { key: 'events', label: '事件列表' },
            { key: 'notifications', label: <span>通知中心 {stats?.pending_notifications ? <Badge count={stats.pending_notifications} size="small" /> : null}</span> },
            { key: 'documents', label: '数据源与原文' },
          ]}
        />
        <div className="small" style={{ marginTop: 20, padding: '0 8px', lineHeight: 1.9 }}>
          数据截止日：<b>{meta?.as_of}</b><br />
          iFinD MCP：未接入<br />
          扶摇：未接入<br />
          公开材料 / 样例：可用
        </div>
      </Sider>

      <Content className="main">
        {err && <Alert type="error" showIcon message={`接口异常：${err}`} style={{ marginBottom: 14 }} />}
        <div className="disclaimer">⚠️ {meta?.disclaimer}</div>

        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col span={4}><Card size="small"><Statistic title="关注标的" value={stats?.targets ?? 0} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="原始文档" value={stats?.documents ?? 0} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="识别事件" value={stats?.events ?? 0} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="证据条目" value={stats?.evidence ?? 0} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="事件状态分布" value={stats?.by_status?.map((b) => `${meta?.status?.[b.status] || b.status}${b.c}`).join(' / ') || '-'} valueStyle={{ fontSize: 13 }} /></Card></Col>
          <Col span={4}><Card size="small"><Statistic title="待读通知" value={stats?.pending_notifications ?? 0} valueStyle={{ color: '#c8161d' }} /></Card></Col>
        </Row>

        {view === 'events' && <EventList meta={meta} onOpen={goDetail} />}
        {view === 'detail' && <EventDetail code={code} meta={meta} onBack={backToList} onChanged={refresh} />}
        {view === 'notifications' && <Notifications meta={meta} onOpen={(c) => goDetail(c)} onChanged={refresh} />}
        {view === 'documents' && <Documents />}
      </Content>
    </Layout>
  );
}

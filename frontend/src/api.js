// 统一请求封装：处理 {code, message, data} 契约（后端契约见 07-主PRD/API 定义）
const BASE = '/api';

export async function apiGet(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.code !== 0) throw new Error(body.message || '接口返回错误');
  return body.data;
}

export async function apiPost(path, payload) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.code !== 0) throw new Error(body.message || '接口返回错误');
  return body.data;
}

export const svc = {
  health: () => apiGet('/health'),
  meta: () => apiGet('/meta'),
  stats: () => apiGet('/stats'),
  events: (qs = '') => apiGet(`/events${qs}`),
  event: (code) => apiGet(`/events/${code}`),
  documents: () => apiGet('/documents'),
  notifications: () => apiGet('/notifications'),
  readNotification: (id) => apiPost(`/notifications/${id}/read`),
  runPipeline: () => apiPost('/pipeline/run'),
};

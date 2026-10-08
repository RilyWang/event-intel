# 部署说明（GitHub + Render）

> 目标：拿到一个**持久、无提醒页**的公网地址（题目要求的"可访问 Web 产品 URL"）。
> 本项目是**单进程整站**：后端同时提供 API 与前端页面，因此只需部署一个服务。

## 前置：环境实测结论（决定了本方案为什么这样设计）

| 事实 | 影响 |
| --- | --- |
| 本机 `github.com:443` 不通，但 `github.com:22`（SSH）通 | 推送必须走 **SSH**，不能用 HTTPS / PAT |
| `api.github.com` 通 | 可用 REST API 创建仓库 |
| `8787`、`8899` 端口被平台代理占用 | 本地后端改用 `5311` |
| Render 登录方式是 GitHub | 仓库必须先存在于 GitHub，Render 才能拉取 |

## 第 1 步：在 GitHub 建空仓库（约 1 分钟）

登录 GitHub，新建仓库：

- **Repository name**：`event-intel`
- **Public / Private**：按作业要求选（Render 免费层两者都支持）
- **不要**勾选 "Add a README"、"Add .gitignore"、"Choose a license"（必须建**空仓库**，否则推送会冲突）

建好后仓库地址应为：`https://github.com/RilyWang/event-intel`

> 本地 remote 已配置为 `git@github.com:RilyWang/event-intel.git`，SSH 公钥已验证可用（`Hi RilyWang! You've successfully authenticated`）。

## 第 2 步：推送代码（我来执行）

仓库建好后告知即可，我执行：

```bash
git push -u origin main
```

## 第 3 步：部署到 Render（约 3 分钟）

### 方式 A：Blueprint 一键（仓库里已有 `render.yaml`）

Render 控制台 → **New** → **Blueprint** → 选择 `RilyWang/event-intel` → Apply。
`render.yaml` 已写好构建/启动命令与 `NODE_VERSION=24`。

### 方式 B：手动建 Web Service（若 Blueprint 不识别）

Render 控制台 → **New** → **Web Service** → 连接 `event-intel`，按下表填写：

| 字段 | 填写内容 |
| --- | --- |
| Runtime | Node |
| Build Command | `npm --prefix frontend install && npm --prefix frontend run build && npm --prefix backend install` |
| Start Command | `node backend/src/server.js` |
| Health Check Path | `/api/health` |
| Instance Type | Free |

**环境变量（Environment → Add Environment Variable）**：

| Key | Value |
| --- | --- |
| `NODE_VERSION` | `24` |
| `LLM_BASE_URL` | `https://api.moonshot.cn/v1` |
| `LLM_MODEL` | `kimi-k2.6` |
| `LLM_TEMPERATURE` | `1` |
| `LLM_API_KEY` | 你的 Key（**只填在 Render 控制台，不要写进仓库**） |

> `NODE_VERSION` 必须固定：`node:sqlite` 自 Node 22.13 起才免 flag，Node 过旧会启动失败。

### 方式 C：Docker（仓库里已有 `Dockerfile`）

把 Render 服务的 Runtime 选为 **Docker**，无需填写构建/启动命令，环境变量同上。

## 第 4 步：验证（我来执行）

部署完成后把 Render 给的地址（形如 `https://event-intel-xxxx.onrender.com`）告诉我，我会验证：

1. `GET /api/health` 返回 `{code:0,...}` 且 `llm.available=true`
2. `GET /api/events` 返回 3 个事件、状态为 `denied / corrected / expired`
3. 首页返回真实应用（不是错误页）
4. `/api/llm/status` 显示 `events_extracted_by_llm=3`

## 已知风险（如实声明，未在本机验证）

| 风险 | 说明 | 应对 |
| --- | --- | --- |
| Docker 路径未实测 | 本机无 Docker，无法本地验证 `Dockerfile` | 优先用方式 A/B（Node 原生），方式 C 作为备选 |
| `render.yaml` 字段名随 Render 版本变化 | 未能在本机对 Render 校验 | 若 Blueprint 报错，改用方式 B 手动填写（等价） |
| 免费实例会休眠 | 闲置后首次访问需等待数十秒唤醒 | 演示前先访问一次预热 |
| 免费实例磁盘为临时盘 | 重新部署后 SQLite 数据重置 | 服务启动时会自动重新 seed，演示数据总能复现 |

## 备用部署路径（若 Render 不顺）

| 平台 | 需要 | 备注 |
| --- | --- | --- |
| Railway | 账号 Token | 同样支持 Node / Docker |
| Fly.io | 账号 Token | 其 CLI 从 GitHub 下载，本机下不来，需在您本机操作 |
| 任意 VPS | SSH 访问 | 直接 `git clone` + `node backend/src/server.js` |

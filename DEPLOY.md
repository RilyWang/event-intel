# 部署说明 —— Cloudflare Pages（免信用卡、国内可访问）

> 目标：取得**可访问的 Web 产品 URL**。已实测各平台在本网络的可用性，结论如下。

## 0. 为什么是 Cloudflare Pages（实测依据）

| 平台 / 域名 | 结果 | 说明 |
| --- | --- | --- |
| **`pages.dev`（Cloudflare Pages）** | ✅ 可达 | **免费、无需信用卡**，Functions 也跑在同一域名 |
| `cloud.sealos.io` | ✅ 可达 | 国内平台，备选（需注册，可能需实名） |
| `cnb.cool` | ✅ 可达 | 国内平台，备选 |
| `onrender.com`（Render 部署域名） | ❌ **不可达** | 且 Render 免费层也要求**绑定信用卡**验证身份 |
| `vercel.app` | ❌ 不可达 | 域名网络不通 |
| `netlify.app` / `koyeb.app` | ❌ 不可达 | 同上 |
| `workers.dev` | ❌ 不可达 | 但 `pages.dev` 可达，故走 Pages |
| `huggingface.co` | ❌ 不可达 | HF Spaces 方案不可用 |

**另一项硬约束**：Cloudflare 运行时（Workers/Pages Functions）**不支持 `node:sqlite` 与文件系统**，因此线上版本采用「**快照模式**」：把本地已跑通的 LLM 抽取结果导出为快照，由 Pages Functions 提供只读 API。

## 1. 两种运行形态（同一套代码）

| | 完整版（本地 / Node 主机） | 快照版（Cloudflare Pages） |
| --- | --- | --- |
| 数据层 | `node:sqlite` 文件库 | 只读快照（`cf/snapshot.js`） |
| 接口实现 | Express（`backend/src/server.js`） | Pages Functions（`functions/api/*`） |
| 读操作（浏览/筛选/切页签/看时间线证据结论） | ✅ | ✅ |
| 写操作（重跑主链路 / 标记已读） | ✅ | ⚠️ 不可用，界面会明确提示 |
| 需要 LLM Key | 是（实时抽取） | **否**（数据已由 LLM 抽取并固化为快照） |
| **接口一致性** | —— | **已用 `tests/cf-parity.js` 验证 10/10 逐字节一致** |

> 快照里的事件、证据、状态演化、结论、通知，都是 `kimi-k2.6` **真实抽取**产生的，不是写死的假数据。

## 2. 部署步骤（Cloudflare Pages，约 3 分钟）

### 前置
- Cloudflare 账号（邮箱注册即可，**不需要信用卡**）
- 代码已在 GitHub：`https://github.com/RilyWang/event-intel`

### 步骤
1. 登录 Cloudflare → 左侧 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 授权并选择仓库 **`RilyWang/event-intel`**
3. 构建设置按下表填写（**关键**）：

| 字段 | 填写内容 |
| --- | --- |
| Framework preset | `None` |
| Build command | `npm --prefix frontend install && npm --prefix frontend run build` |
| Build output directory | `frontend/dist` |
| Root directory | 留空（仓库根目录） |

4. 点 **Save and Deploy**
   - `functions/` 目录会被自动识别为 Pages Functions，无需额外配置
   - `_routes.json` 已放在 `frontend/public/`，构建时自动复制到输出目录，用于把 `/api/*` 交给 Functions
   - **不需要配置任何环境变量**（快照版不含密钥）
5. 部署完成后得到地址：`https://event-intel.pages.dev`（或带随机后缀）

### 命令行方式（备选）
```bash
# 需要 Cloudflare API Token（My Profile → API Tokens，模板选 "Edit Cloudflare Workers"）
npx wrangler pages deploy frontend/dist --project-name event-intel
```

## 3. 部署后自检清单

| 检查 | 期望 |
| --- | --- |
| `GET https://<域名>/api/health` | `code:0`，且 `data.mode === "snapshot"` |
| `GET https://<域名>/api/events` | 3 个事件，状态为 `denied / corrected / expired` |
| 首页 | 正常渲染，顶部有「只读快照演示版」提示 |
| 事件详情 | 4 个时间戳、5 条时间线、证据权重构成、状态规则记录（P1/P3/P5/P6）、版本演化均在 |
| `/api/events?status=denied` | 过滤生效，返回 1 条 |

## 4. 完整版部署（可选，需要常驻 Node 运行时）

若希望线上也能「重跑主链路」（实时调用 LLM），需要支持 Node + 可写磁盘的平台：

```bash
cd backend && npm install && npm start   # 默认 5311
```
- 仓库已含 `Dockerfile`（`node:24-alpine`，先构建前端再由后端同域托管，单进程整站）
- 环境变量：`LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` / `LLM_TEMPERATURE`
- **注意**：Dockerfile 与 Render 配置在本机**无法实测**（本机无 Docker、Render 需信用卡且域名不可达），仅作为备选保留

## 5. 数据更新方式（快照版）

本地改了样例数据或换了模型后，重新生成快照并推送即可：

```bash
cd backend
node src/seed.js        # 重跑主链路（走 LLM）
node src/snapshot.js    # 导出快照到 cf/snapshot.js
cd .. && git add -A && git commit -m "更新快照" && git push
```
Cloudflare Pages 检测到推送会自动重新构建部署。

## 6. 风险与边界（如实声明）

| 项 | 说明 |
| --- | --- |
| 快照版不支持写入 | 界面已明确提示，不会伪装成功；`/api/pipeline/run`、`/api/notifications/:id/read` 返回 `code:503` 与原因说明 |
| 快照为静态数据 | 数据截止日 `2026-08-25`，与本地一致；页面上有标注 |
| Cloudflare 首次审核 | 新账号首次部署偶有排队，通常数分钟内完成 |
| 接口一致性已验证 | 但仅覆盖 10 个用例，未穷举所有查询组合 |

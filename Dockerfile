# 单进程整站镜像：构建前端 → 由后端同域托管
# node:24 —— node:sqlite 自 Node 22.13 起免 flag，24 更稳，故固定大版本
FROM node:24-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN npm --prefix frontend ci
COPY frontend/ ./frontend/
RUN npm --prefix frontend run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci --omit=dev
COPY backend/ ./backend/
COPY --from=build /app/frontend/dist ./frontend/dist
# 容器内端口；平台若注入 PORT 环境变量则以平台为准
EXPOSE 5311
CMD ["node", "backend/src/server.js"]

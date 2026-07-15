# SynovaAgent — 组织数字孪生诊断 Agent
# 方案 B: Docker 部署 (用户有 Docker Desktop 或运维帮部署)
#
# 构建: docker buildx build --platform linux/amd64,linux/arm64 -t synova-agent .
# 启动: docker compose up -d
# 或用: docker run -d -p 3000:3000 -v $PWD/data:/app/data synova-agent

# ═══ 阶段 1: 构建（multi-arch）═══
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /app

# 复制 monorepo 依赖结构
COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY server/vendor/ ./vendor/

# 安装依赖
RUN npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev

# ═══ 阶段 2: 运行 ═══
FROM node:22-alpine

LABEL org.opencontainers.image.title="SynovaAgent"
LABEL org.opencontainers.image.description="AI 组织诊断 — 持续增长导航系统"
LABEL org.opencontainers.image.version="0.2.0"

WORKDIR /app

# 复制 node_modules + packages + vendor
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/vendor ./vendor

# 复制源代码
COPY package.json tsconfig.json vitest.config.ts ./
COPY src/ ./src/
COPY scripts/ ./scripts/

# 数据目录
RUN mkdir -p /app/data /app/logs

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

EXPOSE 3000

# 生产启动
ENV NODE_ENV=production
CMD ["node", "--import", "tsx/esm", "src/index.ts"]

# SynovaAgent — 组织数字孪生诊断 Agent
# 基于 node:22-alpine，最小生产镜像
FROM node:22-alpine

LABEL org.opencontainers.image.title="SynovaAgent"
LABEL org.opencontainers.image.description="组织数字孪生诊断 Agent"
LABEL org.opencontainers.image.version="0.1.0"

WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json* ./

# 安装依赖（生产模式，跳过 devDependencies）
RUN npm ci --omit=dev

# 复制源代码 + engine-core
COPY tsconfig.json vitest.config.ts ./
COPY src/ ./src/
COPY ../server/vendor/@synova/engine-core/ ./vendor/@synova/engine-core/

# 创建数据目录
RUN mkdir -p /app/data

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000

# 生产启动：先用 esbuild 编译再运行
CMD ["sh", "-c", "npx esbuild src/index.ts --bundle --platform=node --format=cjs --target=node20 --outfile=dist/index.js --external:express --external:cors --external:pino --external:better-sqlite3 --external:@synova/* --external:fs --external:path --external:os --external:crypto && node dist/index.js"]

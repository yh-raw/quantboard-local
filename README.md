# QuantBoard (个人量化投资看板)

一个可上线演示、可写进简历的全栈项目 MVP：
- 前端：Next.js App Router + TypeScript + Tailwind + shadcn/ui + Recharts
- 后端：Next.js Route Handlers (`/app/api/*`)
- 数据库：Prisma + SQLite（默认）/ PostgreSQL（可切换）
- 认证：NextAuth + GitHub OAuth（多用户）
- 数据源：真实日线优先（Stooq）+ Mock 回退（`/api/market/sync`）
- 页面打开时自动触发真实数据刷新（带服务端 TTL 防抖）
- 内置中英文语言切换（English / 中文）

## 1. 已实现功能（MVP）

- Dashboard 首页
- 近期信号卡片（基于 MA20 / BOLL 简化信号）
- Watchlist 入口与快照
- Watchlist 自选
- 添加/删除 ticker（AAPL、TSLA、SPY、BTC-USD 等）
- 展示最新 close 与涨跌幅（由 DB 最近两根 K 线计算）
- Asset 详情页：`/asset/[ticker]`
- TradingView 风格 K 线图（Candlestick）
- 指标开关：MA20、BOLL
- 图上信号点标注（MA 上穿/下穿 + BOLL 突破）
- 市场数据 API
- `GET /api/market/bars`
- `POST /api/market/sync`
- Watchlist API
- `GET /api/watchlist`
- `POST /api/watchlist/item`
- `DELETE /api/watchlist/item?ticker=...`
- 多用户认证与隔离
- GitHub 登录（NextAuth）
- Watchlist / Alerts / Deliveries 按 `userId` 隔离
- Backtest 模块
- 策略参数：`shortWindow / longWindow / feeBps / initialCapital / riskFreeRatePct`
- 输出：收益曲线、最大回撤、夏普比率、交易明细
- 回测 API：`POST /api/backtest/run`
- 告警订阅模块
- 订阅管理：`LOG / WEBHOOK / TELEGRAM`
- 扫描触发：`POST /api/alerts/scan`
- 去重投递：同一订阅 + 同一信号类型 + 同一信号时间仅发送一次
- 任务调度（Cron / 队列）
- `SyncJob` 队列表 + 抢占式 worker + 自动重试
- `GET/POST /api/jobs/market-sync/queue`（查看/入队）
- `POST /api/jobs/market-sync/run`（消费队列）
- `GET/POST /api/cron/market-sync`（定时总入口，支持 token）
- 开发模式自动调度器（默认每 10 分钟一次增量同步）
- 全站语言切换
- 顶部切换按钮支持中文/英文
- 通过 `locale` cookie 持久化语言偏好

## 2. 项目结构

```text
app/
  auth/signin/page.tsx
  api/
    auth/[...nextauth]/route.ts
    cron/market-sync/route.ts
    jobs/market-sync/queue/route.ts
    jobs/market-sync/run/route.ts
    alerts/subscriptions/route.ts
    alerts/scan/route.ts
    backtest/run/route.ts
    market/bars/route.ts
    market/sync/route.ts
    watchlist/route.ts
    watchlist/item/route.ts
  asset/[ticker]/page.tsx
  alerts/page.tsx
  backtest/page.tsx
  watchlist/page.tsx
  page.tsx
components/
  auth/auth-controls.tsx
  auth/session-provider.tsx
  asset/asset-chart.tsx
  alerts/alert-manager.tsx
  backtest/backtest-runner.tsx
  watchlist/watchlist-manager.tsx
  ui/*
lib/
  auth/options.ts
  auth/session.ts
  auth/user.ts
  backtest/engine.ts
  db.ts
  api-response.ts
  errors.ts
  indicators/
    ma.ts
    boll.ts
    signals.ts
  data/mockMarket.ts
  alerts/notifier.ts
  repo/priceBarRepo.ts
  repo/alertRepo.ts
  repo/syncJobRepo.ts
  services/alertScanService.ts
  services/devMarketScheduler.ts
  services/marketSync.ts
  services/marketSyncQueue.ts
  services/watchlistService.ts
prisma/
  schema.prisma                # SQLite 默认
  schema.postgres.prisma       # PostgreSQL 切换模板
  migrations/
```

## 3. Windows 本地启动（默认 SQLite）

> 推荐 PowerShell

1. 安装依赖

```powershell
npm install
```

2. 准备 SQLite 文件目录（纯英文路径，避免 Prisma 在中文路径下偶发问题）

```powershell
New-Item -ItemType Directory -Path C:\quantboard-data -Force | Out-Null
```

3. 确认 `.env`（默认已写好）

```env
DATABASE_URL="file:C:/quantboard-data/dev.db"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="替换成随机长字符串"
GITHUB_ID="你的 GitHub OAuth App Client ID"
GITHUB_SECRET="你的 GitHub OAuth App Client Secret"
```

也可以直接复制模板：

```powershell
Copy-Item .env.example .env
```

4. 创建 GitHub OAuth App（一次性）

- GitHub -> Settings -> Developer settings -> OAuth Apps -> New OAuth App
- `Homepage URL`: `http://localhost:3000`
- `Authorization callback URL`: `http://localhost:3000/api/auth/callback/github`
- 把生成的 Client ID / Client Secret 填入 `.env` 的 `GITHUB_ID / GITHUB_SECRET`

5. 推送 schema / 生成客户端

```powershell
npm run db:push
npm run db:generate
```

如果遇到 Windows 报错：
`EPERM: operation not permitted, rename ... query_engine-windows.dll.node`
请先关闭正在运行的 `npm run dev`（或占用该文件的 Node 进程），然后重试 `npm run db:generate`。

6. （可选）如果你要创建新的 migration，建议先映射一个英文路径再执行：

```powershell
if (!(Test-Path C:\\qbproj)) { New-Item -ItemType Junction -Path C:\\qbproj -Target "当前项目绝对路径" | Out-Null }
Set-Location C:\\qbproj
npx prisma migrate dev --name your_change_name
```

7. 启动

```powershell
npm run dev
```

8. 访问
- `http://localhost:3000`（Dashboard）
- `http://localhost:3000/watchlist`
- `http://localhost:3000/api/jobs/market-sync/queue`（查看队列状态）
- `http://localhost:3000/auth/signin`（登录页）

## 4. 数据库模式切换

### A) PostgreSQL（Docker，Windows 可用）

1. 启动 PG 容器

```powershell
docker run --name quantboard-pg `
  -e POSTGRES_USER=quant `
  -e POSTGRES_PASSWORD=quant123 `
  -e POSTGRES_DB=quantboard `
  -p 5432:5432 `
  -d postgres:16
```

2. 修改 `.env`

```env
DATABASE_URL="postgresql://quant:quant123@localhost:5432/quantboard?schema=public"
```

3. 生成 PostgreSQL Prisma Client 并推送 schema

```powershell
npm run db:generate:pg
npm run db:push:pg
```

4. 启动

```powershell
npm run dev
```

### B) SQLite（本地开发默认）

把 `.env` 改回：

```env
DATABASE_URL="file:C:/quantboard-data/dev.db"
```

然后执行：

```powershell
npm run db:generate
npm run db:push
npm run dev
```

## 5. API 说明

除 `market/*`、`backtest/*`、`cron/*` 外，用户数据相关 API 需要先登录（NextAuth Session）。

### `GET /api/market/bars`

Query:
- `ticker` (required)
- `tf=1d` (optional)
- `limit=200` (optional)

返回：按时间升序的 K 线数组。

### `POST /api/market/sync`

Body:

```json
{
  "ticker": "AAPL",
  "tf": "1d",
  "days": 200
}
```

行为：拉取真实日线（Stooq）或生成 mock 数据并 upsert 到 `PriceBar`（复合唯一键防重复）。

可选参数：
- `source`: `auto | real | mock`（默认 `auto`）
  - `auto`: 优先真实行情，失败自动回退 mock
  - `real`: 强制真实行情，失败返回错误
  - `mock`: 强制 mock 生成

### Watchlist CRUD

- `GET /api/watchlist`
- `POST /api/watchlist/item` body: `{ "ticker": "AAPL" }`
- `DELETE /api/watchlist/item?ticker=AAPL`

说明：
- 以上接口都基于当前登录用户的 `userId`，互不共享数据。

说明：
- 当前真实源：
  - 加密币（如 `BTC-USD`、`ETH-USD`）优先走 Binance 日线接口
  - 美股/ETF 走 Stooq CSV 接口
- 对不支持的 symbol，`source=auto` 会自动回退为 mock，保证演示流程可用。
- Dashboard / Watchlist / Asset 页面会自动触发 `source=auto` 刷新，通常不需要手动点同步。
- 自动刷新默认 6 小时内只会对同一 ticker 触发一次（减少重复请求）。

## 5.1 任务调度（Cron / 队列）

### 队列模型

- `SyncJob`：`ticker/timeframe/days/source/status/attempts/runAfter/...`
- 状态流转：`QUEUED -> RUNNING -> SUCCEEDED/FAILED`
- 失败重试：指数退避（30s, 60s, 120s...，最大 1h），超出 `maxAttempts` 标记为 `FAILED`

### 队列 API

- `GET /api/jobs/market-sync/queue`：查看队列统计和最近任务
- `POST /api/jobs/market-sync/queue`：按 watchlist（或指定 tickers）入队
- `POST /api/jobs/market-sync/run`：手动触发 worker 消费队列

示例（入队）：

```json
{
  "timeframe": "1d",
  "days": 7,
  "source": "auto",
  "tickers": ["AAPL", "TSLA", "BTC-USD"]
}
```

示例（消费）：

```json
{
  "limit": 4
}
```

### Cron 入口

- `GET /api/cron/market-sync`
- `POST /api/cron/market-sync`

默认执行流程：
1. 按 watchlist 增量入队
2. 抢占并执行一批任务
3. 返回入队结果 + 执行结果 + 最新队列统计

可选 token 鉴权：
- 配置 `MARKET_SYNC_CRON_TOKEN`
- 调用时通过以下任一方式带上 token：
  - Header: `x-cron-token: <token>`
  - Header: `Authorization: Bearer <token>`
  - Query: `?token=<token>`（仅 GET）

### 开发模式自动调度器

- `npm run dev` 时，服务会自动启动本地调度器（默认每 10 分钟一次）
- 可用环境变量：
  - `MARKET_SYNC_DEV_INTERVAL_MINUTES=10`
  - `MARKET_SYNC_DEV_SCHEDULER_DISABLED=true`（禁用）
  - `MARKET_SYNC_DEV_WARMUP_IMMEDIATE=true`（开发启动后 5 秒先执行一次，默认关闭）
  - `MARKET_SYNC_INCREMENTAL_DAYS=7`
  - `MARKET_SYNC_QUEUE_BATCH=4`

### `POST /api/backtest/run`

Body 示例：

```json
{
  "ticker": "AAPL",
  "tf": "1d",
  "lookbackDays": 720,
  "shortWindow": 20,
  "longWindow": 60,
  "initialCapital": 100000,
  "feeBps": 10,
  "riskFreeRatePct": 2,
  "source": "auto"
}
```

返回：
- `metrics`：`totalReturnPct / annualizedReturnPct / maxDrawdownPct / sharpeRatio / finalEquity`
- `equityCurve`：策略净值曲线 + 基准净值 + 回撤曲线
- `trades`：买卖订单明细

### `GET/POST/PATCH/DELETE /api/alerts/subscriptions`

- `GET`: 获取订阅列表 + 最近投递记录
- `POST`: 创建订阅
- `PATCH`: 启用/停用订阅
- `DELETE`: 删除订阅

说明：
- 告警订阅与投递记录按当前登录用户隔离。

`POST` body 示例：

```json
{
  "ticker": "TSLA",
  "channel": "WEBHOOK",
  "target": "https://example.com/webhook",
  "signalType": "MA_CROSS_UP"
}
```

### `POST /api/alerts/scan`

手动触发一次扫描并发送告警：

```json
{
  "forceSync": true,
  "source": "auto"
}
```

返回扫描统计：`scanned / triggered / failed / skippedNoSignal / skippedDuplicate`

告警通道配置：
- `LOG`: 无需配置，直接写服务端日志
- `WEBHOOK`: `target` 填 webhook URL
- `TELEGRAM`: 需在 `.env` 配置 `TELEGRAM_BOT_TOKEN`，`target` 填 chat_id

统一返回结构：

```json
{
  "success": true,
  "data": {}
}
```

或

```json
{
  "success": false,
  "error": {
    "code": "...",
    "message": "..."
  }
}
```

## 6. 数据模型

核心模型 `PriceBar`：
- `ticker`
- `timeframe`
- `ts`
- `open/high/low/close/volume`
- 复合唯一键：`(ticker, timeframe, ts)`

## 7. 截图占位

- `docs/screenshots/dashboard.png`
- `docs/screenshots/watchlist.png`
- `docs/screenshots/asset-detail.png`

## 8. 常用命令

```powershell
npm run dev
npm run lint
npm run build
npm run db:push
npm run db:generate
npm run db:push:pg
npm run db:generate:pg
```

## 9. 生产部署建议（Cron）

如果部署在 Vercel，可在 `vercel.json` 配置：

```json
{
  "crons": [
    {
      "path": "/api/cron/market-sync",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

然后在项目环境变量中配置 `MARKET_SYNC_CRON_TOKEN`，并在 cron 请求中带上该 token。

## 10. 发布到 GitHub（安全流程）

发布前先做安全检查：

```powershell
npm run repo:scan
```

自动修正（补齐 `.gitignore` 检查、检测潜在泄露）：

```powershell
npm run repo:prepare
```

如果你曾经把密钥提交进 git 历史，先重写历史再推送：

```powershell
npm run repo:purge-secrets -- -Force -AlsoRemoveEnvFiles
```

然后强推：

```powershell
git push --force --all
git push --force --tags
```

最后，务必轮换以下密钥后再公开仓库：
- `GITHUB_SECRET`
- `NEXTAUTH_SECRET`
- `TELEGRAM_BOT_TOKEN`（如果有）
- 其它任何第三方 token/key

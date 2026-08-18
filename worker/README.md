# Streamline RSS 自建代理 (Cloudflare Worker)

解决浏览器抓取 RSS 的 CORS 限制: 转发订阅源请求, 15 分钟边缘缓存。
免费额度 10 万请求/天, 个人使用绰绰有余。

## 部署

```bash
cd worker

npm install               # 安装依赖 (Readability/linkedom/wrangler), 只需一次
npx wrangler login        # 登录 Cloudflare (首次, 浏览器授权)
npx wrangler deploy       # 部署 → 输出 https://streamline-rss-proxy.你的子域.workers.dev
```

> 国内网络可加镜像: `npm install --registry=https://registry.npmmirror.com`

**备选: 控制台粘贴**
1. 打开 https://dash.cloudflare.com → Workers & Pages → Create → Worker
2. 删除默认代码, 粘贴 `src/index.js` 内容 → Deploy

## 在阅读器中配置

1. 打开阅读器 → 侧栏 ⚙️ 设置 → **数据管理** 标签页
2. 「自建 RSS 代理」输入框填入你的 Worker 地址 (如 `https://streamline-rss-proxy.xxx.workers.dev`)
3. 点 **保存**, 再点 **测试** 确认连通 (会请求 Hacker News RSS 验证)
4. 之后抓取优先走你的 Worker, 失败自动回退公共代理

## 本地调试

```bash
cd worker
npx wrangler dev          # 本地起服务 → http://localhost:8787
# 测试: curl "http://localhost:8787/api/rss?url=https%3A%2F%2Fnews.ycombinator.com%2Frss"
```

## 接口

```
GET /api/rss?url=<encodeURIComponent(订阅源URL)>
→ 200: RSS/Atom XML (Content-Type: application/xml)
→ 400: 参数缺失/非法 URL
→ 502: 上游抓取失败

GET /api/fulltext?url=<encodeURIComponent(文章页URL)>
→ 200: JSON { url, title, byline, excerpt, content(正文HTML), length }
→ 422: 页面无可读正文
```
两个接口都走 15 分钟边缘缓存。

## 备注

- 国内访问: `workers.dev` 直连可能不稳, 建议在 Cloudflare 控制台为该 Worker **绑定自定义域名**
  (Workers → 你的 Worker → Settings → Domains & Routes → Add → Custom Domain, 免费)
- 缓存: 走 Cache API (免费版自带), 15 分钟 TTL, 无需配置 KV
- 配置文件: `wrangler.toml` (name / main / compatibility_date)

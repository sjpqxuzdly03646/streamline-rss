/**
 * Streamline RSS 自建代理 (Cloudflare Worker)
 *
 * 功能:
 *   GET /api/rss?url=...       转发抓取 RSS/Atom 源 (15 分钟边缘缓存)
 *   GET /api/fulltext?url=...  抓取原文页面并提取正文 (Readability + linkedom, 15 分钟缓存)
 *
 * 部署: 见本目录 README.md (需 npm install 一次安装依赖, 之后 npx wrangler deploy)
 */
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'

const CACHE_TTL = 15 * 60 // 秒
const UA = 'Mozilla/5.0 (compatible; StreamlineRSS/1.0)'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405)

    if (url.pathname === '/api/rss') return handleRss(url, ctx)
    if (url.pathname === '/api/fulltext') return handleFulltext(url, ctx)
    return json({ error: 'not found' }, 404)
  },
}

/* ---------------- RSS 转发 ---------------- */
async function handleRss(url, ctx) {
  const feedUrl = validateUrl(url.searchParams.get('url'))
  if (!feedUrl) return json({ error: 'invalid url' }, 400)

  const cache = caches.default
  const cacheKey = cacheKeyFor('/api/rss', feedUrl.href)
  const cached = await cache.match(cacheKey)
  if (cached) return withCors(cached)

  try {
    const res = await fetch(feedUrl.href, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
    })
    if (!res.ok) return json({ error: `upstream ${res.status}` }, 502)
    const body = await res.text()
    if (!body || body.length < 20) return json({ error: 'empty upstream response' }, 502)

    const out = new Response(body, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*',
        'X-RSS-Source': feedUrl.hostname,
      },
    })
    ctx.waitUntil(cache.put(cacheKey, out.clone()))
    return out
  } catch (e) {
    return json({ error: 'fetch failed: ' + e.message }, 502)
  }
}

/* ---------------- 全文提取 ---------------- */
async function handleFulltext(url, ctx) {
  const pageUrl = validateUrl(url.searchParams.get('url'))
  if (!pageUrl) return json({ error: 'invalid url' }, 400)

  const cache = caches.default
  const cacheKey = cacheKeyFor('/api/fulltext', pageUrl.href)
  const cached = await cache.match(cacheKey)
  if (cached) return withCors(cached)

  try {
    const res = await fetch(pageUrl.href, {
      headers: { 'User-Agent': UA, Accept: 'text/html, application/xhtml+xml, */*' },
      redirect: 'follow',
    })
    if (!res.ok) return json({ error: `upstream ${res.status}` }, 502)
    const html = await res.text()
    if (!html || html.length < 100) return json({ error: 'empty upstream response' }, 502)

    const { document } = parseHTML(html)
    const article = new Readability(document).parse()
    if (!article || !article.content) return json({ error: 'no readable content found' }, 422)

    const out = json({
      url: pageUrl.href,
      title: article.title || '',
      byline: article.byline || '',
      excerpt: article.excerpt || '',
      content: article.content,
      length: article.length || 0,
    })
    ctx.waitUntil(cache.put(cacheKey, out.clone()))
    return out
  } catch (e) {
    return json({ error: 'fetch failed: ' + e.message }, 502)
  }
}

/* ---------------- 工具 ---------------- */
function validateUrl(target) {
  if (!target) return null
  try {
    const u = new URL(target)
    if (!/^https?:$/.test(u.protocol)) return null
    if (u.hostname.length > 253) return null
    return u
  } catch {
    return null
  }
}

function cacheKeyFor(path, href) {
  return new Request(`https://rss-cache.streamline${path}?url=${encodeURIComponent(href)}`)
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function withCors(res) {
  const headers = new Headers(res.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  return new Response(res.body, { status: res.status, headers })
}
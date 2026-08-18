/**
 * RSS 工具集: 抓取(多级代理回退) / 解析(RSS 2.0 + Atom) / 清洗 / 格式化
 * 移植自预设稿 rss_1/code.html 中的 fetchFeed/parseRSS, 并做了增强:
 *  - 完整正文 content:encoded / Atom content 提取
 *  - 相对链接补全为绝对链接
 *  - 文章首图提取 (enclosure / media:content / 正文 <img>)
 *  - 作者 / 分类提取
 */

const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
]

/** 带超时的 fetch, 返回 text; 失败返回 null */
async function fetchText(url, ms = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/xml, application/rss+xml, application/atom+xml, application/xml, */*' },
    })
    if (!res.ok) return null
    const text = await res.text()
    return text && text.length > 0 ? text : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 用户自建 RSS 代理 (Cloudflare Worker), 在设置里配置, 存于 localStorage */
export function getCustomProxy() {
  try {
    const raw = localStorage.getItem('streamline:v1:proxy-url')
    if (!raw) return ''
    let v = raw
    try {
      v = JSON.parse(raw) // store 持久化时是 JSON.stringify 格式
    } catch {
      /* 兼容非 JSON 的裸字符串 */
    }
    return typeof v === 'string' ? v.trim().replace(/\/+$/, '') : ''
  } catch {
    return ''
  }
}

/**
 * 抓取 RSS 源 XML:
 *   0. 自建代理 (Cloudflare Worker) 优先 — 稳定/快/隐私可控
 *   1. 直连 (浏览器通常因 CORS 失败, 但值得一试)
 *   2. 公共代理 (兜底)
 * @returns {Promise<string|null>}
 */
export async function fetchFeedXml(url) {
  // 0. 自建代理优先
  const customProxy = getCustomProxy()
  if (customProxy) {
    const proxied = await fetchText(`${customProxy}/api/rss?url=${encodeURIComponent(url)}`)
    if (proxied) return proxied
  }

  // 1. 直连 (浏览器通常因 CORS 失败, 但值得一试)
  const direct = await fetchText(url)
  if (direct) return direct

  // 2. 多级公共代理兜底
  for (const proxy of PROXIES) {
    const proxied = await fetchText(proxy(url))
    if (proxied) return proxied
  }
  return null
}

/** 选取子元素, selectors 依次尝试 (兼容 XML 命名空间限定名, 如 content:encoded) */
function pick(el, selectors) {
  for (const sel of selectors) {
    try {
      const found = el.querySelector(sel)
      if (found) return found
    } catch {
      /* 忽略无效选择器 */
    }
    // 命名空间限定名 (content:encoded / media:content) 用 getElementsByTagName 兜底
    if (sel.includes(':') && !sel.includes(' ')) {
      const found = el.getElementsByTagName(sel)
      if (found && found.length) return found[0]
    }
  }
  return null
}

function pickText(el, selectors) {
  const found = pick(el, selectors)
  return found ? (found.textContent || '').trim() : ''
}

/** HTML → 纯文本摘要 */
export function htmlToText(html, max = 160) {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const text = (tmp.textContent || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** 清洗正文: 移除脚本/样式, 去事件属性, 绝对化链接, 提取首图 */
export function sanitizeHtml(html, baseUrl) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.body
  root.querySelectorAll('script, style, iframe, object, embed, link, meta, form, noscript').forEach((el) => el.remove())
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
      } else if ((name === 'href' || name === 'src') && /^\s*(javascript|vbscript)/i.test(attr.value.trim())) {
        el.removeAttribute(attr.name)
      }
    }
  })
  if (baseUrl) {
    root.querySelectorAll('[href],[src],[poster]').forEach((el) => {
      for (const a of ['href', 'src', 'poster']) {
        const v = el.getAttribute(a)
        if (v && !/^(#|mailto:|tel:|javascript:|data:|blob:)/i.test(v.trim())) {
          try {
            el.setAttribute(a, new URL(v, baseUrl).href)
          } catch {
            /* 保持原样 */
          }
        }
      }
    })
  }
  return root.innerHTML
}

function extractFirstImage(html, baseUrl) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const img = doc.body.querySelector('img[src]')
  if (!img || !img.getAttribute('src')) return ''
  const src = img.getAttribute('src')
  try {
    return /^(https?:|data:)/i.test(src) ? src : new URL(src, baseUrl).href
  } catch {
    return src
  }
}

/** 稳定哈希 → 文章 id */
function hashId(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  }
  return 'a' + h.toString(36)
}

/** RSS 源 URL → 域名 */
export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url || ''
  }
}

/** 源夹心图标 (Google s2), 组件内会做 onerror 降级 */
export function faviconUrl(url) {
  const domain = domainOf(url)
  if (!domain) return ''
  return `https://s2.googleusercontent.com/s2/favicons?domain=${domain}&sz=32`
}

const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })

/** 相对时间, 如 “10 分钟前” */
export function relativeTime(ts) {
  if (!ts) return ''
  const diff = ts - Date.now()
  const abs = Math.abs(diff)
  const days = Math.round(diff / 86400000)
  if (abs < 3600000) return rtf.format(Math.round(diff / 60000), 'minute')
  if (abs < 86400000) return rtf.format(Math.round(diff / 3600000), 'hour')
  return rtf.format(days, 'day')
}

/** 预计阅读时长 (分钟) */
export function readingMinutes(content) {
  if (!content) return 1
  const text = htmlToText(content, 100000)
  return Math.max(1, Math.round(text.length / 400))
}

/**
 * 解析 RSS/Atom XML
 * @param {string} xmlString
 * @param {string} sourceUrl
 * @param {string} feedId
 * @returns {{title: string, articles: Array}|null}
 */
export function parseFeed(xmlString, sourceUrl, feedId) {
  // 移除非法控制字符, 防止 DOMParser 报错
  xmlString = xmlString.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return null

  const items = [...doc.querySelectorAll('item, entry')]
  if (items.length === 0) return null

  const sourceTitle = pickText(doc, ['channel > title', 'feed > title']) || domainOf(sourceUrl)
  const feedDefaultCategory = pickText(doc, ['channel > category', 'feed > category'])

  const articles = items.map((item) => {
    // 链接: 优先 link 文本, 再取 href 属性 (Atom 可能多 link, 排除 self)
    let linkEl = pick(item, ['link'])
    if (item.tagName === 'entry') {
      const links = item.querySelectorAll('link')
      for (const l of links) {
        const rel = l.getAttribute('rel')
        if (!rel || rel === 'alternate') {
          linkEl = l
          break
        }
      }
    }
    const link = linkEl ? (linkEl.getAttribute('href') || linkEl.textContent || '').trim() : '#'

    // 正文: content:encoded > description > content
    let raw = pickText(item, ['content\\:encoded', 'encoded', 'description', 'content'])
    if (!raw) raw = ''
    if (item.tagName === 'entry') {
      const summary = pickText(item, ['summary'])
      if (!raw) raw = summary
    }

    // 首图: enclosure / media:content / 正文 img
    let image = ''
    const enclosure = item.querySelector('enclosure')
    if (enclosure && /^image\//i.test(enclosure.getAttribute('type') || '')) {
      image = enclosure.getAttribute('url') || ''
    }
    if (!image) {
      const media = pick(item, ['media\\:content', 'media:content'])
      const murl = media && media.getAttribute('url')
      if (murl) image = murl
    }
    if (!image) image = extractFirstImage(raw, sourceUrl)

    const author = pickText(item, ['dc\\:creator', 'creator', 'author > name', 'author'])
    const category = pickText(item, ['category']) || feedDefaultCategory || ''

    const dateStr = pickText(item, ['pubDate', 'published', 'updated', 'date'])
    const date = dateStr ? new Date(dateStr) : new Date()
    const dateMs = !isNaN(date.getTime()) ? date.getTime() : Date.now()

    const title = pickText(item, ['title']) || '无标题'
    const id = hashId(link + title + feedId)
    const snippet = htmlToText(raw) || ''

    return {
      id,
      feedId,
      sourceTitle,
      sourceUrl,
      title,
      link,
      snippet,
      content: raw,
      author,
      category,
      date: dateMs,
      image,
    }
  })

  return { title: sourceTitle, articles }
}

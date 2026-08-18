import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchFeedXml, parseFeed, sanitizeHtml, htmlToText, faviconUrl } from '../utils/rss'

const LS = {
  feeds: 'streamline:v1:feeds',
  articles: 'streamline:v1:articles',
  read: 'streamline:v1:read',
  starred: 'streamline:v1:starred',
  theme: 'streamline:v1:theme',
  scale: 'streamline:v1:scale',
  rules: 'streamline:v1:rules',
  hidden: 'streamline:v1:hidden',
  progress: 'streamline:v1:progress',
  categories: 'streamline:v1:categories',
  categoryIcons: 'streamline:v1:category-icons',
  collapsedCats: 'streamline:v1:collapsed-cats',
  collapsedInit: 'streamline:v1:collapsed-init',
  notify: 'streamline:v1:notify',
  searchHistory: 'streamline:v1:search-history',
  proxyUrl: 'streamline:v1:proxy-url',
}

/** 默认分类 (与预设 rss_1 侧栏一致) */
const DEFAULT_CATEGORIES = ['科技', '设计', '新闻', '未分类']

/** 默认分类图标 (可自设, 存于 categoryIcons) */
const DEFAULT_CATEGORY_ICONS = {
  科技: 'code',
  设计: 'palette',
  新闻: 'newspaper',
  未分类: 'rss_feed',
}

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 忽略 */
  }
}

/** 子序列模糊匹配: query 的字符按顺序出现在 text 中 (如 "AI芯" 命中 "AI 芯片行业") */
function fuzzyMatch(text, query) {
  let i = 0
  for (const ch of query) {
    const idx = text.indexOf(ch, i)
    if (idx < 0) return false
    i = idx + 1
  }
  return true
}

export const useReaderStore = defineStore('reader', () => {
  /* ---------------- state ---------------- */
  const feeds = ref([])
  const articles = ref([])
  const readIds = ref(loadLS(LS.read, []))
  const starredIds = ref(loadLS(LS.starred, []))
  const theme = ref(loadLS(LS.theme, 'dark'))
  const scale = ref(loadLS(LS.scale, 1))
  const filter = ref('all') // 'all' | 'unread' | 'starred' | 'feed:<id>' | 'category:<名称>'
  const query = ref('')
  const modalOpen = ref(false)
  /** 移动端右下角操作悬浮按钮展开状态 (纯 UI, 不持久化) */
  const fabOpen = ref(false)
  const loading = ref(false)
  const error = ref('')
  const addError = ref('')
  const adding = ref(false)
  /** 进入阅读页时的文章队列 (用于上一篇/下一篇) */
  const readerQueue = ref([])
  /** 订阅规则 / 被规则隐藏的文章 / 规则管理弹窗 */
  const rules = ref(loadLS(LS.rules, []))
  const hiddenIds = ref(loadLS(LS.hidden, []))
  const rulesOpen = ref(false)
  /** 统一设置弹窗: 标签页 'rules' | 'data' */
  const settingsOpen = ref(false)
  const settingsTab = ref('rules')
  /** 阅读进度: articleId → 0..1 */
  const progressMap = ref(loadLS(LS.progress, {}))
  /** 新文章桌面通知开关 / 搜索历史 */
  const notificationsEnabled = ref(loadLS(LS.notify, false))
  const searchHistory = ref(loadLS(LS.searchHistory, []))
  /** 自建 RSS 代理 (Cloudflare Worker) */
  const proxyUrl = ref(loadLS(LS.proxyUrl, ''))
  /** 数据管理弹窗 */
  const dataOpen = ref(false)
  /** 分类管理: 有序分类名列表 (可增删改) + 管理弹窗 */
  const categoryNames = ref(loadLS(LS.categories, null) || [...DEFAULT_CATEGORIES])
  const categoryIcons = ref(loadLS(LS.categoryIcons, {}))
  /** 分类树折叠状态: { 分类名: true(收起) } */
  const collapsedCategories = ref(loadLS(LS.collapsedCats, null) || {})

  /* ---------------- getters ---------------- */
  const readSet = computed(() => new Set(readIds.value))
  const starredSet = computed(() => new Set(starredIds.value))

  const unreadCount = computed(
    () => articles.value.filter((a) => !hiddenSet.value.has(a.id) && !readSet.value.has(a.id)).length
  )
  const starredCount = computed(
    () => articles.value.filter((a) => !hiddenSet.value.has(a.id) && starredSet.value.has(a.id)).length
  )

  const isDark = computed(() => theme.value === 'dark')

  const hiddenSet = computed(() => new Set(hiddenIds.value))
  const hiddenCount = computed(() => hiddenIds.value.length)

  const categories = computed(() =>
    categoryNames.value.map((name) => ({
      name,
      icon: categoryIcons.value[name] || DEFAULT_CATEGORY_ICONS[name] || 'rss_feed',
      count: feeds.value.filter((f) => (f.category || '未分类') === name).length,
    }))
  )

  /** 对外展示的分类 (不含兜底的"未分类") */
  const visibleCategories = computed(() => categories.value.filter((c) => c.name !== '未分类'))

  /** 分类图标 (自设优先, 否则默认) */
  function categoryIcon(name) {
    return categoryIcons.value[name] || DEFAULT_CATEGORY_ICONS[name] || 'rss_feed'
  }

  /** 设置分类图标 (侧栏/弹窗即时同步) */
  function setCategoryIcon(name, icon) {
    if (!name || !icon) return
    categoryIcons.value = { ...categoryIcons.value, [name]: icon }
    persist()
  }

  /** 当前筛选 + 搜索后的文章列表 (规则隐藏的文章不显示) */
  const filteredArticles = computed(() => {
    let list = articles.value.filter((a) => !hiddenSet.value.has(a.id))
    if (filter.value === 'unread') list = list.filter((a) => !readSet.value.has(a.id))
    else if (filter.value === 'starred') list = list.filter((a) => starredSet.value.has(a.id))
    else if (filter.value.startsWith('feed:')) list = list.filter((a) => a.feedId === filter.value.slice(5))
    else if (filter.value.startsWith('category:')) list = list.filter((a) => a.category === filter.value.slice(9))

    const q = query.value.trim()
    if (q) {
      // 分词(空格/逗号/顿号) AND 匹配 + 子序列模糊匹配
      const terms = q
        .toLowerCase()
        .split(/[\s,，、]+/)
        .filter(Boolean)
      list = list.filter((a) => {
        const haystack = (
          a.title +
          ' ' +
          a.sourceTitle +
          ' ' +
          (a.author || '') +
          ' ' +
          (a.snippet || '')
        ).toLowerCase()
        return terms.every((t) => fuzzyMatch(haystack, t))
      })
    }
    return [...list]
  })

  const activeFeed = computed(() =>
    filter.value.startsWith('feed:') ? feeds.value.find((f) => f.id === filter.value.slice(5)) : null
  )

  const activeCategory = computed(() => (filter.value.startsWith('category:') ? filter.value.slice(9) : null))

  /** 当前筛选的展示信息 (列表页提示条 / 侧栏高亮) */
  const activeFilterInfo = computed(() => {
    if (filter.value === 'all') return null
    if (filter.value.startsWith('feed:')) {
      const f = feeds.value.find((x) => x.id === filter.value.slice(5))
      return { label: f ? f.title : '订阅', type: 'feed', icon: 'rss_feed' }
    }
    if (filter.value.startsWith('category:')) {
      const name = filter.value.slice(9)
      return { label: name, type: 'category', icon: categoryIcon(name) }
    }
    if (filter.value === 'unread') return { label: '未读', type: 'filter', icon: 'mark_email_unread' }
    if (filter.value === 'starred') return { label: '星标', type: 'filter', icon: 'star' }
    return null
  })

  /** 单个订阅源的未读数 */
  function feedUnreadCount(feedId) {
    return articles.value.filter((a) => a.feedId === feedId && !hiddenSet.value.has(a.id) && !readSet.value.has(a.id))
      .length
  }

  /* ---------------- helpers ---------------- */
  function persist() {
    saveLS(LS.feeds, feeds.value)
    saveLS(LS.articles, articles.value)
    saveLS(LS.read, readIds.value)
    saveLS(LS.starred, starredIds.value)
    saveLS(LS.theme, theme.value)
    saveLS(LS.scale, scale.value)
    saveLS(LS.rules, rules.value)
    saveLS(LS.hidden, hiddenIds.value)
    saveLS(LS.progress, progressMap.value)
    saveLS(LS.categories, categoryNames.value)
    saveLS(LS.categoryIcons, categoryIcons.value)
    saveLS(LS.collapsedCats, collapsedCategories.value)
    saveLS(LS.notify, notificationsEnabled.value)
    saveLS(LS.searchHistory, searchHistory.value)
    if (proxyUrl.value) saveLS(LS.proxyUrl, proxyUrl.value)
    else localStorage.removeItem(LS.proxyUrl)
  }

  function applyTheme() {
    document.documentElement.classList.toggle('dark', theme.value === 'dark')
  }

  function upsertArticles(newArticles) {
    const map = new Map(articles.value.map((a) => [a.id, a]))
    for (const a of newArticles) {
      const existing = map.get(a.id)
      map.set(a.id, {
        ...a,
        read: existing ? existing.read : readSet.value.has(a.id),
        starred: existing ? existing.starred : starredSet.value.has(a.id),
      })
    }
    // 时间倒序
    articles.value = [...map.values()].sort((a, b) => b.date - a.date)
    // 对新入库的文章应用订阅规则
    applyRulesToArticles(newArticles)
  }

  /* ---------------- 订阅规则 ---------------- */

  /** 对一批文章执行所有启用中的规则 (自动已读 / 自动星标 / 自动隐藏) */
  function applyRulesToArticles(list) {
    for (const a of list) {
      for (const r of rules.value) {
        if (!r.enabled) continue
        const feedOk = !r.feedMatch || (a.sourceUrl || '').toLowerCase().includes(r.feedMatch.toLowerCase())
        const titleOk = !r.titleMatch || (a.title || '').toLowerCase().includes(r.titleMatch.toLowerCase())
        if (feedOk && titleOk) {
          if (r.action === 'read' && !readIds.value.includes(a.id)) readIds.value.push(a.id)
          if (r.action === 'star' && !starredIds.value.includes(a.id)) starredIds.value.push(a.id)
          if (r.action === 'hide' && !hiddenIds.value.includes(a.id)) hiddenIds.value.push(a.id)
        }
      }
    }
  }

  /** 新增规则 (至少一个匹配条件), 并立即对存量文章生效 */
  function addRule({ feedMatch = '', titleMatch = '', action = 'read', enabled = true }) {
    if (!titleMatch.trim() && !feedMatch.trim()) return false
    rules.value.push({
      id: 'rule-' + Math.random().toString(36).slice(2, 9),
      name: titleMatch.trim() || feedMatch.trim(),
      feedMatch: feedMatch.trim(),
      titleMatch: titleMatch.trim(),
      action,
      enabled,
    })
    persist()
    applyRulesToArticles(articles.value)
    persist()
    return true
  }

  function removeRule(id) {
    rules.value = rules.value.filter((r) => r.id !== id)
    persist()
  }

  function toggleRule(id) {
    const r = rules.value.find((x) => x.id === id)
    if (r) {
      r.enabled = !r.enabled
      persist()
    }
  }

  /** 一键恢复被规则隐藏的文章 */
  function clearHidden() {
    hiddenIds.value = []
    persist()
  }

  /* ---------------- 分类管理 ---------------- */

  /** 新增分类 (重名/空名拒绝) */
  function addCategory(name) {
    const n = (name || '').trim()
    if (!n || categoryNames.value.includes(n)) return false
    categoryNames.value.push(n)
    persist()
    return true
  }

  /** 重命名分类 (未分类禁止; 订阅与筛选同步更新) */
  function renameCategory(oldName, newName) {
    const n = (newName || '').trim()
    if (!n || oldName === n || oldName === '未分类' || !categoryNames.value.includes(oldName)) return false
    if (categoryNames.value.includes(n)) return false
    categoryNames.value = categoryNames.value.map((c) => (c === oldName ? n : c))
    for (const f of feeds.value) {
      if ((f.category || '未分类') === oldName) f.category = n
    }
    // 同步已有文章的旧分类名
    for (const a of articles.value) {
      if ((a.category || '未分类') === oldName) a.category = n
    }
    if (filter.value === 'category:' + oldName) filter.value = 'category:' + n
    persist()
    return true
  }

  /** 删除分类 (未分类禁止; 其订阅移入未分类) */
  function deleteCategory(name) {
    if (name === '未分类' || !categoryNames.value.includes(name)) return false
    categoryNames.value = categoryNames.value.filter((c) => c !== name)
    for (const f of feeds.value) {
      if ((f.category || '未分类') === name) f.category = '未分类'
    }
    // 同步已有文章的旧分类
    for (const a of articles.value) {
      if ((a.category || '未分类') === name) a.category = '未分类'
    }
    if (filter.value === 'category:' + name) filter.value = 'all'
    persist()
    return true
  }

  /** 设置订阅源的分类 */
  function setFeedCategory(feedId, category) {
    const f = feeds.value.find((x) => x.id === feedId)
    const cat = categoryNames.value.includes(category) ? category : '未分类'
    if (f && f.category !== cat) {
      f.category = cat
      // 同步该订阅源已有文章的分类 (否则切到新分类过滤不到)
      for (const a of articles.value) {
        if (a.feedId === feedId) a.category = cat
      }
      persist()
    }
  }

  /** 分类未读总数 (树形节点徽标) */
  function categoryUnreadCount(name) {
    return feeds.value
      .filter((f) => (f.category || '未分类') === name)
      .reduce((sum, f) => sum + feedUnreadCount(f.id), 0)
  }

  /** 展开/收起分类树节点 */
  function toggleCategory(name) {
    collapsedCategories.value = { ...collapsedCategories.value, [name]: !collapsedCategories.value[name] }
    saveLS(LS.collapsedInit, '1') // 用户已手动管理折叠状态, 不再强制默认收起
    persist()
  }

  function isCategoryCollapsed(name) {
    return !!collapsedCategories.value[name]
  }

  /* ---------------- 阅读进度 ---------------- */
  function saveProgress(id, fraction) {
    if (!id || typeof fraction !== 'number' || !isFinite(fraction)) return
    progressMap.value = { ...progressMap.value, [id]: Math.max(0, Math.min(1, fraction)) }
    saveLS(LS.progress, progressMap.value)
  }

  function getProgress(id) {
    const v = progressMap.value[id]
    return typeof v === 'number' && isFinite(v) ? v : 0
  }

  function clearProgress(id) {
    if (id in progressMap.value) {
      progressMap.value = { ...progressMap.value }
      delete progressMap.value[id]
      saveLS(LS.progress, progressMap.value)
    }
  }

  /* ---------------- actions ---------------- */
  function init() {
    applyTheme()
    const savedFeeds = loadLS(LS.feeds, null)
    const savedArticles = loadLS(LS.articles, null)

    // 首次使用: 播种默认分类 (科技/设计/新闻/未分类)
    if (!localStorage.getItem(LS.categories)) {
      categoryNames.value = [...DEFAULT_CATEGORIES]
      saveLS(LS.categories, categoryNames.value)
    }
    // 分类树初始状态: 分类很多 (超过 6 个) 时默认全部收起 (仅首次触发,
    // 标志在分类少时不写入, 等以后分类变多时仍会生效)
    if (!localStorage.getItem(LS.collapsedInit)) {
      if (visibleCategories.value.length > 6) {
        collapsedCategories.value = Object.fromEntries(visibleCategories.value.map((c) => [c.name, true]))
        saveLS(LS.collapsedCats, collapsedCategories.value)
        saveLS(LS.collapsedInit, '1')
      }
    }

    if (Array.isArray(savedFeeds) && savedFeeds.length > 0) {
      // 迁移: 移除历史遗留的演示订阅 (demo 标记) 及其文章, 只保留真实订阅
      const real = savedFeeds.filter((f) => !f.demo)
      feeds.value = real
      if (Array.isArray(savedArticles)) {
        const feedIds = new Set(real.map((f) => f.id))
        articles.value = savedArticles.filter((a) => feedIds.has(a.feedId))
      }
      if (real.length > 0) {
        persist() // 先立即落盘清理结果, 避免网络刷新期间旧演示数据残留
        refreshFeeds() // 后台拉取最新内容
      } else {
        persist() // 清掉残留的演示数据
      }
    } else {
      // 首次使用: 保持空列表, 展示欢迎空状态
      persist()
    }
  }

  /**
   * 添加订阅源
   * @param {string} url
   * @param {string} [category] 指定分类 (不存在则归入未分类)
   * @returns {Promise<boolean>}
   */
  async function addFeed(url, category) {
    addError.value = ''
    let cleanUrl = (url || '').trim()
    if (!cleanUrl) {
      addError.value = '请输入订阅源 URL'
      return false
    }
    // 自动补全协议
    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = 'https://' + cleanUrl
    if (/^https?:\/\/https?:/i.test(cleanUrl)) {
      addError.value = 'URL 格式不正确'
      return false
    }

    const existing = feeds.value.find((f) => f.url.replace(/\/+$/, '') === cleanUrl.replace(/\/+$/, ''))
    if (existing) {
      addError.value = '该订阅源已存在: ' + existing.title
      return false
    }

    const feedCategory = categoryNames.value.includes(category) ? category : '未分类'

    adding.value = true
    const id = 'feed-' + Math.random().toString(36).slice(2, 10)
    try {
      const xml = await fetchFeedXml(cleanUrl)
      const parsed = xml ? parseFeed(xml, cleanUrl, id) : null
      if (!parsed) {
        addError.value = '无法解析该地址, 请确认它是有效的 RSS/Atom 源'
        return false
      }

      const feed = {
        id,
        url: cleanUrl,
        title: parsed.title,
        category: feedCategory,
        favicon: faviconUrl(cleanUrl),
      }
      feeds.value.push(feed)
      upsertArticles(
        parsed.articles.map((a) => ({
          ...a,
          content: sanitizeHtml(a.content, cleanUrl),
          snippet: htmlToText(a.content) || a.snippet,
          category: a.category || feedCategory,
        }))
      )
      persist()
      return true
    } catch (e) {
      console.error('addFeed', e)
      addError.value = '添加订阅失败, 请稍后重试'
      return false
    } finally {
      adding.value = false
    }
  }

  /**
   * 刷新全部订阅源
   * @param {boolean} [silent] 静默模式: 自动刷新用, 不显示骨架屏/错误横幅, 但会检测新文章并发通知
   */
  async function refreshFeeds(silent = false) {
    if (feeds.value.length === 0) return
    if (!silent) {
      loading.value = true
      error.value = ''
    }
    const beforeIds = new Set(articles.value.map((a) => a.id))
    const failed = []

    await Promise.all(
      feeds.value.map(async (feed) => {
        try {
          const xml = await fetchFeedXml(feed.url)
          const parsed = xml ? parseFeed(xml, feed.url, feed.id) : null
          if (parsed) {
            const list = parsed.articles.map((a) => ({
              ...a,
              content: sanitizeHtml(a.content, feed.url),
              snippet: htmlToText(a.content) || a.snippet,
              category: a.category || feed.category || '未分类',
            }))
            // 只替换该源的文章
            articles.value = articles.value.filter((a) => a.feedId !== feed.id)
            upsertArticles(list)
            if (feed.title !== parsed.title) feed.title = parsed.title
          } else {
            failed.push(feed.title)
          }
        } catch (e) {
          console.warn('refresh failed:', feed.url, e)
          failed.push(feed.title)
        }
      })
    )

    if (failed.length > 0 && !silent) {
      error.value = '部分订阅源拉取失败, 已保留原数据: ' + failed.join('、')
      // 自动清除, 避免常驻打扰
      setTimeout(() => {
        if (error.value) error.value = ''
      }, 6000)
    }
    persist()
    if (!silent) loading.value = false

    // 静默(自动)刷新发现新文章 → 桌面通知
    if (silent) {
      const newArticles = articles.value.filter((a) => !beforeIds.has(a.id))
      if (newArticles.length > 0) sendNewArticlesNotification(newArticles)
    }
  }

  /* ---------------- 自动刷新与新文章通知 ---------------- */

  let autoRefreshTimer = null

  /** 开启周期自动刷新 (15 分钟, 预设原设计); 幂等 */
  function startAutoRefresh(intervalMs = 15 * 60 * 1000) {
    if (autoRefreshTimer) return
    autoRefreshTimer = setInterval(() => refreshFeeds(true), intervalMs)
  }

  function sendNewArticlesNotification(newArticles) {
    if (!notificationsEnabled.value) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return
    const titles = newArticles.slice(0, 2).map((a) => a.title)
    const body =
      newArticles.length > 2 ? `${titles.join('、')} 等 ${newArticles.length} 篇新文章` : `${titles.join('、')}`
    try {
      const n = new Notification('Streamline RSS · 新文章', { body, icon: '/pwa/icon-192.png' })
      n.onclick = () => {
        window.focus()
        n.close()
      }
    } catch {
      /* 忽略 */
    }
  }

  /** 开关通知: 未授权先请求权限, 已授权则切换开关 */
  async function toggleNotifications() {
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'default') {
      const res = await Notification.requestPermission()
      notificationsEnabled.value = res === 'granted'
    } else if (Notification.permission === 'denied') {
      notificationsEnabled.value = false
    } else {
      notificationsEnabled.value = !notificationsEnabled.value
    }
    persist()
    return notificationsEnabled.value
  }

  function removeFeed(feedId) {
    feeds.value = feeds.value.filter((f) => f.id !== feedId)
    articles.value = articles.value.filter((a) => a.feedId !== feedId)
    if (filter.value === 'feed:' + feedId) filter.value = 'all'
    persist()
  }

  function markRead(id) {
    if (!readIds.value.includes(id)) readIds.value.push(id)
    persist()
  }

  /** 切换已读/未读 (快捷键 m) */
  function toggleRead(id) {
    const i = readIds.value.indexOf(id)
    if (i >= 0) readIds.value.splice(i, 1)
    else readIds.value.push(id)
    persist()
  }

  function markAllRead(list = filteredArticles.value) {
    for (const a of list) {
      if (!readIds.value.includes(a.id)) readIds.value.push(a.id)
    }
    persist()
  }

  function toggleStar(id) {
    const i = starredIds.value.indexOf(id)
    if (i >= 0) starredIds.value.splice(i, 1)
    else starredIds.value.push(id)
    persist()
  }

  /** 更新文章正文 (全文阅读模式抓取后) */
  function updateArticleContent(id, content) {
    const a = articles.value.find((x) => x.id === id)
    if (a && content && content.includes('<')) {
      a.content = content
      a.snippet = htmlToText(content) || a.snippet
      persist()
      return true
    }
    return false
  }

  /** 打开文章: 标记已读并记录阅读队列 */
  function openArticle(id) {
    markRead(id)
    const inQueue = readerQueue.value
    if (!inQueue.includes(id)) readerQueue.value = [...inQueue, ...filteredArticles.value.map((a) => a.id)]
    const article = articles.value.find((a) => a.id === id)
    return article
  }

  function setFilter(f) {
    filter.value = f
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    applyTheme()
    persist()
  }

  function cycleScale() {
    const options = [1, 1.15, 1.3]
    const i = options.indexOf(scale.value)
    scale.value = options[(i + 1) % options.length]
    persist()
  }

  function setQuery(q) {
    query.value = q
  }

  /** 设置自建 RSS 代理地址 */
  function setProxyUrl(v) {
    proxyUrl.value = (v || '').trim().replace(/\/+$/, '')
    persist()
  }

  /** 记录搜索历史 (去重, 最多 10 条) */
  function addSearchHistory(q) {
    const s = (q || '').trim()
    if (!s) return
    searchHistory.value = [s, ...searchHistory.value.filter((x) => x !== s)].slice(0, 10)
    saveLS(LS.searchHistory, searchHistory.value)
  }

  function clearSearchHistory() {
    searchHistory.value = []
    saveLS(LS.searchHistory, [])
  }

  /* ---------------- 导出与备份 ---------------- */

  /** 生成 OPML 文档 (供导出) */
  function buildOPML() {
    const esc = (s) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    const outlines = feeds.value
      .map((f) => `    <outline type="rss" text="${esc(f.title)}" title="${esc(f.title)}" xmlUrl="${esc(f.url)}"/>`)
      .join('\n')
    return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>Streamline RSS 订阅</title></head>\n  <body>\n${outlines}\n  </body>\n</opml>`
  }

  /** 生成全量 JSON 备份 */
  function buildBackup() {
    return {
      app: 'streamline-rss-reader',
      version: 1,
      exportedAt: new Date().toISOString(),
      feeds: feeds.value,
      articles: articles.value,
      readIds: readIds.value,
      starredIds: starredIds.value,
      rules: rules.value,
      hiddenIds: hiddenIds.value,
      scale: scale.value,
      categories: categoryNames.value,
      categoryIcons: categoryIcons.value,
    }
  }

  /** 从备份恢复 (覆盖当前数据) */
  function restoreBackup(data) {
    if (!data || !Array.isArray(data.feeds) || !Array.isArray(data.articles)) {
      return { ok: false, error: '备份文件格式不正确' }
    }
    feeds.value = data.feeds
    articles.value = data.articles
    readIds.value = Array.isArray(data.readIds) ? data.readIds : []
    starredIds.value = Array.isArray(data.starredIds) ? data.starredIds : []
    rules.value = Array.isArray(data.rules) ? data.rules : []
    hiddenIds.value = Array.isArray(data.hiddenIds) ? data.hiddenIds : []
    if (typeof data.scale === 'number') scale.value = data.scale
    if (Array.isArray(data.categories) && data.categories.length > 0) categoryNames.value = data.categories
    if (data.categoryIcons && typeof data.categoryIcons === 'object') categoryIcons.value = data.categoryIcons
    if (!filter.value.startsWith('feed:') || !feeds.value.some((f) => f.id === filter.value.slice(5))) {
      filter.value = 'all'
    }
    persist()
    return { ok: true, feeds: feeds.value.length, articles: articles.value.length }
  }

  /** OPML 导入: 解析 <outline xmlUrl=...> 并逐个添加 */
  async function importOPML(file) {
    const text = await file.text()
    const doc = new DOMParser().parseFromString(text, 'text/xml')
    if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('不是有效的 OPML 文件')
    const urls = [...doc.querySelectorAll('outline[xmlUrl]')].map((n) => n.getAttribute('xmlUrl'))
    if (urls.length === 0) throw new Error('OPML 中未找到任何订阅源')
    let ok = 0
    let fail = 0
    for (const u of urls) {
      if ((await addFeed(u)) === true) ok++
      else fail++
    }
    return { ok, fail }
  }

  /* ---------------- expose ---------------- */
  return {
    // state
    feeds,
    articles,
    readIds,
    starredIds,
    theme,
    scale,
    filter,
    query,
    modalOpen,
    fabOpen,
    loading,
    error,
    addError,
    adding,
    readerQueue,
    // getters
    readSet,
    starredSet,
    unreadCount,
    starredCount,
    isDark,
    categories,
    filteredArticles,
    activeFeed,
    activeCategory,
    activeFilterInfo,
    feedUnreadCount,
    // 规则
    rules,
    hiddenIds,
    hiddenSet,
    hiddenCount,
    rulesOpen,
    settingsOpen,
    settingsTab,
    addRule,
    removeRule,
    toggleRule,
    clearHidden,
    applyRulesToArticles,
    // 分类
    categoryNames,
    categoryIcons,
    visibleCategories,
    categoryIcon,
    setCategoryIcon,
    addCategory,
    renameCategory,
    deleteCategory,
    setFeedCategory,
    categoryUnreadCount,
    toggleCategory,
    isCategoryCollapsed,
    // 阅读进度
    progressMap,
    saveProgress,
    getProgress,
    clearProgress,
    // 通知与自动刷新
    notificationsEnabled,
    toggleNotifications,
    startAutoRefresh,
    // 搜索历史
    searchHistory,
    addSearchHistory,
    clearSearchHistory,
    // 导出与备份
    dataOpen,
    buildOPML,
    buildBackup,
    restoreBackup,
    // 自建代理
    proxyUrl,
    setProxyUrl,
    // actions
    init,
    addFeed,
    refreshFeeds,
    removeFeed,
    markRead,
    toggleRead,
    markAllRead,
    toggleStar,
    openArticle,
    updateArticleContent,
    setFilter,
    toggleTheme,
    cycleScale,
    setQuery,
    importOPML,
  }
})

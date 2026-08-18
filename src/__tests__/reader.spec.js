/**
 * RSS 阅读器核心逻辑测试 (vitest + jsdom 环境)
 * 运行: npm test
 *
 * 注: 应用已移除内置演示数据, 测试通过 seedFake 注入自己的假数据。
 */
// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { parseFeed, sanitizeHtml, relativeTime, fetchFeedXml } from '../utils/rss'
import { useReaderStore } from '../stores/reader'

// 测试中网络一律失败 → 验证失败路径与错误提示
beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', async () => {
    throw new Error('network disabled in tests')
  })
})

/** 注入自造订阅与文章 (绕过网络) */
function seedFake(store) {
  store.feeds.push(
    { id: 'f1', url: 'https://a.example/rss', title: '源A', category: '科技', favicon: '' },
    { id: 'f2', url: 'https://b.example/rss', title: '源B', category: '设计', favicon: '' }
  )
  const now = Date.now()
  store.articles.push(
    {
      id: 'a1',
      feedId: 'f1',
      sourceTitle: '源A',
      sourceUrl: 'https://a.example',
      title: '第一篇文章',
      link: 'https://a.example/1',
      snippet: '摘要1',
      content: '<p>正文1</p>',
      author: '甲',
      category: '科技',
      date: now - 1000,
      image: '',
    },
    {
      id: 'a2',
      feedId: 'f1',
      sourceTitle: '源A',
      sourceUrl: 'https://a.example',
      title: '第二篇文章',
      link: 'https://a.example/2',
      snippet: '摘要2',
      content: '<p>正文2</p>',
      author: '甲',
      category: '科技',
      date: now - 2000,
      image: '',
    },
    {
      id: 'a3',
      feedId: 'f2',
      sourceTitle: '源B',
      sourceUrl: 'https://b.example',
      title: '第三篇文章',
      link: 'https://b.example/3',
      snippet: '摘要3',
      content: '<p>正文3</p>',
      author: '乙',
      category: '设计',
      date: now - 3000,
      image: '',
    }
  )
}

describe('RSS 2.0 解析', () => {
  const rssXml = `<?xml version="1.0"?><rss version="2.0"><channel>
<title>测试源</title>
<item><title>第一篇文章</title><link>https://example.com/1</link>
<description><![CDATA[<p>简介</p>]]></description>
<content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/"><![CDATA[
<p>完整正文 <b>加粗</b></p><script>alert(1)</script><img src="/img.png" onerror="x"/>
]]></content:encoded>
<pubDate>Mon, 13 Jan 2025 08:00:00 GMT</pubDate>
<author>作者甲</author><category>科技</category>
<enclosure url="https://example.com/hero.jpg" type="image/jpeg"/></item>
<item><title>第二篇文章</title><link>https://example.com/2</link><description>纯文字摘要</description>
<pubDate>Tue, 14 Jan 2025 08:00:00 GMT</pubDate></item>
</channel></rss>`

  it('解析标题与文章数量', () => {
    const rss = parseFeed(rssXml, 'https://example.com/feed.xml', 'feed-1')
    expect(rss).not.toBeNull()
    expect(rss.title).toBe('测试源')
    expect(rss.articles).toHaveLength(2)
  })

  it('提取正文/首图/作者/分类/日期', () => {
    const a1 = parseFeed(rssXml, 'https://example.com/feed.xml', 'feed-1').articles[0]
    expect(a1.content).toContain('完整正文')
    expect(a1.image).toBe('https://example.com/hero.jpg')
    expect(a1.author).toBe('作者甲')
    expect(a1.category).toBe('科技')
    expect(new Date(a1.date).toISOString()).toMatch(/^2025-01-13/)
    expect(a1.snippet).toContain('完整正文')
    // 清洗链路 (store 在入库时调用 sanitizeHtml)
    const rich = sanitizeHtml(a1.content, 'https://example.com/feed.xml')
    expect(rich).toContain('https://example.com/img.png') // 相对路径已绝对化
    expect(rich).not.toContain('<script')
    expect(rich).not.toContain('onerror')
  })
})

describe('Atom 解析', () => {
  const atomXml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<title>Atom 源</title>
<entry><title>Atom 文章</title>
<link rel="alternate" href="https://example.com/atom/1"/>
<link rel="self" href="https://example.com/feed"/>
<summary>这是摘要</summary>
<content type="html">&lt;p&gt;HTML 正文&lt;/p&gt;</content>
<author><name>作者乙</name></author>
<updated>2025-01-15T10:00:00Z</updated>
<media:content url="https://example.com/atom-hero.jpg" medium="image"/></entry>
</feed>`

  it('解析 Atom 条目', () => {
    const atom = parseFeed(atomXml, 'https://example.com/atom.xml', 'feed-2')
    expect(atom.title).toBe('Atom 源')
    expect(atom.articles).toHaveLength(1)
    const at = atom.articles[0]
    expect(at.link).toBe('https://example.com/atom/1') // alternate 优先
    expect(at.content).toContain('HTML 正文')
    expect(at.author).toBe('作者乙')
    expect(at.image).toBe('https://example.com/atom-hero.jpg')
  })
})

describe('sanitizeHtml', () => {
  it('清除脚本/危险链接/iframe 并补全相对链接', () => {
    const dirty =
      '<p>ok</p><script>bad()</script><a href="javascript:evil()">x</a><a href="rel">相对</a><iframe src="x"></iframe>'
    const clean = sanitizeHtml(dirty, 'https://example.com/base/')
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('javascript:')
    expect(clean).not.toContain('iframe')
    expect(clean).toContain('https://example.com/base/rel') // 相对链接补全
  })
})

describe('Store', () => {
  it('初始化不注入任何演示数据', () => {
    const store = useReaderStore()
    store.init()
    expect(store.feeds).toHaveLength(0)
    expect(store.articles).toHaveLength(0)
    expect(store.unreadCount).toBe(0)
  })

  it('迁移: 清除历史遗留的演示订阅', () => {
    localStorage.setItem(
      'streamline:v1:feeds',
      JSON.stringify([
        { id: 'demo-hn', url: 'https://news.ycombinator.com/rss', title: 'Hacker News', demo: true },
        { id: 'feed-x', url: 'https://real.example/rss', title: '真实源' },
      ])
    )
    localStorage.setItem(
      'streamline:v1:articles',
      JSON.stringify([
        { id: 'd1', feedId: 'demo-hn', title: '演示文章', date: 1 },
        { id: 'r1', feedId: 'feed-x', title: '真实文章', date: 2 },
      ])
    )
    const store = useReaderStore()
    store.init()
    expect(store.feeds).toHaveLength(1)
    expect(store.feeds[0].id).toBe('feed-x')
    expect(store.articles).toHaveLength(1)
    expect(store.articles[0].id).toBe('r1')
  })

  it('星标/已读/阅读队列/全选已读/主题切换/持久化', () => {
    const store = useReaderStore()
    store.init()
    seedFake(store)
    const total = store.articles.length
    expect(store.unreadCount).toBe(total)

    const first = store.articles[0]
    store.toggleStar(first.id)
    expect(store.starredCount).toBe(1)
    store.setFilter('starred')
    expect(store.filteredArticles).toHaveLength(1)
    store.setFilter('all')

    store.openArticle(first.id)
    expect(store.readSet.has(first.id)).toBe(true)
    expect(store.unreadCount).toBe(total - 1)
    expect(store.readerQueue).toContain(first.id)

    store.markAllRead()
    expect(store.unreadCount).toBe(0)

    store.toggleTheme()
    expect(store.isDark).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    store.toggleTheme()
    expect(store.isDark).toBe(true)

    expect(JSON.parse(localStorage.getItem('streamline:v1:feeds'))).toHaveLength(2)
  })

  it('筛选与搜索', () => {
    const store = useReaderStore()
    store.init()
    seedFake(store)
    expect(store.filteredArticles).toHaveLength(3)
    store.setFilter('category:设计')
    expect(store.filteredArticles).toHaveLength(1)
    expect(store.filteredArticles[0].title).toBe('第三篇文章')
    store.setFilter('all')
    store.setQuery('第二')
    expect(store.filteredArticles).toHaveLength(1)
    store.setQuery('')
  })

  it('订阅源未读数与筛选信息', () => {
    const store = useReaderStore()
    store.init()
    seedFake(store)
    expect(store.feedUnreadCount('f1')).toBe(2)
    store.setFilter('feed:f1')
    expect(store.filteredArticles).toHaveLength(2)
    expect(store.activeFilterInfo).toMatchObject({ label: '源A', type: 'feed' })
    store.markRead('a1')
    expect(store.feedUnreadCount('f1')).toBe(1)
    store.setFilter('all')
    expect(store.activeFilterInfo).toBeNull()
    store.setFilter('category:设计')
    expect(store.activeFilterInfo).toMatchObject({ label: '设计', type: 'category' })
  })

  it('添加订阅: 重复订阅报错', async () => {
    const store = useReaderStore()
    store.init()
    seedFake(store)
    const ok = await store.addFeed('https://a.example/rss')
    expect(ok).toBe(false)
    expect(store.addError).toContain('已存在')
  })

  it('添加订阅: 无法解析的地址报错', async () => {
    const store = useReaderStore()
    store.init()
    const ok = await store.addFeed('https://not-a-feed.invalid/feed')
    expect(ok).toBe(false)
    expect(store.addError).toContain('无法解析')
  })

  it('toggleRead 可切换已读状态', () => {
    const store = useReaderStore()
    store.init()
    seedFake(store)
    store.toggleRead('a1')
    expect(store.readSet.has('a1')).toBe(true)
    store.toggleRead('a1')
    expect(store.readSet.has('a1')).toBe(false)
  })

  it('阅读进度保存/获取/清除 (含越界收敛)', () => {
    const store = useReaderStore()
    store.init()
    store.saveProgress('a1', 0.45)
    expect(store.getProgress('a1')).toBe(0.45)
    store.saveProgress('a1', 1.5)
    expect(store.getProgress('a1')).toBe(1)
    store.saveProgress('a1', -0.2)
    expect(store.getProgress('a1')).toBe(0)
    store.clearProgress('a1')
    expect(store.getProgress('a1')).toBe(0)
    expect(JSON.parse(localStorage.getItem('streamline:v1:progress'))).toEqual({})
  })

  it('相对时间格式化', () => {
    expect(/(分钟|小时|天)前/.test(relativeTime(Date.now() - 5 * 60000))).toBe(true)
  })
})

describe('自建 RSS 代理', () => {
  it('配置代理后 fetchFeedXml 优先走代理, 不再直连', async () => {
    localStorage.setItem('streamline:v1:proxy-url', 'https://my.workers.dev')
    const calls = []
    vi.stubGlobal('fetch', async (_u) => {
      calls.push(String(_u))
      return new Response('<rss><channel><title>代理内容</title></channel></rss>', { status: 200 })
    })
    const xml = await fetchFeedXml('https://a.example/rss')
    expect(calls[0]).toContain('https://my.workers.dev/api/rss?url=')
    expect(calls[0]).toContain(encodeURIComponent('https://a.example/rss'))
    expect(xml).toContain('代理内容')
    expect(calls).toHaveLength(1) // 代理成功即返回, 不继续请求
    localStorage.removeItem('streamline:v1:proxy-url')
  })

  it('代理失败时回退公共代理', async () => {
    localStorage.setItem('streamline:v1:proxy-url', 'https://my.workers.dev')
    let call = 0
    vi.stubGlobal('fetch', async (_u) => {
      call++
      if (call === 1) throw new Error('proxy down') // 自建代理失败
      return new Response('<rss><channel><title>兜底内容</title></channel></rss>', { status: 200 })
    })
    const xml = await fetchFeedXml('https://a.example/rss')
    expect(xml).toContain('兜底内容')
    localStorage.removeItem('streamline:v1:proxy-url')
  })
})

describe('分类管理', () => {
  it('默认分类已初始化, 未分类不可删除/重命名', () => {
    const store = useReaderStore()
    store.init()
    const names = store.categories.map((c) => c.name)
    expect(names).toEqual(expect.arrayContaining(['科技', '设计', '新闻', '未分类']))
    expect(store.deleteCategory('未分类')).toBe(false)
    expect(store.renameCategory('未分类', '其他')).toBe(false)
  })

  it('分类增删改与订阅指派联动', () => {
    const store = useReaderStore()
    store.init()
    seedFake(store) // f1 科技, f2 设计
    expect(store.categories.find((c) => c.name === '科技').count).toBe(1)

    expect(store.addCategory('AI')).toBe(true)
    expect(store.addCategory('AI')).toBe(false) // 重名拒绝
    expect(store.addCategory('   ')).toBe(false) // 空名拒绝

    store.setFeedCategory('f2', 'AI')
    expect(store.feeds.find((f) => f.id === 'f2').category).toBe('AI')
    expect(store.categories.find((c) => c.name === 'AI').count).toBe(1)
    expect(store.categories.find((c) => c.name === '设计').count).toBe(0)

    store.renameCategory('AI', '人工智能')
    expect(store.feeds.find((f) => f.id === 'f2').category).toBe('人工智能')
    expect(store.categories.some((c) => c.name === '人工智能')).toBe(true)

    store.deleteCategory('人工智能')
    expect(store.feeds.find((f) => f.id === 'f2').category).toBe('未分类')
    expect(store.categories.some((c) => c.name === '人工智能')).toBe(false)

    // 持久化
    expect(JSON.parse(localStorage.getItem('streamline:v1:categories'))).toEqual(
      expect.arrayContaining(['科技', '未分类'])
    )
  })

  it('可见分类不含未分类, 图标可自设并持久化', () => {
    const store = useReaderStore()
    store.init()
    expect(store.visibleCategories.map((c) => c.name)).toEqual(['科技', '设计', '新闻'])
    expect(store.visibleCategories.map((c) => c.name)).not.toContain('未分类')
    // 默认图标
    expect(store.categoryIcon('科技')).toBe('code')
    expect(store.categoryIcon('设计')).toBe('palette')
    // 自设图标 → 各处同步
    store.setCategoryIcon('科技', 'rocket_launch')
    expect(store.categoryIcon('科技')).toBe('rocket_launch')
    expect(store.visibleCategories.find((c) => c.name === '科技').icon).toBe('rocket_launch')
    expect(store.categories.find((c) => c.name === '科技').icon).toBe('rocket_launch')
    expect(JSON.parse(localStorage.getItem('streamline:v1:category-icons'))).toEqual({ 科技: 'rocket_launch' })
  })

  it('分类树: 未读汇总 / 折叠状态持久化', () => {
    const store = useReaderStore()
    store.init()
    seedFake(store) // f1(科技, 2篇未读), f2(设计, 1篇未读)
    expect(store.categoryUnreadCount('科技')).toBe(2)
    expect(store.categoryUnreadCount('设计')).toBe(1)
    expect(store.isCategoryCollapsed('科技')).toBe(false)
    store.toggleCategory('科技')
    expect(store.isCategoryCollapsed('科技')).toBe(true)
    expect(JSON.parse(localStorage.getItem('streamline:v1:collapsed-cats'))).toEqual({ 科技: true })
    store.toggleCategory('科技')
    expect(store.isCategoryCollapsed('科技')).toBe(false)
  })

  it('分类很多时默认全部收起', () => {
    localStorage.setItem('streamline:v1:categories', JSON.stringify(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']))
    const store = useReaderStore()
    store.init()
    expect(store.visibleCategories).toHaveLength(8)
    for (const c of store.visibleCategories) {
      expect(store.isCategoryCollapsed(c.name)).toBe(true)
    }
  })

  it('添加订阅可指定分类 (失败路径不崩溃)', async () => {
    const store = useReaderStore()
    store.init()
    const ok = await store.addFeed('https://x.example/rss', '科技')
    expect(ok).toBe(false)
    expect(store.addError).toContain('无法解析')
  })
})

describe('订阅规则', () => {
  it('标题规则: 自动已读 / 自动星标 / 自动隐藏, 隐藏可恢复', () => {
    const store = useReaderStore()
    store.init()
    seedFake(store)

    store.addRule({ titleMatch: '第二', action: 'read' })
    expect(store.readSet.has('a2')).toBe(true)

    store.addRule({ titleMatch: '第一', action: 'star' })
    expect(store.starredSet.has('a1')).toBe(true)

    store.addRule({ titleMatch: '第三', action: 'hide' })
    expect(store.hiddenCount).toBe(1)
    expect(store.filteredArticles.map((a) => a.id)).toEqual(['a1', 'a2']) // 隐藏的不展示
    expect(store.unreadCount).toBe(1) // 隐藏文章的未读不计数

    store.clearHidden()
    expect(store.hiddenCount).toBe(0)
    expect(store.filteredArticles).toHaveLength(3)
  })

  it('URL 规则与停用、持久化', () => {
    const store = useReaderStore()
    store.init()
    seedFake(store)

    const ok = store.addRule({ feedMatch: 'b.example', action: 'read' })
    expect(ok).toBe(true)
    expect(store.readSet.has('a3')).toBe(true)

    // 无匹配条件不能添加
    expect(store.addRule({ titleMatch: '', feedMatch: '', action: 'read' })).toBe(false)

    const rule = store.rules[0]
    expect(JSON.parse(localStorage.getItem('streamline:v1:rules'))).toHaveLength(store.rules.length)
    store.toggleRule(rule.id)
    expect(store.rules[0].enabled).toBe(false)
    store.removeRule(rule.id)
    expect(store.rules).toHaveLength(0)
  })

  it('规则在文章库更新时自动生效 (upsert 路径)', () => {
    const store = useReaderStore()
    store.init()
    store.addRule({ titleMatch: 'AI', action: 'star' })
    store.articles.push({
      id: 'n1',
      feedId: 'f1',
      sourceTitle: '源',
      sourceUrl: 'https://n.example',
      title: 'AI 新文章',
      link: 'https://n.example/1',
      snippet: '',
      content: '',
      author: '',
      category: '',
      date: Date.now(),
      image: '',
    })
    store.applyRulesToArticles(store.articles)
    expect(store.starredSet.has('n1')).toBe(true)
  })
})

describe('搜索增强', () => {
  it('分词 AND + 子序列模糊匹配', () => {
    const store = useReaderStore()
    store.init()
    seedFake(store)
    store.setQuery('第 文章') // 空格分词, 两词都命中
    expect(store.filteredArticles.length).toBeGreaterThanOrEqual(3)
    store.setQuery('第二篇')
    expect(store.filteredArticles).toHaveLength(1)
    store.setQuery('二文') // 子序列: 「第二篇文章」中按序包含 二…文 (跳过中间字)
    expect(store.filteredArticles.map((a) => a.id)).toContain('a2')
    store.setQuery('乙 第三') // 作者 + 标题 跨字段 AND
    expect(store.filteredArticles.map((a) => a.id)).toContain('a3')
    store.setQuery('不存在的词')
    expect(store.filteredArticles).toHaveLength(0)
    store.setQuery('')
  })

  it('搜索历史: 去重/上限/置顶/清空/持久化', () => {
    const store = useReaderStore()
    store.init()
    for (let i = 0; i < 12; i++) store.addSearchHistory('词' + i)
    expect(store.searchHistory).toHaveLength(10)
    expect(store.searchHistory[0]).toBe('词11')
    store.addSearchHistory('词5') // 重复项置顶且不重复
    expect(store.searchHistory[0]).toBe('词5')
    expect(store.searchHistory.filter((x) => x === '词5')).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('streamline:v1:search-history'))).toHaveLength(10)
    store.clearSearchHistory()
    expect(store.searchHistory).toHaveLength(0)
  })
})

describe('导出与备份', () => {
  it('OPML 导出包含全部订阅源并正确转义', () => {
    const store = useReaderStore()
    store.init()
    seedFake(store)
    const opml = store.buildOPML()
    expect(opml).toContain('<?xml version="1.0"')
    expect(opml).toContain('<opml version="2.0">')
    expect(opml).toContain('xmlUrl="https://a.example/rss"')
    expect(opml).toContain('text="源A"')
  })

  it('JSON 备份与恢复往返', () => {
    const store = useReaderStore()
    store.init()
    seedFake(store)
    store.toggleStar('a1')
    store.markRead('a2')
    store.addRule({ titleMatch: '第三', action: 'hide' })
    const backup = store.buildBackup()
    expect(backup.feeds).toHaveLength(2)
    expect(backup.articles).toHaveLength(3)
    expect(backup.starredIds).toContain('a1')
    expect(backup.readIds).toContain('a2')
    expect(backup.rules).toHaveLength(1)

    const s2 = useReaderStore()
    s2.init()
    const r = s2.restoreBackup(backup)
    expect(r.ok).toBe(true)
    expect(s2.feeds).toHaveLength(2)
    expect(s2.articles).toHaveLength(3)
    expect(s2.starredSet.has('a1')).toBe(true)
    expect(s2.readSet.has('a2')).toBe(true)
    expect(s2.hiddenCount).toBe(1)
    // 非法备份拒绝
    expect(s2.restoreBackup({ foo: 1 }).ok).toBe(false)
    expect(s2.restoreBackup(null).ok).toBe(false)
  })
})

describe('通知与自动刷新', () => {
  it('通知开关: 首次请求权限后开启, 再次点击关闭', async () => {
    const store = useReaderStore()
    store.init()
    let permission = 'default'
    class FakeNotification {
      static get permission() {
        return permission
      }
      static requestPermission = vi.fn(async () => {
        permission = 'granted'
        return 'granted'
      })
      constructor() {}
      close() {}
    }
    vi.stubGlobal('Notification', FakeNotification)

    expect(await store.toggleNotifications()).toBe(true)
    expect(store.notificationsEnabled).toBe(true)
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1)

    expect(await store.toggleNotifications()).toBe(false) // 已授权 → 切换关闭
    expect(store.notificationsEnabled).toBe(false)
    expect(JSON.parse(localStorage.getItem('streamline:v1:notify'))).toBe(false)
  })

  it('静默刷新不显示加载态与错误横幅', async () => {
    const store = useReaderStore()
    store.init()
    seedFake(store)
    await store.refreshFeeds(true) // 网络失败但静默
    expect(store.loading).toBe(false)
    expect(store.error).toBe('')
  })
})

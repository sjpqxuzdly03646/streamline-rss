/**
 * 关键组件测试 (@vue/test-utils + jsdom)
 * 运行: npm test
 */
// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import ArticleCard from '../components/ArticleCard.vue'
import EmptyState from '../components/EmptyState.vue'
import AddFeedModal from '../components/AddFeedModal.vue'
import SettingsModal from '../components/SettingsModal.vue'
import { useReaderStore } from '../stores/reader'

const article = {
  id: 'a1',
  feedId: 'f1',
  sourceTitle: '源A',
  sourceUrl: 'https://a.example/rss',
  title: '测试文章标题',
  link: 'https://a.example/1',
  snippet: '这是摘要',
  content: '<p>正文</p>',
  author: '作者',
  category: '科技',
  date: Date.now(),
  image: '',
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  document.body.innerHTML = ''
})

/** Teleport 内容挂到 body 下, 取最后一个 modal-card 避免与其他组件残留混淆 */
function lastModalCard() {
  const cards = document.querySelectorAll('.modal-card')
  return cards[cards.length - 1]
}

describe('ArticleCard', () => {
  it('未读文章: 渲染标题/来源/摘要, 有脉冲点, 无 read 类', () => {
    const store = useReaderStore()
    store.init()
    store.articles.push(article)
    const wrapper = mount(ArticleCard, { props: { article } })
    expect(wrapper.text()).toContain('测试文章标题')
    expect(wrapper.text()).toContain('源A')
    expect(wrapper.find('.unread-pulse').exists()).toBe(true)
    expect(wrapper.find('article').classes()).not.toContain('read')
  })

  it('已读文章: 无脉冲点, 有 read 类', async () => {
    const store = useReaderStore()
    store.init()
    store.articles.push(article)
    store.markRead('a1')
    const wrapper = mount(ArticleCard, { props: { article } })
    expect(wrapper.find('.unread-pulse').exists()).toBe(false)
    expect(wrapper.find('article').classes()).toContain('read')
  })

  it('点击触发 open 事件并携带文章', async () => {
    const store = useReaderStore()
    store.init()
    store.articles.push(article)
    const wrapper = mount(ArticleCard, { props: { article } })
    await wrapper.find('article').trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect(wrapper.emitted('open')[0][0].id).toBe('a1')
  })

  it('选中态: 带高亮 ring 类', () => {
    const store = useReaderStore()
    store.init()
    store.articles.push(article)
    const wrapper = mount(ArticleCard, { props: { article, selected: true } })
    expect(wrapper.find('article').classes()).toContain('ring-2')
  })
})

describe('EmptyState', () => {
  it('渲染欢迎语与示例订阅按钮', () => {
    const wrapper = mount(EmptyState)
    expect(wrapper.text()).toContain('欢迎来到 Streamline')
    expect(wrapper.text()).toContain('Hacker News')
    expect(wrapper.text()).toContain('The Verge')
  })

  it('输入 URL 提交时调用 store.addFeed', async () => {
    const store = useReaderStore()
    store.init()
    const spy = vi.spyOn(store, 'addFeed').mockResolvedValue(true)
    const wrapper = mount(EmptyState)
    await wrapper.find('input').setValue('https://example.com/rss')
    await wrapper.find('button').trigger('click')
    expect(spy).toHaveBeenCalledWith('https://example.com/rss')
    spy.mockRestore()
  })
})

describe('AddFeedModal', () => {
  it('打开时清空输入并重置分类', async () => {
    const store = useReaderStore()
    store.init()
    const wrapper = mount(AddFeedModal, { attachTo: document.body })
    store.modalOpen = true
    await wrapper.vm.$nextTick()
    const input = lastModalCard().querySelector('input')
    expect(input).toBeTruthy()
    input.value = 'https://x.example/rss'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    store.modalOpen = false
    await wrapper.vm.$nextTick()
    store.modalOpen = true
    await wrapper.vm.$nextTick()
    expect(lastModalCard().querySelector('input').value).toBe('')
    wrapper.unmount()
  })

  it('提交调用 store.addFeed 并传入分类', async () => {
    const store = useReaderStore()
    store.init()
    const spy = vi.spyOn(store, 'addFeed').mockResolvedValue(true)
    const wrapper = mount(AddFeedModal, { attachTo: document.body })
    store.modalOpen = true
    await wrapper.vm.$nextTick()
    const input = lastModalCard().querySelector('input')
    input.value = 'https://x.example/rss'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    const addBtn = [...lastModalCard().querySelectorAll('button')].find((b) => b.textContent.includes('添加'))
    addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(spy).toHaveBeenCalledWith('https://x.example/rss', '科技') // 默认选中第一个可见分类
    spy.mockRestore()
    wrapper.unmount()
  })
})

describe('SettingsModal', () => {
  it('标签页切换: 规则 → 数据', async () => {
    const store = useReaderStore()
    store.init()
    const wrapper = mount(SettingsModal, { attachTo: document.body })
    store.settingsOpen = true
    store.settingsTab = 'rules'
    await wrapper.vm.$nextTick()
    expect(lastModalCard().textContent).toContain('订阅规则')
    // 切到数据管理
    const dataTab = [...lastModalCard().querySelectorAll('button')].find((b) =>
      b.textContent.includes('数据管理')
    )
    await dataTab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(lastModalCard().textContent).toContain('导出 OPML')
    expect(lastModalCard().textContent).toContain('自建 RSS 代理')
    wrapper.unmount()
  })

  it('规则表单: 添加规则调用 store.addRule', async () => {
    const store = useReaderStore()
    store.init()
    const spy = vi.spyOn(store, 'addRule').mockReturnValue(true)
    const wrapper = mount(SettingsModal, { attachTo: document.body })
    store.settingsOpen = true
    store.settingsTab = 'rules'
    await wrapper.vm.$nextTick()
    const input = lastModalCard().querySelector('input[placeholder*="标题包含"]')
    input.value = 'AI'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    const addBtn = [...lastModalCard().querySelectorAll('button')].find((b) => b.textContent.includes('添加规则'))
    await addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ titleMatch: 'AI' }))
    spy.mockRestore()
    wrapper.unmount()
  })
})
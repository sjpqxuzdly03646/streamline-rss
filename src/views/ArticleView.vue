<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useReaderStore } from '../stores/reader'
import { relativeTime, readingMinutes, domainOf, getCustomProxy } from '../utils/rss'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import xml from 'highlight.js/lib/languages/xml'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import python from 'highlight.js/lib/languages/python'
import json from 'highlight.js/lib/languages/json'
import 'highlight.js/styles/github-dark.css'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('python', python)
hljs.registerLanguage('json', json)

const props = defineProps({
  id: { type: String, required: true },
})

const store = useReaderStore()
const router = useRouter()

const article = computed(() => store.articles.find((a) => a.id === props.id))

const isStarred = computed(() => (article.value ? store.starredSet.has(article.value.id) : false))
// 正文在入库时已 sanitizeHtml 清洗, 渲染不再重复解析; 空正文回退摘要
const safeContent = computed(() => {
  if (!article.value) return ''
  const raw = article.value.content || ''
  if (raw.includes('<')) return raw
  return `<p>${article.value.snippet || article.value.title || ''}</p>`
})
const domainLabel = computed(() => (article.value ? domainOf(article.value.sourceUrl) : ''))
const readingMin = computed(() => (article.value ? readingMinutes(article.value.content) : 1))
const fullDate = computed(() =>
  article.value
    ? new Date(article.value.date).toLocaleString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
)

/* ---- 阅读进度条 ---- */
const progress = ref(0)
function docFraction() {
  const doc = document.documentElement
  const max = doc.scrollHeight - doc.clientHeight
  return max > 0 ? doc.scrollTop / max : 0
}
function onScroll() {
  progress.value = docFraction() * 100
  // 读到结尾自动标记已读 (每篇文章只触发一次)
  if (progress.value >= 98 && article.value && !readAtEnd.value) {
    readAtEnd.value = true
    store.markRead(props.id)
  }
  throttleSaveProgress()
}

/** 已触发过"读到结尾已读"的文章 (切换文章时重置) */
const readAtEnd = ref(false)

/* ---- 阅读进度记忆 (Throttle 保存, 进入恢复) ---- */
const showResume = ref(false)
const resumePct = ref(0)
let saveTimer = null

function saveCurrentProgress() {
  if (!article.value) return
  const f = docFraction()
  if (f >= 0.98 || f < 0.03)
    store.clearProgress(props.id) // 读完或未开始 → 不记进度
  else store.saveProgress(props.id, f)
}
function throttleSaveProgress() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveCurrentProgress()
  }, 400)
}
function tryRestoreProgress() {
  if (!article.value) return
  const saved = store.getProgress(props.id)
  if (saved > 0.02 && saved < 0.98) {
    requestAnimationFrame(() => {
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      if (max > 0) {
        window.scrollTo(0, max * saved)
        resumePct.value = Math.round(saved * 100)
        showResume.value = true
      }
    })
  }
}
function restartReading() {
  store.clearProgress(props.id)
  showResume.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/* ---- 目录 (TOC) / 代码高亮 / 图片放大 ---- */
const toc = ref([])
const tocOpen = ref(false)
const lightbox = ref('')

function buildTocAndHighlight() {
  nextTick(() => {
    const root = document.querySelector('.article-content')
    if (!root) return
    // 目录: 收集 h2/h3 并加锚点
    const items = []
    root.querySelectorAll('h2, h3').forEach((el, i) => {
      const id = 'toc-' + props.id + '-' + i
      el.id = id
      items.push({ id, text: el.textContent.trim(), level: el.tagName === 'H2' ? 2 : 3 })
    })
    toc.value = items
    // 代码高亮 (hljs 只处理未高亮过的块)
    root.querySelectorAll('pre code').forEach((el) => {
      if (!el.classList.contains('hljs')) hljs.highlightElement(el)
    })
  })
}

function scrollToHeading(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  tocOpen.value = false
}

function onContentClick(e) {
  const t = e.target
  if (t && t.tagName === 'IMG' && t.src) lightbox.value = t.src
}

/* ---- 全文阅读模式 ---- */
const fulltextLoading = ref(false)
const fulltextMsg = ref('')

async function fetchFulltext() {
  if (!article.value || fulltextLoading.value) return
  const proxy = getCustomProxy()
  if (!proxy) {
    fulltextMsg.value = '请先在 设置 → 数据管理 中配置自建代理'
    setTimeout(() => (fulltextMsg.value = ''), 4000)
    return
  }
  fulltextLoading.value = true
  try {
    const res = await fetch(`${proxy}/api/fulltext?url=${encodeURIComponent(article.value.link)}`)
    if (!res.ok) throw new Error('代理返回 ' + res.status)
    const data = await res.json()
    if (!data || !data.content) throw new Error('页面无可读正文')
    store.updateArticleContent(article.value.id, data.content)
    if (data.title && data.title.trim()) article.value.title = data.title
    fulltextMsg.value = '已加载全文'
    buildTocAndHighlight()
  } catch (e) {
    fulltextMsg.value = '全文抓取失败: ' + e.message
  }
  fulltextLoading.value = false
  setTimeout(() => (fulltextMsg.value = ''), 4000)
}

/* ---- 键盘快捷键 ---- */
function goToArticle(a) {
  if (!a) return
  store.openArticle(a.id) // 标记已读并维护阅读队列
  router.push({ name: 'article', params: { id: a.id } })
}
function onKeydown(e) {
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
  const k = e.key
  if (k === 'ArrowLeft' || k === 'p') {
    goToArticle(prevArticle.value)
  } else if (k === 'ArrowRight' || k === 'n') {
    goToArticle(nextArticle.value)
  } else if (k === 's') {
    store.toggleStar(props.id)
  } else if (k === 'f') {
    store.cycleScale()
  } else if (k === 'u') {
    if (article.value?.link) window.open(article.value.link, '_blank', 'noopener')
  } else if (k === 'Escape') {
    router.push('/')
  }
}

/* ---- 上一篇 / 下一篇 ---- */
function buildQueue() {
  if (!article.value) return []
  if (store.readerQueue.length > 0) return store.readerQueue
  return store.filteredArticles.map((a) => a.id)
}
const queue = computed(buildQueue)
const currentIndex = computed(() => queue.value.indexOf(props.id))
const prevArticle = computed(() => {
  const i = currentIndex.value
  return i > 0 ? store.articles.find((a) => a.id === queue.value[i - 1]) || null : null
})
const nextArticle = computed(() => {
  const i = currentIndex.value
  return i >= 0 && i < queue.value.length - 1 ? store.articles.find((a) => a.id === queue.value[i + 1]) || null : null
})

/* ---- 分享 / 复制 ---- */
const shareMsg = ref('')
function share() {
  if (!article.value) return
  const payload = { title: article.value.title, url: article.value.link }
  if (navigator.share) {
    navigator.share(payload).catch(() => {})
  } else {
    navigator.clipboard?.writeText(article.value.link).then(() => {
      shareMsg.value = '链接已复制'
      setTimeout(() => (shareMsg.value = ''), 2000)
    })
  }
}

/* ---- 守卫: 只有 id 存在且文章缺失时才回列表 (返回导航时 id 为空, 不触发) ---- */
watch(
  () => props.id,
  (id) => {
    if (id && !store.articles.find((a) => a.id === id)) router.replace('/')
  },
  { immediate: true }
)

watch(
  () => props.id,
  (id, oldId) => {
    if (oldId) saveCurrentProgress() // 切换前保存上一篇文章进度
    window.scrollTo({ top: 0, behavior: 'auto' })
    showResume.value = false
    readAtEnd.value = false
    tocOpen.value = false
    buildTocAndHighlight()
    if (id) tryRestoreProgress()
  }
)

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('keydown', onKeydown)
  onScroll()
  tryRestoreProgress()
  buildTocAndHighlight()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(saveTimer)
  saveCurrentProgress() // 离开时保存最终进度
})
</script>

<template>
  <div class="bg-liquid-flow text-on-surface antialiased min-h-screen relative font-sans overflow-hidden">
    <!-- 根节点始终渲染, 内部 v-if 避免离开动画期间根节点被卸载 -->
    <template v-if="article">
      <!-- Global Progress Bar -->
      <div
        class="fixed top-0 left-0 h-1 bg-gradient-to-r from-primary to-secondary-container z-[100] transition-all duration-300 rounded-r-full shadow-[0_0_10px_rgba(255,181,160,0.5)]"
        :style="{ width: progress + '%' }"
      ></div>

      <!-- Sticky Top Toolbar -->
      <header
        class="fixed top-0 left-0 right-0 z-50 flex justify-center px-margin-mobile md:px-margin-desktop pointer-events-none py-sm"
      >
        <div
          class="w-full max-w-content flex justify-between items-center glass-panel rounded-full px-md py-sm pointer-events-auto shadow-lg"
        >
          <button
            class="flex items-center gap-xs text-secondary hover:text-primary transition-colors group"
            @click="router.push('/')"
          >
            <span class="material-symbols-outlined text-[20px] group-hover:-translate-x-1 transition-transform"
              >arrow_back</span
            >
            <span class="font-label-caps text-label-caps uppercase tracking-wider hidden sm:block">返回列表</span>
          </button>
          <div class="flex items-center gap-base">
            <button
              class="p-2 rounded-full hover:bg-surface-variant text-tertiary hover:text-primary transition-colors"
              title="调整字号"
              @click="store.cycleScale()"
            >
              <span class="material-symbols-outlined text-[20px]">format_size</span>
            </button>
            <button
              class="p-2 rounded-full hover:bg-surface-variant text-tertiary hover:text-primary transition-colors"
              title="抓取并阅读全文 (需自建代理)"
              @click="fetchFulltext"
            >
              <span class="material-symbols-outlined text-[20px]" :class="{ 'animate-spin': fulltextLoading }">{{ fulltextLoading ? 'autorenew' : 'auto_stories' }}</span>
            </button>
            <button
              class="p-2 rounded-full hover:bg-surface-variant text-tertiary hover:text-primary transition-colors"
              title="分享"
              @click="share"
            >
              <span class="material-symbols-outlined text-[20px]">ios_share</span>
            </button>
            <button
              class="p-2 rounded-full hover:bg-surface-variant transition-colors"
              :class="isStarred ? 'text-primary' : 'text-tertiary hover:text-secondary-container'"
              :title="isStarred ? '取消星标' : '星标收藏'"
              @click="store.toggleStar(article.id)"
            >
              <span class="material-symbols-outlined text-[22px]">{{ isStarred ? 'star' : 'star_border' }}</span>
            </button>
            <a
              :href="article.link"
              target="_blank"
              rel="noopener noreferrer"
              class="p-2 rounded-full hover:bg-surface-variant text-tertiary hover:text-primary transition-colors"
              :title="'在原网站查看: ' + domainLabel"
            >
              <span class="material-symbols-outlined text-[20px]">open_in_new</span>
            </a>
          </div>
        </div>
      </header>

      <!-- 分享/全文提示 -->
      <Transition name="fade" :duration="200">
        <div
          v-if="shareMsg || fulltextMsg"
          class="fixed top-20 left-1/2 -translate-x-1/2 z-[90] glass-panel rounded-full px-4 py-2 text-sm text-primary"
        >
          {{ fulltextMsg || shareMsg }}
        </div>
      </Transition>

      <!-- 恢复阅读位置提示 -->
      <Transition name="fade" :duration="200">
        <div
          v-if="showResume"
          class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[90] glass-panel rounded-full px-4 py-2 text-sm text-on-surface flex items-center gap-3 shadow-xl"
        >
          <span class="material-symbols-outlined text-primary text-[18px]">bookmark</span>
          <span
            >已恢复到上次阅读位置 <span class="text-primary font-bold">{{ resumePct }}%</span></span
          >
          <button class="text-on-surface-variant/80 hover:text-primary transition-colors" @click="restartReading">
            从头开始
          </button>
          <button
            class="text-on-surface-variant/50 hover:text-on-surface transition-colors"
            @click="showResume = false"
          >
            <span class="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </Transition>

      <!-- Main Content Canvas -->
      <main
        class="w-full flex justify-center pt-[100px] pb-[104px] px-margin-mobile md:px-margin-desktop relative z-10"
      >
        <article
          class="w-full max-w-content glass-panel rounded-[24px] md:rounded-[32px] md:p-xl md:pb-lg overflow-hidden relative p-lg pb-lg"
        >
          <!-- Ambient Glow behind header -->
          <div
            class="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[200px] bg-primary/10 blur-[80px] rounded-full pointer-events-none"
          ></div>

          <!-- Meta Data -->
          <header class="mb-xl relative z-10">
            <!-- 一行: 左侧 分类 chip; 右侧 来源 · 时间 · 阅读时长 -->
            <div
              class="flex flex-nowrap items-center gap-x-xs font-label-caps text-label-caps text-tertiary mb-sm uppercase"
            >
              <span
                class="flex items-center gap-xs bg-primary/10 border border-primary/20 px-2 py-1 rounded-sm text-primary flex-none"
              >
                <span class="material-symbols-outlined text-[14px]">{{
                  store.categoryIcon(article.category || '未分类')
                }}</span>
                {{ article.category || '未分类' }}
              </span>
              <span class="flex items-center gap-x-xs ml-auto min-w-0">
                <span class="flex items-center gap-xs min-w-0 flex-1 truncate">
                  <span class="material-symbols-outlined text-[14px] flex-none">person</span>
                  <span class="truncate">{{ article.author || domainLabel }}</span>
                </span>
                <span class="text-outline-variant">•</span>
                <span class="flex items-center gap-xs whitespace-nowrap" :title="fullDate">
                  <span class="material-symbols-outlined text-[14px]">schedule</span>
                  {{ relativeTime(article.date) }}
                </span>
                <span class="text-outline-variant">•</span>
                <span class="flex items-center gap-xs whitespace-nowrap">
                  <span class="material-symbols-outlined text-[14px]">book</span>
                  {{ readingMin }} 分钟
                </span>
              </span>
            </div>
            <!-- Title -->
            <h1
              class="font-display-lg text-display-lg leading-tight mt-sm mb-lg drop-shadow-sm"
              :style="{ color: 'rgb(var(--article-strong))' }"
            >
              {{ article.title }}
            </h1>
          </header>

          <!-- Hero Image -->
          <figure
            v-if="article.image"
            class="mb-xl rounded-xl overflow-hidden shadow-lg border border-outline-variant/20 relative group"
          >
            <img
              :src="article.image"
              :alt="article.title"
              class="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105 aspect-[16/9]"
              loading="lazy"
              @error="$event.target.style.display = 'none'"
            />
            <figcaption
              class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-surface-container-lowest to-transparent p-sm text-right font-label-caps text-label-caps text-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {{ domainLabel }}
            </figcaption>
          </figure>

          <!-- 目录 (TOC) -->
          <div
            v-if="toc.length > 0"
            class="mb-lg rounded-xl bg-surface-container/70 border border-outline-variant/20 overflow-hidden"
          >
            <button
              class="w-full flex items-center gap-2 px-sm py-2.5 text-sm text-on-surface font-medium hover:bg-surface-container-high/50 transition-colors"
              @click="tocOpen = !tocOpen"
            >
              <span class="material-symbols-outlined text-[16px] text-primary">format_list_bulleted</span>
              <span class="flex-1 text-left">目录 ({{ toc.length }})</span>
              <span
                class="material-symbols-outlined text-[18px] text-on-surface-variant/50 transition-transform duration-200"
                :class="tocOpen ? 'rotate-180' : ''"
              >expand_more</span>
            </button>
            <div v-if="tocOpen" class="px-sm pb-2.5 space-y-0.5">
              <button
                v-for="item in toc"
                :key="item.id"
                class="w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors"
                :class="item.level === 2 ? 'text-on-surface' : 'text-on-surface-variant pl-6'"
                @click="scrollToHeading(item.id)"
              >
                {{ item.text }}
              </button>
            </div>
          </div>

          <!-- Article Body -->
          <div
            class="article-content w-full mx-auto"
            :style="{ '--reader-scale': store.scale }"
            @click="onContentClick"
            v-html="safeContent"
          ></div>

          <!-- End Marker -->
          <div class="flex justify-center mt-lg mb-sm">
            <div class="w-12 h-1 bg-outline-variant/30 rounded-full"></div>
          </div>
        </article>
      </main>

      <!-- Sticky Bottom Navigation (Prev/Next) -->
      <nav
        class="fixed bottom-margin-mobile md:bottom-margin-desktop left-0 right-0 z-50 flex justify-center px-margin-mobile pointer-events-none"
      >
        <div
          class="w-full max-w-content glass-panel rounded-full px-2 flex justify-between items-center pointer-events-auto shadow-lg border border-white/5 relative overflow-hidden py-xs"
        >
          <div
            class="absolute inset-0 bg-gradient-to-t from-surface-container-highest/50 to-transparent pointer-events-none"
          ></div>

          <button
            class="flex items-center gap-sm px-md py-sm rounded-full hover:bg-surface-variant/80 transition-colors text-secondary hover:text-on-surface group z-10 w-1/2 justify-start"
            :class="prevArticle ? '' : 'opacity-40 pointer-events-none'"
            @click="goToArticle(prevArticle)"
          >
            <span class="material-symbols-outlined group-hover:-translate-x-1 transition-transform">chevron_left</span>
            <div class="flex flex-col items-start">
              <span class="font-label-caps text-label-caps text-tertiary group-hover:text-secondary-fixed">上一篇</span>
              <span class="text-body-sm font-medium truncate max-w-[220px] hidden sm:block">{{
                prevArticle?.title || '没有了'
              }}</span>
            </div>
          </button>

          <div class="w-[1px] h-8 bg-outline-variant/50 z-10"></div>

          <button
            class="flex items-center gap-sm px-md py-sm rounded-full hover:bg-surface-variant/80 transition-colors text-secondary hover:text-on-surface group z-10 w-1/2 justify-end text-right"
            :class="nextArticle ? '' : 'opacity-40 pointer-events-none'"
            @click="goToArticle(nextArticle)"
          >
            <div class="flex flex-col items-end">
              <span class="font-label-caps text-label-caps text-tertiary group-hover:text-secondary-fixed">下一篇</span>
              <span class="text-body-sm font-medium truncate max-w-[220px] hidden sm:block">{{
                nextArticle?.title || '没有了'
              }}</span>
            </div>
            <span class="material-symbols-outlined group-hover:translate-x-1 transition-transform">chevron_right</span>
          </button>
        </div>
      </nav>

      <!-- 图片放大 -->
      <Transition name="fade" :duration="200">
        <div
          v-if="lightbox"
          class="fixed inset-0 z-[120] bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"
          @click="lightbox = ''"
        >
          <img :src="lightbox" alt="" class="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain" />
          <button
            class="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            @click.stop="lightbox = ''"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </Transition>
    </template>

    <!-- 文章不存在时的兜底 (直接访问失效链接) -->
    <div v-else class="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <span class="material-symbols-outlined text-6xl opacity-40">file_open</span>
      <p class="font-headline-sm text-headline-sm">这篇文章不存在或已失效</p>
      <button
        class="mt-2 bg-primary/90 text-on-primary font-bold px-6 py-2.5 rounded-lg hover:bg-primary transition-colors"
        @click="router.push('/')"
      >
        返回列表
      </button>
    </div>
  </div>
</template>

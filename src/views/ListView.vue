<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useReaderStore } from '../stores/reader'
import AppShell from '../components/AppShell.vue'
import ArticleCard from '../components/ArticleCard.vue'
import EmptyState from '../components/EmptyState.vue'

const store = useReaderStore()
const router = useRouter()

function openArticle(article) {
  store.openArticle(article.id)
  router.push({ name: 'article', params: { id: article.id } })
}

function onSearchInput(e) {
  store.setQuery(e.target.value)
  clearTimeout(searchDebounce.value)
  searchDebounce.value = setTimeout(() => store.addSearchHistory(e.target.value), 800)
}

/* ---- 列表加载更多分页 ---- */
const PAGE_SIZE = 30
const visibleCount = ref(PAGE_SIZE)

const visibleList = computed(() => store.filteredArticles.slice(0, visibleCount.value))

/** 筛选/搜索/数据变化后重置分页 */
watch(
  () => store.filteredArticles,
  () => {
    visibleCount.value = PAGE_SIZE
  }
)

function loadMore() {
  if (visibleCount.value < store.filteredArticles.length) {
    visibleCount.value += PAGE_SIZE
  }
}

function onMainScroll() {
  const el = document.getElementById('main-scroll')
  if (!el) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) loadMore()
}

onMounted(() => {
  document.getElementById('main-scroll')?.addEventListener('scroll', onMainScroll, { passive: true })
})
onBeforeUnmount(() => {
  document.getElementById('main-scroll')?.removeEventListener('scroll', onMainScroll)
})

/* ---- 搜索历史 ---- */
const searchFocused = ref(false)
const searchHover = ref(false)
let searchHoverTimer = null

function onSearchEnter() {
  clearTimeout(searchHoverTimer)
  searchHover.value = true
}

function onSearchLeave() {
  // 延迟收起, 避免鼠标在边界时展开/收起快速切换造成抖动
  clearTimeout(searchHoverTimer)
  searchHoverTimer = setTimeout(() => (searchHover.value = false), 250)
}
/** 展开条件: 悬停 || 聚焦 || 有搜索内容 */
const searchExpanded = computed(() => searchHover.value || searchFocused.value || !!store.query)
const searchDebounce = ref(null)
const searchBlurTimer = ref(null)

function onSearchFocus() {
  searchFocused.value = true
}

function onSearchBlur() {
  clearTimeout(searchBlurTimer.value)
  searchBlurTimer.value = setTimeout(() => (searchFocused.value = false), 150)
}

function pickHistory(term) {
  store.setQuery(term)
  store.addSearchHistory(term)
  searchFocused.value = false
}

function clearHistory() {
  store.clearSearchHistory()
}

/* ---------------- 键盘选择与快捷键 ---------------- */
const selectedIndex = ref(0)
const showKeys = ref(false)

watch(
  () => store.filteredArticles.length,
  (n) => {
    if (selectedIndex.value >= n) selectedIndex.value = Math.max(0, n - 1)
    if (n === 0) selectedIndex.value = -1
  }
)

const selectedId = computed(() => store.filteredArticles[selectedIndex.value]?.id ?? null)

function moveSelection(dir) {
  const n = store.filteredArticles.length
  if (n === 0) return
  selectedIndex.value = Math.max(0, Math.min(n - 1, selectedIndex.value + dir))
  nextTick(() => {
    // 选中项未渲染(超出已加载范围) → 先加载更多
    if (selectedIndex.value >= visibleCount.value) loadMore()
    document.querySelector(`[data-id="${selectedId.value}"]`)?.scrollIntoView({ block: 'nearest' })
  })
}

function openSelected() {
  const a = store.filteredArticles[selectedIndex.value]
  if (a) openArticle(a)
}

function toggleReadSelected() {
  const a = store.filteredArticles[selectedIndex.value]
  if (a) store.toggleRead(a.id)
}

function onKeydown(e) {
  const t = e.target
  const typing =
    t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
  if (typing) {
    if (e.key === 'Escape') t.blur()
    return
  }
  const k = e.key
  if (k === 'j' || k === 'ArrowDown') {
    moveSelection(1)
    e.preventDefault()
  } else if (k === 'k' || k === 'ArrowUp') {
    moveSelection(-1)
    e.preventDefault()
  } else if (k === 'Enter') {
    openSelected()
    e.preventDefault()
  } else if (k === '/') {
    document.getElementById('list-search')?.focus()
    e.preventDefault()
  } else if (k === 'm') {
    if (e.shiftKey) store.markAllRead()
    else toggleReadSelected()
  } else if (k === 'r') {
    store.refreshFeeds()
  } else if (k === '?') {
    showKeys.value = !showKeys.value
  } else if (k === '1') {
    store.setFilter('all')
  } else if (k === '2') {
    store.setFilter('unread')
  } else if (k === '3') {
    store.setFilter('starred')
  }
}

function focusSearch() {
  document.getElementById('list-search')?.focus()
}

/** 悬浮菜单模式: 'ops' 操作图标 | 'search' 搜索输入 */
const fabMode = ref('ops')

/** 移动端悬浮菜单打开时回到操作图标模式 */
watch(
  () => store.fabOpen,
  (open) => {
    if (open) fabMode.value = 'ops'
  }
)

/** 进入搜索模式时聚焦输入框 */
watch(fabMode, (m) => {
  if (m === 'search') nextTick(() => document.getElementById('fab-search')?.focus())
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(searchHoverTimer)
})
</script>

<template>
  <AppShell>
    <!-- Controls Row (桌面端显示; 移动端收纳进右下角悬浮按钮) -->
    <div
      class="hidden sm:flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 w-full"
    >
      <div
        class="relative flex transition-all duration-300"
        :class="searchExpanded ? 'w-full sm:w-80' : 'w-10'"
        @mouseenter="onSearchEnter"
        @mouseleave="onSearchLeave"
      >
        <!-- 悬停展开式搜索: 常态放大镜小钮, 悬停/聚焦/有内容时展开 -->
        <div
          class="flex items-center overflow-hidden transition-all duration-300 h-10"
          :class="
            searchExpanded
              ? 'feed-input w-full rounded-full'
              : 'w-10 rounded-full border border-transparent text-on-surface-variant hover:text-primary hover:bg-white/10 dark:hover:bg-white/10 cursor-pointer'
          "
        >
          <span
            class="material-symbols-outlined flex-none cursor-pointer select-none ml-3 transition-colors"
            :class="searchExpanded ? 'text-on-surface-variant/50' : ''"
            @click="focusSearch"
          >search</span>
          <input
            id="list-search"
            :value="store.query"
            type="text"
            placeholder="搜索文章... (支持模糊)"
            class="flex-1 min-w-0 bg-transparent outline-none py-2 text-on-surface font-label-caps text-label-caps placeholder:text-on-surface-variant/50 transition-all duration-300"
            :class="searchExpanded ? 'opacity-100 pl-2 pr-4' : 'opacity-0 pointer-events-none w-0 pl-0 pr-0'"
            @input="onSearchInput"
            @focus="onSearchFocus"
            @blur="onSearchBlur"
            @keydown.escape="searchFocused = false"
          />
        </div>
        <!-- 搜索历史下拉 -->
        <Transition name="fade" :duration="150">
          <div
            v-if="searchFocused && store.searchHistory.length > 0"
            class="absolute top-full mt-1 left-0 right-0 z-30 glass-panel rounded-lg shadow-xl overflow-hidden"
          >
            <div
              class="flex items-center justify-between px-3 py-1.5 text-xs text-on-surface-variant/60 border-b border-white/5"
            >
              <span class="font-label-caps text-label-caps">最近搜索</span>
              <button class="hover:text-primary transition-colors" @mousedown.prevent="clearHistory">清空</button>
            </div>
            <button
              v-for="term in store.searchHistory"
              :key="term"
              class="w-full text-left px-3 py-1.5 text-sm text-on-surface hover:bg-white/10 transition-colors flex items-center gap-2"
              @mousedown.prevent="pickHistory(term)"
            >
              <span class="material-symbols-outlined text-[14px] text-on-surface-variant/50 flex-none">history</span>
              <span class="truncate">{{ term }}</span>
            </button>
          </div>
        </Transition>
      </div>
      <div class="flex gap-2 w-full sm:w-auto">
        <button
          class="flex-1 sm:flex-none glass-panel hover:bg-white/10 dark:hover:bg-white/10 text-on-surface px-4 py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors border border-white/5"
          @click="store.markAllRead()"
        >
          <span class="material-symbols-outlined text-[18px]">done_all</span>
          <span>标记已读</span>
        </button>
        <button
          class="flex-1 sm:flex-none glass-panel hover:bg-white/10 dark:hover:bg-white/10 text-on-surface px-4 py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors border border-white/5"
          @click="store.refreshFeeds()"
        >
          <span class="material-symbols-outlined text-[18px]" :class="{ 'animate-spin': store.loading }">refresh</span>
          <span>{{ store.loading ? '刷新中' : '刷新' }}</span>
        </button>
      </div>
    </div>

    <!-- 当前筛选提示 -->
    <Transition name="fade" :duration="200">
      <div v-if="store.activeFilterInfo" class="mb-5 -mt-2 flex items-center gap-3">
        <span class="glass-panel rounded-full px-4 py-1.5 text-sm text-primary flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px]">{{ store.activeFilterInfo.icon }}</span>
          <span class="font-medium">{{ store.activeFilterInfo.label }}</span>
        </span>
        <button
          class="text-xs text-on-surface-variant/70 hover:text-primary transition-colors flex items-center gap-1"
          @click="store.setFilter('all')"
        >
          <span class="material-symbols-outlined text-[14px]">close</span> 清除筛选
        </button>
      </div>
    </Transition>

    <!-- 提示横幅 -->
    <Transition name="fade" :duration="200">
      <div
        v-if="store.error"
        class="mb-6 px-4 py-3 rounded-lg glass-panel border border-error/30 text-error text-sm flex items-center gap-2"
      >
        <span class="material-symbols-outlined text-[18px]">info</span>
        <span class="flex-1">{{ store.error }}</span>
        <button class="hover:text-on-surface transition-colors" @click="store.error = ''">
          <span class="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </Transition>

    <!-- 空状态: 无订阅源 -->
    <EmptyState v-if="store.feeds.length === 0" />

    <!-- 加载骨架屏 -->
    <div v-else-if="store.loading" class="space-y-4 w-full">
      <article v-for="i in 3" :key="i" class="glass-panel rounded-xl p-6 flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <div class="w-6 h-6 rounded-full skeleton"></div>
          <div class="h-4 w-24 rounded skeleton"></div>
        </div>
        <div class="h-6 w-3/4 rounded skeleton mt-2"></div>
        <div class="h-4 w-full rounded skeleton"></div>
        <div class="h-4 w-1/2 rounded skeleton"></div>
      </article>
    </div>

    <!-- 无匹配结果 -->
    <div
      v-else-if="store.filteredArticles.length === 0"
      class="flex flex-col items-center justify-center py-24 text-center text-on-surface-variant"
    >
      <span class="material-symbols-outlined text-6xl opacity-40 mb-6">inbox</span>
      <p class="font-headline-sm text-headline-sm">没有匹配的文章</p>
      <p class="text-sm mt-2 opacity-70">换个筛选条件或搜索词试试</p>
    </div>

    <!-- Articles List -->
    <div v-else class="space-y-4 w-full">
      <ArticleCard
        v-for="(article, i) in visibleList"
        :key="article.id"
        :article="article"
        :selected="i === selectedIndex"
        @open="openArticle"
      />

      <!-- 分页计数与加载 -->
      <div
        v-if="store.filteredArticles.length > visibleList.length"
        class="flex flex-col items-center gap-2 py-6 text-sm text-on-surface-variant/60"
      >
        <span class="font-label-caps text-label-caps">已显示 {{ visibleList.length }} / {{ store.filteredArticles.length }} 篇</span>
        <button
          class="glass-panel px-5 py-2 rounded-full text-on-surface hover:text-primary transition-colors text-sm"
          @click="loadMore"
        >
          加载更多
        </button>
      </div>
    </div>

    <!-- 快捷键提示 -->
    <div
      v-if="store.feeds.length > 0"
      class="mt-8 pt-2 text-center text-xs text-on-surface-variant/40 font-label-caps text-label-caps"
    >
      <button class="hover:text-primary transition-colors" @click="showKeys = !showKeys">? 快捷键</button>
    </div>

    <Transition name="fade" :duration="200">
      <div
        v-if="showKeys && store.feeds.length > 0"
        class="fixed bottom-6 right-6 z-[80] glass-panel rounded-2xl p-md shadow-2xl max-w-xs"
      >
        <div class="flex items-center justify-between mb-3">
          <span class="font-headline-sm text-headline-sm font-bold text-on-surface">快捷键</span>
          <button class="text-on-surface-variant hover:text-on-surface transition-colors" @click="showKeys = false">
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-on-surface-variant">
          <span><kbd class="key">j</kbd>/<kbd class="key">k</kbd> 选择文章</span>
          <span><kbd class="key">Enter</kbd> 打开</span>
          <span><kbd class="key">/</kbd> 搜索</span>
          <span><kbd class="key">m</kbd> 已读切换</span>
          <span><kbd class="key">⇧M</kbd> 全部已读</span>
          <span><kbd class="key">r</kbd> 刷新</span>
          <span><kbd class="key">1</kbd><kbd class="key">2</kbd><kbd class="key">3</kbd> 全部/未读/星标</span>
        </div>
      </div>
    </Transition>

    <!-- 移动端: 右下角固定悬浮操作按钮 (搜索 / 标记已读 / 刷新) -->
    <div v-if="store.fabOpen" class="sm:hidden fixed inset-0 z-30" @click="store.fabOpen = false"></div>
    <div class="sm:hidden fixed bottom-24 right-4 z-40">
      <Transition name="fade" :duration="150">
        <div
          v-if="store.fabOpen"
          class="absolute bottom-full right-0 mb-3 glass-panel rounded-2xl p-2 shadow-xl border border-white/5"
          :class="fabMode === 'search' ? 'w-auto' : 'w-48'"
        >
          <!-- 操作图标行 -->
          <div v-if="fabMode === 'ops'" class="flex items-center gap-1">
            <button
              class="flex-1 h-11 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white/10 transition-colors"
              title="搜索文章"
              @click="fabMode = 'search'"
            >
              <span class="material-symbols-outlined text-[22px]">search</span>
            </button>
            <button
              class="flex-1 h-11 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white/10 transition-colors"
              title="标记已读"
              @click="store.markAllRead(); store.fabOpen = false"
            >
              <span class="material-symbols-outlined text-[22px]">done_all</span>
            </button>
            <button
              class="flex-1 h-11 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white/10 transition-colors"
              title="刷新"
              @click="store.refreshFeeds(); store.fabOpen = false"
            >
              <span class="material-symbols-outlined text-[22px]" :class="{ 'animate-spin': store.loading }"
                >refresh</span
              >
            </button>
          </div>
          <!-- 搜索输入模式: 胶囊输入框, 点击菜单外或回车关闭 -->
          <div v-else class="feed-input w-72 max-w-[calc(100vw-6rem)] rounded-full flex items-center pl-3 pr-1 py-1">
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant/50 flex-none">search</span>
            <input
              id="fab-search"
              :value="store.query"
              type="text"
              placeholder="搜索文章..."
              class="flex-1 min-w-0 bg-transparent outline-none px-2 py-1.5 text-sm text-on-surface font-label-caps text-label-caps placeholder:text-on-surface-variant/50"
              @input="onSearchInput"
              @keyup.enter="store.fabOpen = false"
            />
            <button
              v-if="store.query"
              class="flex-none w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant/60 hover:text-primary transition-colors"
              title="清空搜索"
              @click="store.query = ''"
            >
              <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
      </Transition>
      <button
        class="w-14 h-14 rounded-full glass-panel shadow-lg border border-white/5 flex items-center justify-center text-primary transition-transform active:scale-90 hover:scale-105"
        title="操作"
        @click="store.fabOpen = !store.fabOpen"
      >
        <span class="material-symbols-outlined text-[26px]">{{ store.fabOpen ? 'close' : 'more_horiz' }}</span>
      </button>
    </div>
  </AppShell>
</template>

<style scoped>
.key {
  display: inline-block;
  padding: 0 0.3em;
  margin: 0 0.1em;
  border: 1px solid var(--glass-border);
  border-bottom-width: 2px;
  border-radius: 0.25rem;
  background: var(--glass-bg);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.75rem;
  line-height: 1.4;
}
</style>

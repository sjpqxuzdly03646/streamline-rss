<script setup>
import { computed } from 'vue'
import { useReaderStore } from '../stores/reader'

const store = useReaderStore()

const FEED_FALLBACK_ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23888888"><path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>'
  )

const navItems = computed(() => [
  { key: 'all', label: '全部订阅', icon: 'inbox', badge: null, count: store.articles.length },
  { key: 'unread', label: '未读', icon: 'mark_email_unread', badge: store.unreadCount, count: store.unreadCount },
  { key: 'starred', label: '星标', icon: 'star', badge: store.starredCount, count: store.starredCount },
])

function isActive(key) {
  if (key === 'all') return store.filter === 'all'
  return store.filter === key
}

function selectNav(key) {
  store.setFilter(key)
}

/* ---- 订阅源列表 ---- */
/** 某分类下的订阅源 (树叶子) */
function feedsOf(category) {
  return store.feeds.filter((f) => (f.category || '未分类') === category)
}

/* ---- 长标题悬停滚动 (无缝循环, 不卡顿) ---- */
/** 两份文本之间的间距 (与 marquee-seam::after 的 margin-left 一致) */
const MARQUEE_GAP = 32

function startMarquee(container) {
  const text = container.querySelector('.feed-title-text')
  if (!text) return
  // 加伪元素副本后测量: 单份文本宽 = (总宽 - 间距) / 2
  text.classList.add('marquee-seam')
  const w1 = (text.scrollWidth - MARQUEE_GAP) / 2
  const overflow = w1 + MARQUEE_GAP - container.clientWidth
  if (overflow <= 0) {
    text.classList.remove('marquee-seam')
    return // 标题未溢出, 不滚动
  }
  text.classList.remove('truncate') // 滚动时完整显示, 不带省略号
  // 滚动一份文本 + 间距后, 副本恰好顶在原位 → 无缝循环
  const dist = -(w1 + MARQUEE_GAP)
  const dur = Math.max(4, Math.round(-dist / 30)) * 1000
  if (text._marqueeAnim) {
    text._marqueeAnim.cancel()
    text._marqueeAnim = null
  }
  if (typeof text.animate === 'function') {
    text._marqueeAnim = text.animate([{ marginLeft: '0px' }, { marginLeft: dist + 'px' }], {
      duration: dur,
      iterations: Infinity,
      easing: 'linear',
      fill: 'both',
    })
  } else {
    text.style.transition = `margin-left ${dur / 1000}s linear`
    requestAnimationFrame(() => {
      text.style.marginLeft = dist + 'px'
    })
  }
}

function stopMarquee(container) {
  const text = container.querySelector('.feed-title-text')
  if (!text) return
  if (text._marqueeAnim) {
    text._marqueeAnim.cancel()
    text._marqueeAnim = null
  }
  text.style.marginLeft = '0px'
  text.style.transition = 'none'
  text.classList.remove('marquee-seam')
  text.classList.add('truncate')
}
</script>

<template>
  <!-- SideNavBar (Desktop) -->
  <aside class="h-screen w-64 fixed left-0 top-0 hidden md:flex flex-col p-md glass-panel z-40 overflow-y-auto pt-10">
    <div class="mb-8 flex items-center justify-between">
      <div>
        <h1 class="font-headline-sm text-headline-sm font-bold text-primary">Streamline RSS</h1>
        <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">{{ store.unreadCount }} 条未读文章</p>
      </div>
    </div>

    <button
      class="w-full bg-white/40 hover:bg-white/60 backdrop-blur-md text-on-surface border border-white/40 transition-colors rounded-lg py-2 mb-6 flex items-center justify-center gap-2 font-label-caps text-label-caps shadow-sm dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/5"
      @click="store.modalOpen = true"
    >
      <span class="material-symbols-outlined text-[18px]">add</span> 添加订阅
    </button>

    <nav class="flex-1 space-y-2">
      <a
        v-for="item in navItems"
        :key="item.key"
        href="#"
        class="flex items-center justify-between px-3 py-2 rounded-lg transition-colors"
        :class="
          isActive(item.key)
            ? 'bg-primary/10 text-primary font-bold border border-primary/10'
            : 'text-on-surface-variant hover:bg-white/5 hover:text-on-surface border border-transparent'
        "
        @click.prevent="selectNav(item.key)"
      >
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </div>
        <span
          v-if="item.badge"
          class="text-xs px-2 py-0.5 rounded-full font-label-caps text-label-caps"
          :class="
            isActive(item.key)
              ? 'bg-primary/20 text-primary border border-primary/20'
              : 'bg-white/5 border border-white/10 text-on-surface-variant'
          "
          >{{ item.badge }}</span
        >
      </a>
    </nav>

    <div class="mt-auto pt-6 space-y-1">
      <div
        class="px-3 py-2 text-on-surface-variant/50 font-label-caps text-label-caps uppercase text-xs flex items-center justify-between"
      >
        <span>订阅分类</span>
      </div>

      <!-- 分类树: 分类为节点, 订阅源折叠其下 -->
      <div v-for="cat in store.visibleCategories" :key="cat.name">
        <div
          class="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
          :class="
            store.activeCategory === cat.name
              ? 'bg-primary/10 text-primary font-bold border border-primary/10'
              : 'text-on-surface-variant hover:bg-white/5 hover:text-on-surface border border-transparent'
          "
          @click="store.setFilter('category:' + cat.name)"
        >
          <button
            class="p-0.5 rounded transition-colors flex-none"
            :title="store.isCategoryCollapsed(cat.name) ? '展开' : '收起'"
            @click.stop="store.toggleCategory(cat.name)"
          >
            <span
              class="material-symbols-outlined text-[16px] transition-transform duration-200"
              :class="store.isCategoryCollapsed(cat.name) ? '-rotate-90 text-on-surface-variant/40' : 'text-primary'"
              >expand_more</span
            >
          </button>
          <span class="material-symbols-outlined text-[16px] flex-none">{{ cat.icon }}</span>
          <span class="truncate flex-1">{{ cat.name }}</span>
          <span
            v-if="store.categoryUnreadCount(cat.name) > 0"
            class="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/20 font-label-caps flex-none"
            >{{ store.categoryUnreadCount(cat.name) > 99 ? '99+' : store.categoryUnreadCount(cat.name) }}</span
          >
        </div>

        <!-- 分类下的订阅源 (树叶子) -->
        <div
          v-if="!store.isCategoryCollapsed(cat.name)"
          class="ml-4 space-y-0.5 border-l border-outline-variant/20 pl-1.5"
        >
          <div
            v-for="feed in feedsOf(cat.name)"
            :key="feed.id"
            class="group relative flex items-center px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            :class="
              store.activeFeed && store.activeFeed.id === feed.id
                ? 'bg-primary/10 text-primary font-bold border border-primary/10'
                : 'text-on-surface-variant hover:bg-white/5 hover:text-on-surface border border-transparent'
            "
            @click="store.setFilter('feed:' + feed.id)"
            @mouseenter="startMarquee($event.currentTarget)"
            @mouseleave="stopMarquee($event.currentTarget)"
          >
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <div class="relative flex-none">
                <img
                  :src="feed.favicon || FEED_FALLBACK_ICON"
                  alt=""
                  class="w-4 h-4 rounded-sm"
                  loading="lazy"
                  @error="$event.target.src = FEED_FALLBACK_ICON"
                />
                <span
                  v-if="store.feedUnreadCount(feed.id) > 0 && store.activeFeed?.id !== feed.id"
                  class="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-primary text-on-primary text-[9px] font-bold flex items-center justify-center leading-none shadow"
                  :title="feed.title + ' 未读 ' + store.feedUnreadCount(feed.id)"
                  >{{ store.feedUnreadCount(feed.id) > 99 ? '99+' : store.feedUnreadCount(feed.id) }}</span
                >
              </div>
              <div class="min-w-0 flex-1 overflow-hidden">
                <span
                  class="feed-title-text block truncate whitespace-nowrap overflow-hidden"
                  :data-title="feed.title"
                  >{{ feed.title }}</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      <p v-if="store.visibleCategories.length === 0" class="px-3 py-1 text-xs text-on-surface-variant/40">
        暂无分类, 点击上方「管理分类」新建
      </p>
      <p
        v-if="store.visibleCategories.length > 0 && store.feeds.length === 0"
        class="px-3 py-1 text-xs text-on-surface-variant/40"
      >
        还没有订阅, 点击「添加订阅」
      </p>
    </div>

    <div class="mt-8 border-t border-white/5 pt-6 flex justify-between px-2">
      <button
        class="text-on-surface-variant hover:text-primary transition-colors p-1"
        title="设置 (规则 / 数据)"
        @click="store.settingsOpen = true"
      >
        <span class="material-symbols-outlined">settings</span>
      </button>
      <button
        class="transition-colors p-1"
        :class="store.notificationsEnabled ? 'text-primary' : 'text-on-surface-variant hover:text-primary'"
        :title="store.notificationsEnabled ? '新文章通知已开启' : '开启新文章通知'"
        @click="store.toggleNotifications()"
      >
        <span class="material-symbols-outlined">{{
          store.notificationsEnabled ? 'notifications_active' : 'notifications_off'
        }}</span>
      </button>
      <button
        class="text-on-surface-variant hover:text-primary transition-colors p-1"
        title="切换主题"
        @click="store.toggleTheme()"
      >
        <span class="material-symbols-outlined">{{ store.isDark ? 'light_mode' : 'dark_mode' }}</span>
      </button>
    </div>
  </aside>
</template>

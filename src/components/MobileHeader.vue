<script setup>
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useReaderStore } from '../stores/reader'

const store = useReaderStore()
const router = useRouter()
const menuOpen = ref(false)

const navItems = computed(() => [
  { key: 'all', label: '全部订阅' },
  { key: 'unread', label: '未读' },
  { key: 'starred', label: '星标' },
])

function isActive(key) {
  if (key === 'all') return store.filter === 'all'
  return store.filter === key
}

function go(key) {
  store.setFilter(key)
  menuOpen.value = false
}

/** 点击未读数: 不切换筛选, 在当前列表里滚动到第一条未读 */
function jumpToUnread() {
  if (router.currentRoute.value.path !== '/') router.push('/')
  nextTick(() => {
    requestAnimationFrame(() => {
      const main = document.getElementById('main-scroll')
      const firstUnread = document.querySelector('.article:not(.read)')
      if (firstUnread) firstUnread.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else main?.scrollTo({ top: 0, behavior: 'smooth' })
    })
  })
}

function openAdd() {
  store.modalOpen = true
  menuOpen.value = false
}

function openSettings() {
  store.settingsOpen = true
  store.settingsTab = 'rules'
  menuOpen.value = false
}
</script>

<template>
  <!-- TopAppBar (Mobile) -->
  <header
    class="fixed top-0 w-full z-50 glass-panel shadow-lg md:hidden pt-[env(safe-area-inset-top)]"
  >
    <div class="flex justify-between items-center h-16 px-margin-mobile w-full max-w-full">
      <div class="flex items-center gap-2 min-w-0">
        <span class="material-symbols-outlined text-primary font-bold text-headline-md flex-none">rss_feed</span>
        <span class="font-headline-md text-headline-md font-bold text-on-surface truncate">Streamline RSS</span>
        <span
          v-if="store.unreadCount > 0"
          class="flex-none bg-primary text-on-primary text-xs font-bold min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center shadow cursor-pointer transition-transform active:scale-90"
          :title="'跳到第一条未读 (' + store.unreadCount + ' 条)'"
          @click="jumpToUnread"
          >{{ store.unreadCount > 99 ? '99+' : store.unreadCount }}</span
        >
      </div>
      <div class="flex gap-4">
        <button
          class="text-on-surface-variant hover:text-on-surface hover:bg-white/5 dark:hover:bg-white/5 transition-all duration-300 rounded-full p-1"
          @click="menuOpen = !menuOpen"
        >
          <span class="material-symbols-outlined">{{ menuOpen ? 'close' : 'menu' }}</span>
        </button>
      </div>
    </div>

    <!-- Mobile Navigation Dropdown -->
    <Transition name="fade" :duration="200">
      <nav
        v-if="menuOpen"
        class="flex flex-col glass-panel px-margin-mobile py-4 gap-4 border-t border-white/5 max-h-[calc(100dvh-4.5rem)] overflow-y-auto"
      >
        <a
          v-for="item in navItems"
          :key="item.key"
          href="#"
          class="transition-colors"
          :class="isActive(item.key) ? 'text-primary font-bold' : 'text-on-surface-variant'"
          @click.prevent="go(item.key)"
          >{{ item.label }}</a
        >

        <!-- 分类列表 (移动端无侧栏, 在此筛选分类) -->
        <template v-if="store.visibleCategories.length > 0">
          <hr class="border-outline-variant/30" />
          <div class="text-xs text-on-surface-variant/50 font-label-caps text-label-caps px-2">分类</div>
          <a
            v-for="cat in store.visibleCategories"
            :key="cat.name"
            href="#"
            class="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors"
            :class="isActive('category:' + cat.name) ? 'bg-primary/10 text-primary font-bold' : 'text-on-surface-variant'"
            @click.prevent="go('category:' + cat.name)"
          >
            <span class="material-symbols-outlined text-[16px] flex-none">{{ cat.icon }}</span>
            <span class="flex-1 truncate">{{ cat.name }}</span>
            <span
              v-if="store.categoryUnreadCount(cat.name) > 0"
              class="flex-none bg-primary/20 text-primary text-xs font-bold min-w-[20px] h-[20px] px-1 rounded-full flex items-center justify-center"
              >{{ store.categoryUnreadCount(cat.name) > 99 ? '99+' : store.categoryUnreadCount(cat.name) }}</span
            >
          </a>
        </template>

        <hr class="border-outline-variant/30" />
        <div class="flex justify-between px-2 pt-1">
          <button
            class="text-on-surface-variant hover:text-primary transition-colors p-1"
            title="添加订阅"
            @click="openAdd()"
          >
            <span class="material-symbols-outlined">add</span>
          </button>
          <button
            class="text-on-surface-variant hover:text-primary transition-colors p-1"
            title="设置 (规则 / 数据)"
            @click="openSettings()"
          >
            <span class="material-symbols-outlined">settings</span>
          </button>
          <button
            class="text-on-surface-variant hover:text-primary transition-colors p-1"
            title="切换主题"
            @click="store.toggleTheme()"
          >
            <span class="material-symbols-outlined">{{ store.isDark ? 'light_mode' : 'dark_mode' }}</span>
          </button>
        </div>
      </nav>
    </Transition>
  </header>
</template>

<script setup>
import { ref } from 'vue'
import { useReaderStore } from '../stores/reader'

const store = useReaderStore()

/** 可选分类图标 (Material Symbols) */
const ICON_CHOICES = [
  'code',
  'palette',
  'newspaper',
  'rss_feed',
  'rocket_launch',
  'science',
  'psychology',
  'auto_awesome',
  'finance_chip',
  'pets',
  'sports_esports',
  'music_note',
  'movie',
  'restaurant',
  'fitness_center',
  'travel_explore',
  'architecture',
  'forum',
  'tag',
  'star',
]

const newName = ref('')
const newIcon = ref('') // 新建分类时直接选择的图标
const showNewIconPicker = ref(false)
const editing = ref(null) // 正在重命名的分类名
const editValue = ref('')
const iconPickerFor = ref(null) // 正在选图标的分类名

function createCategory() {
  const name = newName.value.trim()
  if (store.addCategory(name)) {
    if (newIcon.value) store.setCategoryIcon(name, newIcon.value)
    newName.value = ''
    newIcon.value = ''
    showNewIconPicker.value = false
  }
}

function startRename(name) {
  editing.value = name
  editValue.value = name
}

function saveRename(name) {
  if (store.renameCategory(name, editValue.value)) editing.value = null
}

function pickIcon(name, icon) {
  store.setCategoryIcon(name, icon)
  iconPickerFor.value = null
}

/** 分类下的订阅源列表 */
function feedsOf(category) {
  return store.feeds.filter((f) => (f.category || '未分类') === category)
}

/** 未分类订阅 (无分类时兜底, 在此可移入任意分类) */
function unclassifiedFeeds() {
  return store.feeds.filter((f) => (f.category || '未分类') === '未分类')
}
</script>

<template>
  <div>
    <p class="text-sm text-on-surface-variant/70 mb-3">
      分类用于组织订阅源与筛选文章。点击分类行左侧图标可自设图标，删除分类时其订阅归入兜底。
    </p>

    <!-- 新建分类 -->
    <div class="flex gap-2 mb-3">
      <div class="relative flex-1">
        <span class="material-symbols-outlined absolute left-2.5 top-2 text-on-surface-variant/50 text-[16px]"
          >add</span
        >
        <input
          v-model="newName"
          class="w-full rounded-lg pl-8 pr-3 py-1.5 text-sm text-on-surface font-label-caps text-label-caps placeholder:text-on-surface-variant/50 bg-surface-container-low border border-outline-variant/30 outline-none transition-colors focus:border-primary focus:shadow-[var(--focus-ring)]"
          placeholder="新分类名称, 如: 效率"
          @keyup.enter="createCategory"
        />
      </div>
      <button
        class="w-9 rounded-lg flex items-center justify-center text-on-surface-variant bg-surface-container-low border border-outline-variant/30 hover:text-primary hover:border-primary/50 transition-colors flex-none"
        :class="showNewIconPicker || newIcon ? 'text-primary border-primary/50' : ''"
        :title="showNewIconPicker ? '收起图标选择' : newIcon ? '已选图标: ' + newIcon + ' (点击更换)' : '选择图标 (可选)'"
        @click="showNewIconPicker = !showNewIconPicker"
      >
        <span class="material-symbols-outlined text-[18px]">{{ newIcon || 'category' }}</span>
      </button>
      <button
        class="bg-primary/90 text-on-primary font-bold px-4 py-1.5 rounded-lg hover:bg-primary transition-colors text-sm flex items-center gap-1.5 flex-none"
        @click="createCategory"
      >
        新建
      </button>
    </div>

    <!-- 新建时的图标选择面板 -->
    <Transition name="fade" :duration="150">
      <div
        v-if="showNewIconPicker"
        class="mb-3 grid grid-cols-8 gap-1 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20"
      >
        <button
          v-for="ic in ICON_CHOICES"
          :key="ic"
          class="w-7 h-7 rounded-md flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors"
          :class="newIcon === ic ? 'bg-primary/15 text-primary' : ''"
          :title="ic"
          @click="newIcon = ic; showNewIconPicker = false"
        >
          <span class="material-symbols-outlined text-[16px]">{{ ic }}</span>
        </button>
      </div>
    </Transition>

    <!-- 分类列表 (不含"未分类") -->
    <div class="space-y-3">
      <p v-if="store.visibleCategories.length === 0" class="text-center text-sm text-on-surface-variant/50 py-8">
        还没有分类, 先新建一个吧。
      </p>
      <div
        v-for="cat in store.visibleCategories"
        :key="cat.name"
        class="rounded-xl px-sm py-2.5 bg-surface-container/70 border border-outline-variant/20"
      >
        <!-- 分类头 -->
        <div class="flex items-center gap-2">
          <!-- 图标: 点击可自设 -->
          <button
            class="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors flex-none"
            :title="'设置图标: ' + cat.name"
            @click="iconPickerFor = iconPickerFor === cat.name ? null : cat.name"
          >
            <span class="material-symbols-outlined text-[18px]">{{ cat.icon }}</span>
          </button>

          <span v-if="editing !== cat.name" class="text-sm font-medium text-on-surface flex-1 truncate">
            {{ cat.name }}
          </span>
          <span
            v-if="editing !== cat.name"
            class="text-xs text-on-surface-variant/50 font-label-caps text-label-caps flex-none"
            >{{ cat.count }} 个订阅</span
          >
          <div v-if="editing === cat.name" class="flex items-center gap-1 flex-1">
            <input
              v-model="editValue"
              class="flex-1 min-w-0 rounded-lg px-2.5 py-1 text-sm text-on-surface bg-surface-container-low border border-primary/50 outline-none"
              @keyup.enter="saveRename(cat.name)"
              @keyup.esc="editing = null"
            />
            <button
              class="p-1 rounded-full text-primary transition-colors"
              title="保存"
              @click="saveRename(cat.name)"
            >
              <span class="material-symbols-outlined text-[16px]">check</span>
            </button>
            <button
              class="p-1 rounded-full text-on-surface-variant/50 hover:text-on-surface transition-colors"
              title="取消"
              @click="editing = null"
            >
              <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
          <button
            v-if="editing !== cat.name"
            class="p-1 rounded-full text-on-surface-variant/50 hover:text-primary transition-colors"
            title="重命名"
            @click="startRename(cat.name)"
          >
            <span class="material-symbols-outlined text-[16px]">edit</span>
          </button>
          <button
            class="p-1 rounded-full text-on-surface-variant/50 hover:text-error transition-colors"
            title="删除分类 (订阅归入兜底)"
            @click="store.deleteCategory(cat.name)"
          >
            <span class="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>

        <!-- 图标选择面板 -->
        <Transition name="fade" :duration="150">
          <div
            v-if="iconPickerFor === cat.name"
            class="mt-2 grid grid-cols-8 gap-1 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20"
          >
            <button
              v-for="ic in ICON_CHOICES"
              :key="ic"
              class="w-7 h-7 rounded-md flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors"
              :class="cat.icon === ic ? 'bg-primary/15 text-primary' : ''"
              :title="ic"
              @click="pickIcon(cat.name, ic)"
            >
              <span class="material-symbols-outlined text-[16px]">{{ ic }}</span>
            </button>
          </div>
        </Transition>

        <!-- 分类下的订阅源 (只读展示, 分类切换请到「订阅源」栏目) -->
        <div v-if="feedsOf(cat.name).length > 0" class="mt-2 space-y-1.5">
          <div
            v-for="feed in feedsOf(cat.name)"
            :key="feed.id"
            class="flex items-center gap-2 text-xs text-on-surface-variant"
          >
            <span class="material-symbols-outlined text-[14px] text-on-surface-variant/40">rss_feed</span>
            <span class="flex-1 truncate">{{ feed.title }}</span>
          </div>
        </div>
      </div>

      <!-- 未分类订阅 (兜底, 可在此移动) -->
      <div
        v-if="unclassifiedFeeds().length > 0"
        class="rounded-xl px-sm py-2.5 bg-surface-container/70 border border-dashed border-outline-variant/30"
      >
        <div class="flex items-center gap-2 text-sm text-on-surface-variant/80">
          <span class="material-symbols-outlined text-[16px]">inbox</span>
          未分类订阅 ({{ unclassifiedFeeds().length }})
        </div>
        <div class="mt-2 space-y-1.5">
          <div
            v-for="feed in unclassifiedFeeds()"
            :key="feed.id"
            class="flex items-center gap-2 text-xs text-on-surface-variant"
          >
            <span class="material-symbols-outlined text-[14px] text-on-surface-variant/40">rss_feed</span>
            <span class="flex-1 truncate">{{ feed.title }}</span>
            <button
              class="p-0.5 rounded text-on-surface-variant/50 hover:text-error transition-colors"
              :title="'删除 ' + feed.title"
              @click="store.removeFeed(feed.id)"
            >
              <span class="material-symbols-outlined text-[14px]">delete</span>
            </button>
            <select
              class="rounded-md px-2 py-0.5 text-xs text-on-surface bg-surface-container-low border border-outline-variant/30 outline-none"
              value=""
              @change="store.setFeedCategory(feed.id, $event.target.value)"
            >
              <option value="" disabled>移入分类…</option>
              <option v-for="c in store.visibleCategories" :key="c.name" :value="c.name">{{ c.name }}</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

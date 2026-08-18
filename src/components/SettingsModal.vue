<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useReaderStore } from '../stores/reader'
import CategoryManager from './CategoryManager.vue'

const store = useReaderStore()

/* ============ 订阅源管理 ============ */
const FEED_FALLBACK_ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23888888"><path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>'
  )

/** 待确认删除的订阅源 (两步确认, 3 秒自动取消) */
const delFeedId = ref(null)
let delTimer = null

/** 正在弹出分类菜单的订阅源 id (同时只开一个) */
const catMenuFeed = ref(null)
/** 菜单定位 (fixed, 视口坐标; 向上下空间大的一边展开, 限高内部滚动) */
const catMenuPos = ref({ left: 0, top: null, bottom: null, maxH: 320 })
/** 分类选项: 现有分类 + 兜底「未分类」 */
const categoryOptions = computed(() => [...store.visibleCategories.map((c) => c.name), '未分类'])

/** 当前弹出菜单对应的订阅源 */
const menuFeed = computed(() => store.feeds.find((f) => f.id === catMenuFeed.value) || null)

function toggleCatMenu(feed, event) {
  if (catMenuFeed.value === feed.id) {
    catMenuFeed.value = null
    return
  }
  const chip = event.currentTarget.getBoundingClientRect()
  const below = window.innerHeight - chip.bottom - 8
  const above = chip.top - 8
  const up = below < above
  catMenuPos.value = {
    left: Math.max(8, chip.right - 150),
    top: up ? null : chip.bottom + 8, // 向下: 顶部贴 chip
    bottom: up ? window.innerHeight - chip.top + 8 : null, // 向上: 底部贴 chip, 向上生长
    maxH: Math.max(120, up ? above : below),
  }
  catMenuFeed.value = feed.id
}

function pickCategory(feed, name) {
  catMenuFeed.value = null
  store.setFeedCategory(feed.id, name)
}

function askDeleteFeed(id) {
  delFeedId.value = id
  clearTimeout(delTimer)
  delTimer = setTimeout(() => (delFeedId.value = null), 3000)
}

function confirmDeleteFeed(id) {
  clearTimeout(delTimer)
  delFeedId.value = null
  store.removeFeed(id)
}

onBeforeUnmount(() => clearTimeout(delTimer))

/* ============ 订阅规则 ============ */
const ACTIONS = [
  { value: 'read', label: '自动已读', icon: 'done_all' },
  { value: 'star', label: '自动星标', icon: 'star' },
  { value: 'hide', label: '自动隐藏', icon: 'visibility_off' },
]

const titleMatch = ref('')
const feedMatch = ref('')
const action = ref('read')

function submitRule() {
  const ok = store.addRule({ titleMatch: titleMatch.value, feedMatch: feedMatch.value, action: action.value })
  if (ok) {
    titleMatch.value = ''
    feedMatch.value = ''
    action.value = 'read'
  }
}

function actionInfo(a) {
  return ACTIONS.find((x) => x.value === a) || ACTIONS[0]
}

/* ============ 数据管理 ============ */
const msg = ref('')
const pendingRestore = ref(null)
const restoreFile = ref(null)
const opmlFile = ref(null)

/* ============ 自建 RSS 代理 ============ */
const proxyInput = ref(store.proxyUrl)
const proxyMsg = ref('')
const proxyTesting = ref(false)

function saveProxy() {
  store.setProxyUrl(proxyInput.value)
  proxyMsg.value = store.proxyUrl ? '已保存: ' + store.proxyUrl : '已清除, 将回退公共代理'
  setTimeout(() => (proxyMsg.value = ''), 3000)
}

async function testProxy() {
  const base = (proxyInput.value || '').trim().replace(/\/+$/, '')
  if (!base) {
    proxyMsg.value = '请先填写代理地址'
    return
  }
  proxyTesting.value = true
  proxyMsg.value = ''
  try {
    const res = await fetch(`${base}/api/rss?url=${encodeURIComponent('https://news.ycombinator.com/rss')}`)
    if (res.ok) {
      const text = await res.text()
      proxyMsg.value = text && text.includes('<') ? '✅ 连接成功, 代理可正常返回 RSS' : '⚠️ 代理有响应但不是 RSS 内容'
    } else {
      proxyMsg.value = `❌ 代理返回 ${res.status}, 请检查地址`
    }
  } catch {
    proxyMsg.value = '❌ 无法连接, 请检查地址与网络'
  }
  proxyTesting.value = false
  setTimeout(() => (proxyMsg.value = ''), 5000)
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function exportOPML() {
  download('streamline-feeds.opml', store.buildOPML(), 'text/xml')
  msg.value = 'OPML 已导出'
  setTimeout(() => (msg.value = ''), 2000)
}

function exportBackup() {
  const date = new Date().toISOString().slice(0, 10)
  download(`streamline-backup-${date}.json`, JSON.stringify(store.buildBackup(), null, 2), 'application/json')
  msg.value = '备份已下载'
  setTimeout(() => (msg.value = ''), 2000)
}

async function onOpmlImport(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const { ok, fail } = await store.importOPML(file)
    msg.value = `OPML 导入完成: 成功 ${ok} 个, 失败 ${fail} 个`
  } catch (err) {
    msg.value = 'OPML 导入失败: ' + err.message
  }
  setTimeout(() => (msg.value = ''), 4000)
}

function onRestoreFile(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result)
      if (!data || !Array.isArray(data.feeds) || !Array.isArray(data.articles)) {
        msg.value = '不是有效的 Streamline 备份文件'
        return
      }
      pendingRestore.value = data
      msg.value = ''
    } catch {
      msg.value = '文件解析失败, 请选择 JSON 备份'
    }
  }
  reader.readAsText(file)
}

function confirmRestore() {
  if (!pendingRestore.value) return
  const r = store.restoreBackup(pendingRestore.value)
  msg.value = r.ok ? `已恢复: ${r.feeds} 个订阅 / ${r.articles} 篇文章` : r.error || '恢复失败'
  pendingRestore.value = null
  setTimeout(() => (msg.value = ''), 3000)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" :duration="250">
      <div
        v-if="store.settingsOpen"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-margin-mobile"
        @click.self="store.settingsOpen = false"
      >
        <div
          class="modal-card glass-panel w-full max-w-lg rounded-2xl p-md md:p-xl shadow-2xl max-h-[88vh] flex flex-col"
          @click="catMenuFeed = null"
        >
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[22px]">settings</span>
              设置
            </h2>
            <button
              class="text-on-surface-variant hover:text-on-surface rounded-full p-1 transition-colors"
              @click="store.settingsOpen = false"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <!-- 标签页 -->
          <div class="flex flex-nowrap gap-0.5 mb-4 p-0.5 rounded-xl bg-surface-container/70 border border-outline-variant/20 w-full">
            <button
              class="flex-1 justify-center px-1 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-0.5 whitespace-nowrap"
              :class="
                store.settingsTab === 'rules'
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              "
              @click="store.settingsTab = 'rules'"
            >
              <span class="material-symbols-outlined text-[14px] hidden sm:inline-block">tune</span> 订阅规则
            </button>
            <button
              class="flex-1 justify-center px-1 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-0.5 whitespace-nowrap"
              :class="
                store.settingsTab === 'categories'
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              "
              @click="store.settingsTab = 'categories'"
            >
              <span class="material-symbols-outlined text-[14px] hidden sm:inline-block">category</span> 分类
            </button>
            <button
              class="flex-1 justify-center px-1 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-0.5 whitespace-nowrap"
              :class="
                store.settingsTab === 'feeds'
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              "
              @click="store.settingsTab = 'feeds'"
            >
              <span class="material-symbols-outlined text-[14px] hidden sm:inline-block">rss_feed</span> 订阅源
            </button>
            <button
              class="flex-1 justify-center px-1 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-0.5 whitespace-nowrap"
              :class="
                store.settingsTab === 'data'
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              "
              @click="store.settingsTab = 'data'"
            >
              <span class="material-symbols-outlined text-[14px] hidden sm:inline-block">database</span> 数据管理
            </button>
          </div>

          <div class="flex-1 overflow-y-auto -mx-1 px-1" @scroll="catMenuFeed = null">
            <!-- ============ 订阅规则 ============ -->
            <div v-if="store.settingsTab === 'rules'">
              <p class="text-sm text-on-surface-variant/70 mb-3">
                规则在文章抓取与刷新时自动生效：匹配条件的文章会自动已读 / 星标 / 隐藏。
              </p>

              <!-- 新增规则 -->
              <div class="rounded-xl p-sm mb-4 bg-surface-container/70 border border-outline-variant/20">
                <div class="grid sm:grid-cols-2 gap-2 mb-2">
                  <div class="relative">
                    <span
                      class="material-symbols-outlined absolute left-2.5 top-2 text-on-surface-variant/50 text-[16px]"
                      >link</span
                    >
                    <input
                      v-model="feedMatch"
                      class="w-full rounded-lg pl-8 pr-3 py-1.5 text-sm text-on-surface font-label-caps text-label-caps placeholder:text-on-surface-variant/50 bg-surface-container-low border border-outline-variant/30 outline-none transition-colors focus:border-primary focus:shadow-[var(--focus-ring)]"
                      placeholder="来源 URL 包含 (可选)"
                      @keyup.enter="submitRule"
                    />
                  </div>
                  <div class="relative">
                    <span
                      class="material-symbols-outlined absolute left-2.5 top-2 text-on-surface-variant/50 text-[16px]"
                      >title</span
                    >
                    <input
                      v-model="titleMatch"
                      class="w-full rounded-lg pl-8 pr-3 py-1.5 text-sm text-on-surface font-label-caps text-label-caps placeholder:text-on-surface-variant/50 bg-surface-container-low border border-outline-variant/30 outline-none transition-colors focus:border-primary focus:shadow-[var(--focus-ring)]"
                      placeholder="标题包含 (可选)"
                      @keyup.enter="submitRule"
                    />
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <select
                    v-model="action"
                    class="rounded-lg px-3 py-1.5 text-sm text-on-surface bg-surface-container-low border border-outline-variant/30 outline-none transition-colors focus:border-primary"
                  >
                    <option v-for="a in ACTIONS" :key="a.value" :value="a.value">{{ a.label }}</option>
                  </select>
                  <button
                    class="bg-primary/90 text-on-primary font-bold px-4 py-1.5 rounded-lg hover:bg-primary transition-colors text-sm flex items-center gap-1.5 ml-auto"
                    @click="submitRule"
                  >
                    <span class="material-symbols-outlined text-[16px]">add</span> 添加规则
                  </button>
                </div>
              </div>

              <!-- 规则列表 -->
              <div class="space-y-2">
                <p v-if="store.rules.length === 0" class="text-center text-sm text-on-surface-variant/50 py-6">
                  还没有规则。添加一条试试，例如：标题包含 “AI” → 自动星标。
                </p>
                <div
                  v-for="rule in store.rules"
                  :key="rule.id"
                  class="rounded-xl px-sm py-2.5 flex items-center gap-3 bg-surface-container/70 border border-outline-variant/20"
                >
                  <span
                    class="material-symbols-outlined text-[18px] flex-none"
                    :class="rule.enabled ? 'text-primary' : 'text-on-surface-variant/30'"
                    >{{ actionInfo(rule.action).icon }}</span
                  >
                  <div class="min-w-0 flex-1">
                    <div
                      class="text-sm font-medium truncate"
                      :class="rule.enabled ? 'text-on-surface' : 'text-on-surface-variant/50'"
                    >
                      {{ rule.name }}
                    </div>
                    <div class="text-xs text-on-surface-variant/60 font-label-caps text-label-caps mt-0.5">
                      {{ actionInfo(rule.action).label }}
                      <template v-if="rule.feedMatch"> · URL 含 “{{ rule.feedMatch }}”</template>
                      <template v-if="rule.titleMatch"> · 标题含 “{{ rule.titleMatch }}”</template>
                    </div>
                  </div>
                  <button
                    class="p-1 rounded-full transition-colors"
                    :class="rule.enabled ? 'text-primary' : 'text-on-surface-variant/40'"
                    :title="rule.enabled ? '停用' : '启用'"
                    @click="store.toggleRule(rule.id)"
                  >
                    <span class="material-symbols-outlined text-[20px]">{{
                      rule.enabled ? 'toggle_on' : 'toggle_off'
                    }}</span>
                  </button>
                  <button
                    class="p-1 rounded-full text-on-surface-variant/50 hover:text-error transition-colors"
                    title="删除规则"
                    @click="store.removeRule(rule.id)"
                  >
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>

              <div
                v-if="store.hiddenCount > 0"
                class="border-t border-outline-variant/30 pt-3 mt-3 flex items-center justify-between"
              >
                <span class="text-sm text-on-surface-variant/70">
                  已按规则隐藏 <span class="text-primary font-bold">{{ store.hiddenCount }}</span> 篇文章
                </span>
                <button
                  class="text-sm text-primary hover:underline flex items-center gap-1"
                  @click="store.clearHidden()"
                >
                  <span class="material-symbols-outlined text-[16px]">undo</span> 全部恢复
                </button>
              </div>
            </div>

            <!-- ============ 订阅源管理 ============ -->
            <div v-else-if="store.settingsTab === 'feeds'">
              <p class="text-sm text-on-surface-variant/70 mb-3">管理订阅源的分类与删除。</p>

              <p
                v-if="store.feeds.length === 0"
                class="text-center text-sm text-on-surface-variant/50 py-6"
              >
                还没有订阅, 点击「添加订阅」开始。
              </p>

              <div v-else class="space-y-2">
                <div
                  v-for="feed in store.feeds"
                  :key="feed.id"
                  class="rounded-xl px-sm py-2.5 flex items-center gap-3 bg-surface-container/70 border border-outline-variant/20 relative"
                >
                  <img
                    :src="feed.favicon || FEED_FALLBACK_ICON"
                    alt=""
                    class="w-5 h-5 rounded-sm flex-none"
                    loading="lazy"
                    @error="$event.target.src = FEED_FALLBACK_ICON"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium truncate text-on-surface">{{ feed.title }}</div>
                    <div class="text-xs text-on-surface-variant/60 font-label-caps text-label-caps mt-0.5 truncate">
                      {{ feed.url }}
                    </div>
                  </div>
                  <div class="relative flex-none">
                    <button
                      class="flex items-center gap-1 rounded-full pl-2 pr-1.5 py-1 text-xs text-on-surface-variant bg-surface-container-low border border-outline-variant/30 hover:border-primary/50 hover:text-primary transition-colors"
                      title="修改分类"
                      @click.stop="toggleCatMenu(feed, $event)"
                    >
                      <span class="material-symbols-outlined text-[14px]">folder</span>
                      <span class="max-w-[90px] truncate">{{ feed.category || '未分类' }}</span>
                      <span class="material-symbols-outlined text-[16px]">arrow_drop_down</span>
                    </button>
                  </div>
                  <button
                    class="flex-none h-8 min-w-8 px-1 rounded-full flex items-center justify-center transition-colors"
                    :class="
                      delFeedId === feed.id
                        ? 'bg-error/10 text-error text-xs font-bold px-2 gap-0.5'
                        : 'text-on-surface-variant/50 hover:text-error'
                    "
                    :title="delFeedId === feed.id ? '确认删除' : '删除订阅'"
                    @click="delFeedId === feed.id ? confirmDeleteFeed(feed.id) : askDeleteFeed(feed.id)"
                  >
                    <span class="material-symbols-outlined text-[18px] leading-none">{{
                      delFeedId === feed.id ? 'check' : 'delete'
                    }}</span>
                    <template v-if="delFeedId === feed.id">删除</template>
                  </button>
                </div>
              </div>
            </div>

            <!-- ============ 分类管理 ============ -->
            <div v-else-if="store.settingsTab === 'categories'">
              <CategoryManager />
            </div>

            <!-- ============ 数据管理 ============ -->
            <div v-else>
              <!-- 自建 RSS 代理 -->
              <div class="rounded-xl p-sm mb-4 bg-surface-container/70 border border-outline-variant/20">
                <div class="text-sm font-medium text-on-surface mb-1 flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-primary text-[16px]">cloud</span>
                  自建 RSS 代理 (Cloudflare Worker)
                </div>
                <p class="text-xs text-on-surface-variant/60 mb-2">
                  抓取优先走自己的 Worker (稳定/快/隐私可控), 失败自动回退公共代理。留空则不用。
                </p>
                <div class="flex gap-2">
                  <input
                    v-model="proxyInput"
                    class="flex-1 min-w-0 rounded-lg px-3 py-1.5 text-sm text-on-surface font-label-caps text-label-caps placeholder:text-on-surface-variant/50 bg-surface-container-low border border-outline-variant/30 outline-none transition-colors focus:border-primary focus:shadow-[var(--focus-ring)]"
                    placeholder="https://你的子域.workers.dev"
                    @keyup.enter="saveProxy"
                  />
                  <button
                    class="bg-primary/90 text-on-primary font-bold px-3 py-1.5 rounded-lg hover:bg-primary transition-colors text-sm"
                    @click="saveProxy"
                  >
                    保存
                  </button>
                  <button
                    class="bg-surface-container-low border border-outline-variant/30 text-on-surface px-3 py-1.5 rounded-lg hover:bg-surface-container-high transition-colors text-sm flex items-center gap-1"
                    :disabled="proxyTesting"
                    @click="testProxy"
                  >
                    <span v-if="proxyTesting" class="material-symbols-outlined text-[14px] animate-spin"
                      >autorenew</span
                    >
                    <template v-else
                      ><span class="material-symbols-outlined text-[14px]">wifi_tethering</span> 测试</template
                    >
                  </button>
                </div>
                <p v-if="proxyMsg" class="mt-2 text-xs text-primary">{{ proxyMsg }}</p>
              </div>

              <p class="text-sm text-on-surface-variant/70 mb-4">
                订阅与阅读数据都存在浏览器本地, 可导出备份、导入 OPML 或迁移到其他设备。
              </p>

              <div class="space-y-2.5">
                <button
                  class="w-full flex items-center gap-3 rounded-xl px-sm py-2.5 bg-surface-container/70 border border-outline-variant/20 text-sm text-on-surface hover:border-primary/40 transition-colors"
                  @click="exportOPML"
                >
                  <span class="material-symbols-outlined text-primary text-[18px]">rss_feed</span>
                  <span class="flex-1 text-left">
                    <span class="block font-medium">导出 OPML</span>
                    <span class="block text-xs text-on-surface-variant/60">订阅源列表, 可导入其他阅读器</span>
                  </span>
                  <span class="material-symbols-outlined text-on-surface-variant/40 text-[18px]">download</span>
                </button>

                <button
                  class="w-full flex items-center gap-3 rounded-xl px-sm py-2.5 bg-surface-container/70 border border-outline-variant/20 text-sm text-on-surface hover:border-primary/40 transition-colors"
                  @click="opmlFile?.click()"
                >
                  <span class="material-symbols-outlined text-primary text-[18px]">upload_file</span>
                  <span class="flex-1 text-left">
                    <span class="block font-medium">导入 OPML</span>
                    <span class="block text-xs text-on-surface-variant/60">从其他阅读器迁移订阅</span>
                  </span>
                  <span class="material-symbols-outlined text-on-surface-variant/40 text-[18px]">upload</span>
                </button>
                <input
                  ref="opmlFile"
                  type="file"
                  accept=".opml,.xml,text/x-opml"
                  class="hidden"
                  @change="onOpmlImport"
                />

                <button
                  class="w-full flex items-center gap-3 rounded-xl px-sm py-2.5 bg-surface-container/70 border border-outline-variant/20 text-sm text-on-surface hover:border-primary/40 transition-colors"
                  @click="exportBackup"
                >
                  <span class="material-symbols-outlined text-primary text-[18px]">save</span>
                  <span class="flex-1 text-left">
                    <span class="block font-medium">备份全部数据 (JSON)</span>
                    <span class="block text-xs text-on-surface-variant/60"
                      >订阅 / 文章 / 已读 / 星标 / 规则 / 分类</span
                    >
                  </span>
                  <span class="material-symbols-outlined text-on-surface-variant/40 text-[18px]">download</span>
                </button>

                <button
                  class="w-full flex items-center gap-3 rounded-xl px-sm py-2.5 bg-surface-container/70 border border-outline-variant/20 text-sm text-on-surface hover:border-primary/40 transition-colors"
                  @click="restoreFile?.click()"
                >
                  <span class="material-symbols-outlined text-primary text-[18px]">restore</span>
                  <span class="flex-1 text-left">
                    <span class="block font-medium">从备份恢复</span>
                    <span class="block text-xs text-on-surface-variant/60">选择 JSON 备份并覆盖当前数据</span>
                  </span>
                  <span class="material-symbols-outlined text-on-surface-variant/40 text-[18px]">upload_file</span>
                </button>
                <input
                  ref="restoreFile"
                  type="file"
                  accept=".json,application/json"
                  class="hidden"
                  @change="onRestoreFile"
                />
              </div>

              <!-- 恢复确认 -->
              <div
                v-if="pendingRestore"
                class="mt-3 rounded-xl px-sm py-2.5 bg-error-container/20 border border-error/30 text-sm"
              >
                <p class="text-on-surface mb-2">
                  将覆盖当前数据: <span class="font-bold text-primary">{{ pendingRestore.feeds.length }}</span> 个订阅 /
                  <span class="font-bold text-primary">{{ pendingRestore.articles.length }}</span> 篇文章
                </p>
                <div class="flex gap-2">
                  <button
                    class="flex-1 bg-error/90 text-on-error font-bold px-3 py-1.5 rounded-lg text-sm hover:bg-error transition-colors"
                    @click="confirmRestore"
                  >
                    确认恢复
                  </button>
                  <button
                    class="flex-1 bg-surface-container-low border border-outline-variant/30 text-on-surface px-3 py-1.5 rounded-lg text-sm hover:bg-surface-container-high transition-colors"
                    @click="pendingRestore = null"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          </div>

          <p v-if="msg" class="mt-3 text-sm text-primary">{{ msg }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 分类菜单: 挂在 body 下, fixed 定位, 不受弹窗滚动容器裁剪 -->
  <Teleport to="body">
    <div
      v-if="menuFeed"
      class="fixed z-[110] glass-panel rounded-lg shadow-xl overflow-y-auto py-1 min-w-[150px]"
      :style="{
        left: catMenuPos.left + 'px',
        top: catMenuPos.top === null ? 'auto' : catMenuPos.top + 'px',
        bottom: catMenuPos.bottom === null ? 'auto' : catMenuPos.bottom + 'px',
        maxHeight: catMenuPos.maxH + 'px',
      }"
    >
      <button
        v-for="c in categoryOptions"
        :key="c"
        class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-on-surface hover:bg-white/10 transition-colors text-left"
        @click="pickCategory(menuFeed, c)"
      >
        <span
          class="material-symbols-outlined text-[14px] flex-none"
          :class="(menuFeed.category || '未分类') === c ? 'text-primary' : 'text-transparent'"
          >check</span
        >
        <span class="flex-1 truncate" :class="(menuFeed.category || '未分类') === c ? 'text-primary font-medium' : ''">{{
          c
        }}</span>
      </button>
    </div>
  </Teleport>
</template>

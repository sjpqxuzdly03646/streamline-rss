<script setup>
import { ref, watch } from 'vue'
import { useReaderStore } from '../stores/reader'

const store = useReaderStore()
const url = ref('')
const category = ref(store.visibleCategories[0]?.name || '未分类')

const EXAMPLES = [
  { label: 'Hacker News', url: 'https://news.ycombinator.com/rss' },
  { label: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { label: 'GitHub 状态', url: 'https://www.githubstatus.com/feed' },
]

watch(
  () => store.modalOpen,
  (open) => {
    if (open) {
      store.addError = ''
      url.value = ''
      category.value = store.visibleCategories[0]?.name || '未分类'
    }
  }
)

async function submit() {
  if (store.adding) return
  const ok = await store.addFeed(url.value, category.value)
  if (ok) store.modalOpen = false
}

function addExample(u) {
  url.value = u
  submit()
}

const opmlInput = ref(null)

async function onOpmlChange(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  try {
    const { ok, fail } = await store.importOPML(file)
    store.addError = `OPML 导入完成: 成功 ${ok} 个, 失败 ${fail} 个`
    if (fail === 0) store.modalOpen = false
  } catch (err) {
    store.addError = 'OPML 导入失败: ' + err.message
  }
  e.target.value = ''
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" :duration="250">
      <div
        v-if="store.modalOpen"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-margin-mobile"
        @click.self="store.modalOpen = false"
      >
        <div class="modal-card glass-panel w-full max-w-lg rounded-2xl p-md md:p-xl shadow-2xl">
          <div class="flex items-center justify-between mb-6">
            <h2 class="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[22px]">rss_feed</span>
              添加订阅
            </h2>
            <button
              class="text-on-surface-variant hover:text-on-surface rounded-full p-1 transition-colors"
              @click="store.modalOpen = false"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <div class="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              v-model="url"
              class="flex-1 rounded-lg px-4 py-3 text-on-surface font-label-caps text-label-caps placeholder:text-on-surface-variant/50 bg-surface-container-low border border-outline-variant/30 outline-none transition-colors focus:border-primary focus:shadow-[var(--focus-ring)]"
              placeholder="https://example.com/rss"
              type="url"
              @keyup.enter="submit"
            />
            <select
              v-model="category"
              class="rounded-lg px-3 py-3 text-sm text-on-surface bg-surface-container-low border border-outline-variant/30 outline-none transition-colors focus:border-primary"
              title="订阅分类"
            >
              <option v-for="c in store.visibleCategories" :key="c.name" :value="c.name">{{ c.name }}</option>
            </select>
            <button
              class="bg-primary/90 text-on-primary font-bold px-6 py-3 rounded-lg hover:bg-primary transition-colors whitespace-nowrap flex items-center justify-center gap-2"
              :disabled="store.adding"
              @click="submit"
            >
              <span v-if="store.adding" class="material-symbols-outlined animate-spin text-[18px]">autorenew</span>
              <template v-else><span class="material-symbols-outlined text-[18px]">add</span> 添加</template>
            </button>
          </div>

          <div v-if="store.addError" class="mb-4 text-error text-sm flex items-start gap-2">
            <span class="material-symbols-outlined text-[16px] mt-0.5">error</span>
            <span>{{ store.addError }}</span>
          </div>

          <p class="text-sm text-on-surface-variant/60 mb-3">快速示例：</p>
          <div class="flex flex-wrap gap-2 mb-6">
            <button
              v-for="ex in EXAMPLES"
              :key="ex.url"
              class="glass-panel text-on-surface px-3 py-1.5 rounded-full text-xs hover:bg-white/10 dark:hover:bg-white/10 transition-colors"
              @click="addExample(ex.url)"
            >
              {{ ex.label }}
            </button>
          </div>

          <div class="border-t border-outline-variant/30 pt-4 flex items-center justify-between">
            <button
              class="text-on-surface-variant hover:text-primary transition-colors text-sm flex items-center gap-2"
              @click="opmlInput?.click()"
            >
              <span class="material-symbols-outlined text-[18px]">upload_file</span> 从 OPML 导入
            </button>
            <button
              class="text-on-surface-variant hover:text-primary transition-colors text-sm flex items-center gap-2"
              @click="store.modalOpen = false"
            >
              <span class="material-symbols-outlined text-[18px]">close</span> 关闭
            </button>
          </div>

          <input ref="opmlInput" type="file" accept=".opml,.xml,text/x-opml" class="hidden" @change="onOpmlChange" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

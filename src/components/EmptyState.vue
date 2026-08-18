<script setup>
import { ref } from 'vue'
import { useReaderStore } from '../stores/reader'

const store = useReaderStore()
const url = ref('')
const busy = ref(false)

const EXAMPLES = [
  { label: 'Hacker News', url: 'https://news.ycombinator.com/rss' },
  { label: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { label: 'GitHub 状态', url: 'https://www.githubstatus.com/feed' },
]

async function submit() {
  if (busy.value) return
  busy.value = true
  store.addError = ''
  const ok = await store.addFeed(url.value)
  busy.value = false
  if (ok) url.value = ''
}

async function addExample(u) {
  if (busy.value) return
  busy.value = true
  await store.addFeed(u)
  busy.value = false
}
</script>

<template>
  <div class="flex-1 flex-col items-center justify-center py-20 text-center flex">
    <div
      class="w-24 h-24 mb-8 rounded-full glass-panel flex items-center justify-center text-on-surface-variant border border-white/5"
    >
      <span class="material-symbols-outlined text-5xl opacity-50">rss_feed</span>
    </div>
    <h2 class="font-display-lg text-display-lg text-on-surface mb-6">欢迎来到 Streamline</h2>
    <p class="font-body-lg text-body-lg text-on-surface-variant max-w-md mx-auto mb-10">
      您的订阅列表为空。添加订阅源 URL 或导入 OPML 文件，开始您的阅读之旅。
    </p>

    <div class="flex flex-col sm:flex-row gap-4 w-full max-w-lg mb-10">
      <input
        v-model="url"
        class="feed-input flex-1 rounded-lg px-4 py-3 text-on-surface font-label-caps text-label-caps placeholder:text-on-surface-variant/50"
        placeholder="https://example.com/rss"
        type="url"
        @keyup.enter="submit"
      />
      <button
        class="bg-primary/90 text-on-primary font-bold px-6 py-3 rounded-lg hover:bg-primary transition-colors whitespace-nowrap shadow-[0_0_15px_rgba(255,181,160,0.3)] flex items-center justify-center gap-2"
        :disabled="busy"
        @click="submit"
      >
        <span v-if="busy" class="material-symbols-outlined animate-spin text-[18px]">autorenew</span>
        <template v-else>添加订阅</template>
      </button>
    </div>

    <p v-if="store.addError" class="text-error text-sm mb-4">{{ store.addError }}</p>

    <p class="text-sm text-on-surface-variant/50 mb-4">或者试试点这些真实订阅源：</p>
    <div class="flex flex-wrap justify-center gap-3">
      <button
        v-for="ex in EXAMPLES"
        :key="ex.url"
        class="glass-panel text-on-surface px-4 py-2 rounded-full text-xs hover:bg-white/10 dark:hover:bg-white/10 transition-colors"
        @click="addExample(ex.url)"
      >
        {{ ex.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useReaderStore } from '../stores/reader'
import { relativeTime, faviconUrl } from '../utils/rss'

const props = defineProps({
  article: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})
const emit = defineEmits(['open'])

const store = useReaderStore()

const isRead = computed(() => store.readSet.has(props.article.id))
const favicon = computed(() => faviconUrl(props.article.sourceUrl))

const FALLBACK_ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23888888"><path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>'
  )

function onMove(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`)
  e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`)
}
</script>

<template>
  <article
    :data-id="article.id"
    class="article glass-panel hover-glow transition-transform-colors rounded-xl p-6 cursor-pointer relative group scroll-mt-[calc(4.5rem+env(safe-area-inset-top))]"
    :class="[
      isRead ? 'read' : 'hover:border-primary/30 hover:-translate-y-1',
      selected ? 'ring-2 ring-primary/50 border-primary/40' : '',
    ]"
    @click="emit('open', article)"
    @mousemove="onMove"
  >
    <!-- 未读脉冲点 (内联在头部行尾部, 与预设静态稿一致, 避免与时间戳重叠) -->
    <div class="flex items-center gap-3 mb-2">
      <img
        :src="favicon"
        alt=""
        class="w-5 h-5 rounded-sm bg-white/5 dark:bg-white/5 p-0.5 flex-none"
        loading="lazy"
        @error="$event.target.src = FALLBACK_ICON"
      />
      <span class="font-label-caps text-label-caps text-on-surface-variant truncate min-w-0 flex-1">{{
        article.sourceTitle
      }}</span>
      <span class="text-on-surface-variant/40 text-xs ml-auto whitespace-nowrap flex-none">{{
        relativeTime(article.date)
      }}</span>
      <div
        v-if="!isRead"
        class="w-2 h-2 rounded-full bg-primary unread-pulse flex-none shadow-[0_0_8px_rgba(255,181,160,0.6)]"
      ></div>
    </div>

    <h3
      class="font-headline-md-mobile md:font-headline-md text-headline-md-mobile md:text-headline-md leading-tight mb-2 pr-4"
      :class="isRead ? '' : 'font-bold text-on-surface group-hover:text-primary transition-colors'"
    >
      {{ article.title }}
    </h3>

    <p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 leading-relaxed">
      {{ article.snippet }}
    </p>

    <div
      v-if="!isRead"
      class="flex items-center text-primary text-xs font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity mt-4"
    >
      <span>阅读全文</span>
      <span class="material-symbols-outlined text-sm ml-1">arrow_forward</span>
    </div>
  </article>
</template>

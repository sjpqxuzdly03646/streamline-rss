<script setup>
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { useReaderStore } from './stores/reader'

const route = useRoute()
const store = useReaderStore()

// PWA 未读角标: 安装到桌面/主屏后, 图标显示未读数 (Badge API, Chromium 系支持)
watch(
  () => store.unreadCount,
  (n) => {
    try {
      if (n > 0) navigator.setAppBadge?.(n)
      else navigator.clearAppBadge?.()
    } catch {
      /* 不支持时静默忽略 */
    }
  },
  { immediate: true } // 挂载时用当前未读数立即设置
)
</script>

<template>
  <router-view v-slot="{ Component }">
    <!-- :key 保证路由切换必然重建组件实例; :duration 兜底超时, 防止 transitionend 事件
         异常时过渡挂起导致视图永远不切换 -->
    <transition name="page" mode="out-in" :duration="250">
      <component :is="Component" :key="route.path" />
    </transition>
  </router-view>
</template>
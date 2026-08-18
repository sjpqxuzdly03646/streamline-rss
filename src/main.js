import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useReaderStore } from './stores/reader'
import './assets/main.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 在挂载前初始化主题与本地数据, 避免首屏闪烁
const store = useReaderStore()
store.init()
store.startAutoRefresh() // 15 分钟静默自动刷新 + 新文章通知

app.mount('#app')

import { createRouter, createWebHashHistory } from 'vue-router'

// 路由懒加载: 按需分包, 首屏只加载列表页
const ListView = () => import('../views/ListView.vue')
const ArticleView = () => import('../views/ArticleView.vue')

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'list', component: ListView },
    { path: '/article/:id', name: 'article', component: ArticleView, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router

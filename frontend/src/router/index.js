import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: { name: 'dashboard' }
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: '总览', icon: '□' }
  },
  {
    path: '/plan',
    name: 'plan',
    component: () => import('@/views/PlanView.vue'),
    meta: { title: '计划', icon: '☑' }
  },
  {
    path: '/ledger',
    name: 'ledger',
    component: () => import('@/views/LedgerView.vue'),
    meta: { title: '记账', icon: '¤' }
  },
  {
    path: '/mood',
    name: 'mood',
    component: () => import('@/views/MoodView.vue'),
    meta: { title: '心情', icon: '◉' }
  },
  {
    path: '/news',
    name: 'news',
    component: () => import('@/views/NewsView.vue'),
    meta: { title: '热点', icon: '✦' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '设置', icon: '⚙' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

export default router

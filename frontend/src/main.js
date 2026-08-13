import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

/* Global styles — order matters: variables → base → atmosphere → animations → components */
import '@/assets/styles/variables.css'
import '@/assets/styles/themes.css'
import '@/assets/styles/base.css'
import '@/assets/styles/atmosphere.css'
import '@/assets/styles/animations.css'
import '@/assets/styles/components.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

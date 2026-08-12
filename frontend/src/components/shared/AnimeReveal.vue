<script setup>
import { ref, onMounted } from 'vue'
import { useAnime } from '@/composables/useAnime'

const props = defineProps({
  preset: { type: String, default: 'staggerFadeUp' },
  selector: { type: String, default: '.reveal-item' },
  delay: { type: Number, default: 0 }
})

const wrapper = ref(null)
const { staggerEnter } = useAnime()

onMounted(() => {
  setTimeout(() => {
    if (wrapper.value) {
      staggerEnter(props.selector, wrapper.value, props.preset)
    }
  }, props.delay)
})
</script>

<template>
  <div ref="wrapper" class="anime-reveal">
    <slot />
  </div>
</template>

<style scoped>
.anime-reveal {
  display: contents;
}
</style>

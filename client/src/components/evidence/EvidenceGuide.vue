<template>
  <div class="ev-guide" :class="{ collapsed }">
    <div
      class="ev-guide-hd"
      :class="{ 'ev-guide-hd--interactive': isMobile }"
      :role="isMobile ? 'button' : undefined"
      :tabindex="isMobile ? 0 : undefined"
      :aria-expanded="isMobile ? !collapsed : undefined"
      @click="toggleCollapsed"
      @keydown.enter.prevent="toggleCollapsed"
      @keydown.space.prevent="toggleCollapsed"
    >
      <div class="ev-guide-hd-ic">🗺</div>
      <div class="ev-guide-hd-t">证据搜集指引</div>
      <div class="ev-guide-toggle" aria-hidden="true">▾</div>
    </div>
    <div class="ev-guide-body">
      <div v-for="item in guide" :key="item.group" class="eg-item">
        <div class="eg-name">{{ item.group }}</div>
        <div class="eg-desc">{{ item.guide || item.desc }}</div>
      </div>
      <div v-if="!guide?.length" style="color:var(--gray2);font-size:12.5px;padding:8px 0">
        保存案情后将自动生成专属指引
      </div>
    </div>
    <div class="ev-guide-ft">💡 建议在维权初期即保存好原始文件，勿截图后删除原件</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

defineProps({ guide: { type: Array, default: () => [] } })

const MOBILE_MQ = '(max-width: 700px)'

const collapsed = ref(true)
const isMobile = ref(false)

let mq

function syncMq() {
  if (!mq) return
  isMobile.value = mq.matches
  if (!mq.matches) collapsed.value = false
}

function toggleCollapsed() {
  if (!isMobile.value) return
  collapsed.value = !collapsed.value
}

onMounted(() => {
  mq = window.matchMedia(MOBILE_MQ)
  syncMq()
  mq.addEventListener('change', syncMq)
})

onUnmounted(() => {
  if (mq) mq.removeEventListener('change', syncMq)
})
</script>

<template>
  <div class="evi" :class="{inv: isDraft}" @click="handlePreview">
    <div class="evi-th">
      <img v-if="thumbUrl" :src="thumbUrl" alt="" />
      <span v-else>{{ ev.mimetype?.includes('pdf') ? '📄' : '🖼' }}</span>
    </div>
    <div class="evi-info">
      <div class="evi-n">
        {{ ev.filename }}
        <span v-if="ev.isDemo" class="evi-demo-badge">示例</span>
      </div>
      <div class="evi-tg">{{ isDraft ? '⚠ 归类待定' : '✅ ' + ev.evType }}</div>
      <div class="evi-v">{{ ev.verdict }}</div>
    </div>
    <button class="evi-del" @click.stop="$emit('delete', ev.id)">🗑</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  ev:      { type: Object, required: true },
  isDraft: { type: Boolean, default: false },
})
const emit = defineEmits(['delete', 'preview'])

const thumbUrl = computed(() => {
  if (props.ev.isDemo) return null
  if (!props.ev.filepath) return null
  return `/uploads/${props.ev.filepath}`
})

function handlePreview() {
  if (!thumbUrl.value) return
  emit('preview', props.ev)
}
</script>

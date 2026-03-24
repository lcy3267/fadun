<template>
  <div class="evi" :class="{inv: isDraft}" @click="handlePreview">
    <div class="evi-th">
      <img v-if="thumbUrl" :src="thumbUrl" alt="" />
      <span v-else>{{ fileIcon }}</span>
    </div>
    <div class="evi-info">
      <div class="evi-n">
        {{ ev.filename }}
        <span v-if="ev.isDemo" class="evi-demo-badge">示例</span>
      </div>
      <div class="evi-tg">{{ isPending ? '⏳ 待认证' : isDraft ? '⚠ 归类待定' : '✅ ' + (ev.evType || '—') }}</div>
      <div class="evi-v">{{ ev.verdict || (isPending ? '上传后请选择并点击「进行证据归类认证」' : '') }}</div>
    </div>
    <button class="evi-del" @click.stop="$emit('delete', ev.id)">🗑</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  ev:       { type: Object, required: true },
  isDraft:  { type: Boolean, default: false },
  isPending: { type: Boolean, default: false },
})
const emit = defineEmits(['delete', 'preview'])

const isImage = computed(() => (props.ev.mimetype || '').startsWith('image/'))
const fileIcon = computed(() => {
  const type = (props.ev.mimetype || '').toLowerCase()
  if (type.includes('pdf')) return '📄'
  if (type.includes('word') || type.includes('document') || type.includes('docx')) return '📝'
  if (type.startsWith('text/')) return '📃'
  return '📎'
})

const thumbUrl = computed(() => {
  if (!isImage.value) return null
  if (props.ev.isDemo) return null
  if (!props.ev.filepath) return null
  return `/uploads/${props.ev.filepath}`
})

function handlePreview() {
  if (!isImage.value) return
  if (!thumbUrl.value) return
  emit('preview', props.ev)
}
</script>

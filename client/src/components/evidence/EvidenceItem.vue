<template>
  <div class="evi" :class="{inv: isDraft}" @click="handlePreview">
    <div class="evi-th">
      <EvidenceImage
        v-if="showImageThumb"
        :evidence-id="ev.id"
        alt=""
      />
      <span v-else>{{ fileIcon }}</span>
    </div>
    <div class="evi-info">
      <div class="evi-n">
        <span class="evi-id">#{{ ev.id }}</span>
        <span class="evi-name" :title="ev.filename">{{ ev.filename }}</span>
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
import EvidenceImage from './EvidenceImage.vue'
import { isImageKind, isImagePreviewable } from '@/utils/evidenceKind.js'

const props = defineProps({
  ev:       { type: Object, required: true },
  isDraft:  { type: Boolean, default: false },
  isPending: { type: Boolean, default: false },
})
const emit = defineEmits(['delete', 'preview'])

const isImage = computed(() => isImageKind(props.ev))
const showImageThumb = computed(() => isImagePreviewable(props.ev))
const fileIcon = computed(() => {
  const type = (props.ev.mimetype || '').toLowerCase()
  if (type.includes('pdf')) return '📄'
  if (type.includes('word') || type.includes('document') || type.includes('docx')) return '📝'
  if (type.startsWith('text/')) return '📃'
  return '📎'
})

function handlePreview() {
  if (!isImagePreviewable(props.ev)) return
  emit('preview', props.ev)
}
</script>

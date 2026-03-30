<template>
  <img v-if="src" :src="src" alt="" v-bind="$attrs" />
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import api from '@/api/client.js'

const props = defineProps({
  /** 支持接口返回 number 或序列化后的 string */
  evidenceId: { type: [Number, String], required: true },
})

const src = ref('')
let objectUrl = null
let loadSeq = 0

function clearBlob() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
  src.value = ''
}

async function load() {
  const id = Number(props.evidenceId)
  if (!Number.isFinite(id) || id <= 0) {
    clearBlob()
    return
  }

  const seq = ++loadSeq
  clearBlob()

  try {
    const blob = await api.get(`/evidence/uploads/${id}`, { responseType: 'blob' })
    if (seq !== loadSeq) return
    if (!(blob instanceof Blob) || blob.size === 0) return
    objectUrl = URL.createObjectURL(blob)
    src.value = objectUrl
  } catch {
    if (seq !== loadSeq) return
    clearBlob()
  }
}

watch(
  () => props.evidenceId,
  () => {
    void load()
  },
  { immediate: true }
)

onUnmounted(() => {
  loadSeq += 1
  clearBlob()
})
</script>

<template>
  <div>
    <div
      class="upl"
      :class="{drag: isDragging}"
      @click="fileInput.click()"
      @dragover.prevent="isDragging=true"
      @dragleave="isDragging=false"
      @drop.prevent="onDrop"
    >
      <div class="upl-ic">📤</div>
      <div class="upl-t"><strong>点击或拖拽</strong>上传证据截图</div>
      <div class="upl-s">支持 JPG、PNG · 支持多选 · AI 自动分析证明力并归类</div>
    </div>
    <input ref="fileInput" type="file" multiple accept="image/*" style="display:none" @change="onFiles" />

    <!-- Progress -->
    <div v-if="uploading" class="ev-progress">
      <div class="ep-row">
        <span class="ep-txt">{{ progressText }}</span>
        <span style="font-size:11.5px;color:var(--gray2)">AI 分析中</span>
      </div>
      <div class="ep-bar">
        <div class="ep-fill" :style="{width: uploadPct+'%'}"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { uploadEvidence } from '@/api/evidence.js'

const props = defineProps({ caseId: Number, caseInfo: Object })
const emit  = defineEmits(['uploaded'])

const fileInput  = ref(null)
const isDragging = ref(false)
const uploading  = ref(false)
const uploadPct  = ref(0)
const progressText = ref('正在上传并分析…')

const BATCH = 8

function onFiles(e) { processFiles(Array.from(e.target.files)); e.target.value = '' }
function onDrop(e)  { isDragging.value = false; processFiles(Array.from(e.dataTransfer.files)) }

async function processFiles(files) {
  const imgs = files.filter(f => f.type.startsWith('image/'))
  if (!imgs.length) return

  uploading.value = true
  uploadPct.value = 0

  const all = []
  // Split into batches and send sequentially (server handles Claude concurrency)
  for (let i = 0; i < imgs.length; i += BATCH) {
    const batch = imgs.slice(i, i + BATCH)
    progressText.value = `已分析 ${Math.min(i, imgs.length)} / ${imgs.length} 张`
    const results = await uploadEvidence(props.caseId, batch, (ev) => {
      const base = (i / imgs.length) * 100
      const chunk = (batch.length / imgs.length) * 100
      uploadPct.value = Math.round(base + (ev.loaded / ev.total) * chunk * 0.5)
    })
    all.push(...results)
    uploadPct.value = Math.round(((i + batch.length) / imgs.length) * 100)
  }

  uploading.value = false
  emit('uploaded', all)
}
</script>

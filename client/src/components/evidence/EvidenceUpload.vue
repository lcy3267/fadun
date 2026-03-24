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
      <div class="upl-s">支持 JPG/PNG/PDF/DOCX/TXT · 支持多选 · 上传后后台自动解析</div>
    </div>
    <input ref="fileInput" type="file" multiple accept="image/*,.pdf,.docx,.txt" style="display:none" @change="onFiles" />

    <!-- Progress -->
    <div v-if="uploading" class="ev-progress">
      <div class="ep-row">
        <span class="ep-txt">{{ progressText }}</span>
        <span style="font-size:11.5px;color:var(--gray2)">{{ phaseLabel }}</span>
      </div>
      <div class="ep-bar">
        <div class="ep-fill" :style="{width: uploadPct+'%'}"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import imageCompression from 'browser-image-compression'
import { uploadEvidence } from '@/api/evidence.js'
import { useToast } from '@/composables/useToast.js'

const props = defineProps({ caseId: Number, caseInfo: Object })
const emit  = defineEmits(['uploaded'])
const { toast } = useToast()

const fileInput  = ref(null)
const isDragging = ref(false)
const uploading  = ref(false)
const uploadPct  = ref(0)
const progressText = ref('正在上传…')
const phase = ref('compress') // 'compress' | 'upload'
const phaseLabel = computed(() => phase.value === 'compress' ? '压缩中' : '上传中')

const BATCH = 8
const MAX_SIZE_KB = 200
const SKIP_COMPRESS_KB = 150

async function compressImage(file) {
  if (file.size <= SKIP_COMPRESS_KB * 1024) return file
  const options = {
    maxSizeMB: MAX_SIZE_KB / 1024,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.85,
  }
  const out = await imageCompression(file, options)
  const baseName = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image'
  return new File([out], `${baseName}.jpg`, { type: 'image/jpeg' })
}

function onFiles(e) { processFiles(Array.from(e.target.files)); e.target.value = '' }
function onDrop(e)  { isDragging.value = false; processFiles(Array.from(e.dataTransfer.files)) }

async function processFiles(files) {
  if (!files.length) return
  const imgs = files.filter(f => f.type.startsWith('image/'))
  const others = files.filter(f => !f.type.startsWith('image/'))

  uploading.value = true
  uploadPct.value = 0

  try {
    phase.value = 'compress'
    progressText.value = `压缩中 0 / ${imgs.length} 张`
    const compressed = []
    for (let i = 0; i < imgs.length; i++) {
      const out = await compressImage(imgs[i])
      compressed.push(out)
      uploadPct.value = Math.round(((i + 1) / imgs.length) * 50)
      progressText.value = `压缩中 ${i + 1} / ${imgs.length} 张`
    }

    const payloadFiles = [...compressed, ...others]

    phase.value = 'upload'
    const all = []
    for (let i = 0; i < payloadFiles.length; i += BATCH) {
      const batch = payloadFiles.slice(i, i + BATCH)
      progressText.value = `已上传 ${Math.min(i, payloadFiles.length)} / ${payloadFiles.length} 份`
      const res = await uploadEvidence(props.caseId, batch, (ev) => {
        const base = 50 + (i / payloadFiles.length) * 50
        const chunk = (batch.length / payloadFiles.length) * 50
        uploadPct.value = Math.round(base + (ev.loaded / ev.total) * chunk)
      })
      all.push(...(res?.created || []))
      uploadPct.value = Math.round(((i + batch.length) / payloadFiles.length) * 50 + 50)
    }

    emit('uploaded', all)
  } catch (e) {
    toast(e?.message || '上传失败，请重试')
  } finally {
    uploading.value = false
    uploadPct.value = 0
    progressText.value = '正在上传…'
  }
}
</script>

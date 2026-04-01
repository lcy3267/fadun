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
      <div class="upl-s">支持 JPG/PNG/PDF/DOCX/TXT/XLSX · 支持多选 · 上传后后台自动解析</div>
    </div>
    <input ref="fileInput" type="file" multiple accept="image/*,.pdf,.docx,.txt,.xlsx" style="display:none" @change="onFiles" />

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

    <!-- 公开数据抓取入口由开关控制；后端 API 仍保留，便于后续再开 -->
    <div v-if="SHOW_PUBLIC_FETCH_UI" class="u-fetch">
      <button type="button" class="btn btn-g btn-sm" @click="showFetch = !showFetch">
        {{ showFetch ? '收起公开抓取' : '抓取公开证据' }}
      </button>
    </div>

    <div v-if="SHOW_PUBLIC_FETCH_UI && showFetch" class="u-fetch-form">
      <div class="u-fetch-row">
        <input v-model.trim="fetchForm.companyName" placeholder="企业名称（必填）" />
      </div>
      <div class="u-fetch-row">
        <input v-model.trim="fetchForm.uscc" placeholder="统一社会信用代码（可选）" />
      </div>
      <div class="u-fetch-row">
        <input
          v-model.trim="fetchForm.keywords"
          placeholder="关键词（可选，逗号分隔，如 劳动争议,拖欠工资）"
        />
      </div>
      <div class="u-fetch-row" style="display:flex;gap:8px">
        <input v-model.number="fetchForm.limit" type="number" min="1" max="50" placeholder="数量上限" />
        <button type="button" class="btn btn-p btn-sm" :disabled="fetching" @click="runPublicFetch">
          {{ fetching ? '抓取中…' : '开始抓取' }}
        </button>
      </div>
      <div v-if="fetching" class="u-fetch-status">{{ fetchStatus }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import imageCompression from 'browser-image-compression'
import { uploadEvidence } from '@/api/evidence.js'
import { useToast } from '@/composables/useToast.js'
import { useCasesStore } from '@/stores/cases.js'
import { streamTask } from '@/api/tasks.js'

/** 设为 true 可恢复证据区的「抓取公开证据」表单（后端 `POST /api/evidence/public-fetch` 仍可用） */
const SHOW_PUBLIC_FETCH_UI = false

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
const store = useCasesStore()
const showFetch = ref(false)
const fetching = ref(false)
const fetchStatus = ref('')
const fetchForm = ref({
  companyName: '',
  uscc: '',
  keywords: '',
  limit: 20,
})

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

async function runPublicFetch() {
  if (!props.caseId) return
  const companyName = String(fetchForm.value.companyName || '').trim()
  if (!companyName) {
    toast('请填写企业名称')
    return
  }
  const keywords = String(fetchForm.value.keywords || '')
    .split(/[，,]/)
    .map((x) => x.trim())
    .filter(Boolean)

  fetching.value = true
  fetchStatus.value = '任务提交中…'
  try {
    const { taskId } = await store.runPublicEvidenceFetch({
      caseId: props.caseId,
      targets: ['company_profile', 'similar_cases'],
      limit: Number(fetchForm.value.limit || 20),
      subject: {
        companyName,
        uscc: String(fetchForm.value.uscc || '').trim(),
        keywords,
      },
    })
    if (!taskId) throw new Error('未返回任务ID')

    const es = streamTask(taskId, {
      onProgress: ({ task }) => {
        if (task?.status === 'failed') {
          fetchStatus.value = task?.error || '抓取失败'
          es.close()
          fetching.value = false
        } else {
          fetchStatus.value = `进行中 ${Number(task?.progress || 0)}%`
        }
      },
      onItemDone: (evt) => {
        const map = {
          planning: '规划中',
          fetching: '抓取中',
          filtering: '筛选中',
          writing: '入库中',
        }
        fetchStatus.value = map[evt?.step] || fetchStatus.value
      },
      onAllDone: async () => {
        es.close()
        fetching.value = false
        fetchStatus.value = '抓取完成'
        await store.fetchCase(props.caseId)
        toast('公开证据抓取完成，请在候选区确认')
      },
      onTaskError: (evt) => {
        es.close()
        fetching.value = false
        fetchStatus.value = evt?.message || '抓取失败'
        toast(`抓取失败：${evt?.message || '未知错误'}`)
      },
      onError: () => {
        es.close()
        fetching.value = false
      },
    })
  } catch (e) {
    fetching.value = false
    fetchStatus.value = ''
    toast(e?.response?.data?.error || e?.message || '提交抓取失败')
  }
}
</script>

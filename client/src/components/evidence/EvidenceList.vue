<template>
  <div>
    <!-- 待认证：仅缩略图 + 复选框，无文字说明；支持全选 -->
    <div v-if="pendingEvidence.length" class="pending-section">
      <div class="pending-hd">
        <span class="evs-t">待认证 {{ pendingEvidence.length }} 张</span>
        <button type="button" class="btn btn-g btn-sm" @click="toggleSelectAll">
          {{ isAllPendingSelected ? '取消全选' : '全选' }}
        </button>
      </div>
      <div class="pending-list">
        <div v-for="[kind, evs] in pendingByKind" :key="`pending-${kind}`" style="margin-bottom:8px">
          <div style="font-size:12px;color:var(--gray2);margin:2px 2px 6px">{{ kindLabel(kind) }} · {{ evs.length }}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <label
              v-for="ev in evs"
              :key="ev.id"
              class="pending-item"
              :class="{ selected: selectedIds.includes(ev.id), processing: isProcessing(ev.id) }"
            >
              <input type="checkbox" :value="ev.id" v-model="selectedIds" :disabled="isProcessing(ev.id)" @click.stop />
              <div class="pending-thumb" style="position:relative" @click.stop="onPendingPreview(ev)">
                <img v-if="!ev.isDemo && ev.filepath && kind === 'image'" :src="`/uploads/${ev.filepath}`" alt="" />
                <span v-else>{{ kindIcon(kind) }}</span>
                <div
                  v-if="isProcessing(ev.id)"
                  style="position:absolute;inset:0;border-radius:8px;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;"
                >
                  <span class="spin pending-spin" style="border-color:rgba(255,255,255,.35);border-top-color:#fff"></span>
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>
      <div class="pending-actions">
        <button
          class="btn btn-p btn-sm"
          :disabled="!selectedIds.length"
          @click="handleVerify"
        >
          {{ activeTaskCount > 0 ? `继续加入认证队列（已选 ${selectedIds.length}）` : `进行证据归类认证（已选 ${selectedIds.length}）` }}
        </button>
        <button
          type="button"
          class="btn btn-danger btn-sm"
          :disabled="!selectedIds.length"
          @click="handleDeleteSelected"
        >
          删除已选
        </button>
      </div>
    </div>

    <div class="evs-hd">
      <div class="evs-t">证据清单</div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="tag t-green">有效 {{ validEvidence.length }}</span>
        <span v-if="draftEvidence.length" class="tag t-gray">草稿箱 {{ draftEvidence.length }}</span>
        <button
          v-if="canDownload"
          class="btn btn-g btn-sm"
          style="margin-left:6px"
          @click="$emit('download')"
        >
          下载证据
        </button>
      </div>
    </div>

    <!-- 已识别：按分组展示 -->
    <div v-if="props.groups.length">
      <div v-for="[group, evs] in groupedEntries" :key="group" class="evg" :class="{col: collapsed[group]}">
        <div class="evg-h" @click="collapsed[group]=!collapsed[group]">
          <span style="font-size:15px">📂</span>
          <span class="evg-n">{{ group }}</span>
          <span class="evg-c">{{ evs.length }} 份</span>
          <span class="evg-arr">▾</span>
        </div>
        <div class="evg-b">
          <div v-for="[kind, byType] in groupByKind(evs)" :key="`${group}-${kind}`" style="margin-bottom:6px">
            <div style="font-size:12px;color:var(--gray2);margin:2px 2px 4px">{{ kindLabel(kind) }} · {{ byType.length }}</div>
            <EvidenceItem
              v-for="ev in byType"
              :key="ev.id"
              :ev="ev"
              @delete="$emit('deleted', ev.id)"
              @preview="$emit('preview', ev)"
            />
          </div>
          <div v-if="!evs.length" class="empty-ev" style="margin:6px 4px 10px;font-size:11.5px;color:var(--gray2);">
            暂无该分组下的证据，上传截图后将自动归类到此处
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty-ev">暂无已归类证据，上传后选择「待认证」图片进行证据归类认证</div>

    <!-- Draft box -->
    <div v-if="draftEvidence.length" class="draft">
      <div class="draft-h">📦 草稿箱 <span style="font-weight:400;font-size:12px">— AI 未能归类的证据</span></div>
      <div v-for="[kind, evs] in draftByKind" :key="`draft-${kind}`" style="margin-bottom:8px">
        <div style="font-size:12px;color:var(--gray2);margin:2px 2px 4px">{{ kindLabel(kind) }} · {{ evs.length }}</div>
        <EvidenceItem
          v-for="ev in evs"
          :key="ev.id"
          :ev="ev"
          :is-draft="true"
          @delete="$emit('deleted', ev.id)"
          @preview="$emit('preview', ev)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import EvidenceItem from './EvidenceItem.vue'
import { useCasesStore } from '@/stores/cases.js'
import { useToast } from '@/composables/useToast.js'
import { streamTask } from '@/api/tasks.js'

const props = defineProps({
  caseId:   Number,
  evidence: { type: Array, default: () => [] },
  groups:   { type: Array, default: () => [] },
  canDownload: { type: Boolean, default: false },
})
const emit = defineEmits(['deleted', 'preview', 'download', 'verified'])

const store = useCasesStore()
const { toast } = useToast()
const collapsed = reactive({})
const selectedIds = ref([])
const KIND_ORDER = ['image', 'docx', 'pdf', 'txt', 'other']
const processingIds = ref([])
const activeTaskCount = ref(0)

// 待认证：未 AI 识别的（aiVerified 为 false 或 status 为 pending）
const pendingEvidence = computed(() =>
  props.evidence.filter(e => !e.aiVerified || e.status === 'pending')
)
const pendingByKind = computed(() => groupByKind(pendingEvidence.value))

const isAllPendingSelected = computed(() => {
  const pending = pendingEvidence.value
  if (!pending.length) return false
  return pending.every(e => selectedIds.value.includes(e.id))
})

function toggleSelectAll() {
  const pending = pendingEvidence.value
  if (isAllPendingSelected.value) {
    selectedIds.value = []
  } else {
    selectedIds.value = pending.map(e => e.id)
  }
}

function onPendingPreview(ev) {
  if (!(ev.mimetype || '').startsWith('image/')) return
  if (ev.isDemo || !ev.filepath) return
  emit('preview', ev)
}

function getFileKind(ev) {
  const mime = (ev?.mimetype || '').toLowerCase()
  const ext = (ev?.ext || '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.includes('pdf') || ext === '.pdf') return 'pdf'
  if (mime.includes('word') || mime.includes('document') || ext === '.docx' || ext === '.doc') return 'docx'
  if (mime.startsWith('text/') || ext === '.txt') return 'txt'
  return 'other'
}

function groupByKind(list) {
  const map = new Map(KIND_ORDER.map(k => [k, []]))
  list.forEach(ev => {
    map.get(getFileKind(ev)).push(ev)
  })
  return [...map.entries()].filter(([, evs]) => evs.length > 0)
}

function kindLabel(kind) {
  if (kind === 'image') return '图片'
  if (kind === 'docx') return 'Word'
  if (kind === 'pdf') return 'PDF'
  if (kind === 'txt') return 'TXT'
  return '其他'
}

function kindIcon(kind) {
  if (kind === 'image') return '🖼'
  if (kind === 'docx') return '📝'
  if (kind === 'pdf') return '📄'
  if (kind === 'txt') return '📃'
  return '📎'
}

// 已识别的证据中：有效 + 草稿（仅统计 aiVerified 的）
const verifiedEvidence = computed(() => props.evidence.filter(e => e.aiVerified))

const validEvidence = computed(() => verifiedEvidence.value.filter(e => e.status === 'valid'))
const draftEvidence = computed(() => {
  return verifiedEvidence.value.filter(e => {
    if (e.status === 'invalid') return true
    const hasGroupMatch  = !!(e.group && props.groups.includes(e.group))
    const hasTypeMatch   = !!(e.evType && props.groups.includes(e.evType))
    return !hasGroupMatch && !hasTypeMatch
  })
})
const draftByKind = computed(() => groupByKind(draftEvidence.value))

const groupedEntries = computed(() => {
  const map = new Map()
  props.groups.forEach(g => map.set(g, []))
  validEvidence.value.forEach(ev => {
    let target = null
    if (ev.group && map.has(ev.group)) {
      target = ev.group
    } else if (ev.evType && map.has(ev.evType)) {
      target = ev.evType
    }
    if (target) {
      map.get(target).push(ev)
    }
  })
  return [...map.entries()]
})

async function handleVerify() {
  if (!selectedIds.value.length || !props.caseId) return
  const ids = [...new Set(selectedIds.value)].filter(id => !processingIds.value.includes(id))
  if (!ids.length) {
    toast('所选文件已在认证队列中')
    return
  }
  processingIds.value = [...new Set([...processingIds.value, ...ids])]
  selectedIds.value = selectedIds.value.filter(id => !ids.includes(id))
  try {
    const { taskId } = await store.verifyEvidence(props.caseId, ids)
    if (!taskId) throw new Error('未返回任务 ID')
    activeTaskCount.value += 1

    const finishVerify = async (message, isError = false) => {
      await store.fetchCase(props.caseId)
      processingIds.value = processingIds.value.filter(id => !ids.includes(id))
      activeTaskCount.value = Math.max(0, activeTaskCount.value - 1)
      if (message) toast((isError ? '认证失败：' : '✅ ') + message)
      emit('verified', [])
    }

    const es = streamTask(taskId, {
      onProgress: ({ task }) => {
        if (task?.status === 'failed') {
          es.close()
          finishVerify(task?.error || '任务失败', true)
        }
        if (task?.status === 'succeeded' && Number(task?.progress) >= 100) {
          es.close()
          finishVerify('证据认证任务已完成')
        }
      },
      onItemDone: () => {
      },
      onTaskError: (evt) => {
        es.close()
        finishVerify(evt?.message || '未知错误', true)
      },
      onAllDone: async () => {
        es.close()
        await finishVerify('证据认证任务已完成')
      },
      onError: () => {
        es.close()
        processingIds.value = processingIds.value.filter(id => !ids.includes(id))
        activeTaskCount.value = Math.max(0, activeTaskCount.value - 1)
      },
    })
  } catch (e) {
    processingIds.value = processingIds.value.filter(id => !ids.includes(id))
    toast('认证失败：' + (e?.response?.data?.error || e?.message || '未知错误'))
  }
}

async function handleDeleteSelected() {
  if (!selectedIds.value.length || !props.caseId) return
  try {
    for (const id of selectedIds.value) {
      await store.deleteEvidence(props.caseId, id)
    }
    const n = selectedIds.value.length
    selectedIds.value = []
    toast(`已删除 ${n} 张待认证图片`)
  } catch (e) {
    toast('删除失败：' + (e?.response?.data?.error || e?.message || '未知错误'))
  }
}

function isProcessing(id) {
  return processingIds.value.includes(id)
}
</script>

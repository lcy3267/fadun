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
        <label
          v-for="ev in pendingEvidence"
          :key="ev.id"
          class="pending-item"
          :class="{ selected: selectedIds.includes(ev.id) }"
        >
          <input type="checkbox" :value="ev.id" v-model="selectedIds" @click.stop />
          <div class="pending-thumb" @click.stop="onPendingPreview(ev)">
            <img v-if="!ev.isDemo && ev.filepath" :src="`/uploads/${ev.filepath}`" alt="" />
            <span v-else>🖼</span>
          </div>
        </label>
      </div>
      <div class="pending-actions">
        <button
          class="btn btn-p btn-sm"
          :disabled="!selectedIds.length || verifying"
          @click="handleVerify"
        >
          <span v-if="verifying" class="spin pending-spin"></span>
          {{ verifying ? '认证中…' : `进行证据归类认证（已选 ${selectedIds.length}）` }}
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
          <EvidenceItem
            v-for="ev in evs"
            :key="ev.id"
            :ev="ev"
            @delete="$emit('deleted', ev.id)"
            @preview="$emit('preview', ev)"
          />
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
      <EvidenceItem
        v-for="ev in draftEvidence"
        :key="ev.id"
        :ev="ev"
        :is-draft="true"
        @delete="$emit('deleted', ev.id)"
        @preview="$emit('preview', ev)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import EvidenceItem from './EvidenceItem.vue'
import { useCasesStore } from '@/stores/cases.js'
import { useToast } from '@/composables/useToast.js'

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
const verifying = ref(false)

// 待认证：未 AI 识别的（aiVerified 为 false 或 status 为 pending）
const pendingEvidence = computed(() =>
  props.evidence.filter(e => !e.aiVerified || e.status === 'pending')
)

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
  if (ev.isDemo || !ev.filepath) return
  emit('preview', ev)
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
  verifying.value = true
  try {
    const updated = await store.verifyEvidence(props.caseId, selectedIds.value)
    selectedIds.value = []
    toast(`✅ 已认证 ${updated.length} 份证据，${updated.filter(e => e.status === 'valid').length} 份有效`)
    emit('verified', updated)
  } catch (e) {
    toast('认证失败：' + (e?.response?.data?.error || e?.message || '未知错误'))
  } finally {
    verifying.value = false
  }
}
</script>

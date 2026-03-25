<template>
  <BaseModal v-model="open" :title="'AI日志（案件助手）'" :lg="true">
    <div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <div style="font-size:12.5px;color:var(--gray2)">
          选择一个 AgentRun 查看执行轨迹：
        </div>
        <div style="min-width:260px;flex:1">
          <select v-model="selectedRunId" class="sel" :disabled="loadingRuns || !runs.length">
            <option v-for="r in runs" :key="r.id" :value="r.id">
              {{ formatRunLabel(r) }}
            </option>
          </select>
        </div>
        <div style="font-size:12px;color:var(--gray2)">
          当前：{{ selectedRunId ? selectedRunId : '—' }}
        </div>
      </div>

      <div v-if="loadingDetail" class="aia-loading">
        <span class="spin" style="border-color:rgba(139,26,26,.2);border-top-color:var(--seal)"></span>
        加载日志中…
      </div>

      <div v-else>
        <div v-if="run?.error" class="warnbox">
          <div style="font-weight:700;margin-bottom:6px">AgentRun 失败</div>
          <div style="white-space:pre-wrap">{{ run.error }}</div>
        </div>

        <div v-if="!run?.messages?.length" style="font-size:12.5px;color:var(--gray2)">
          暂无执行轨迹数据
        </div>

        <div v-else class="trace-list">
          <div v-for="(m, idx) in run.messages" :key="idx" class="trace-item">
            <div class="trace-top">
              <span class="trace-type" :class="typeClass(m.type)">{{ m.type || 'unknown' }}</span>
              <span class="trace-name" v-if="m.name">· {{ m.name }}</span>
            </div>
            <div v-if="m.args" class="trace-body">
              <div class="trace-sub">args</div>
              <pre class="trace-pre">{{ safePretty(m.args) }}</pre>
            </div>
            <div v-if="m.result" class="trace-body">
              <div class="trace-sub">result</div>
              <pre class="trace-pre">{{ safePretty(m.result) }}</pre>
            </div>
            <div v-if="m.content" class="trace-body">
              <div class="trace-sub">content</div>
              <pre class="trace-pre">{{ m.content }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { listAgentRuns, getAgentRun } from '@/api/agentRuns.js'
import { useToast } from '@/composables/useToast.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  caseId: { type: Number, default: null },
  defaultRunId: { type: Number, default: null },
})

const emit = defineEmits(['update:modelValue'])
const { toast } = useToast()

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const runs = ref([])
const selectedRunId = ref(null)
const loadingRuns = ref(false)
const loadingDetail = ref(false)
const run = ref(null)

function safePretty(v) {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function formatRunLabel(r) {
  const t = r?.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : ''
  const st = r?.status || ''
  const p = r?.progress ?? 0
  return `${t} · ${st} · ${p}% · ${r.lastTool || ''}`
}

function typeClass(t) {
  const s = String(t || '')
  if (s === 'tool_call') return 'tcall'
  if (s === 'tool_result') return 'tresult'
  if (s === 'model') return 'tmodel'
  if (s === 'tool_step') return 'tstep'
  return 'tother'
}

async function fetchRuns() {
  if (!props.caseId) return
  loadingRuns.value = true
  try {
    const rs = await listAgentRuns(props.caseId)
    runs.value = Array.isArray(rs) ? rs : []
    if (!runs.value.length) {
      selectedRunId.value = null
      run.value = null
      return
    }
    const pick = props.defaultRunId && runs.value.some(r => r.id === props.defaultRunId)
      ? props.defaultRunId
      : runs.value[0].id
    selectedRunId.value = pick
  } catch (e) {
    toast('加载 AI 日志失败：' + (e?.response?.data?.error || e?.message || '未知错误'))
  } finally {
    loadingRuns.value = false
  }
}

async function fetchDetail(runId) {
  if (!runId) return
  loadingDetail.value = true
  try {
    run.value = await getAgentRun(runId)
  } catch (e) {
    toast('加载日志详情失败：' + (e?.response?.data?.error || e?.message || '未知错误'))
    run.value = null
  } finally {
    loadingDetail.value = false
  }
}

watch(open, (v) => {
  if (v) fetchRuns()
})

watch(selectedRunId, (v) => {
  if (v) fetchDetail(v)
})
</script>

<style scoped>
.trace-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.trace-item {
  padding: 12px;
  border: 1px solid rgba(139, 26, 26, 0.14);
  border-radius: 10px;
  background: rgba(255, 250, 247, 0.75);
}

.trace-top {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.trace-type {
  font-size: 12px;
  font-weight: 700;
}

.tcall {
  color: #7c3aed;
}

.tresult {
  color: #0f766e;
}

.tmodel {
  color: #b45309;
}

.tstep {
  color: #2563eb;
}

.tother {
  color: var(--ink2);
}

.trace-name {
  font-size: 12px;
  color: var(--gray2);
}

.trace-body {
  margin-top: 6px;
}

.trace-sub {
  font-size: 11.5px;
  color: var(--gray2);
  margin-bottom: 4px;
}

.trace-pre {
  margin: 0;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.5;
}

.warnbox {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(185, 28, 28, 0.25);
  background: rgba(185, 28, 28, 0.06);
  margin-bottom: 10px;
  color: var(--ink);
}
</style>


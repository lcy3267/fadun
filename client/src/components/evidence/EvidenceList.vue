<template>
  <div>
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

    <!-- Grouped evidence -->
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
    <div v-else class="empty-ev">暂无已归类证据，上传截图后 AI 将自动分析并归类</div>

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
import { computed, reactive } from 'vue'
import EvidenceItem from './EvidenceItem.vue'

const props = defineProps({
  caseId:   Number,
  evidence: { type: Array, default: () => [] },
  groups:   { type: Array, default: () => [] },
  canDownload: { type: Boolean, default: false },
})
const emit = defineEmits(['deleted', 'preview', 'download'])

const collapsed = reactive({})

const validEvidence = computed(() => props.evidence.filter(e => e.status === 'valid'))
const draftEvidence = computed(() => {
  return props.evidence.filter(e => {
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
</script>

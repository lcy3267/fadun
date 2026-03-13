<template>
  <div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <h2 class="serif" style="font-size:20px;color:var(--seal)">我的案件</h2>
      <button class="btn btn-p" @click="$emit('create')">＋ 新建案件</button>
    </div>

    <div v-if="store.loading" style="padding:40px;text-align:center;color:var(--gray2)">
      <span class="spin"></span> 加载中…
    </div>

    <div v-else-if="!store.cases.length" style="padding:60px;text-align:center;color:var(--gray2)">
      <div style="font-size:36px;margin-bottom:12px">📁</div>
      <div>还没有案件，点击右上方「新建案件」开始维权</div>
    </div>

    <div v-else style="display:flex;flex-direction:column;gap:12px">
      <div
        v-for="c in store.cases" :key="c.id"
        class="case-card"
        @click="$emit('open', c)"
      >
        <div v-if="c.isDemo" class="case-demo-badge">示例</div>
        <div style="display:flex;align-items:flex-start;gap:14px">
          <div class="case-card-ic">{{ ICONS[c.type] || '📁' }}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <div class="case-card-type">{{ c.type }}</div>
              <span class="tag" :class="c.status==='done'?'t-green':'t-red'">
                {{ c.status === 'done' ? '✓ 已完结' : '● 进行中' }}
              </span>
            </div>
            <div class="case-card-meta">{{ c.plaintiff?.name }} 诉 {{ c.defendant?.name }} · {{ c.goal }}</div>
            <div class="case-card-meta" style="margin-top:4px">创建 {{ fmtDate(c.createdAt) }} · 更新 {{ fmtDate(c.updatedAt) }}</div>
          </div>
          <div style="font-size:13px;color:var(--gray2)">{{ validCount(c) }} 份证据</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useCasesStore } from '@/stores/cases.js'

defineEmits(['open', 'create'])

const store = useCasesStore()
const ICONS = { '网络侵权':'📱', '劳动纠纷':'💼', '消费维权':'🛍', '合同纠纷':'📝', '婚姻家庭':'🏠', '人身损害':'🏥', '其他':'📁' }

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('zh-CN') : '—' }
function validCount(c) { return (c.evidence || []).filter(e => e.status === 'valid').length }
</script>

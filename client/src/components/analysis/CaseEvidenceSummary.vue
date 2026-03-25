<template>
  <div class="aia">
    <div v-if="!summary" class="aia-loading">
      <span class="spin" style="border-color:rgba(139,26,26,.2);border-top-color:var(--seal)"></span>
      暂无案件综述
    </div>

    <div v-else class="aia-body">
      <div class="aia-sec">
        <div class="aia-sec-t">核心事实还原</div>
        <div class="aia-sec-c">{{ summary.factSummary || '暂无' }}</div>
      </div>

      <div class="aia-sec">
        <div class="aia-sec-t">胜诉概率评估</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:4px">
          <div style="flex:1">
            <div class="aia-bar">
              <div class="aia-bar-fill" :style="{width: strength + '%', background: barColor}"></div>
            </div>
          </div>
          <span style="font-size:13px;font-weight:700" :style="{ color: barColor }">{{ strength }}%</span>
        </div>
        <div style="font-size:12px;margin-top:3px" :style="{ color: barColor }">
          {{ strengthLabel }} · {{ summary.strengthNote || '暂无说明' }}
        </div>
      </div>

      <div class="aia-sec">
        <div class="aia-sec-t">证据互证与薄弱点</div>
        <div class="aia-tags">
          <span v-for="k in strongList" :key="`s-${k}`" class="aia-tag ok">{{ k }}</span>
          <span v-for="k in weakList" :key="`w-${k}`" class="aia-tag warn">{{ k }}</span>
          <span v-if="!strongList.length && !weakList.length" class="aia-sec-c">暂无</span>
        </div>
      </div>

      <div class="aia-sec">
        <div class="aia-sec-t">关键证据缺口</div>
        <div v-if="summary.evidenceGaps?.length">
          <div v-for="(g, idx) in summary.evidenceGaps" :key="idx" class="gap-item">
            <div class="gap-title">{{ idx + 1 }}. {{ g.title || '待补充' }}</div>
            <div class="gap-detail">{{ g.detail || '暂无说明' }}</div>
          </div>
        </div>
        <div v-else class="aia-sec-c">当前无明显缺口</div>
      </div>

      <div class="aia-sec">
        <div class="aia-sec-t">关键法律要点</div>
        <div class="aia-tags">
          <span v-for="k in summary.keyPoints || []" :key="k" class="aia-tag ok">{{ k }}</span>
          <span v-if="!summary.keyPoints?.length" class="aia-sec-c">暂无</span>
        </div>
      </div>

      <div class="aia-sec">
        <div class="aia-sec-t">主要风险</div>
        <div class="aia-tags">
          <span v-for="r in summary.risks || []" :key="r" class="aia-tag warn">{{ r }}</span>
          <span v-if="!summary.risks?.length" class="aia-sec-c">暂无</span>
        </div>
      </div>

      <div class="aia-sec aia-suggest">
        <div class="aia-sec-t" style="color:var(--gold)">建议行动</div>
        <div class="aia-sec-c">{{ summary.suggestion || '暂无建议' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ summary: { type: Object, default: null } })

const strength = computed(() => {
  const s = Number(props.summary?.strength || 0)
  return Number.isFinite(s) ? Math.max(0, Math.min(100, Math.round(s))) : 0
})
const strongList = computed(() => props.summary?.crossCheck?.strong || [])
const weakList = computed(() => props.summary?.crossCheck?.weak || [])
const barColor = computed(() => {
  const s = strength.value
  return s >= 70 ? '#1a6b3a' : s >= 45 ? '#c2590a' : '#b91c1c'
})
const strengthLabel = computed(() => {
  const s = strength.value
  return s >= 70 ? '胜诉可能性较高' : s >= 45 ? '胜诉可能性中等' : '需补充关键证据'
})
</script>

<style scoped>
.gap-item {
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid rgba(139, 26, 26, 0.15);
  border-radius: 10px;
  background: #fffaf7;
}
.gap-title {
  font-weight: 700;
  color: var(--ink);
  font-size: 13px;
}
.gap-detail {
  margin-top: 4px;
  color: var(--ink2);
  font-size: 12px;
  line-height: 1.6;
}
</style>

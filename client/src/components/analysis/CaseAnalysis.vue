<template>
  <div class="aia">
    <div v-if="!analysis" class="aia-loading">
      <span class="spin" style="border-color:rgba(139,26,26,.2);border-top-color:var(--seal)"></span>
      暂无分析数据
    </div>

    <div v-else class="aia-body">
      <!-- Summary -->
      <div class="aia-sec">
        <div class="aia-sec-t">案情概要</div>
        <div class="aia-sec-c">{{ analysis.summary }}</div>
      </div>

      <!-- Strength -->
      <div class="aia-sec">
        <div class="aia-sec-t">胜诉可能性</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:4px">
          <div style="flex:1">
            <div class="aia-bar">
              <div class="aia-bar-fill" :style="{width:analysis.strength+'%',background:barColor}"></div>
            </div>
          </div>
          <span style="font-size:13px;font-weight:700" :style="{color:barColor}">{{ analysis.strength }}分</span>
        </div>
        <div style="font-size:12px;margin-top:3px" :style="{color:barColor}">
          {{ strengthLabel }} · {{ analysis.strengthNote }}
        </div>
      </div>

      <!-- Key Points -->
      <div class="aia-sec">
        <div class="aia-sec-t">关键法律要点</div>
        <div class="aia-tags">
          <span v-for="k in analysis.keyPoints" :key="k" class="aia-tag ok">{{ k }}</span>
        </div>
      </div>

      <!-- Risks -->
      <div class="aia-sec">
        <div class="aia-sec-t">主要风险</div>
        <div class="aia-tags">
          <span v-for="r in analysis.risks" :key="r" class="aia-tag warn">{{ r }}</span>
        </div>
      </div>

      <!-- Suggestion -->
      <div class="aia-sec aia-suggest">
        <div class="aia-sec-t" style="color:var(--gold)">建议行动</div>
        <div class="aia-sec-c">{{ analysis.suggestion }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ analysis: { type: Object, default: null } })

const barColor = computed(() => {
  const s = props.analysis?.strength || 0
  return s >= 70 ? '#1a6b3a' : s >= 45 ? '#c2590a' : '#b91c1c'
})
const strengthLabel = computed(() => {
  const s = props.analysis?.strength || 0
  return s >= 70 ? '胜诉可能性较高' : s >= 45 ? '胜诉可能性中等' : '需补充关键证据'
})
</script>

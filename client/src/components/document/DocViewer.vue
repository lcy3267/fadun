<template>
  <BaseModal v-model="show" title="维权陈述书" :lg="true">
    <div v-if="doc" class="ldoc">
      <div class="ldoc-hd">
        <h2>{{ doc.title }}</h2>
        <p>起草日期：{{ today }} · 当事人：{{ caseData?.plaintiff?.name }} · 类型：{{ caseData?.type }}</p>
      </div>
      <div v-for="s in doc.sections" :key="s.title" class="ldoc-sec">
        <div class="ldoc-sec-t">{{ s.title }}</div>
        <p>{{ s.content }}</p>
      </div>
    </div>
    <template #footer>
      <div style="font-size:11.5px;color:var(--gray2);flex:1;align-self:center">AI 辅助生成 · 建议律师审阅后正式使用</div>
      <button class="btn btn-g" @click="show=false">关闭</button>
      <button class="btn btn-p" :disabled="pdfLoading" @click="downloadPdf">
        <span v-if="pdfLoading" class="spin"></span>
        {{ pdfLoading ? '生成中…' : '⬇ 下载 PDF' }}
      </button>
    </template>
  </BaseModal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'

const props = defineProps({ modelValue: Boolean, doc: Object, caseData: Object })
const emit  = defineEmits(['update:modelValue'])

const show       = ref(props.modelValue)
watch(() => props.modelValue, v => show.value = v)
watch(show, v => emit('update:modelValue', v))

const pdfLoading = ref(false)
const today = new Date().toLocaleDateString('zh-CN')

async function downloadPdf() {
  if (!props.doc || !window.jspdf) return
  pdfLoading.value = true
  await new Promise(r => setTimeout(r, 100))

  try {
    const { jsPDF } = window.jspdf
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210, M = 20, CW = 170
    let y = M
    const d = props.doc
    const c = props.caseData

    pdf.setFillColor(139, 26, 26)
    pdf.rect(0, 0, 210, 30, 'F')
    pdf.setFontSize(17); pdf.setTextColor(255, 255, 255)
    pdf.text(d.title, 105, 13, { align: 'center' })
    pdf.setFontSize(8.5)
    pdf.text(`起草日期：${today}  ·  当事人：${c?.plaintiff?.name}  ·  类型：${c?.type}`, 105, 22, { align: 'center' })

    y = 38
    pdf.setDrawColor(154, 120, 32); pdf.setLineWidth(0.35); pdf.line(M, y, 190, y); y += 8

    d.sections.forEach(s => {
      if (y > 262) { pdf.addPage(); y = M }
      pdf.setFillColor(253, 248, 240); pdf.rect(M, y - 4, CW, 9, 'F')
      pdf.setFillColor(139, 26, 26); pdf.rect(M, y - 4, 3, 9, 'F')
      pdf.setFontSize(11); pdf.setTextColor(139, 26, 26); pdf.text(s.title, M + 6, y + 2); y += 11
      pdf.setFontSize(10); pdf.setTextColor(50, 40, 30)
      pdf.splitTextToSize(s.content, CW).forEach(l => {
        if (y > 278) { pdf.addPage(); y = M }
        pdf.text(l, M, y); y += 6
      })
      y += 5
    })

    const tot = pdf.internal.getNumberOfPages()
    for (let p = 1; p <= tot; p++) {
      pdf.setPage(p); pdf.setFontSize(7.5); pdf.setTextColor(180, 170, 160)
      pdf.text(`法盾 AI 法律援助 · 第${p}/${tot}页 · 本文书由 AI 辅助生成，建议律师审阅后正式使用`, 105, 291, { align: 'center' })
    }

    pdf.save(`维权陈述书_${c?.plaintiff?.name}_${c?.type}_${today.replace(/\//g, '-')}.pdf`)
  } finally {
    pdfLoading.value = false
  }
}
</script>

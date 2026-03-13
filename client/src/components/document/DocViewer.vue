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
import { ref, watch } from 'vue'
import html2canvas from 'html2canvas'
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
    const d = props.doc
    const c = props.caseData

    const wrap = document.createElement('div')
    wrap.style.cssText = 'position:absolute;left:-9999px;top:0;width:794px;background:#fff;font-family:\'Noto Serif SC\',\'Noto Sans SC\',serif;padding:0;box-sizing:border-box;'
    wrap.innerHTML = `
      <div style="background:rgb(139,26,26);color:#fff;padding:20px 24px;margin:0;">
        <h2 style="margin:0 0 6px;font-size:17px;font-weight:700;text-align:center;">${escapeHtml(d.title)}</h2>
        <p style="margin:0;font-size:8.5px;text-align:center;opacity:0.95;">起草日期：${escapeHtml(today)} · 当事人：${escapeHtml(c?.plaintiff?.name || '')} · 类型：${escapeHtml(c?.type || '')}</p>
      </div>
      <div style="height:1px;background:rgb(154,120,32);margin:0 20px;opacity:0.8;"></div>
      <div style="padding:8px 20px 24px;">
        ${(d.sections || []).map(s => `
          <div style="margin-bottom:16px;">
            <div style="background:rgb(253,248,240);border-left:3px solid rgb(139,26,26);padding:6px 10px 8px 12px;margin-bottom:6px;">
              <div style="font-size:11px;font-weight:700;color:rgb(139,26,26);">${escapeHtml(s.title)}</div>
            </div>
            <p style="margin:0;font-size:10px;color:rgb(50,40,30);line-height:1.7;">${escapeHtml(s.content)}</p>
          </div>
        `).join('')}
        <div style="margin-top:24px;font-size:7.5px;color:rgb(180,170,160);text-align:center;">法盾 AI 法律援助 · 本文书由 AI 辅助生成，建议律师审阅后正式使用</div>
      </div>
    `
    document.body.appendChild(wrap)

    const canvas = await html2canvas(wrap, { scale: 2, logging: false, useCORS: true })
    document.body.removeChild(wrap)

    const { jsPDF } = window.jspdf
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const imgW = 210
    const pageH = 297
    const imgData = canvas.toDataURL('image/png')
    const imgH = (canvas.height * imgW) / canvas.width
    let heightLeft = imgH
    let position = 0

    pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH)
    heightLeft -= pageH

    while (heightLeft >= 0) {
      position = heightLeft - imgH
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH)
      heightLeft -= pageH
    }

    const tot = pdf.internal.getNumberOfPages()
    for (let p = 1; p <= tot; p++) {
      pdf.setPage(p)
      pdf.setFontSize(7.5)
      pdf.setTextColor(180, 170, 160)
      pdf.text(`Page ${p}/${tot}`, 105, 291, { align: 'center' })
    }

    pdf.save(`维权陈述书_${c?.plaintiff?.name || '文书'}_${c?.type || '案件'}_${today.replace(/\//g, '-')}.pdf`)
  } catch (e) {
    console.error('PDF export failed', e)
    if (window.jspdf) {
      const { jsPDF } = window.jspdf
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      pdf.setFontSize(12)
      pdf.text('PDF export failed. Please try again.', 20, 20)
      pdf.save('维权陈述书.pdf')
    }
  } finally {
    pdfLoading.value = false
  }
}

function escapeHtml(str) {
  if (str == null) return ''
  const s = String(str)
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}
</script>

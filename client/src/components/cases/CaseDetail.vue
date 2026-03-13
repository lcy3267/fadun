<template>
  <div v-if="c">
    <div class="back" @click="$emit('back')">← 返回案件列表</div>

    <!-- Info Card (collapsible) -->
    <div class="dic" :class="{collapsed}">
      <div class="dic-hd" @click="collapsed=!collapsed">
        <div class="di-type">
          <div class="di-ic">{{ ICONS[c.type] || '📁' }}</div>
          <div>
            <div class="di-tn">{{ c.type }}</div>
            <div class="di-td">创建于 {{ fmtDate(c.createdAt) }} · 更新于 {{ fmtDate(c.updatedAt) }}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px" @click.stop>
          <span v-if="c.isDemo" class="tag t-demo">示例</span>
          <span class="tag" :class="c.status==='done'?'t-green':'t-red'">{{ c.status==='done'?'✓ 已完结':'● 进行中' }}</span>
          <button class="btn btn-g btn-sm" @click="$emit('edit', c.id)">✏️ 修改案情</button>
          <button v-if="c.doc" class="btn btn-gold btn-sm" @click="showDoc=true">📄 文书详情</button>
          <button class="btn btn-danger btn-sm" @click="showDelConfirm=true">删除</button>
          <div class="dic-toggle">▾</div>
        </div>
      </div>
      <div class="dic-body">
        <div class="dic-inner">
          <div class="di-grid">
            <div>
              <div class="dib-t">原告信息</div>
              <div class="dr"><span class="dk">姓名</span><span class="dv">{{ c.plaintiff?.name }}</span></div>
              <div class="dr"><span class="dk">性别/年龄</span><span class="dv">{{ genderLabel(c.plaintiff?.gender) }} · {{ c.plaintiff?.age }}岁</span></div>
              <div class="dr"><span class="dk">地区</span><span class="dv">{{ c.plaintiff?.region }}</span></div>
              <div class="dr"><span class="dk">维权目的</span><span class="dv">{{ c.goal }}</span></div>
            </div>
            <div>
              <div class="dib-t">被告信息</div>
              <div class="dr"><span class="dk">姓名</span><span class="dv">{{ c.defendant?.name }}</span></div>
              <div class="dr"><span class="dk">性别</span><span class="dv">{{ genderLabel(c.defendant?.gender) }}</span></div>
              <div class="dr"><span class="dk">户籍地</span><span class="dv">{{ c.defendant?.huji || '—' }}</span></div>
              <div class="dr"><span class="dk">与您关系</span><span class="dv">{{ c.defendant?.rel }}</span></div>
            </div>
          </div>
          <div class="ddesc">
            <div class="ddesc-l">案情描述</div>
            <div style="font-size:13px;color:var(--ink2);line-height:1.8">{{ c.desc }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- AI Analysis (collapsible) -->
    <div class="dic" :class="{ collapsed: analysisCollapsed }">
      <div class="dic-hd" @click="analysisCollapsed = !analysisCollapsed">
        <div class="di-type">
          <div class="di-ic">⚖️</div>
          <div>
            <div class="di-tn">AI 案情分析</div>
            <div class="di-td">基于您填写的案情与证据，由 AI 自动生成</div>
          </div>
        </div>
        <div class="dic-toggle">▾</div>
      </div>
      <div class="dic-body">
        <div class="dic-inner">
          <CaseAnalysis :analysis="c.analysis" />
        </div>
      </div>
    </div>

    <!-- Evidence Layout -->
    <div class="ev-layout">
      <EvidenceGuide :guide="c.guide" />
      <div>
        <EvidenceList
          :case-id="c.id"
          :evidence="c.evidence || []"
          :groups="c.groups || []"
          @deleted="onEvDeleted"
          @preview="onEvPreview"
        />
        <EvidenceUpload v-if="!c.isDemo" :case-id="c.id" :case-info="c" @uploaded="onUploaded" />
        <div v-else class="pnote" style="margin-top:12px">💡 这是演示案件，无法上传真实证据。新建案件后可上传您的截图。</div>
      </div>
    </div>

    <!-- Generate Doc -->
    <div class="gdz">
      <div class="gdz-text">
        <h3>生成维权陈述书</h3>
        <p>{{ validCount > 0 ? `已有 ${validCount} 份有效证据，可生成高质量文书` : '暂无有效证据，也可按案情模板生成文书框架' }}</p>
      </div>
      <button class="gdz-btn" :disabled="genLoading" @click="showGenConfirm=true">
        <span v-if="genLoading" class="spin" style="border-color:rgba(139,26,26,.3);border-top-color:var(--seal)"></span>
        {{ genLoading ? '生成中…' : '✍️ 立即生成文书' }}
      </button>
    </div>

    <!-- Confirm Gen Modal -->
    <BaseModal v-model="showGenConfirm" title="确认生成维权陈述书">
      <div class="co-ic">✍️</div>
      <div class="co-t">即将生成维权陈述书</div>
      <div class="co-d">
        {{ validCount > 0 ? `基于您的案情和 ${validCount} 份有效证据生成文书。` : '暂无有效证据，将按案情模板生成文书框架。' }}
        文书生成后案件将标记为"已完结"。
      </div>
      <template #footer>
        <button class="btn btn-g" @click="showGenConfirm=false">取消</button>
        <button class="btn btn-p" @click="handleGenDoc">确认生成</button>
      </template>
    </BaseModal>

    <!-- Doc Viewer -->
    <DocViewer v-model="showDoc" :doc="c.doc" :case-data="c" />

    <!-- Evidence Preview -->
    <BaseModal v-model="showPreview" title="证据预览" :lg="true">
      <div v-if="previewEv">
        <div style="margin-bottom:10px;font-size:13px;color:var(--gray2)">
          {{ previewEv.filename }}
        </div>
        <div v-if="previewUrl" style="text-align:center">
          <img :src="previewUrl" alt="" style="max-width:100%;max-height:70vh;border-radius:8px;box-shadow:var(--sh2)" />
        </div>
        <div v-else style="font-size:13px;color:var(--gray2)">暂不支持预览此类型文件</div>
      </div>
    </BaseModal>

    <!-- Delete Confirm -->
    <BaseModal v-model="showDelConfirm" title="删除案件">
      <div class="co-ic">⚠️</div>
      <div class="co-t">确认删除此案件？</div>
      <div class="co-d">删除后无法恢复，包括所有上传的证据和生成的文书。</div>
      <template #footer>
        <button class="btn btn-g" @click="showDelConfirm=false">取消</button>
        <button class="btn btn-danger" @click="handleDelete">确认删除</button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCasesStore } from '@/stores/cases.js'
import { useToast } from '@/composables/useToast.js'
import { deleteEvidence } from '@/api/evidence.js'
import BaseModal     from '@/components/ui/BaseModal.vue'
import CaseAnalysis  from '@/components/analysis/CaseAnalysis.vue'
import EvidenceGuide from '@/components/evidence/EvidenceGuide.vue'
import EvidenceList  from '@/components/evidence/EvidenceList.vue'
import EvidenceUpload from '@/components/evidence/EvidenceUpload.vue'
import DocViewer     from '@/components/document/DocViewer.vue'

const emit = defineEmits(['back', 'edit'])
const store = useCasesStore()
const { toast } = useToast()

const c                = computed(() => store.activeCase)
const collapsed        = ref(false)
const analysisCollapsed = ref(false)
const showGenConfirm = ref(false)
const showDoc    = ref(false)
const showDelConfirm = ref(false)
const genLoading = ref(false)
const showPreview = ref(false)
const previewEv   = ref(null)
const previewUrl  = computed(() => {
  if (!previewEv.value || previewEv.value.isDemo || !previewEv.value.filepath) return ''
  return `/uploads/${previewEv.value.filepath}`
})

const ICONS = { '网络侵权':'📱','劳动纠纷':'💼','消费维权':'🛍','合同纠纷':'📝','婚姻家庭':'🏠','人身损害':'🏥','其他':'📁' }
const validCount = computed(() => (c.value?.evidence || []).filter(e => e.status === 'valid').length)

function genderLabel(g) { return g === 'female' ? '女' : g === 'unknown' ? '不确定' : '男' }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('zh-CN') : '—' }

function onUploaded(evs) {
  store.activeCase.evidence.push(...evs)
  toast(`✅ 分析完成，${evs.filter(e=>e.status==='valid').length} 份有效证据`)
}
function onEvPreview(ev) {
  previewEv.value = ev
  showPreview.value = true
}
async function onEvDeleted(id) {
  try {
    await deleteEvidence(id)
    store.activeCase.evidence = store.activeCase.evidence.filter(e => e.id !== id)
    toast('证据已删除')
  } catch (e) {
    toast('删除失败：' + (e?.response?.data?.error || e.message || '未知错误'))
  }
}

async function handleGenDoc() {
  showGenConfirm.value = false
  genLoading.value = true
  try {
    await store.generateDocument(c.value.id)
    toast('✅ 维权陈述书已生成')
    showDoc.value = true
  } catch (e) {
    toast('生成失败：' + e.message)
  } finally {
    genLoading.value = false
  }
}

async function handleDelete() {
  await store.deleteCase(c.value.id)
  toast('案件已删除')
  emit('back')
}
</script>

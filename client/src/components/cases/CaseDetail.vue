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
        <div class="dic-hd-acts" @click.stop>
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
            <div class="di-td">{{ summarySubtitle }}</div>
          </div>
        </div>
        <div class="dic-hd-acts" @click.stop>
          <button
            class="btn btn-g btn-sm"
            :disabled="summaryLoading || !c?.id"
            @click="handleGenSummary"
          >
            <span
              v-if="summaryLoading"
              class="spin"
              style="border-color:rgba(139,26,26,.3);border-top-color:var(--seal);margin-right:4px"
            ></span>
            {{ c?.caseSummary ? '更新案件综述' : '生成案件综述' }}
          </button>
          <button
            class="btn btn-p btn-sm"
            :disabled="agentLoading || !c?.id"
            @click="handleRunCaseAgent"
          >
            <span
              v-if="agentLoading"
              class="spin"
              style="border-color:rgba(139,26,26,.3);border-top-color:var(--seal);margin-right:4px"
            ></span>
            {{ agentLoading ? '运行中…' : '运行案件助手' }}
          </button>
          <div class="dic-toggle">▾</div>
        </div>
      </div>
      <div class="dic-body">
        <div class="dic-inner">
          <CaseEvidenceSummary v-if="c.caseSummary" :summary="c.caseSummary" />
          <CaseAnalysis v-else :analysis="c.analysis" />
        </div>
      </div>
    </div>

    <!-- Evidence Layout -->
    <div class="ev-layout">
      <EvidenceGuide :guide="c.guide" />
      <div>
        <EvidenceUpload v-if="!c.isDemo" :case-id="c.id" :case-info="c" @uploaded="onUploaded" />
        <div v-else class="pnote" style="margin-bottom:16px">💡 这是演示案件，无法上传真实证据。新建案件后可上传您的截图。</div>
        <EvidenceList
          :case-id="c.id"
          :evidence="c.evidence || []"
          :groups="c.groups || []"
          :can-download="(c.evidence || []).some((e) => !e?.isDemo)"
          @deleted="onEvDeleted"
          @preview="onEvPreview"
          @download="handleDownloadEvidence"
        />
      </div>
    </div>

    <button
      type="button"
      class="case-chat-fab"
      aria-label="打开公益律师问答"
      @click="showCaseChatModal = true"
    >
      💬
    </button>

    <BaseModal v-model="showCaseChatModal" title="公益律师问答" :lg="true" content-fill>
      <div class="case-chat-modal">
        <CaseChat
          v-if="c?.id"
          ref="caseChatRef"
          :case-id="c.id"
          hide-header
        />
      </div>
    </BaseModal>

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
        <div class="preview-ev-caption">
          <span class="evi-id">#{{ previewEv.id }}</span>
          <span class="preview-ev-name">{{ previewEv.filename }}</span>
        </div>
        <div
          v-if="previewEv && isImagePreviewable(previewEv)"
          style="text-align:center"
        >
          <EvidenceImage
            :evidence-id="previewEv.id"
            alt=""
            style="max-width:100%;max-height:70vh;border-radius:8px;box-shadow:var(--sh2)"
          />
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
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useCasesStore } from '@/stores/cases.js'
import { useToast } from '@/composables/useToast.js'
import { deleteEvidence, downloadEvidenceZip } from '@/api/evidence.js'
import BaseModal     from '@/components/ui/BaseModal.vue'
import CaseAnalysis  from '@/components/analysis/CaseAnalysis.vue'
import CaseEvidenceSummary from '@/components/analysis/CaseEvidenceSummary.vue'
import EvidenceGuide from '@/components/evidence/EvidenceGuide.vue'
import EvidenceList  from '@/components/evidence/EvidenceList.vue'
import EvidenceUpload from '@/components/evidence/EvidenceUpload.vue'
import EvidenceImage from '@/components/evidence/EvidenceImage.vue'
import DocViewer     from '@/components/document/DocViewer.vue'
import { streamTask } from '@/api/tasks.js'
import CaseChat from '@/components/agent/CaseChat.vue'
import { isImagePreviewable } from '@/utils/evidenceKind.js'

const emit = defineEmits(['back', 'edit'])
const store = useCasesStore()
const { toast } = useToast()

const MOBILE_MQ = '(max-width: 700px)'

function initialMobileCardCollapsed() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches
}

const c                 = computed(() => store.activeCase)
const collapsed         = ref(initialMobileCardCollapsed())
const analysisCollapsed = ref(initialMobileCardCollapsed())
const summaryLoading = ref(false)
const agentLoading = ref(false)
const showCaseChatModal = ref(false)
const caseChatRef = ref(null)

let cardLayoutMq
function syncCardLayoutToViewport() {
  if (!cardLayoutMq) return
  /* 仅宽屏：强制展开，避免窄屏样式下误带收起态；窄屏不碰状态，用户可自由展开/收起 */
  if (!cardLayoutMq.matches) {
    collapsed.value = false
    analysisCollapsed.value = false
  }
}

onMounted(() => {
  cardLayoutMq = window.matchMedia(MOBILE_MQ)
  syncCardLayoutToViewport()
  cardLayoutMq.addEventListener('change', syncCardLayoutToViewport)
})
onUnmounted(() => {
  cardLayoutMq?.removeEventListener('change', syncCardLayoutToViewport)
})

watch(showCaseChatModal, async (open) => {
  if (!open) return
  const bump = () => {
    const inst = caseChatRef.value
    if (inst?.scrollToBottomSoon) inst.scrollToBottomSoon()
    else if (inst?.scrollToBottom) inst.scrollToBottom()
  }
  await nextTick()
  bump()
  requestAnimationFrame(bump)
  setTimeout(bump, 120)
  setTimeout(bump, 380)
})
const showGenConfirm = ref(false)
const showDoc    = ref(false)
const showDelConfirm = ref(false)
const genLoading = ref(false)
const showPreview = ref(false)
const previewEv   = ref(null)

const ICONS = { '网络侵权':'📱','劳动纠纷':'💼','消费维权':'🛍','合同纠纷':'📝','婚姻家庭':'🏠','人身损害':'🏥','其他':'📁' }
const validCount = computed(() => (c.value?.evidence || []).filter(e => e.status === 'valid').length)
const summarySubtitle = computed(() => {
  if (c.value?.caseSummary?.meta?.generatedAt) {
    const d = new Date(c.value.caseSummary.meta.generatedAt)
    const generatedAt = Number.isNaN(d.getTime()) ? '未知时间' : d.toLocaleString('zh-CN')
    const n = Number(c.value.caseSummary.meta.validEvidenceCount || 0)
    return `基于 ${n} 份有效证据更新 · ${generatedAt}`
  }
  return '基于您填写的案情与证据，由 AI 自动生成'
})

function genderLabel(g) { return g === 'female' ? '女' : g === 'unknown' ? '不确定' : '男' }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('zh-CN') : '—' }

function onUploaded(evs) {
  store.activeCase.evidence.push(...evs)
  // 已完结案件新上传了有效证据时，与后端一致：状态改为进行中，页面即时更新
  const hadDone = store.activeCase.status === 'done'
  const hasValid = evs.some(e => e.status === 'valid')
  if (hadDone && hasValid) {
    store.activeCase.status = 'active'
    const idx = store.cases.findIndex(x => x.id === store.activeCase.id)
    if (idx !== -1) store.cases[idx].status = 'active'
  }
  toast(`✅ 已上传 ${evs.length} 张图片，请在下方「待认证」中选择后进行证据归类认证`)
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

async function handleDownloadEvidence() {
  if (!c.value) return
  try {
    const blob = await downloadEvidenceZip(c.value.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const name = c.value.plaintiff?.name || '案件'
    const type = c.value.type || '证据'
    const date = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `证据清单_${name}_${type}_${date}.zip`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    toast('下载失败：' + (e.message || '未知错误'))
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

async function handleGenSummary() {
  if (!c.value?.id) return
  summaryLoading.value = true
  try {
    await store.generateCaseSummary(c.value.id)
    toast('✅ 案件综述已生成')
  } catch (e) {
    toast('综述生成失败：' + (e?.response?.data?.error || e?.message || '未知错误'))
  } finally {
    summaryLoading.value = false
  }
}

async function handleRunCaseAgent() {
  if (!c.value?.id || agentLoading.value) return
  agentLoading.value = true
  try {
    const { taskId } = await store.runCaseAgent(c.value.id)
    if (!taskId) throw new Error('未返回 taskId')

    const es = streamTask(taskId, {
      onProgress: () => {},
      onTaskError: (evt) => {
        es.close()
        agentLoading.value = false
        toast('案件助手失败：' + (evt?.message || '未知错误'))
      },
      onAllDone: (evt) => {
        es.close()
        agentLoading.value = false
        const task = evt?.task
        const notification = task?.result?.notification
        toast(notification?.message ? `✅ ${notification.message}` : '✅ 案件助手已完成')
      },
      onItemDone: () => {},
      onError: () => {
        es.close()
        agentLoading.value = false
      },
    })
  } catch (e) {
    agentLoading.value = false
    toast('案件助手启动失败：' + (e?.response?.data?.error || e?.message || '未知错误'))
  }
}

async function handleDelete() {
  await store.deleteCase(c.value.id)
  toast('案件已删除')
  emit('back')
}
</script>

<style scoped>
.case-chat-fab {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 850;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1px solid rgba(139, 26, 26, 0.22);
  background: linear-gradient(145deg, rgba(139, 26, 26, 0.95), rgba(100, 30, 30, 0.98));
  color: #fff;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 10px 28px rgba(13, 10, 6, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.case-chat-fab:hover {
  transform: scale(1.05);
  box-shadow: 0 12px 32px rgba(13, 10, 6, 0.34);
}
.case-chat-modal {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.case-chat-modal :deep(.case-chat) {
  border: none;
  background: transparent;
}
</style>

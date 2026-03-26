<template>
  <div class="case-chat" :class="{ 'case-chat--fill': hideHeader }">
    <div v-if="!hideHeader" class="case-chat-hd">
      <div class="case-chat-title">公益律师问答</div>
      <div class="case-chat-sub">基于本案已认证有效证据回答</div>
    </div>

    <div ref="bodyEl" class="case-chat-body">
      <div
        v-if="!messages.length && !loadingHistory"
        class="case-chat-empty"
      >
        还没有对话。输入问题后点击发送。
      </div>

      <div v-for="(m, idx) in messages" :key="m.localId || idx" class="case-chat-row" :class="m.role === 'user' ? 'row-user' : 'row-assistant'">
        <div class="bubble" :class="m.role === 'user' ? 'b-user' : 'b-assistant'">
          <div style="white-space:pre-wrap;word-break:break-word">{{ m.content }}</div>
        </div>
      </div>

      <div v-if="typing" class="typing">
        正在生成回答…
      </div>
      <div ref="tailRef" class="case-chat-tail" aria-hidden="true" />
    </div>

    <div class="case-chat-ft">
      <textarea
        v-model="input"
        class="case-chat-input"
        placeholder="输入你的疑问，例如：我这份证据能证明什么？下一步怎么补证？"
        rows="3"
        @keydown.enter.exact.prevent="send"
      />
      <button class="btn btn-g" :disabled="typing || !input.trim()" @click="send">
        发送
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { getLatestCaseChat, sendCaseChatMessage } from '@/api/agentChat.js'
import { streamTask } from '@/api/tasks.js'
import { useToast } from '@/composables/useToast.js'

const props = defineProps({
  caseId: { type: Number, default: null },
  /** 弹窗内使用时隐藏与 Modal 标题重复的头部 */
  hideHeader: { type: Boolean, default: false },
})

const { toast } = useToast()

const loadingHistory = ref(false)
const sessionId = ref(null)
const messages = ref([])
const input = ref('')
const typing = ref(false)
const bodyEl = ref(null)
const tailRef = ref(null)

const canLoad = computed(() => !!props.caseId)

function scrollToBottom() {
  const tail = tailRef.value
  const el = bodyEl.value
  if (tail) {
    tail.scrollIntoView({ block: 'end', behavior: 'auto' })
  } else if (el) {
    el.scrollTop = el.scrollHeight
  }
}

/** 等 Vue 把消息渲染进 DOM 后再滚到底，避免 scrollHeight 未更新 */
async function scrollToBottomSoon() {
  await nextTick()
  scrollToBottom()
  requestAnimationFrame(() => {
    scrollToBottom()
    requestAnimationFrame(() => scrollToBottom())
  })
}

let scrollRaf = 0
function queueScrollToBottom() {
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    void scrollToBottomSoon()
  })
}

function normalizeMessages(list) {
  const arr = Array.isArray(list) ? list : []
  return arr.map((m, idx) => ({
    localId: `m-${m.id || idx}`,
    role: m.role,
    content: String(m.content || ''),
  }))
}

async function loadLatest() {
  if (!canLoad.value) return
  loadingHistory.value = true
  try {
    const res = await getLatestCaseChat(props.caseId)
    sessionId.value = res?.sessionId || null
    messages.value = normalizeMessages(res?.messages || [])
  } catch (e) {
    toast('加载对话失败：' + (e?.response?.data?.error || e?.message || '未知错误'))
  } finally {
    loadingHistory.value = false
    await scrollToBottomSoon()
  }
}

watch(() => props.caseId, () => {
  if (props.caseId) loadLatest()
})

defineExpose({ scrollToBottom, scrollToBottomSoon })

async function send() {
  if (!props.caseId) return
  const msg = input.value.trim()
  if (!msg) return
  if (typing.value) return

  typing.value = true

  // optimistic UI
  const userEntry = { localId: `u-${Date.now()}`, role: 'user', content: msg }
  const assistantEntry = { localId: `a-${Date.now() + 1}`, role: 'assistant', content: '' }
  messages.value = [...messages.value, userEntry, assistantEntry]
  input.value = ''
  await scrollToBottomSoon()

  let es = null
  try {
    const res = await sendCaseChatMessage({
      caseId: props.caseId,
      message: msg,
      sessionId: sessionId.value || undefined,
    })
    const taskId = res?.taskId
    const sid = res?.sessionId || null
    sessionId.value = sid
    if (!taskId) throw new Error('未返回 taskId')

    es = streamTask(taskId, {
      onItemDone: (evt) => {
        if (!evt || evt.step !== 'chat_delta') return
        const delta = String(evt.delta || '')
        const idx = messages.value.length - 1
        const last = messages.value[idx]
        if (last && last.role === 'assistant' && delta) {
          messages.value[idx] = {
            ...last,
            content: (last.content || '') + delta,
          }
        }
        queueScrollToBottom()
      },
      onTaskError: (evt) => {
        if (es) es.close()
        typing.value = false
        toast('问答失败：' + (evt?.message || '未知错误'))
      },
      onAllDone: async (evt) => {
        if (es) es.close()
        typing.value = false
        const assistantText = evt?.task?.result?.assistantText
        if (assistantText != null) {
          const last = messages.value[messages.value.length - 1]
          if (last && last.role === 'assistant') last.content = assistantText
        }
        await scrollToBottomSoon()
      },
      onError: () => {
        if (es) es.close()
        typing.value = false
        toast('SSE 连接异常')
      },
    })
  } catch (e) {
    typing.value = false
    toast('发送失败：' + (e?.response?.data?.error || e?.message || '未知错误'))
    if (es) es.close()
  }
}

// initial load
if (canLoad.value) loadLatest()
</script>

<style scoped>
.case-chat {
  border: 1px solid rgba(139, 26, 26, 0.18);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 250, 247, 0.8);
}
.case-chat-hd {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(139, 26, 26, 0.12);
}
.case-chat-title {
  font-weight: 800;
  margin-bottom: 4px;
}
.case-chat-sub {
  font-size: 12px;
  color: var(--gray2);
}
.case-chat-body {
  padding: 12px 14px;
  max-height: 320px;
  overflow: auto;
}
.case-chat--fill {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.case-chat--fill .case-chat-body {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow-y: auto;
}
.case-chat--fill .case-chat-ft {
  flex-shrink: 0;
}
.case-chat-empty {
  font-size: 12.5px;
  color: var(--gray2);
}
.case-chat-row {
  display: flex;
  margin: 10px 0;
}
.row-user {
  justify-content: flex-end;
}
.row-assistant {
  justify-content: flex-start;
}
.bubble {
  max-width: 82%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(139, 26, 26, 0.14);
  background: #fff;
}
.b-user {
  background: rgba(37, 99, 235, 0.06);
  border-color: rgba(37, 99, 235, 0.2);
}
.b-assistant {
  background: rgba(26, 107, 58, 0.06);
  border-color: rgba(26, 107, 58, 0.2);
}
.typing {
  font-size: 12.5px;
  color: var(--gray2);
  margin-top: 8px;
}
.case-chat-tail {
  height: 1px;
  width: 100%;
  flex-shrink: 0;
  pointer-events: none;
}
.case-chat-ft {
  border-top: 1px solid rgba(139, 26, 26, 0.12);
  padding: 12px 14px;
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.case-chat-input {
  flex: 1;
  resize: none;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(139, 26, 26, 0.18);
  background: #fff;
  font-family: inherit;
}
</style>


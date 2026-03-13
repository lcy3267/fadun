import { ref } from 'vue'

const toasts = ref([])
let tid = 0

export function useToast() {
  function toast(msg, duration = 2800) {
    const id = ++tid
    toasts.value.push({ id, msg })
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, duration)
  }
  return { toasts, toast }
}

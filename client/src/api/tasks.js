import api from './client.js'

export const getTask = (taskId) => api.get(`/tasks/${taskId}`)

export const streamTask = (taskId, handlers = {}) => {
  const token = localStorage.getItem('fd_token')
  const url = `/api/tasks/${taskId}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`
  const es = new EventSource(url)

  if (handlers.onProgress) es.addEventListener('progress', (e) => handlers.onProgress(JSON.parse(e.data)))
  if (handlers.onItemDone) es.addEventListener('item_done', (e) => handlers.onItemDone(JSON.parse(e.data)))
  if (handlers.onTaskError) es.addEventListener('task_error', (e) => handlers.onTaskError(JSON.parse(e.data)))
  if (handlers.onAllDone) es.addEventListener('all_done', (e) => handlers.onAllDone(JSON.parse(e.data)))
  if (handlers.onError) es.onerror = handlers.onError

  return es
}

import api from './client.js'
import axios from 'axios'

export const uploadEvidence = (caseId, files, onProgress) => {
  const fd = new FormData()
  fd.append('caseId', caseId)
  files.forEach(f => fd.append('files', f))
  return api.post('/evidence/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  })
}

export const deleteEvidence = (id) => api.delete(`/evidence/${id}`)

export const verifyEvidence = (evidenceIds) =>
  api.post('/evidence/verify', { evidenceIds })

export const publicFetchEvidence = (payload) =>
  api.post('/evidence/public-fetch', payload)

export const confirmPublicEvidence = (evidenceIds) =>
  api.post('/evidence/public-confirm', { evidenceIds })

export const rejectPublicEvidence = (evidenceIds) =>
  api.post('/evidence/public-reject', { evidenceIds })

export const getTask = (taskId) => api.get(`/tasks/${taskId}`)

export const downloadEvidenceZip = async (caseId) => {
  const token = localStorage.getItem('fd_token')
  const res = await axios.get(`/api/evidence/download/${caseId}`, {
    responseType: 'blob',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  return res.data
}

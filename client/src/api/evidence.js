import api from './client.js'

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

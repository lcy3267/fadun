import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as casesApi    from '@/api/cases.js'
import * as evidenceApi from '@/api/evidence.js'

export const useCasesStore = defineStore('cases', () => {
  const cases      = ref([])
  const activeCase = ref(null)
  const loading    = ref(false)

  async function fetchCases() {
    loading.value = true
    cases.value = await casesApi.getCases()
    loading.value = false
  }

  async function fetchCase(id) {
    const c = await casesApi.getCase(id)
    activeCase.value = c
    return c
  }

  async function createCase(formData) {
    const c = await casesApi.createCase(formData)
    cases.value.unshift(c)
    activeCase.value = c
    return c
  }

  async function updateCase(id, data) {
    const c = await casesApi.updateCase(id, data)
    const idx = cases.value.findIndex(x => x.id === id)
    if (idx !== -1) cases.value[idx] = c
    activeCase.value = c
    return c
  }

  async function deleteCase(id) {
    await casesApi.deleteCase(id)
    cases.value = cases.value.filter(x => x.id !== id)
    if (activeCase.value?.id === id) activeCase.value = null
  }

  async function uploadEvidence(caseId, files) {
    const created = await evidenceApi.uploadEvidence(caseId, files)
    if (activeCase.value?.id === caseId) {
      activeCase.value.evidence.push(...created)
    }
    return created
  }

  async function deleteEvidence(caseId, evId) {
    await evidenceApi.deleteEvidence(evId)
    if (activeCase.value?.id === caseId) {
      activeCase.value.evidence = activeCase.value.evidence.filter(e => e.id !== evId)
    }
  }

  async function generateDocument(caseId) {
    const res = await casesApi.aiDocument(caseId)
    if (activeCase.value?.id === caseId) {
      activeCase.value.doc    = res.doc
      activeCase.value.status = 'done'
    }
    const idx = cases.value.findIndex(x => x.id === caseId)
    if (idx !== -1) cases.value[idx].status = 'done'
    return res
  }

  return {
    cases, activeCase, loading,
    fetchCases, fetchCase, createCase, updateCase, deleteCase,
    uploadEvidence, deleteEvidence, generateDocument,
  }
})

<template>
  <div class="page">
    <AppNav />
    <div class="app-content">
      <CaseList   v-if="view==='list'"   @open="openCase" @create="view='form'" />
      <CaseForm   v-if="view==='form'"   :edit-id="editId" @saved="onFormSaved" @cancel="onFormCancel" />
      <CaseDetail v-if="view==='detail'" @back="view='list'" @edit="onEdit" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import AppNav    from '@/components/layout/AppNav.vue'
import CaseList  from '@/components/cases/CaseList.vue'
import CaseForm  from '@/components/cases/CaseForm.vue'
import CaseDetail from '@/components/cases/CaseDetail.vue'
import { useCasesStore } from '@/stores/cases.js'

const store  = useCasesStore()
const view   = ref('list')
const editId = ref(null)

onMounted(() => store.fetchCases())

function openCase(c) {
  store.activeCase = c
  view.value = 'detail'
}

function onFormSaved(c) {
  store.activeCase = c
  editId.value = null
  view.value = 'detail'
}

function onFormCancel() {
  editId.value = null
  view.value = store.activeCase ? 'detail' : 'list'
}

function onEdit(id) {
  editId.value = id
  view.value = 'form'
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-content {
  flex: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 32px 40px;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .app-content {
    padding: 16px 16px 24px;
  }
}
</style>

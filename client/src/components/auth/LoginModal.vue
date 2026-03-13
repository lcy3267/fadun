<template>
  <BaseModal v-model="show" title="登录法盾">
    <form @submit.prevent="handleSubmit">
      <div class="fg">
        <label class="fl">手机号 <span class="r">*</span></label>
        <input v-model="form.phone" class="fi" :class="{err:errors.phone}" placeholder="请输入手机号" maxlength="11" />
        <span v-if="errors.phone" class="form-err">{{ errors.phone }}</span>
      </div>
      <div class="fg">
        <label class="fl">密码 <span class="r">*</span></label>
        <input v-model="form.password" type="password" class="fi" :class="{err:errors.password}" placeholder="请输入密码" />
        <span v-if="errors.password" class="form-err">{{ errors.password }}</span>
      </div>
      <span v-if="errors.global" class="form-err" style="display:block;margin-bottom:10px">{{ errors.global }}</span>
      <button type="submit" class="btn btn-p btn-lg" style="width:100%" :disabled="loading">
        <span v-if="loading" class="spin"></span>
        {{ loading ? '登录中…' : '登录' }}
      </button>
    </form>
    <div class="auth-switch">还没有账号？<a @click="$emit('switch')">立即注册</a></div>
  </BaseModal>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useAuthStore } from '@/stores/auth.js'
import { useToast } from '@/composables/useToast.js'

const props = defineProps({ modelValue: Boolean })
const emit  = defineEmits(['update:modelValue', 'switch'])

const show   = ref(props.modelValue)
watch(() => props.modelValue, v => show.value = v)
watch(show, v => emit('update:modelValue', v))

const auth    = useAuthStore()
const router  = useRouter()
const { toast } = useToast()
const loading = ref(false)
const form    = reactive({ phone: '', password: '' })
const errors  = reactive({ phone: '', password: '', global: '' })

function validate() {
  errors.phone = errors.password = errors.global = ''
  if (!/^1[3-9]\d{9}$/.test(form.phone)) { errors.phone = '请输入有效的手机号'; return false }
  if (!form.password) { errors.password = '请输入密码'; return false }
  return true
}

async function handleSubmit() {
  if (!validate()) return
  loading.value = true
  try {
    await auth.login(form.phone, form.password)
    toast('登录成功')
    show.value = false
    router.push('/app')
  } catch (e) {
    errors.global = e.message
  } finally {
    loading.value = false
  }
}
</script>

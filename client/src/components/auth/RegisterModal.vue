<template>
  <BaseModal v-model="show" title="注册法盾账号">
    <form @submit.prevent="handleSubmit">
      <div class="fg">
        <label class="fl">手机号 <span class="r">*</span></label>
        <input v-model="form.phone" class="fi" :class="{err:errors.phone}" placeholder="请输入手机号" maxlength="11" />
        <span v-if="errors.phone" class="form-err">{{ errors.phone }}</span>
      </div>
      <div class="fg">
        <label class="fl">密码 <span class="r">*</span></label>
        <input v-model="form.password" type="password" class="fi" :class="{err:errors.password}" placeholder="至少 6 位" />
        <span v-if="errors.password" class="form-err">{{ errors.password }}</span>
      </div>
      <div class="fg">
        <label class="fl">确认密码 <span class="r">*</span></label>
        <input v-model="form.confirmPassword" type="password" class="fi" :class="{err:errors.confirmPassword}" placeholder="再次输入密码" />
        <span v-if="errors.confirmPassword" class="form-err">{{ errors.confirmPassword }}</span>
      </div>
      <span v-if="errors.global" class="form-err" style="display:block;margin-bottom:10px">{{ errors.global }}</span>
      <button type="submit" class="btn btn-p btn-lg" style="width:100%" :disabled="loading">
        <span v-if="loading" class="spin"></span>
        {{ loading ? '注册中…' : '注册' }}
      </button>
    </form>
    <div class="auth-note">注册即代表您同意法盾用户协议和隐私政策</div>
    <div class="auth-switch">已有账号？<a @click="$emit('switch')">直接登录</a></div>
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
const form    = reactive({ phone: '', password: '', confirmPassword: '' })
const errors  = reactive({ phone: '', password: '', confirmPassword: '', global: '' })

function validate() {
  Object.keys(errors).forEach(k => errors[k] = '')
  if (!/^1[3-9]\d{9}$/.test(form.phone))   { errors.phone = '请输入有效的 11 位手机号'; return false }
  if (form.password.length < 6)             { errors.password = '密码至少 6 位'; return false }
  if (form.password !== form.confirmPassword) { errors.confirmPassword = '两次密码输入不一致'; return false }
  return true
}

async function handleSubmit() {
  if (!validate()) return
  loading.value = true
  try {
    await auth.register(form.phone, form.password, form.confirmPassword)
    toast('注册成功，已为您创建演示案件')
    show.value = false
    router.push('/app')
  } catch (e) {
    errors.global = e.message
  } finally {
    loading.value = false
  }
}
</script>

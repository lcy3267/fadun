<template>
  <div>
    <div class="back" @click="$emit('cancel')">← 返回</div>
    <div class="card">
      <h2 class="serif" style="font-size:18px;color:var(--seal);margin-bottom:20px">
        {{ editId ? '修改案情' : '新建案件' }}
      </h2>

      <div class="fg2">
        <!-- 原告 -->
        <div class="full" style="font-size:13px;font-weight:700;color:var(--seal);letter-spacing:.06em;margin-bottom:4px">原告信息</div>
        <div class="fg"><label class="fl">姓名 <span class="r">*</span></label><input v-model="f.name" class="fi" placeholder="您的真实姓名" /></div>
        <div class="fg">
          <label class="fl">性别 <span class="r">*</span></label>
          <div class="radio-row">
            <div class="rb" :class="{on:f.gender==='male'}"   @click="f.gender='male'">男</div>
            <div class="rb" :class="{on:f.gender==='female'}" @click="f.gender='female'">女</div>
            <div class="rb" :class="{on:f.gender==='other'}"  @click="f.gender='other'">其他</div>
          </div>
        </div>
        <div class="fg"><label class="fl">年龄 <span class="r">*</span></label><input v-model.number="f.age" type="number" min="1" max="120" class="fi" placeholder="年龄" /></div>
        <div class="fg"><label class="fl">所在地区 <span class="r">*</span></label><input v-model="f.region" class="fi" placeholder="如：广东省深圳市" /></div>

        <div class="fg full">
          <label class="fl">案件类型 <span class="r">*</span></label>
          <select v-model="f.type" class="fsl">
            <option value="">请选择</option>
            <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div class="fg full">
          <label class="fl">维权目的 <span class="r">*</span></label>
          <select v-model="f.goalSelect" class="fsl">
            <option value="">请选择</option>
            <option v-for="g in GOALS" :key="g" :value="g">{{ g }}</option>
            <option value="其他">其他</option>
          </select>
          <input v-if="f.goalSelect==='其他'" v-model="f.goalCustom" class="fi" style="margin-top:8px" placeholder="请描述您的维权目的" />
        </div>
        <div class="fg full">
          <label class="fl">案情描述 <span class="r">*</span></label>
          <textarea v-model="f.desc" class="fta" :maxlength="1000" rows="5" placeholder="详细描述侵权经过、时间、金额等关键信息…"></textarea>
          <div class="char-tip">{{ f.desc.length }} / 1000</div>
        </div>

        <!-- 被告 -->
        <div class="full" style="font-size:13px;font-weight:700;color:var(--seal);letter-spacing:.06em;margin:8px 0 4px">被告信息</div>
        <div class="fg"><label class="fl">姓名/名称 <span class="r">*</span></label><input v-model="f.dName" class="fi" placeholder="被告姓名或公司名称" /></div>
        <div class="fg">
          <label class="fl">性别</label>
          <div class="radio-row">
            <div class="rb" :class="{on:f.dGender==='male'}"    @click="f.dGender='male'">男</div>
            <div class="rb" :class="{on:f.dGender==='female'}"  @click="f.dGender='female'">女</div>
            <div class="rb" :class="{on:f.dGender==='unknown'}" @click="f.dGender='unknown'">不确定</div>
          </div>
        </div>
        <div class="fg"><label class="fl">身份证号（选填）</label><input v-model="f.dIdNo" class="fi" placeholder="选填" /></div>
        <div class="fg"><label class="fl">户籍地（选填）</label><input v-model="f.dHuji" class="fi" placeholder="选填" /></div>
        <div class="fg full">
          <label class="fl">与您的关系 <span class="r">*</span></label>
          <select v-model="f.dRel" class="fsl">
            <option value="">请选择</option>
            <option v-for="r in RELS" :key="r" :value="r">{{ r }}</option>
          </select>
        </div>
      </div>

      <div class="pnote">🔒 您填写的信息仅在本次会话中用于 AI 分析，法盾不会存储或共享您的个人敏感信息。正式法律行动请咨询持证律师。</div>
      <span v-if="err" class="form-err" style="display:block;margin-bottom:10px">{{ err }}</span>

      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-g" @click="$emit('cancel')">取消</button>
        <button class="btn btn-p btn-lg" :disabled="submitting" @click="handleSubmit">
          <span v-if="submitting" class="spin"></span>
          {{ submitting ? 'AI 生成证据清单中…' : (editId ? '保存修改' : '保存并进入证据收集 →') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useCasesStore } from '@/stores/cases.js'
import { aiInit } from '@/api/cases.js'
import { useToast } from '@/composables/useToast.js'

const props = defineProps({ editId: { type: Number, default: null } })
const emit  = defineEmits(['saved', 'cancel'])

const store       = useCasesStore()
const { toast }   = useToast()
const submitting  = ref(false)
const err         = ref('')

const TYPES = ['网络侵权','劳动纠纷','消费维权','合同纠纷','婚姻家庭','人身损害','其他']
const GOALS = ['要求对方道歉并删除内容','获得经济赔偿','追究刑事责任','解除合同或恢复原状','防止进一步侵害','要求履行合同义务']
const RELS  = ['前任伴侣','现任伴侣','家庭成员','前雇主','现雇主','商家/平台','合作伙伴','网络用户','其他关系']

const f = reactive({
  name:'', gender:'male', age:'', region:'',
  type:'', goalSelect:'', goalCustom:'', desc:'',
  dName:'', dGender:'male', dIdNo:'', dHuji:'', dRel:'',
})

onMounted(() => {
  if (props.editId) {
    const c = store.activeCase
    if (!c) return
    f.name = c.plaintiff?.name || ''
    f.gender = c.plaintiff?.gender || 'male'
    f.age  = c.plaintiff?.age || ''
    f.region = c.plaintiff?.region || ''
    f.type = c.type || ''
    const known = GOALS.includes(c.goal)
    f.goalSelect = known ? c.goal : '其他'
    f.goalCustom = known ? '' : c.goal
    f.desc = c.desc || ''
    f.dName   = c.defendant?.name || ''
    f.dGender = c.defendant?.gender || 'male'
    f.dIdNo   = c.defendant?.idNo || ''
    f.dHuji   = c.defendant?.huji || ''
    f.dRel    = c.defendant?.rel || ''
  }
})

function validate() {
  const goal = f.goalSelect === '其他' ? f.goalCustom.trim() : f.goalSelect
  if (!f.name.trim())  return '请填写您的姓名'
  if (!f.age || f.age < 1) return '请填写有效年龄'
  if (!f.region.trim()) return '请填写所在地区'
  if (!f.type)          return '请选择案件类型'
  if (!goal)            return '请填写维权目的'
  if (!f.desc.trim())   return '请填写案情描述'
  if (!f.dName.trim())  return '请填写被告姓名'
  if (!f.dRel)          return '请选择与被告的关系'
  return ''
}

async function handleSubmit() {
  err.value = validate()
  if (err.value) return

  submitting.value = true
  const goal = f.goalSelect === '其他' ? f.goalCustom.trim() : f.goalSelect

  try {
    // 并发生成分组 + 分析
    const aiResult = await aiInit({ type: f.type, goal, desc: f.desc,
      defendant: { name: f.dName, rel: f.dRel } })

    const payload = {
      type: f.type, goal, desc: f.desc,
      groups:   aiResult.groups,
      guide:    aiResult.guide,
      analysis: aiResult.analysis,
      plaintiff: { name: f.name, gender: f.gender, age: Number(f.age), region: f.region },
      defendant: { name: f.dName, gender: f.dGender, idNo: f.dIdNo, huji: f.dHuji, rel: f.dRel },
    }

    let c
    if (props.editId) {
      c = await store.updateCase(props.editId, payload)
      toast('案情已更新，AI 分析已刷新')
    } else {
      c = await store.createCase(payload)
      toast('案件已创建，证据清单已生成')
    }
    emit('saved', c)
  } catch (e) {
    err.value = e.message
  } finally {
    submitting.value = false
  }
}
</script>

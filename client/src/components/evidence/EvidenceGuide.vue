<template>
  <div class="ev-guide">
    <div class="ev-guide-hd">
      <div class="ev-guide-hd-ic">🗺</div>
      <div class="ev-guide-hd-t">证据搜集指引</div>
    </div>
    <div class="ev-guide-body">
      <div v-for="item in guide" :key="item.group" class="eg-item">
        <div class="eg-name">{{ item.group }}</div>
        <div class="eg-desc">{{ item.guide || item.desc }}</div>
      </div>
      <div v-if="!guide?.length" style="color:var(--gray2);font-size:12.5px;padding:8px 0">
        保存案情后将自动生成专属指引
      </div>
    </div>
    <div class="ev-guide-ft">💡 建议在维权初期即保存好原始文件，勿截图后删除原件</div>
  </div>
</template>

<script setup>
defineProps({ guide: { type: Array, default: () => [] } })
</script>

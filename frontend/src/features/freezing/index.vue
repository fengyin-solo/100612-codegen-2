<template>
  <section class="page" data-module="freezing-ledger">
    <header class="page-head">
      <div>
        <h2>{{ title }}</h2>
        <p class="page-desc">{{ desc }}</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="resetAll">恢复存量初始数据</button>
      </div>
    </header>

    <p v-if="notice" class="notice-bar" :class="notice.ok ? 'notice-ok' : 'notice-bad'">
      {{ notice.message }}
      <button class="link notice-close" type="button" @click="notice = null">×</button>
    </p>

    <CurtainPanel />
    <HolePanel @notice="onNotice" />
    <ReadingPanel @notice="onNotice" />
    <ExcavationPanel @notice="onNotice" />
    <HazardPanel @notice="onNotice" />

    <footer class="page-foot">
      <span>两个入口（本页与「冻结监测与开挖登记」）及安全巡检页共用同一份台账数据，刷新与多标签页自动同步</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import CurtainPanel from './components/CurtainPanel.vue'
import HolePanel from './components/HolePanel.vue'
import ReadingPanel from './components/ReadingPanel.vue'
import ExcavationPanel from './components/ExcavationPanel.vue'
import HazardPanel from './components/HazardPanel.vue'
import type { GateResult } from './types'
import { useFreezingStore } from './store'

withDefaults(
  defineProps<{ title?: string; desc?: string }>(),
  {
    title: '联络通道冻结与开挖工序台账',
    desc:
      '按冻结孔登记测温、按设计温度判定冻土帷幕，帷幕达标才允许开挖；进尺先于二衬浇筑，越序登记挡回并指出所缺步骤。' +
      '测温中断从断孔补测、整班空数写明原因，异常进尺与强挖拦截同步进安全巡检。',
  },
)

const store = useFreezingStore()
const notice = ref<GateResult | null>(null)

function onNotice(result: GateResult) {
  notice.value = result
}
function resetAll() {
  onNotice(store.resetLedger())
}

onMounted(() => {
  store.bindStorageSync()
})
</script>

<style scoped>
.notice-bar { border-radius: 8px; padding: 8px 12px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
.notice-ok { background: #f2fbf4; border: 1px solid #a6d5b0; color: #067647; }
.notice-bad { background: #fef3f2; border: 1px solid #f0a9a2; color: #b42318; }
.notice-close { font-size: 15px; }
</style>

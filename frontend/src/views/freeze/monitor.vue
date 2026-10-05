<template>
  <section class="page" data-module="freeze-monitor">
    <header class="page-head">
      <div>
        <h2>联络通道冻结监测（第二入口）</h2>
        <p class="page-desc">
          测温值班入口：与「冻结与开挖工序台账」取同一份读数与隐患，两边上送收在一份列表里；本页只测温与跟踪整改，不登记开挖。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/freeze">前往工序台账（开挖/二衬在那登记）</RouterLink>
      </div>
    </header>

    <div class="curtain-card" :class="verdict.formable ? 'curtain-ok' : 'curtain-bad'">
      <div class="curtain-main">
        <h3>冻土帷幕监测结论</h3>
        <p>{{ verdict.message }}</p>
      </div>
      <div class="curtain-stats">
        <div><strong>{{ verdict.qualifiedCount }}</strong><span>达标孔</span></div>
        <div><strong :class="{ warn: verdict.unqualified.length > 0 }">{{ verdict.unqualified.length }}</strong><span>未达标/缺测孔</span></div>
        <div><strong>{{ state.readings.length }}</strong><span>读数总条数</span></div>
      </div>
    </div>

    <ReadingEntry @result="showResult" />

    <HazardPanel :verdict="verdict" @result="showResult" />

    <section class="work-panel">
      <header class="panel-head">
        <h3>工序顺序（只读，供值班对照）</h3>
        <span class="panel-tip">测温达标 → 开挖进尺 → 二衬浇筑；顺序由工序台账闸口强制，本页不可越序操作</span>
      </header>
      <table class="data-table">
        <thead><tr><th>工序</th><th>已登记条数</th><th>最近时刻</th></tr></thead>
        <tbody>
          <tr>
            <td>① 冻结孔测温</td>
            <td>{{ state.readings.length }}</td>
            <td>{{ latestReadingAt }}</td>
          </tr>
          <tr>
            <td>② 开挖进尺</td>
            <td>{{ state.advances.length }}</td>
            <td>{{ latestAdvanceAt }}</td>
          </tr>
          <tr>
            <td>③ 二衬浇筑</td>
            <td>{{ state.linings.length }}</td>
            <td>{{ latestLiningAt }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <p class="flash" :class="flashOk ? 'flash-ok' : 'flash-bad'" v-if="flash">{{ flash }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import ReadingEntry from './components/ReadingEntry.vue'
import HazardPanel from './components/HazardPanel.vue'
import { assessCurtain } from '@/data/freeze-service'
import { freezeState } from '@/data/freeze-store'

const state = freezeState()
const verdict = computed(() => assessCurtain(state))

const latestReadingAt = computed(() =>
  [...state.readings].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]?.measuredAt.replace('T', ' ') ?? '—',
)
const latestAdvanceAt = computed(() =>
  [...state.advances].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.startedAt.replace('T', ' ') ?? '—',
)
const latestLiningAt = computed(() =>
  [...state.linings].sort((a, b) => b.pouredAt.localeCompare(a.pouredAt))[0]?.pouredAt.replace('T', ' ') ?? '—',
)

const flash = ref('')
const flashOk = ref(true)
function showResult(message: string, ok: boolean) {
  flash.value = message
  flashOk.value = ok
}
</script>

<style scoped>
.curtain-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 8px;
  padding: 14px 18px;
  margin: 12px 0;
  border: 1px solid;
}
.curtain-ok {
  background: #ecfdf3;
  border-color: #abefc6;
}
.curtain-bad {
  background: #fef3f2;
  border-color: #fecdca;
}
.curtain-main h3 {
  margin: 0 0 4px;
}
.curtain-main p {
  margin: 2px 0;
  font-size: 13px;
}
.curtain-stats {
  display: flex;
  gap: 18px;
}
.curtain-stats div {
  text-align: center;
}
.curtain-stats strong {
  display: block;
  font-size: 24px;
}
.curtain-stats strong.warn {
  color: #b42318;
}
.curtain-stats span {
  font-size: 12px;
  color: var(--muted);
}
.work-panel {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  margin: 14px 0;
}
.panel-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 8px;
}
.panel-head h3 {
  margin: 0;
  font-size: 15px;
}
.panel-tip {
  font-size: 12px;
  color: var(--muted);
}
.flash {
  position: fixed;
  right: 24px;
  bottom: 24px;
  max-width: 520px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  box-shadow: 0 6px 20px rgba(16, 24, 40, 0.18);
  z-index: 10;
}
.flash-ok {
  background: #ecfdf3;
  border: 1px solid #abefc6;
  color: #027a48;
}
.flash-bad {
  background: #fef3f2;
  border: 1px solid #fecdca;
  color: #b42318;
}
</style>

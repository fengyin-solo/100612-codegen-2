<template>
  <section class="panel">
    <h3 class="panel-title">开挖进尺登记</h3>

    <div class="gate-box" :class="gate.ok ? 'gate-ok' : 'gate-bad'">
      <strong>开挖条件检查：</strong>
      <span>{{ gate.ok ? '满足——测温无中断、全部冻结孔达到设计温度，可登记开挖进尺' : gate.message }}</span>
    </div>

    <form class="inline-form" @submit.prevent="submitAdvance">
      <label class="form-item">
        <span>开挖日期</span>
        <input v-model="advance.advanceDate" type="date" />
      </label>
      <label class="form-item">
        <span>本班进尺(m)</span>
        <input v-model="advance.meter" placeholder="如 1.2" />
      </label>
      <label class="form-item">
        <span>班次</span>
        <input v-model="advance.shiftLabel" placeholder="如 白班 2026-10-05" />
      </label>
      <label class="form-item">
        <span>当班负责人</span>
        <input v-model="advance.recorder" placeholder="姓名" />
      </label>
      <label class="form-item check">
        <input v-model="advance.abnormal" type="checkbox" />
        <span>本班进尺异常（自动写入安全巡检待整改清单）</span>
      </label>
      <label v-if="advance.abnormal" class="form-item wide">
        <span>异常情况说明</span>
        <input v-model="advance.abnormalReason" placeholder="如 工作面掉块、进尺超偏、停挖等" />
      </label>
      <button class="btn primary" type="submit" :disabled="!gate.ok">登记开挖进尺</button>
    </form>

    <table class="data-table compact">
      <thead>
        <tr><th>日期</th><th>班次</th><th>进尺(m)</th><th>负责人</th><th>异常</th><th>登记时未达标孔数</th><th>状态</th></tr>
      </thead>
      <tbody>
        <tr v-for="item in store.advances" :key="item.id" :class="item.abnormal ? 'row-bad' : ''">
          <td>{{ item.advanceDate }}</td>
          <td>{{ item.shiftLabel }}</td>
          <td>{{ item.meter }}</td>
          <td>{{ item.recorder }}</td>
          <td :class="item.abnormal ? 'bad-text' : ''">
            {{ item.abnormal ? `异常：${item.abnormalReason}` : '正常' }}
          </td>
          <td>{{ item.curtainSnapshot.unqualifiedCount }}</td>
          <td class="ok-text">已登记</td>
        </tr>
        <tr v-if="!store.advances.length">
          <td colspan="7" class="empty-state">尚未登记开挖进尺（帷幕未达标或测温中断期间不可登记）</td>
        </tr>
      </tbody>
    </table>

    <h3 class="panel-title second">二次衬砌浇筑登记</h3>
    <div class="gate-box" :class="liningGate.ok ? 'gate-ok' : 'gate-bad'">
      <strong>二衬条件检查：</strong>
      <span>{{ liningGate.ok ? '满足——已有开挖进尺，且首仓尚未浇筑' : liningGate.message }}</span>
    </div>
    <form class="inline-form" @submit.prevent="submitLining">
      <label class="form-item">
        <span>浇筑日期</span>
        <input v-model="lining.pourDate" type="date" />
      </label>
      <label class="form-item">
        <span>浇筑仓段</span>
        <input v-model="lining.sectionLabel" placeholder="如 首仓 K12+310～K12+312" />
      </label>
      <label class="form-item">
        <span>值班人</span>
        <input v-model="lining.recorder" placeholder="姓名" />
      </label>
      <button class="btn primary" type="submit" :disabled="!liningGate.ok">登记二衬浇筑</button>
      <span class="hint">顺序硬性要求：先有开挖进尺才能浇筑二衬；首仓浇筑后进尺台账封闭</span>
    </form>

    <table class="data-table compact">
      <thead>
        <tr><th>浇筑日期</th><th>仓段</th><th>值班人</th><th>状态</th></tr>
      </thead>
      <tbody>
        <tr v-for="item in store.linings" :key="item.id">
          <td>{{ item.pourDate }}</td>
          <td>{{ item.sectionLabel }}</td>
          <td>{{ item.recorder }}</td>
          <td class="ok-text">已浇筑（工序闭环）</td>
        </tr>
        <tr v-if="!store.linings.length">
          <td colspan="4" class="empty-state">尚未进行二衬浇筑</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { GateResult } from '../types'
import { checkAdvanceGate, checkLiningGate } from '../rules'
import { useFreezingStore } from '../store'

const emit = defineEmits<{ (e: 'notice', result: GateResult): void }>()
const notify = (result: GateResult) => emit('notice', result)

const store = useFreezingStore()

const advance = reactive({
  advanceDate: '2026-10-05',
  meter: '',
  shiftLabel: '',
  recorder: '',
  abnormal: false,
  abnormalReason: '',
})
const lining = reactive({ pourDate: '2026-10-05', sectionLabel: '', recorder: '' })

const gate = computed(() =>
  checkAdvanceGate({
    holes: store.holes,
    readings: store.state.readings,
    rounds: store.state.rounds,
    advances: store.state.advances,
    linings: store.state.linings,
  }),
)
const liningGate = computed(() =>
  checkLiningGate({ advances: store.state.advances, linings: store.state.linings }),
)

function submitAdvance() {
  const result = store.addAdvance({ ...advance })
  notify(result)
  if (result.ok) {
    advance.meter = ''
    advance.shiftLabel = ''
    advance.abnormal = false
    advance.abnormalReason = ''
  }
}

function submitLining() {
  notify(store.addLining({ ...lining }))
}
</script>

<style scoped>
.panel { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
.panel-title { margin: 0 0 10px; font-size: 15px; }
.panel-title.second { margin-top: 16px; }
.gate-box { border-radius: 8px; padding: 8px 10px; font-size: 12.5px; margin-bottom: 10px; line-height: 1.6; }
.gate-ok { background: #f2fbf4; border: 1px solid #a6d5b0; color: #067647; }
.gate-bad { background: #fef3f2; border: 1px solid #f0a9a2; color: #b42318; }
.inline-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin: 0 0 12px; }
.form-item span { display: block; font-size: 12px; color: var(--muted); }
.form-item input { padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px; }
.form-item.check { display: flex; align-items: center; gap: 6px; }
.form-item.check span { color: #b54708; }
.form-item.wide { flex: 1 1 100%; }
.form-item.wide input { width: 100%; }
.hint { font-size: 12px; color: var(--muted); }
.data-table.compact th, .data-table.compact td { padding: 6px 8px; font-size: 12px; }
.row-bad { background: #fff8f7; }
.ok-text { color: #067647; }
.bad-text { color: #b42318; }
</style>

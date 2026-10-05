<template>
  <section class="panel">
    <h3 class="panel-title">冻结孔测温台账</h3>

    <div class="panel-actions">
      <button class="btn" type="button" @click="reimport">存量冻结孔按布孔日期重新入库</button>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>测温顺序</th>
          <th>孔号</th>
          <th>设计温度</th>
          <th>布孔日期</th>
          <th>最新读数</th>
          <th>取数时刻</th>
          <th>来源</th>
          <th>达标判定</th>
          <th>差距</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="hole in store.holes" :key="hole.id">
          <td>{{ hole.orderSeq }}</td>
          <td>{{ hole.code }}<span v-if="hole.imported" class="tag">存量</span></td>
          <td>{{ hole.designTempC }}℃</td>
          <td>{{ hole.layoutDate }}</td>
          <td :class="row(hole.id).ok ? 'ok-text' : 'bad-text'">
            {{ row(hole.id).latest !== null ? `${row(hole.id).latest}℃` : '待补测（无读数）' }}
          </td>
          <td>{{ row(hole.id).at ? row(hole.id).at!.replace('T', ' ') : '—' }}</td>
          <td>{{ row(hole.id).source ?? '—' }}</td>
          <td :class="row(hole.id).ok ? 'ok-text' : 'bad-text'">
            {{ row(hole.id).ok ? '达标' : '未达标' }}
          </td>
          <td :class="row(hole.id).ok ? 'ok-text' : 'bad-text'">{{ row(hole.id).gapText }}</td>
        </tr>
        <tr v-if="!store.holes.length">
          <td colspan="9" class="empty-state">暂无冻结孔，可先登记或回填存量孔</td>
        </tr>
      </tbody>
    </table>

    <form class="inline-form" @submit.prevent="submitHole">
      <h4 class="form-title">登记新冻结孔</h4>
      <label class="form-item">
        <span>孔号</span>
        <input v-model="form.code" placeholder="如 D09" />
      </label>
      <label class="form-item">
        <span>设计温度(℃)</span>
        <input v-model.number="form.designTempC" type="number" step="0.1" />
      </label>
      <label class="form-item">
        <span>布孔日期</span>
        <input v-model="form.layoutDate" type="date" />
      </label>
      <button class="btn primary" type="submit">登记并重排顺序</button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import type { GateResult } from '../types'
import { latestReadingMap, round1 } from '../rules'
import { useFreezingStore } from '../store'

const emit = defineEmits<{ (e: 'notice', result: GateResult): void }>()
const notify = (result: GateResult) => emit('notice', result)

const store = useFreezingStore()

const form = reactive({ code: '', designTempC: -10, layoutDate: '2026-10-05' })

function row(holeId: number) {
  const latest = latestReadingMap(store.state.readings).get(holeId) ?? null
  const hole = store.state.holes.find((item) => item.id === holeId)
  if (!latest || !hole) {
    return {
      latest: null,
      at: null,
      source: null,
      ok: false,
      gapText: `缺读数，设计 ${hole ? hole.designTempC : ''}℃`,
    }
  }
  const ok = latest.tempC <= hole.designTempC
  return {
    latest: latest.tempC,
    at: latest.at,
    source: latest.source,
    ok,
    gapText: ok ? '—' : `还差 ${round1(latest.tempC - hole.designTempC)}℃`,
  }
}

function submitHole() {
  notify(store.addHole({ code: form.code, designTempC: Number(form.designTempC), layoutDate: form.layoutDate }))
  form.code = ''
}

function reimport() {
  notify(store.reimportStock())
}
</script>

<style scoped>
.panel { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
.panel-title { margin: 0 0 10px; font-size: 15px; }
.panel-actions { margin-bottom: 10px; }
.tag { display: inline-block; margin-left: 6px; font-size: 11px; background: #eef2f7; color: var(--muted); border-radius: 999px; padding: 0 8px; }
.ok-text { color: #067647; }
.bad-text { color: #b42318; }
.inline-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); }
.form-title { width: 100%; margin: 0; font-size: 13px; }
.form-item span { display: block; font-size: 12px; color: var(--muted); }
.form-item input { padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px; }
</style>

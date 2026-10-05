<template>
  <section class="panel">
    <h3 class="panel-title">测温取数与中断补测</h3>

    <!-- 当前轮次 -->
    <div v-if="openRound" class="round-card" :class="openRound.status === '中断' ? 'round-bad' : 'round-live'">
      <div class="round-head">
        <strong>当前轮次：{{ openRound.shiftLabel }}（{{ openRound.status }}）</strong>
        <span>开始 {{ openRound.startedAt.replace('T', ' ') }}</span>
      </div>
      <p v-if="openRound.status === '中断'" class="round-tip">
        本班于 {{ openRound.interruptedAt?.replace('T', ' ') }} 在「<em>{{ resumeHole?.code }}</em>」断数，
        恢复后只能从该孔接着补测，不能跳孔、不能拿旧读数顶替新数据。
      </p>
      <p v-else class="round-tip">
        已测 {{ openRound.measuredHoleIds.length }}/{{ store.holes.length }} 孔，
        下一个轮到「<em>{{ nextHole?.code }}</em>」，请按布孔顺序逐孔取数。
      </p>
      <div class="round-actions">
        <button class="btn" type="button" @click="interrupt">登记测温中断（记录断掉的孔）</button>
        <label class="reason-line">
          <input v-model="emptyReason" placeholder="整班未取到读数时填写原因，按空班收班" />
          <button class="btn ghost" type="button" @click="closeEmpty">空班收班</button>
        </label>
      </div>
    </div>

    <!-- 新开轮次 -->
    <form v-else class="inline-form" @submit.prevent="startRound">
      <label class="form-item">
        <span>本班班次</span>
        <input v-model="shiftLabel" placeholder="如 白班 2026-10-05（08:00-20:00）" style="width: 260px" />
      </label>
      <button class="btn primary" type="submit">开始本班测温</button>
      <span class="hint">没有进行中的轮次，可先开轮次；零散补录也可直接在下方登记读数</span>
    </form>

    <!-- 读数登记 -->
    <form class="inline-form reading-form" @submit.prevent="submitReading">
      <h4 class="form-title">登记测温读数（同一孔同一时刻重复上传只留先登记的一条）</h4>
      <label class="form-item">
        <span>冻结孔</span>
        <select v-model="form.holeId" :disabled="lockedHoleId !== null">
          <option :value="0">请选择</option>
          <option v-for="hole in store.holes" :key="hole.id" :value="hole.id">
            {{ hole.orderSeq }}. {{ hole.code }}（设计 {{ hole.designTempC }}℃）
          </option>
        </select>
      </label>
      <label class="form-item">
        <span>取数时刻</span>
        <input v-model="form.at" type="datetime-local" />
      </label>
      <label class="form-item">
        <span>实测温度(℃)</span>
        <input v-model.number="form.tempC" type="number" step="0.1" />
      </label>
      <label class="form-item">
        <span>测温人</span>
        <input v-model="form.recorder" placeholder="值守人姓名" />
      </label>
      <button class="btn primary" type="submit">提交读数</button>
      <p v-if="openRound?.status === '中断'" class="form-warn">
        中断补测已锁定断孔「{{ resumeHole?.code }}」，先补这一条才能继续后面的孔。
      </p>
      <p v-else-if="openRound" class="hint">
        本班按序测温，当前应登记「{{ nextHole?.code }}」。
      </p>
    </form>

    <h4 class="form-title">最近测温记录</h4>
    <table class="data-table compact">
      <thead>
        <tr>
          <th>取数时刻</th><th>孔号</th><th>实测温度</th><th>设计温度</th><th>来源</th><th>测温人</th><th>判定</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in recentReadings" :key="item.id">
          <td>{{ item.at.replace('T', ' ') }}</td>
          <td>{{ codeOf(item.holeId) }}</td>
          <td>{{ item.tempC }}℃</td>
          <td>{{ designOf(item.holeId) }}℃</td>
          <td>
            {{ item.source }}
            <span v-if="item.roundId === null" class="tag">轮次外补录</span>
          </td>
          <td>{{ item.recorder }}</td>
          <td :class="isOk(item) ? 'ok-text' : 'bad-text'">{{ isOk(item) ? '达标' : '未达标' }}</td>
        </tr>
        <tr v-if="!store.readings.length">
          <td colspan="7" class="empty-state">暂无测温读数</td>
        </tr>
      </tbody>
    </table>

    <h4 class="form-title">轮次记录（中断必须补测收齐，整班取不到数写明原因）</h4>
    <table class="data-table compact">
      <thead>
        <tr><th>班次</th><th>开始时刻</th><th>状态</th><th>已测孔数</th><th>断孔/空班说明</th><th>收尾时刻</th></tr>
      </thead>
      <tbody>
        <tr v-for="round in store.rounds" :key="round.id">
          <td>{{ round.shiftLabel }}</td>
          <td>{{ round.startedAt.replace('T', ' ') }}</td>
          <td :class="round.status === '中断' ? 'bad-text' : round.status === '空班' ? 'warn-text' : 'ok-text'">
            {{ round.status }}
          </td>
          <td>{{ round.measuredHoleIds.length }}/{{ store.holes.length }}</td>
          <td>
            <template v-if="round.status === '中断'">断在「{{ codeOf(round.resumeHoleId) }}」，待补测</template>
            <template v-else-if="round.status === '空班'">空班原因：{{ round.emptyReason }}</template>
            <template v-else>—</template>
          </td>
          <td>{{ round.closedAt ? round.closedAt.replace('T', ' ') : '—' }}</td>
        </tr>
        <tr v-if="!store.rounds.length">
          <td colspan="6" class="empty-state">暂无轮次记录</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { GateResult } from '../types'
import { useFreezingStore } from '../store'

const emit = defineEmits<{ (e: 'notice', result: GateResult): void }>()
const notify = (result: GateResult) => emit('notice', result)

const store = useFreezingStore()
const openRound = computed(() => store.openRound)

const shiftLabel = ref('')
const emptyReason = ref('')
const form = reactive({ holeId: 0, at: defaultAt(), tempC: -10, recorder: '' })

function defaultAt(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// 轮次存在时孔位选择锁定：中断锁断孔，进行中锁下一个应测孔。
const lockedHoleId = computed<number | null>(() => {
  const round = openRound.value
  if (!round) return null
  if (round.status === '中断') return round.resumeHoleId
  const next = store.holes.find((hole) => !round.measuredHoleIds.includes(hole.id))
  return next ? next.id : null
})

const resumeHole = computed(() =>
  openRound.value?.resumeHoleId !== null && openRound.value?.resumeHoleId !== undefined
    ? store.state.holes.find((hole) => hole.id === openRound.value?.resumeHoleId) ?? null
    : null,
)
const nextHole = computed(() =>
  store.holes.find((hole) => !openRound.value?.measuredHoleIds.includes(hole.id)) ?? null,
)

const recentReadings = computed(() => [...store.readings].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 12))

function codeOf(holeId: number | null): string {
  if (holeId === null) return '—'
  return store.state.holes.find((hole) => hole.id === holeId)?.code ?? '已删孔'
}
function designOf(holeId: number): number | string {
  return store.state.holes.find((hole) => hole.id === holeId)?.designTempC ?? '—'
}
function isOk(item: { holeId: number; tempC: number }): boolean {
  const hole = store.state.holes.find((h) => h.id === item.holeId)
  return !!hole && item.tempC <= hole.designTempC
}

function startRound() {
  notify(store.startRound(shiftLabel.value))
  shiftLabel.value = ''
}
function interrupt() {
  if (openRound.value) notify(store.interruptRound(openRound.value.id))
}
function closeEmpty() {
  if (openRound.value) {
    notify(store.closeEmptyRound(openRound.value.id, emptyReason.value))
    emptyReason.value = ''
  }
}
function submitReading() {
  const holeId = lockedHoleId.value ?? form.holeId
  const result = store.addReading({
    holeId,
    at: form.at,
    tempC: Number(form.tempC),
    recorder: form.recorder,
  })
  notify(result)
  if (result.ok) {
    form.holeId = 0
    form.at = defaultAt()
  }
}
</script>

<style scoped>
.panel { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
.panel-title { margin: 0 0 10px; font-size: 15px; }
.round-card { border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
.round-live { background: #eff8ff; border: 1px solid #a8ccf5; }
.round-bad { background: #fef3f2; border: 1px solid #f0a9a2; }
.round-head { display: flex; justify-content: space-between; font-size: 13px; }
.round-tip { margin: 6px 0; font-size: 13px; }
.round-tip em { font-style: normal; font-weight: 700; }
.round-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.reason-line { display: flex; gap: 6px; }
.reason-line input { padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px; min-width: 300px; }
.inline-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin: 10px 0; }
.reading-form { padding: 10px; background: #f8fafc; border-radius: 8px; }
.form-title { width: 100%; margin: 12px 0 4px; font-size: 13px; }
.form-item span { display: block; font-size: 12px; color: var(--muted); }
.form-item input, .form-item select { padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px; }
.hint { font-size: 12px; color: var(--muted); }
.form-warn { width: 100%; color: #b42318; font-size: 12px; margin: 4px 0 0; }
.data-table.compact th, .data-table.compact td { padding: 6px 8px; font-size: 12px; }
.tag { display: inline-block; margin-left: 6px; font-size: 11px; background: #eef2f7; color: var(--muted); border-radius: 999px; padding: 0 8px; }
.ok-text { color: #067647; }
.bad-text { color: #b42318; }
.warn-text { color: #b54708; }
</style>

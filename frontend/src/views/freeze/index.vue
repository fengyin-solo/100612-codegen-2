<template>
  <section class="page" data-module="freeze">
    <header class="page-head">
      <div>
        <h2>联络通道冻结与开挖工序台账</h2>
        <p class="page-desc">
          按冻结孔登记测温 → 按设计温度判定冻土帷幕 → 达标才准开挖进尺 → 二衬浇筑不许越序；越序挡回、断点续测、空态留因、隐患同源回写。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="resetAll">恢复演示数据</button>
      </div>
    </header>

    <!-- 存量孔重新入库提示 -->
    <div v-if="pendingReindex > 0" class="banner banner-warn">
      <div>
        检测到 <strong>{{ pendingReindex }}</strong> 个存量冻结孔尚未按布孔日期重新入库（当前孔表为回填乱序）。
        其中缺温度孔将按“缺测待补、禁止推算、现场补测”处理。
      </div>
      <button class="btn primary" type="button" @click="doReindex">立即按布孔日期重新入库</button>
    </div>

    <!-- 冻土帷幕判定 -->
    <div class="curtain-card" :class="verdict.formable ? 'curtain-ok' : 'curtain-bad'">
      <div class="curtain-main">
        <h3>冻土帷幕判定</h3>
        <p>{{ verdict.message }}</p>
        <p v-if="verdict.blind" class="blind-note">测温盲区：最近班次整班无读数，按规程任何人不得判定帷幕已形成。</p>
      </div>
      <div class="curtain-stats">
        <div><strong>{{ verdict.qualifiedCount }}</strong><span>达标孔</span></div>
        <div><strong :class="{ warn: verdict.unqualified.length > 0 }">{{ verdict.unqualified.length }}</strong><span>未达标/缺测孔</span></div>
        <div><strong>{{ verdict.holeCount }}</strong><span>冻结孔总数</span></div>
      </div>
    </div>

    <!-- 冻结孔表 -->
    <h3 class="block-title">冻结孔（按入库序号）</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>入库序号</th>
          <th>孔号</th>
          <th>布孔日期</th>
          <th>设计温度 ℃</th>
          <th>最新读数</th>
          <th>最新时刻</th>
          <th>逐孔判定</th>
          <th>存量/缺测</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in holeTable" :key="item.hole.id">
          <td>{{ item.hole.seqNo }}</td>
          <td>{{ item.hole.code }}</td>
          <td>{{ item.hole.layoutDate }}</td>
          <td>{{ item.hole.designTemp }}</td>
          <td v-if="item.latest" :class="item.qualified ? 'temp-ok' : 'temp-bad'">{{ item.latest.temp }}℃</td>
          <td v-else class="muted">—</td>
          <td>{{ item.latest?.measuredAt.replace('T', ' ') ?? '—' }}</td>
          <td>
            <span :class="['tag', item.qualified ? 'tag-ok' : 'tag-danger']">
              {{ item.qualified ? '达标' : item.hole.gap ? '缺测待补' : item.latest ? `差 ${item.gapDegrees}℃` : '无读数' }}
            </span>
            <span v-if="!item.qualified && item.latest" class="muted">（{{ item.reason }}）</span>
          </td>
          <td>
            {{ item.hole.legacy ? '存量' : '新孔' }}
            <span v-if="item.hole.gap" class="tag tag-danger">缺温度</span>
            <span v-else-if="item.hole.gapNote" class="tag tag-ok">已补测</span>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 测温（共享组件，与监测入口同一份数据） -->
    <ReadingEntry @result="showResult" />

    <!-- 开挖进尺 -->
    <section class="work-panel">
      <header class="panel-head">
        <h3>开挖进尺登记</h3>
        <span class="panel-tip" :class="{ 'panel-tip-bad': !verdict.formable }">
          开挖条件：{{ verdict.formable ? '已满足，允许登记进尺' : '未满足，登记将被退回并指出差多少度' }}
        </span>
      </header>
      <form class="work-form" @submit.prevent="saveAdvance">
        <label><span>部位/桩号</span><input v-model="advanceForm.mileage" placeholder="如 联络通道 K12+300 上台阶" /></label>
        <label><span>本班进尺 m</span><input v-model.number="advanceForm.advance" type="number" step="0.1" /></label>
        <label><span>开挖时刻</span><input v-model="advanceForm.startedAt" type="datetime-local" /></label>
        <label class="check-line">
          <input v-model="advanceForm.abnormal" type="checkbox" />
          <span>本班进尺异常（自动写入安全巡检待整改清单）</span>
        </label>
        <label class="full-line">
          <span>异常情况</span>
          <input v-model="advanceForm.abnormalNote" placeholder="涌水/片帮/温度回升等，勾选异常时必填" />
        </label>
        <button class="btn primary" type="submit">登记开挖进尺</button>
      </form>
      <table class="data-table">
        <thead><tr><th>部位/桩号</th><th>进尺 m</th><th>开挖时刻</th><th>异常</th><th>登记人</th></tr></thead>
        <tbody>
          <tr v-for="row in advances" :key="row.id">
            <td>{{ row.mileage }}</td>
            <td>{{ row.advance }}</td>
            <td>{{ row.startedAt.replace('T', ' ') }}</td>
            <td>
              <span v-if="row.abnormal" class="tag tag-danger">异常：{{ row.abnormalNote }}</span>
              <span v-else class="tag tag-ok">正常</span>
            </td>
            <td>{{ row.operator }}</td>
          </tr>
          <tr v-if="!advances.length"><td colspan="5" class="empty-state">尚未登记开挖进尺（帷幕达标前登记会被退回）</td></tr>
        </tbody>
      </table>
    </section>

    <!-- 二衬浇筑 -->
    <section class="work-panel">
      <header class="panel-head">
        <h3>二衬浇筑登记</h3>
        <span class="panel-tip">工序闸口：必须先有开挖进尺，浇筑时刻晚于最近进尺；越序直接挡回</span>
      </header>
      <form class="work-form" @submit.prevent="saveLining">
        <label><span>部位/桩号</span><input v-model="liningForm.mileage" placeholder="与进尺部位对应" /></label>
        <label><span>浇筑方量 m³</span><input v-model.number="liningForm.volume" type="number" step="0.5" /></label>
        <label><span>浇筑时刻</span><input v-model="liningForm.pouredAt" type="datetime-local" /></label>
        <label class="full-line"><span>备注</span><input v-model="liningForm.note" /></label>
        <button class="btn primary" type="submit">登记二衬浇筑</button>
      </form>
      <table class="data-table">
        <thead><tr><th>部位/桩号</th><th>方量 m³</th><th>浇筑时刻</th><th>登记人</th><th>备注</th></tr></thead>
        <tbody>
          <tr v-for="row in linings" :key="row.id">
            <td>{{ row.mileage }}</td>
            <td>{{ row.volume }}</td>
            <td>{{ row.pouredAt.replace('T', ' ') }}</td>
            <td>{{ row.operator }}</td>
            <td>{{ row.note || '—' }}</td>
          </tr>
          <tr v-if="!linings.length"><td colspan="5" class="empty-state">尚未登记二衬浇筑</td></tr>
        </tbody>
      </table>
    </section>

    <!-- 隐患清单（同源组件） -->
    <HazardPanel :verdict="verdict" @result="showResult" />

    <!-- 操作留痕 -->
    <section class="work-panel">
      <header class="panel-head">
        <h3>操作留痕</h3>
        <span class="panel-tip">同一条重复递交只记一次；写不成就不落半条，退回原因在此可查</span>
      </header>
      <table class="data-table">
        <thead><tr><th>时间</th><th>结果</th><th>动作</th><th>说明</th><th>操作人</th></tr></thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td>{{ log.at.replace('T', ' ') }}</td>
            <td><span :class="['tag', kindClass(log.kind)]">{{ log.kind }}</span></td>
            <td>{{ log.action }}</td>
            <td>{{ log.detail }}</td>
            <td>{{ log.operator }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <p class="flash" :class="flashOk ? 'flash-ok' : 'flash-bad'" v-if="flash">{{ flash }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import ReadingEntry from './components/ReadingEntry.vue'
import HazardPanel from './components/HazardPanel.vue'
import {
  assessCurtain,
  orderedHoles,
  latestReadings,
  pendingReindexCount,
  reindexLegacyHoles,
  submitAdvance,
  submitLining,
} from '@/data/freeze-service'
import { freezeState, resetFreezeLedger } from '@/data/freeze-store'
import type { HoleVerdict } from '@/data/freeze-service'
import { useSessionStore } from '@/stores/session'

const store = useSessionStore()
const state = freezeState()

const verdict = computed(() => assessCurtain(state))
const pendingReindex = computed(() => pendingReindexCount(state))
const holeTable = computed<HoleVerdict[]>(() => {
  const latest = latestReadings(state)
  return orderedHoles(state).map((hole) => {
    const reading = latest.get(hole.id)
    if (!reading) {
      return { hole, latest: undefined, qualified: false, gapDegrees: Infinity, reason: hole.gap ? '回填缺温度，缺测待补' : '尚无有效读数' }
    }
    if (reading.temp > hole.designTemp) {
      return { hole, latest: reading, qualified: false, gapDegrees: Number((reading.temp - hole.designTemp).toFixed(1)), reason: `${reading.temp}℃ 高于设计 ${hole.designTemp}℃` }
    }
    return { hole, latest: reading, qualified: true, gapDegrees: 0, reason: '' }
  })
})

const advances = computed(() => [...state.advances].sort((a, b) => b.startedAt.localeCompare(a.startedAt)))
const linings = computed(() => [...state.linings].sort((a, b) => b.pouredAt.localeCompare(a.pouredAt)))
const logs = computed(() => [...state.logs].sort((a, b) => b.at.localeCompare(a.at)))

const advanceForm = reactive({
  mileage: '联络通道 K12+300 上台阶',
  advance: 0.6,
  startedAt: '2026-10-05T14:00',
  abnormal: false,
  abnormalNote: '',
})
const liningForm = reactive({
  mileage: '联络通道 K12+300 上台阶',
  volume: 12,
  pouredAt: '2026-10-05T18:00',
  note: '',
})

const flash = ref('')
const flashOk = ref(true)
function showResult(message: string, ok: boolean) {
  flash.value = message
  flashOk.value = ok
}

function saveAdvance() {
  const result = submitAdvance({ ...advanceForm }, store.operator)
  showResult(result.message, result.ok)
}
function saveLining() {
  const result = submitLining({ ...liningForm }, store.operator)
  showResult(result.message, result.ok)
}
function doReindex() {
  const result = reindexLegacyHoles(store.operator)
  showResult(result.message, result.ok)
}
function resetAll() {
  resetFreezeLedger()
  showResult('已恢复为首次播种的演示数据。', true)
}

function kindClass(kind: string): string {
  if (kind === '成功') return 'tag-ok'
  if (kind === '退回') return 'tag-danger'
  return 'tag-info'
}
</script>

<style scoped>
.banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-radius: 8px;
  padding: 10px 14px;
  margin: 10px 0;
  font-size: 13px;
}
.banner-warn {
  background: #fffaeb;
  border: 1px solid #fedf89;
  color: #b54708;
}
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
.blind-note {
  color: #b42318;
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
.block-title {
  margin: 14px 0 6px;
  font-size: 15px;
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
.panel-tip-bad {
  color: #b42318;
}
.work-form {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  margin-bottom: 12px;
}
.work-form label {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--muted);
  gap: 4px;
}
.work-form label.full-line {
  flex: 1 1 240px;
}
.work-form input {
  font: inherit;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.check-line {
  flex-direction: row !important;
  align-items: center;
  color: #1f2937 !important;
}
.temp-ok {
  color: #027a48;
}
.temp-bad {
  color: #b42318;
}
.tag {
  display: inline-block;
  border-radius: 999px;
  padding: 1px 10px;
  font-size: 12px;
}
.tag-danger {
  background: #fef3f2;
  color: #b42318;
}
.tag-ok {
  background: #ecfdf3;
  color: #027a48;
}
.tag-info {
  background: #eef2f7;
  color: #475467;
}
.muted {
  color: var(--muted);
  font-size: 12px;
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

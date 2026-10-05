import { defineStore } from 'pinia'

import { buildSeedState } from './seed'
import {
  advanceHazardKey,
  checkAdvanceGate,
  checkLiningGate,
  evaluateCurtain,
  nowStamp,
  sortHolesByLayout,
} from './rules'
import type {
  FreezeHazard,
  FreezeHole,
  FreezeReading,
  FreezeRound,
  GateResult,
  LedgerState,
} from './types'

// 独立于通用 CRUD 模块的存储键：两个入口、安全巡检页都从这里取同一份数据。
const STORAGE_KEY = 'crosspassage-freezing:ledger:v1'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function loadState(): LedgerState {
  const fallback = buildSeedState()
  if (typeof window === 'undefined' || !window.localStorage) return fallback
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LedgerState>
    return {
      holes: parsed.holes ?? fallback.holes,
      readings: parsed.readings ?? [],
      rounds: parsed.rounds ?? [],
      advances: parsed.advances ?? [],
      linings: parsed.linings ?? [],
      hazards: parsed.hazards ?? [],
      seq: parsed.seq ?? 100,
    }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

/** 布孔后重新按布孔日期（同日按孔号）排序并回填测温顺序号。 */
function reorderHoles(holes: FreezeHole[]): FreezeHole[] {
  const sorted = sortHolesByLayout(holes)
  sorted.forEach((hole, index) => {
    hole.orderSeq = index + 1
  })
  return sorted
}

export const useFreezingStore = defineStore('freezing-ledger', {
  state: () => ({ state: loadState() }),
  getters: {
    holes: (s): FreezeHole[] => sortHolesByLayout(s.state.holes),
    readings: (s): FreezeReading[] =>
      [...s.state.readings].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id)),
    rounds: (s): FreezeRound[] =>
      [...s.state.rounds].sort((a, b) => b.id - a.id),
    advances: (s) => [...s.state.advances].sort((a, b) => a.id - b.id),
    linings: (s) => [...s.state.linings].sort((a, b) => a.id - b.id),
    hazards: (s): FreezeHazard[] => [...s.state.hazards].sort((a, b) => b.id - a.id),
    pendingHazards(): FreezeHazard[] {
      return this.hazards.filter((item) => item.status === '待整改')
    },
    curtain(): ReturnType<typeof evaluateCurtain> {
      return evaluateCurtain(this.holes, this.readings)
    },
    openRound(): FreezeRound | null {
      const open = this.rounds.filter(
        (round) => round.status === '进行中' || round.status === '中断',
      )
      return open.length ? open[0] : null
    },
  },
  actions: {
    /** 统一落库：每个动作内部校验全部通过后只调一次，避免写一半。 */
    persist() {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
      }
    },
    bindStorageSync() {
      if (typeof window === 'undefined') return
      // 另一个标签页（另一个入口）落库后，把同一份数据重新装进当前内存态。
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY && event.newValue) {
          try {
            this.state = JSON.parse(event.newValue) as LedgerState
          } catch {
            /* 别的标签页写坏的数据不覆盖当前内存态 */
          }
        }
      })
    },
    nextId(): number {
      this.state.seq += 1
      return this.state.seq
    },

    // ── 冻结孔 ────────────────────────────────────────────────
    addHole(input: { code: string; designTempC: number; layoutDate: string }): GateResult {
      const code = input.code.trim()
      if (!code) return { ok: false, message: '孔号不能为空' }
      if (!input.layoutDate) return { ok: false, message: '布孔日期不能为空' }
      if (Number.isNaN(input.designTempC)) {
        return { ok: false, message: '设计温度必须是数字' }
      }
      if (this.state.holes.some((hole) => hole.code === code)) {
        return { ok: false, message: `孔号 ${code} 已存在，同一条孔位重复递交只记一次` }
      }
      const hole: FreezeHole = {
        id: this.nextId(),
        code,
        designTempC: input.designTempC,
        layoutDate: input.layoutDate,
        orderSeq: 0,
        imported: false,
      }
      this.state.holes = reorderHoles([...this.state.holes, hole])
      this.persist()
      return { ok: true, message: `冻结孔 ${code} 已登记，测温顺序已按布孔日期重排为第 ${hole.orderSeq} 号` }
    },

    /**
     * 存量冻结孔重新入库：以存量清单为准合并（已有的孔保留历史读数，不重复建孔），
     * 缺温度的孔不补造读数，继续按「待补测」参与帷幕判定。
     */
    reimportStock(): GateResult {
      const stock = buildSeedState().holes
      let added = 0
      for (const item of stock) {
        if (!this.state.holes.some((hole) => hole.code === item.code)) {
          this.state.holes.push({
            ...item,
            id: this.nextId(),
            orderSeq: 0,
            imported: true,
          })
          added += 1
        }
      }
      this.state.holes = reorderHoles(this.state.holes)
      this.persist()
      return {
        ok: true,
        message: `存量冻结孔已按布孔日期重新入库${added ? `，补登 ${added} 孔` : '，孔位无变化'}；缺温度的孔保持待补测，不编造历史读数`,
      }
    },

    // ── 测温轮次 ──────────────────────────────────────────────
    startRound(shiftLabel: string): GateResult {
      const label = shiftLabel.trim()
      if (!label) return { ok: false, message: '班次说明不能为空' }
      if (this.openRound) {
        return {
          ok: false,
          message: `「${this.openRound.shiftLabel}」还没收尾（${this.openRound.status}），先完成补测或按空班写明原因，不能停在半路另开一轮`,
        }
      }
      const round: FreezeRound = {
        id: this.nextId(),
        shiftLabel: label,
        startedAt: nowStamp(),
        status: '进行中',
        measuredHoleIds: [],
        resumeHoleId: null,
        interruptedAt: null,
        emptyReason: null,
        closedAt: null,
      }
      this.state.rounds.push(round)
      this.persist()
      return { ok: true, message: `测温轮次已开始（${label}），请按布孔顺序逐孔取数` }
    },

    interruptRound(roundId: number): GateResult {
      const round = this.state.rounds.find((item) => item.id === roundId)
      if (!round) return { ok: false, message: '没有找到该测温轮次' }
      if (round.status !== '进行中') {
        return { ok: false, message: `轮次当前为「${round.status}」，不能登记中断` }
      }
      const ordered = sortHolesByLayout(this.state.holes)
      const nextHole = ordered.find((hole) => !round.measuredHoleIds.includes(hole.id))
      if (!nextHole) {
        return { ok: false, message: '本班所有孔都已测完，请直接完成本班测温，不存在断掉的孔' }
      }
      round.status = '中断'
      round.resumeHoleId = nextHole.id
      round.interruptedAt = nowStamp()
      this.persist()
      return {
        ok: true,
        message: `已登记中断：本班在「${nextHole.code}」断数，恢复后必须从该孔接着补测，不得跳孔、不得拿旧读数顶替`,
      }
    },

    /** 整班一个读数都没取到时，写明原因空态收班，不允许把轮次挂在半路。 */
    closeEmptyRound(roundId: number, reason: string): GateResult {
      const text = reason.trim()
      if (!text) return { ok: false, message: '空班必须写明原因，不能给空说明' }
      const round = this.state.rounds.find((item) => item.id === roundId)
      if (!round) return { ok: false, message: '没有找到该测温轮次' }
      if (round.status !== '进行中' && round.status !== '中断') {
        return { ok: false, message: `轮次已收尾（${round.status}），不能再登记空班` }
      }
      if (round.measuredHoleIds.length > 0) {
        return {
          ok: false,
          message: `本班已取到 ${round.measuredHoleIds.length} 个孔的读数，不属于整班空态；请从断掉的孔补测收齐，空班说明只用于一整班都没取到数的情况`,
        }
      }
      round.status = '空班'
      round.emptyReason = text
      round.resumeHoleId = null
      round.closedAt = nowStamp()
      this.persist()
      return { ok: true, message: `已按空班收班并记录原因：${text}` }
    },

    // ── 测温记录 ──────────────────────────────────────────────
    addReading(input: {
      holeId: number
      at: string
      tempC: number
      recorder: string
    }): GateResult {
      const hole = this.state.holes.find((item) => item.id === input.holeId)
      if (!hole) return { ok: false, message: '请选择冻结孔' }
      if (!input.at) return { ok: false, message: '取数时刻不能为空' }
      if (Number.isNaN(input.tempC)) return { ok: false, message: '测温值必须是数字' }
      const recorder = input.recorder.trim() || '未署名'

      // 同一孔同一时刻（精确到分钟）重复上传，只保留第一条。
      const duplicated = this.state.readings.some(
        (item) => item.holeId === input.holeId && item.at === input.at,
      )
      if (duplicated) {
        return {
          ok: false,
          message: `${hole.code} 在 ${input.at.replace('T', ' ')} 已有测温记录，同一孔同一时刻重复上传只保留先登记的一条，未重复落库`,
        }
      }

      // 校验先于写入：轮次顺序要求先全部核完，再一次性落库。
      const round = this.openRound
      let source: FreezeReading['source'] = '值守测温'
      let attachedRound: FreezeRound | null = null
      if (round) {
        attachedRound = round
        if (round.status === '中断') {
          if (round.resumeHoleId !== hole.id) {
            const resumeHole = this.state.holes.find((item) => item.id === round.resumeHoleId)
            return {
              ok: false,
              message: `测温中断后必须从断掉的「${resumeHole ? resumeHole.code : '未知孔'}」接着补测，不能跳孔，也不能拿旧读数顶替新数据`,
            }
          }
          source = '中断补测'
        } else {
          const ordered = sortHolesByLayout(this.state.holes)
          const nextHole = ordered.find((item) => !round.measuredHoleIds.includes(item.id))
          if (!nextHole) {
            return { ok: false, message: '本班测温已全部收齐，请直接完成本班测温' }
          }
          if (nextHole.id !== hole.id) {
            return {
              ok: false,
              message: `本班测温应按布孔顺序进行，下一个轮到「${nextHole.code}」，不能先测 ${hole.code}`,
            }
          }
        }
      }

      const reading: FreezeReading = {
        id: this.nextId(),
        holeId: hole.id,
        at: input.at,
        tempC: input.tempC,
        source,
        roundId: attachedRound ? attachedRound.id : null,
        recorder,
        createdAt: nowStamp(),
      }
      this.state.readings.push(reading)

      let message = `${hole.code} 测温 ${input.tempC}℃ 已登记（${input.at.replace('T', ' ')}）`
      if (attachedRound) {
        attachedRound.measuredHoleIds.push(hole.id)
        if (attachedRound.status === '中断') {
          attachedRound.status = '进行中'
          attachedRound.resumeHoleId = null
          message += '；已从断孔恢复，本班按顺序继续补测'
        }
        if (attachedRound.measuredHoleIds.length === this.state.holes.length) {
          attachedRound.status = '已完成'
          attachedRound.closedAt = nowStamp()
          message += '；本班全部冻结孔测温收齐，轮次已完成'
        }
      }
      this.persist()
      return { ok: true, message }
    },

    // ── 开挖进尺 ──────────────────────────────────────────────
    addAdvance(input: {
      advanceDate: string
      meter: string
      shiftLabel: string
      recorder: string
      abnormal: boolean
      abnormalReason: string
    }): GateResult {
      if (!input.advanceDate) return { ok: false, message: '开挖日期不能为空' }
      const meter = input.meter.trim()
      if (!meter) return { ok: false, message: '进尺不能为空' }
      const shiftLabel = input.shiftLabel.trim()
      if (!shiftLabel) return { ok: false, message: '班次不能为空' }
      if (input.abnormal && !input.abnormalReason.trim()) {
        return { ok: false, message: '进尺异常必须写明异常情况，不能只勾异常不说明' }
      }

      const gate = checkAdvanceGate({
        holes: this.holes,
        readings: this.state.readings,
        rounds: this.state.rounds,
        advances: this.state.advances,
        linings: this.state.linings,
      })
      if (!gate.ok) return gate

      if (
        this.state.advances.some(
          (item) =>
            item.advanceDate === input.advanceDate &&
            item.shiftLabel === shiftLabel &&
            item.meter === meter,
        )
      ) {
        return { ok: false, message: '同一条开挖进尺重复递交只记一次，该日期/班次/进尺已登记，未重复落库' }
      }

      const curtain = evaluateCurtain(this.holes, this.state.readings)
      const id = this.nextId()
      this.state.advances.push({
        id,
        advanceDate: input.advanceDate,
        meter,
        shiftLabel,
        recorder: input.recorder.trim() || '未署名',
        abnormal: input.abnormal,
        abnormalReason: input.abnormalReason.trim(),
        curtainSnapshot: clone(curtain),
        createdAt: nowStamp(),
      })

      // 进尺异常同步写入安全巡检待整改清单，与台账在同一次提交里落库。
      if (input.abnormal) {
        const hazard: FreezeHazard = {
          id: this.nextId(),
          bizKey: advanceHazardKey(id),
          title: `联络通道开挖进尺异常（${input.advanceDate} ${shiftLabel}）`,
          detail: `进尺 ${meter} m 判定异常：${input.abnormalReason.trim()}；登记瞬间未达标孔 ${curtain.unqualifiedCount} 个（${curtain.unqualified
            .map((item) => item.code)
            .join('、') || '无'}）`,
          hazardLevel: '较大',
          status: '待整改',
          unqualifiedCount: curtain.unqualifiedCount,
          unqualifiedCodes: curtain.unqualified.map((item) => item.code),
          sourceAdvanceId: id,
          createdAt: nowStamp(),
          closedAt: null,
          conclusion: null,
        }
        this.state.hazards.push(hazard)
      }

      this.persist()
      return input.abnormal
        ? {
            ok: true,
            message: `开挖进尺 ${meter} m 已登记；进尺异常已写入安全巡检待整改清单（未达标孔数 ${curtain.unqualifiedCount} 已同步，两处读数一致）`,
          }
        : { ok: true, message: `开挖进尺 ${meter} m 已登记，登记时帷幕判定：${curtain.summary}` }
    },

    // ── 二衬浇筑 ──────────────────────────────────────────────
    addLining(input: { pourDate: string; sectionLabel: string; recorder: string }): GateResult {
      if (!input.pourDate) return { ok: false, message: '浇筑日期不能为空' }
      const sectionLabel = input.sectionLabel.trim()
      if (!sectionLabel) return { ok: false, message: '浇筑仓段不能为空' }
      const gate = checkLiningGate({ advances: this.state.advances, linings: this.state.linings })
      if (!gate.ok) return gate
      if (
        this.state.linings.some(
          (item) => item.pourDate === input.pourDate && item.sectionLabel === sectionLabel,
        )
      ) {
        return { ok: false, message: '同一仓段同一日期重复递交只记一次，未重复落库' }
      }
      this.state.linings.push({
        id: this.nextId(),
        pourDate: input.pourDate,
        sectionLabel,
        recorder: input.recorder.trim() || '未署名',
        createdAt: nowStamp(),
      })
      this.persist()
      return { ok: true, message: `二衬浇筑（${sectionLabel}，${input.pourDate}）已登记，工序闭环` }
    },

    // ── 隐患闭环（巡检与台账两处共用）────────────────────────
    closeHazard(id: number, conclusion: string): GateResult {
      const text = conclusion.trim()
      if (!text) return { ok: false, message: '处理结论不能为空，闭环必须回写结论' }
      const hazard = this.state.hazards.find((item) => item.id === id)
      if (!hazard) return { ok: false, message: '没有找到该条隐患' }
      if (hazard.status === '已闭环') {
        return { ok: false, message: '该隐患已闭环，处理结论重复提交只保留一次' }
      }
      hazard.status = '已闭环'
      hazard.closedAt = nowStamp()
      hazard.conclusion = text
      this.persist()
      return { ok: true, message: '处理结论已回写隐患清单，台账与安全巡检两处同步可见' }
    },

    resetLedger(): GateResult {
      this.state = buildSeedState()
      this.persist()
      return { ok: true, message: '已恢复到存量初始数据（含夜班中断轮次）' }
    },
  },
})

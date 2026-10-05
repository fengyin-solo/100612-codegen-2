import { commit, freezeState } from './freeze-store'
export { freezeState } from './freeze-store'
import type {
  AdvanceRecord,
  EmptyShift,
  FreezeHole,
  FreezeState,
  HazardRecord,
  HazardSource,
  LiningRecord,
  OpLog,
  ReadingInput,
  ServiceResult,
  ShiftSlot,
  TempReading,
} from './freeze-types'

/* -------------------------------- 班次工具 -------------------------------- */

const DAY_START_HOUR = 8

/** 按“白班 08:00-20:00 / 夜班 20:00-次日08:00”判定时刻所属班次。 */
export function shiftOf(measuredAt: string): { date: string; slot: ShiftSlot } {
  const [datePart, timePart = ''] = measuredAt.split('T')
  const hour = Number(timePart.split(':')[0] ?? 0)
  if (hour >= DAY_START_HOUR && hour < 20) {
    return { date: datePart, slot: '白班' }
  }
  // 00:00-08:00 算前一天的夜班
  const base = new Date(`${datePart}T00:00:00`)
  if (hour < DAY_START_HOUR) {
    base.setDate(base.getDate() - 1)
  }
  const y = base.getFullYear()
  const m = String(base.getMonth() + 1).padStart(2, '0')
  const d = String(base.getDate()).padStart(2, '0')
  return { date: `${y}-${m}-${d}`, slot: '夜班' }
}

export function shiftKey(date: string, slot: ShiftSlot): string {
  return `${date} ${slot}`
}

/* -------------------------------- 查询/判定 -------------------------------- */

/** 入库顺序：先入库序号，再按孔号兜底。 */
export function orderedHoles(state: FreezeState = freezeState()): FreezeHole[] {
  return [...state.holes].sort((a, b) => a.seqNo - b.seqNo || a.code.localeCompare(b.code))
}

export function holeById(state: FreezeState = freezeState(), id: number): FreezeHole | undefined {
  return state.holes.find((hole) => hole.id === id)
}

/** 每个孔的最新一条有效读数（缺温度孔从未补测时为空）。 */
export function latestReadings(state: FreezeState = freezeState()): Map<number, TempReading> {
  const map = new Map<number, TempReading>()
  for (const reading of [...state.readings].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))) {
    map.set(reading.holeId, reading)
  }
  return map
}

export interface HoleVerdict {
  hole: FreezeHole
  latest?: TempReading
  qualified: boolean
  /** 还差多少度才到设计温度：正数表示不达标差值，0 表示已达标/缺测另算 */
  gapDegrees: number
  reason: string
}

export interface CurtainVerdict {
  formable: boolean
  blind: boolean
  unqualified: HoleVerdict[]
  qualifiedCount: number
  holeCount: number
  message: string
  latestShiftKey: string
  /** 最新动态班次是否整班空态且其后再无读数 */
  latestIsEmpty: boolean
}

function readingsOfShift(state: FreezeState, date: string, slot: ShiftSlot): TempReading[] {
  return state.readings.filter((r) => r.shiftDate === date && r.shiftSlot === slot)
}

/** 冻土帷幕判定：逐孔按设计温度判；任一孔缺读数或最新读数高于设计温度即不达标。 */
export function assessCurtain(state: FreezeState = freezeState()): CurtainVerdict {
  const latest = latestReadings(state)
  const verdicts = orderedHoles(state).map<HoleVerdict>((hole) => {
    const reading = latest.get(hole.id)
    if (!reading) {
      return { hole, latest: undefined, qualified: false, gapDegrees: Infinity, reason: hole.gap ? '回填缺温度，缺测待补' : '尚无有效读数' }
    }
    if (reading.temp > hole.designTemp) {
      return { hole, latest: reading, qualified: false, gapDegrees: Number((reading.temp - hole.designTemp).toFixed(1)), reason: `最新 ${reading.temp}℃ 高于设计 ${hole.designTemp}℃` }
    }
    return { hole, latest: reading, qualified: true, gapDegrees: 0, reason: `最新 ${reading.temp}℃ ≤ 设计 ${hole.designTemp}℃` }
  })

  const unqualified = verdicts.filter((v) => !v.qualified)

  // 盲区判定：最近一个有动态的班次若整班无读数且已写空态，其后又没有新读数，谁也不能下结论。
  const readingKeys = new Set(state.readings.map((r) => shiftKey(r.shiftDate, r.shiftSlot)))
  const emptyKeys = state.emptyShifts.map((e) => shiftKey(e.shiftDate, e.shiftSlot))
  const latestShiftKey = [...readingKeys, ...emptyKeys].sort().at(-1) ?? ''
  // 最近班次是“登记过空态且本班及之后都没有读数”才算盲区；本班事后补到读数即解除
  const latestIsEmpty =
    emptyKeys.includes(latestShiftKey) &&
    !readingKeys.has(latestShiftKey) &&
    ![...readingKeys].some((key) => key > latestShiftKey)

  const formable = unqualified.length === 0 && !latestIsEmpty
  const message = formable
    ? `全部 ${verdicts.length} 个孔最新读数均达到设计温度，冻土帷幕已形成，具备开挖条件。`
    : latestIsEmpty
      ? `最近班次（${latestShiftKey}）整班未取到读数且已写空态，在补测恢复前冻土帷幕无法判定，禁止开挖。`
      : `冻土帷幕未形成：${unqualified.map((v) => `${v.hole.code}（${v.reason}）`).join('、')}。`

  return {
    formable,
    blind: latestIsEmpty,
    unqualified,
    qualifiedCount: verdicts.length - unqualified.length,
    holeCount: verdicts.length,
    message,
    latestShiftKey,
    latestIsEmpty,
  }
}

export interface ShiftCoverage {
  date: string
  slot: ShiftSlot
  measuredHoleIds: number[]
  missingHoles: FreezeHole[]
  /** 按入库顺序，断掉的第一个孔 */
  breakpoint: FreezeHole | undefined
  empty?: EmptyShift
}

/** 某班次的取数覆盖：从断掉的那个孔接着补测，不拿旧读数顶替。 */
export function shiftCoverage(state: FreezeState, date: string, slot: ShiftSlot): ShiftCoverage {
  const holes = orderedHoles(state)
  const rows = readingsOfShift(state, date, slot)
  const measuredHoleIds = [...new Set(rows.map((r) => r.holeId))]
  const missingHoles = holes.filter((hole) => !measuredHoleIds.includes(hole.id))
  return {
    date,
    slot,
    measuredHoleIds,
    missingHoles,
    breakpoint: missingHoles[0],
    empty: state.emptyShifts.find((e) => e.shiftDate === date && e.shiftSlot === slot),
  }
}

/* -------------------------------- 内部写入 -------------------------------- */

function nextId(state: FreezeState, bucket: keyof FreezeState['seq']): number {
  state.seq[bucket] += 1
  return state.seq[bucket]
}

function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function addLog(state: FreezeState, kind: OpLog['kind'], action: string, detail: string, operator: string): void {
  state.logs.push({ id: nextId(state, 'log'), at: nowStamp(), kind, action, detail, operator })
}

function addHazard(
  state: FreezeState,
  source: HazardSource,
  level: string,
  content: string,
  unqualifiedCount: number,
): HazardRecord {
  const stamp = nowStamp()
  const date = stamp.slice(0, 10).replace(/-/g, '')
  const serial = state.seq.hazard + 1
  const hazard: HazardRecord = {
    id: nextId(state, 'hazard'),
    code: `LDD-${date}-${String(serial).padStart(3, '0')}`,
    source,
    level,
    content,
    unqualifiedCount,
    status: '待整改',
    createdAt: stamp,
    closureNote: '',
    closedAt: '',
  }
  state.hazards.push(hazard)
  return hazard
}

/* -------------------------------- 测温上送 -------------------------------- */

/**
 * 一批测温读数原子上送：
 * 1) 先整批校验（孔存在、温度数值合法、时刻晚于该孔已有最新读数），任一条不合法整批退回，不写半条；
 * 2) 同孔同一时刻的重复件只留一条（批内去重 + 与库存去重），不产生第二条；
 * 3) 每一批递交只在操作留痕里记一条汇总。
 */
export function submitReadings(inputs: ReadingInput[], operator: string): ServiceResult {
  if (!inputs.length) {
    return { ok: false, message: '本批没有可上送的测温行' }
  }

  const state = freezeState()
  const errors: string[] = []
  const latest = latestReadings(state)

  const cleaned = inputs.map((row) => ({ ...row, measuredAt: row.measuredAt.trim(), temp: Number(row.temp) }))

  for (const [index, row] of cleaned.entries()) {
    const hole = holeById(state, row.holeId)
    if (!hole) {
      errors.push(`第 ${index + 1} 行：冻结孔不存在`)
      continue
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(row.measuredAt)) {
      errors.push(`第 ${index + 1} 行（${hole.code}）：测温时刻不完整，格式应为 YYYY-MM-DDTHH:mm`)
      continue
    }
    if (Number.isNaN(row.temp)) {
      errors.push(`第 ${index + 1} 行（${hole.code}）：温度不是数值`)
      continue
    }
    if (row.temp > 50 || row.temp < -80) {
      errors.push(`第 ${index + 1} 行（${hole.code}）：温度 ${row.temp}℃ 超出合理范围（-80~50℃）`)
      continue
    }
    const existed = latest.get(hole.id)
    // 与库存“孔+时刻”完全相同的，按重复上送合并处理，不视为旧读数顶替（后面统一去重）
    const exactDupInStore = state.readings.some((r) => r.holeId === row.holeId && r.measuredAt === row.measuredAt)
    if (!exactDupInStore && existed && row.measuredAt <= existed.measuredAt) {
      errors.push(
        `第 ${index + 1} 行（${hole.code}）：时刻 ${row.measuredAt.replace('T', ' ')} 不晚于该孔最新读数 ${existed.measuredAt.replace('T', ' ')}，不得拿旧读数顶替新数据，请从断点孔补测新时刻`,
      )
    }
  }
  if (errors.length) {
    const detail = `整批 ${cleaned.length} 条测温未写入：${errors.join('；')}`
    commit((draft) => addLog(draft, '退回', '测温上送', detail, operator))
    return { ok: false, message: detail }
  }

  // 批内按“孔 + 时刻”去重，同组保留首条，其余重复件丢弃
  const seenInBatch = new Set<string>()
  const deduped: (ReadingInput & { duplicate?: boolean })[] = []
  let droppedInBatch = 0
  for (const row of cleaned) {
    const key = `${row.holeId}@${row.measuredAt}`
    if (seenInBatch.has(key)) {
      droppedInBatch += 1
      continue
    }
    seenInBatch.add(key)
    deduped.push(row)
  }
  // 与库存比对：同孔同时刻只留一条
  const kept = deduped.filter((row) => {
    const dupInStore = state.readings.some((r) => r.holeId === row.holeId && r.measuredAt === row.measuredAt)
    row.duplicate = dupInStore
    return !dupInStore
  })
  const merged = droppedInBatch + (deduped.length - kept.length)

  if (!kept.length) {
    const detail = `本批 ${cleaned.length} 条均为同孔同时刻重复读数，全部未重复入库，库存仍只保留一条。`
    commit((draft) => addLog(draft, '提示', '测温上送', detail, operator))
    return { ok: true, message: detail, inserted: 0, merged: cleaned.length }
  }

  // 按入库顺序、时刻排序写入；缺温度孔的第一条实测即销“缺测待补”
  const seqOf = new Map(orderedHoles(state).map((hole, index) => [hole.id, index]))
  const sorted = [...kept].sort(
    (a, b) => (seqOf.get(a.holeId) ?? 0) - (seqOf.get(b.holeId) ?? 0) || a.measuredAt.localeCompare(b.measuredAt),
  )

  const filledGapHoles: FreezeHole[] = []
  commit((draft) => {
    for (const row of sorted) {
      const hole = draft.holes.find((h) => h.id === row.holeId)!
      const { date, slot } = shiftOf(row.measuredAt)
      const reading: TempReading = {
        id: nextId(draft, 'reading'),
        holeId: hole.id,
        holeCode: hole.code,
        measuredAt: row.measuredAt,
        shiftDate: date,
        shiftSlot: slot,
        temp: Number(row.temp.toFixed(1)),
        resumed: Boolean(row.resumed),
        operator,
        note: row.note ?? (row.resumed ? '测温中断后自断点孔续测' : ''),
      }
      draft.readings.push(reading)
      if (hole.gap) {
        hole.gap = false
        hole.gapNote = `缺温度孔已于 ${row.measuredAt.replace('T', ' ')} 现场实测补齐（${reading.temp}℃），此前无读数，未做任何推算`
        filledGapHoles.push(hole)
      }
    }
    const verdict = assessCurtain(draft)
    const mergedText = merged ? `；另合并 ${merged} 条同孔同时刻重复件（只留一条）` : ''
    const gapText = filledGapHoles.length ? `；缺测孔 ${filledGapHoles.map((h) => h.code).join('、')} 已现场补测销项` : ''
    const curtainText = verdict.formable ? '冻土帷幕已形成，具备开挖条件' : `尚有 ${verdict.unqualified.length} 个孔未达标`
    addLog(
      draft,
      '成功',
      '测温上送',
      `本批写入 ${sorted.length} 条${mergedText}${gapText}；${curtainText}。`,
      operator,
    )
  })

  const after = assessCurtain()
  const mergedText = merged ? `，合并重复 ${merged} 条` : ''
  return {
    ok: true,
    message: `已写入 ${sorted.length} 条测温${mergedText}。${after.message}`,
    inserted: sorted.length,
    merged,
  }
}

/* -------------------------------- 整班空态 -------------------------------- */

/** 整班无读数登记空态说明：已有读数/已有空态的班次不收，原因必填。 */
export function declareEmptyShift(date: string, slot: ShiftSlot, reason: string, operator: string): ServiceResult {
  const state = freezeState()
  const readings = readingsOfShift(state, date, slot)
  if (readings.length) {
    return { ok: false, message: `${date} ${slot}已有 ${readings.length} 条读数，不属于空班，不能登记空态。` }
  }
  if (state.emptyShifts.some((e) => e.shiftDate === date && e.shiftSlot === slot)) {
    return { ok: true, message: `${date} ${slot}已登记过空态说明，同一班次不重复登记。` }
  }
  if (!reason.trim()) {
    return { ok: false, message: '整班未取到读数必须写明原因（断电/设备故障/人员等），不能空着。' }
  }

  commit((draft) => {
    const entry: EmptyShift = {
      id: nextId(draft, 'emptyShift'),
      shiftDate: date,
      shiftSlot: slot,
      reason: reason.trim(),
      operator,
      createdAt: nowStamp(),
    }
    draft.emptyShifts.push(entry)
    addLog(draft, '提示', '空态说明', `${date} ${slot}整班未取到读数：${entry.reason}`, operator)
  })
  return { ok: true, message: `${date} ${slot}空态说明已登记；请从断点孔安排新时刻补测，禁止沿用旧读数。` }
}

/* -------------------------------- 开挖进尺 -------------------------------- */

export interface AdvanceInput {
  mileage: string
  advance: number
  startedAt: string
  abnormal: boolean
  abnormalNote: string
}

/** 开挖进尺登记：未达标一律退回并指出差多少度；异常进尺写入巡检待整改清单。 */
export function submitAdvance(input: AdvanceInput, operator: string): ServiceResult {
  const mileage = input.mileage.trim()
  const advance = Number(input.advance)
  if (!mileage) {
    return { ok: false, message: '请填写开挖部位/桩号' }
  }
  if (Number.isNaN(advance) || advance <= 0) {
    return { ok: false, message: '本班进尺必须为大于 0 的数值' }
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.startedAt.trim())) {
    return { ok: false, message: '开挖时刻不完整，格式应为 YYYY-MM-DDTHH:mm' }
  }
  if (input.abnormal && !input.abnormalNote.trim()) {
    return { ok: false, message: '进尺异常必须写明异常情况（涌水、片帮、温度回升等）' }
  }

  const state = freezeState()
  const verdict = assessCurtain(state)
  if (!verdict.formable) {
    const detail = verdict.blind
      ? `${verdict.message} 开挖登记退回。`
      : `冻土帷幕未达标（不达标 ${verdict.unqualified.length} 孔：${verdict.unqualified
          .map((v) => `${v.hole.code} ${v.reason}`)
          .join('；')}），${mileage} 进尺 ${advance}m 的开挖登记退回。`
    commit((draft) => {
      addHazard(draft, '未达标强行开挖', '较大', detail, verdict.unqualified.length)
      addLog(draft, '退回', '登记开挖进尺', `${detail} 已写入安全巡检待整改清单（未达标 ${verdict.unqualified.length} 孔）。`, operator)
    })
    return {
      ok: false,
      message: `${detail} 当前不达标孔 ${verdict.unqualified.length} 个，已同步列入安全巡检待整改清单，对账单号 LDD。`,
    }
  }

  // 二衬已浇筑的部位不允许再补进尺——工序不许颠倒
  const lastLining = [...state.linings].sort((a, b) => b.pouredAt.localeCompare(a.pouredAt))[0]
  if (lastLining && input.startedAt.trim() <= lastLining.pouredAt) {
    const detail = `二衬已于 ${lastLining.pouredAt.replace('T', ' ')} 在 ${lastLining.mileage} 浇筑，开挖进尺时刻不得早于二衬浇筑（先后不许颠倒），登记退回。`
    commit((draft) => addLog(draft, '退回', '登记开挖进尺', detail, operator))
    return { ok: false, message: detail }
  }

  commit((draft) => {
    const record: AdvanceRecord = {
      id: nextId(draft, 'advance'),
      mileage,
      advance,
      startedAt: input.startedAt.trim(),
      abnormal: input.abnormal,
      abnormalNote: input.abnormal ? input.abnormalNote.trim() : '',
      operator,
    }
    draft.advances.push(record)
    if (input.abnormal) {
      const now = assessCurtain(draft)
      addHazard(
        draft,
        '开挖进尺异常',
        '较大',
        `${mileage} 本班进尺 ${advance}m 出现异常：${input.abnormalNote.trim()}（开挖时刻 ${input.startedAt.trim().replace('T', ' ')}）`,
        now.unqualified.length,
      )
      addLog(draft, '成功', '登记开挖进尺', `进尺已登记并标记异常，写入安全巡检待整改清单（当前未达标 ${now.unqualified.length} 孔）。`, operator)
    } else {
      addLog(draft, '成功', '登记开挖进尺', `${mileage} 本班进尺 ${advance}m 已登记。`, operator)
    }
  })
  return input.abnormal
    ? { ok: true, message: `进尺已登记；异常情况已写入安全巡检待整改清单。`, inserted: 1 }
    : { ok: true, message: `${mileage} 本班进尺 ${advance}m 已登记。`, inserted: 1 }
}

/* -------------------------------- 二衬浇筑 -------------------------------- */

export interface LiningInput {
  mileage: string
  volume: number
  pouredAt: string
  note: string
}

/** 二衬浇筑登记：必须先有开挖进尺，浇筑时刻不得早于最近进尺时刻。 */
export function submitLining(input: LiningInput, operator: string): ServiceResult {
  const mileage = input.mileage.trim()
  const volume = Number(input.volume)
  if (!mileage) {
    return { ok: false, message: '请填写浇筑部位/桩号' }
  }
  if (Number.isNaN(volume) || volume <= 0) {
    return { ok: false, message: '浇筑方量必须为大于 0 的数值' }
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.pouredAt.trim())) {
    return { ok: false, message: '浇筑时刻不完整，格式应为 YYYY-MM-DDTHH:mm' }
  }

  const state = freezeState()
  if (state.advances.length === 0) {
    const detail = '尚未登记任何开挖进尺，二衬浇筑不能先于开挖（先后不许颠倒），登记退回：请先补登记开挖进尺。'
    commit((draft) => addLog(draft, '退回', '登记二衬浇筑', detail, operator))
    return { ok: false, message: detail }
  }
  const lastAdvance = [...state.advances].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  if (input.pouredAt.trim() <= lastAdvance.startedAt) {
    const detail = `浇筑时刻 ${input.pouredAt.trim().replace('T', ' ')} 不晚于最近一次开挖进尺 ${lastAdvance.startedAt.replace('T', ' ')}（${lastAdvance.mileage}），二衬不得排在开挖前面，登记退回。`
    commit((draft) => addLog(draft, '退回', '登记二衬浇筑', detail, operator))
    return { ok: false, message: detail }
  }

  commit((draft) => {
    const record: LiningRecord = {
      id: nextId(draft, 'lining'),
      mileage,
      volume,
      pouredAt: input.pouredAt.trim(),
      operator,
      note: input.note.trim(),
    }
    draft.linings.push(record)
    addLog(draft, '成功', '登记二衬浇筑', `${mileage} 浇筑 ${volume}m³ 已登记，排在最近进尺（${lastAdvance.mileage}）之后。`, operator)
  })
  return { ok: true, message: `${mileage} 二衬浇筑 ${volume}m³ 已登记。`, inserted: 1 }
}

/* ------------------------------ 存量孔重新入库 ------------------------------ */

/** 存量冻结孔按布孔日期（同日按孔号）重新入库，重排入库序号；ID 保持不变以挂住历史测温。 */
export function reindexLegacyHoles(operator: string): ServiceResult {
  const state = freezeState()
  const pending = state.holes.filter((h) => h.legacy && !h.reindexed)
  if (!pending.length) {
    return { ok: true, message: '存量冻结孔均已按布孔日期重新入库，无需重复执行。' }
  }

  commit((draft) => {
    const order = [...draft.holes].sort((a, b) => a.layoutDate.localeCompare(b.layoutDate) || a.code.localeCompare(b.code))
    order.forEach((hole, index) => {
      hole.seqNo = index + 1
      if (hole.legacy) {
        hole.reindexed = true
      }
    })
    const gapHoles = order.filter((h) => h.gap)
    addLog(
      draft,
      '成功',
      '存量孔重新入库',
      `已按布孔日期重排 ${order.length} 个存量孔入库序号（${order.map((h) => h.code).join('→')}）；${
        gapHoles.length ? `缺温度孔 ${gapHoles.map((h) => h.code).join('、')} 按缺测待补处理，禁止推算，待现场实测。` : '无缺温度孔。'
      }`,
      operator,
    )
    if (gapHoles.length && !draft.hazards.some((h) => h.source === '存量孔缺温度' && h.status === '待整改')) {
      addHazard(draft, '存量孔缺温度', '一般', `存量冻结孔 ${gapHoles.map((h) => h.code).join('、')} 回填缺温度，已挂缺测待补，须现场实测补齐，不得用旧读数顶替。`, gapHoles.length)
    }
  })
  return { ok: true, message: `已按布孔日期重新入库 ${pending.length} 个存量孔；缺温度孔保持缺测待补，等现场实测。` }
}

/* -------------------------------- 隐患闭环 -------------------------------- */

/** 处理结论回写隐患清单：结论必填；台账、监测入口、巡检三处同一份。 */
export function closeHazard(id: number, closureNote: string, operator: string): ServiceResult {
  if (!closureNote.trim()) {
    return { ok: false, message: '闭环必须填写处理结论，不能空着销项。' }
  }
  const state = freezeState()
  const hazard = state.hazards.find((h) => h.id === id)
  if (!hazard) {
    return { ok: false, message: '没有找到这条隐患' }
  }
  if (hazard.status === '已闭环') {
    return { ok: false, message: `隐患 ${hazard.code} 已闭环，不用重复操作` }
  }
  commit((draft) => {
    const target = draft.hazards.find((h) => h.id === id)!
    target.status = '已闭环'
    target.closureNote = closureNote.trim()
    target.closedAt = nowStamp()
    addLog(draft, '成功', '隐患闭环', `${target.code}（${target.source}）处理结论已回写：${target.closureNote}`, operator)
  })
  return { ok: true, message: `隐患 ${hazard.code} 已闭环，处理结论已回写。` }
}

/* -------------------------------- 读数检索 -------------------------------- */

/** 两个入口共用的读数列表：同一份存储、同一套筛选。 */
export function listReadings(options: { holeId?: number; date?: string; slot?: ShiftSlot } = {}): TempReading[] {
  const state = freezeState()
  return [...state.readings]
    .filter((r) => (options.holeId ? r.holeId === options.holeId : true))
    .filter((r) => (options.date ? r.shiftDate === options.date : true))
    .filter((r) => (options.slot ? r.shiftSlot === options.slot : true))
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt) || a.holeCode.localeCompare(b.holeCode))
}

export function pendingReindexCount(state: FreezeState = freezeState()): number {
  return state.holes.filter((h) => h.legacy && !h.reindexed).length
}

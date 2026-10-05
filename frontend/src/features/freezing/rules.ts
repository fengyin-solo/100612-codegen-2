import type {
  AdvanceEntry,
  CurtainSnapshot,
  FreezeHole,
  FreezeReading,
  FreezeRound,
  GateResult,
  LiningPour,
  UnqualifiedHole,
} from './types'

/** 温度差保留一位小数；0.1℃ 的差别也要在「还差多少度」里说清楚。 */
export function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function formatTemp(valueC: number): string {
  return `${round1(valueC)}℃`
}

/** 存量冻结孔按布孔日期重新入库：先布孔日期、同一天再按孔号。 */
export function sortHolesByLayout(holes: FreezeHole[]): FreezeHole[] {
  return [...holes].sort((a, b) => {
    if (a.layoutDate !== b.layoutDate) {
      return a.layoutDate < b.layoutDate ? -1 : 1
    }
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0
  })
}

/** 同一孔的最新一条有效读数；没有读数就是 null，绝不拿旧读数之外的东西顶替。 */
export function latestReadingMap(
  readings: FreezeReading[],
): Map<number, FreezeReading> {
  const map = new Map<number, FreezeReading>()
  for (const reading of readings) {
    const previous = map.get(reading.holeId)
    if (!previous || reading.at > previous.at) {
      map.set(reading.holeId, reading)
    }
  }
  return map
}

/**
 * 冻土帷幕判定：每个冻结孔都要「取到过读数」且「最新读数不高于设计温度」。
 * 缺温度的存量孔按待补测计入未达标，宁可保守也不凭空算合格。
 */
export function evaluateCurtain(
  holes: FreezeHole[],
  readings: FreezeReading[],
): CurtainSnapshot {
  const latest = latestReadingMap(readings)
  const unqualified: UnqualifiedHole[] = []

  for (const hole of holes) {
    const reading = latest.get(hole.id)
    if (!reading) {
      unqualified.push({
        holeId: hole.id,
        code: hole.code,
        kind: 'missing',
        gapC: null,
        latestTempC: null,
        designTempC: hole.designTempC,
      })
      continue
    }
    if (reading.tempC > hole.designTempC) {
      unqualified.push({
        holeId: hole.id,
        code: hole.code,
        kind: 'warm',
        gapC: round1(reading.tempC - hole.designTempC),
        latestTempC: reading.tempC,
        designTempC: hole.designTempC,
      })
    }
  }

  const qualified = holes.length > 0 && unqualified.length === 0
  const parts = unqualified.map((item) => {
    if (item.kind === 'missing') {
      return `${item.code} 从未取到读数（设计 ${formatTemp(item.designTempC)}，须补测）`
    }
    return `${item.code} 实测 ${formatTemp(item.latestTempC as number)}，距设计 ${formatTemp(
      item.designTempC,
    )}还差 ${formatTemp(item.gapC as number)}`
  })

  return {
    qualified,
    totalHoles: holes.length,
    unqualifiedCount: unqualified.length,
    unqualified,
    summary: qualified
      ? `全部 ${holes.length} 个冻结孔均已达到设计温度，冻土帷幕已形成`
      : `冻土帷幕未形成：共 ${holes.length} 孔，未达标 ${unqualified.length} 孔——${parts.join('；')}`,
  }
}

/** 还在取数/断了没补完的轮次：有它就不能登记开挖，避免断数期间继续挖。 */
export function findOpenRound(rounds: FreezeRound[]): FreezeRound | null {
  const open = rounds.filter((round) => round.status === '进行中' || round.status === '中断')
  if (open.length === 0) return null
  return open.reduce((a, b) => (a.id > b.id ? a : b))
}

export function describeOpenRound(round: FreezeRound, holes: FreezeHole[]): string {
  if (round.status === '中断' && round.resumeHoleId !== null) {
    const hole = holes.find((item) => item.id === round.resumeHoleId)
    return `测温中断：${round.shiftLabel}在「${hole ? hole.code : '未知孔'}」断数，必须从该孔接着补测，不能拿旧读数顶替`
  }
  return `测温未完成：${round.shiftLabel}本班测温尚未收齐，先完成本班测温或按空班写明原因`
}

/**
 * 开挖闸门：测温 → 帷幕达标 → 开挖。未达标强挖一律退回并说明差多少度。
 */
export function checkAdvanceGate(input: {
  holes: FreezeHole[]
  readings: FreezeReading[]
  rounds: FreezeRound[]
  advances: AdvanceEntry[]
  linings: LiningPour[]
}): GateResult {
  const { holes, readings, rounds, advances, linings } = input

  if (linings.length > 0) {
    return {
      ok: false,
      message:
        '越序登记挡回：二次衬砌已经开始浇筑，不能再补登开挖进尺（进尺必须在前、二衬在后，且首仓浇筑后开挖台账封闭）',
    }
  }

  const openRound = findOpenRound(rounds)
  if (openRound) {
    return { ok: false, message: `开挖条件不满足：${describeOpenRound(openRound, holes)}` }
  }

  if (holes.length === 0) {
    return { ok: false, message: '开挖条件不满足：尚无冻结孔入库，无法判定冻土帷幕' }
  }

  const curtain = evaluateCurtain(holes, readings)
  if (!curtain.qualified) {
    return {
      ok: false,
      message: `越权开挖挡回：${curtain.summary}。冻土帷幕未达标不得开挖，先补测降温至设计温度`,
    }
  }

  return { ok: true, message: "具备开挖条件" }
}

/** 二衬闸门：必须先有开挖进尺；已经浇筑过的首仓不可重复倒序登记。 */
export function checkLiningGate(input: {
  advances: AdvanceEntry[]
  linings: LiningPour[]
}): GateResult {
  const { advances, linings } = input
  if (advances.length === 0) {
    return {
      ok: false,
      message: '越序登记挡回：还没有任何开挖进尺，不能登记二衬浇筑。还差的步骤：先完成测温并确认冻土帷幕达标 → 登记开挖进尺',
    }
  }
  if (linings.length > 0) {
    return {
      ok: false,
      message: `二衬首仓已在 ${linings[0].pourDate} 浇筑，浇筑顺序不可重复登记；后续仓段请在二衬专项台账登记`,
    }
  }
  return { ok: true, message: "具备二衬浇筑条件" }
}

/** 工序总阶段：用于台账顶部的流程条。 */
export function deriveStage(input: {
  holes: FreezeHole[]
  readings: FreezeReading[]
  rounds: FreezeRound[]
  advances: AdvanceEntry[]
  linings: LiningPour[]
}): { key: string; label: string } {
  const { holes, readings, rounds, advances, linings } = input
  if (linings.length > 0) return { key: 'lining', label: '二次衬砌浇筑（工序闭环）' }
  if (advances.length > 0) return { key: 'excavation', label: '通道开挖中' }
  if (findOpenRound(rounds)) return { key: 'measuring', label: '测温取数（当前轮次未收齐）' }
  const curtain = evaluateCurtain(holes, readings)
  if (curtain.qualified) return { key: 'ready', label: '帷幕达标，待开挖' }
  if (readings.length > 0) return { key: 'freezing', label: '积极冻结，帷幕未达标' }
  if (holes.length > 0) return { key: 'holes', label: '冻结孔已布孔，待测温' }
  return { key: 'none', label: '未开工' }
}

/** 异常进尺隐患的业务键：同一条进尺只产生一条待整改记录，重复递交只记一次。 */
export function advanceHazardKey(advanceId: number): string {
  return `ADV-${advanceId}`
}

export function nowStamp(): string {
  return new Date().toISOString().slice(0, 16)
}

import type { FreezeHole, FreezeReading, FreezeRound, LedgerState } from './types'

/**
 * 存量数据：模拟联络通道开工前已布孔、已手工记过几轮温的现场。
 * 特点：
 * - 孔的登记顺序是乱的，要求回填时按布孔日期重新排序入库；
 * - 2026-10-04 夜班在 D05 断数，轮次停在「中断」，必须从 D05 接着补测；
 * - D05 从没取到读数（缺温度的存量孔，按待补测，不编历史读数）；
 * - D03、D06 最新读数高于设计温度，帷幕未达标。
 */
function seedState(): LedgerState {
  const holes: FreezeHole[] = [
    { id: 1, code: 'D01', designTempC: -10, layoutDate: '2026-09-22', orderSeq: 0, imported: true },
    { id: 2, code: 'D02', designTempC: -10, layoutDate: '2026-09-20', orderSeq: 0, imported: true },
    { id: 3, code: 'D03', designTempC: -10, layoutDate: '2026-09-22', orderSeq: 0, imported: true },
    { id: 4, code: 'D04', designTempC: -10, layoutDate: '2026-09-23', orderSeq: 0, imported: true },
    { id: 5, code: 'D05', designTempC: -10, layoutDate: '2026-09-24', orderSeq: 0, imported: true },
    { id: 6, code: 'D06', designTempC: -10, layoutDate: '2026-09-24', orderSeq: 0, imported: true },
    { id: 7, code: 'D07', designTempC: -10, layoutDate: '2026-09-25', orderSeq: 0, imported: true },
    { id: 8, code: 'D08', designTempC: -10, layoutDate: '2026-09-26', orderSeq: 0, imported: true },
  ].sort((a, b) => {
    if (a.layoutDate !== b.layoutDate) return a.layoutDate < b.layoutDate ? -1 : 1
    return a.code < b.code ? -1 : 1
  })
  holes.forEach((hole, index) => {
    hole.orderSeq = index + 1
  })

  const readings: FreezeReading[] = [
    // 夜班：02:00 起按序取数，02:15 在 D05 断掉
    { id: 11, holeId: 1, at: '2026-10-04T02:00', tempC: -8.0, source: '值守测温', roundId: 1, recorder: '刘值守', createdAt: '2026-10-04T02:00' },
    { id: 12, holeId: 2, at: '2026-10-04T02:03', tempC: -11.2, source: '值守测温', roundId: 1, recorder: '刘值守', createdAt: '2026-10-04T02:03' },
    { id: 13, holeId: 3, at: '2026-10-04T02:06', tempC: -5.8, source: '值守测温', roundId: 1, recorder: '刘值守', createdAt: '2026-10-04T02:06' },
    { id: 14, holeId: 4, at: '2026-10-04T02:09', tempC: -10.4, source: '值守测温', roundId: 1, recorder: '刘值守', createdAt: '2026-10-04T02:09' },
    // 白班：D01 已有更新读数（旧的 -8.0 保留可查，但判定只认最新一条）
    { id: 21, holeId: 1, at: '2026-10-05T09:00', tempC: -10.6, source: '值守测温', roundId: null, recorder: '张德福', createdAt: '2026-10-05T09:00' },
    { id: 22, holeId: 2, at: '2026-10-05T09:03', tempC: -12.0, source: '值守测温', roundId: null, recorder: '张德福', createdAt: '2026-10-05T09:03' },
    { id: 23, holeId: 3, at: '2026-10-05T09:06', tempC: -6.5, source: '值守测温', roundId: null, recorder: '张德福', createdAt: '2026-10-05T09:06' },
    { id: 24, holeId: 4, at: '2026-10-05T09:09', tempC: -10.8, source: '值守测温', roundId: null, recorder: '张德福', createdAt: '2026-10-05T09:09' },
    { id: 26, holeId: 6, at: '2026-10-05T09:15', tempC: -9.1, source: '值守测温', roundId: null, recorder: '张德福', createdAt: '2026-10-05T09:15' },
    { id: 27, holeId: 7, at: '2026-10-05T09:18', tempC: -11.6, source: '值守测温', roundId: null, recorder: '张德福', createdAt: '2026-10-05T09:18' },
    { id: 28, holeId: 8, at: '2026-10-05T09:21', tempC: -11.0, source: '值守测温', roundId: null, recorder: '张德福', createdAt: '2026-10-05T09:21' },
  ]

  const rounds: FreezeRound[] = [
    {
      id: 1,
      shiftLabel: '夜班 2026-10-04（20:00-08:00）',
      startedAt: '2026-10-04T02:00',
      status: '中断',
      measuredHoleIds: [1, 2, 3, 4],
      resumeHoleId: 5,
      interruptedAt: '2026-10-04T02:15',
      emptyReason: null,
      closedAt: null,
    },
  ]

  return {
    holes,
    readings,
    rounds,
    advances: [],
    linings: [],
    hazards: [],
    seq: 100,
  }
}

export function buildSeedState(): LedgerState {
  return JSON.parse(JSON.stringify(seedState())) as LedgerState
}

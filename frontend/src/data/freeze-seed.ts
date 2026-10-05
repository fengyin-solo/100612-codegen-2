import type { FreezeState } from './freeze-types'

// 联络通道台账的首次播种数据。
// 特意把存量孔的布孔日期打乱：首屏会提示需要按布孔日期重新入库；
// D07/D08 回填时缺温度，按“缺测待补、禁止推算、现场补测”处理。
export function buildFreezeSeed(): FreezeState {
  return {
    version: 1,
    holes: [
      { id: 1, code: 'D01', seqNo: 1, layoutDate: '2026-09-21', designTemp: -25, legacy: true, reindexed: false, gap: false, gapNote: '' },
      { id: 2, code: 'D02', seqNo: 2, layoutDate: '2026-09-20', designTemp: -25, legacy: true, reindexed: false, gap: false, gapNote: '' },
      { id: 3, code: 'D03', seqNo: 3, layoutDate: '2026-09-21', designTemp: -25, legacy: true, reindexed: false, gap: false, gapNote: '' },
      { id: 4, code: 'D04', seqNo: 4, layoutDate: '2026-09-20', designTemp: -26, legacy: true, reindexed: false, gap: false, gapNote: '' },
      { id: 5, code: 'D05', seqNo: 5, layoutDate: '2026-09-22', designTemp: -25, legacy: true, reindexed: false, gap: false, gapNote: '' },
      { id: 6, code: 'D06', seqNo: 6, layoutDate: '2026-09-21', designTemp: -25, legacy: true, reindexed: false, gap: false, gapNote: '' },
      { id: 7, code: 'D07', seqNo: 7, layoutDate: '2026-09-22', designTemp: -26, legacy: true, reindexed: false, gap: true, gapNote: '回填资料缺温度，标记缺测待补，禁止用邻孔或历史读数推算，须现场实测补齐' },
      { id: 8, code: 'D08', seqNo: 8, layoutDate: '2026-09-22', designTemp: -25, legacy: true, reindexed: false, gap: true, gapNote: '回填资料缺温度，标记缺测待补，禁止用邻孔或历史读数推算，须现场实测补齐' },
    ],
    readings: [
      { id: 1, holeId: 1, holeCode: 'D01', measuredAt: '2026-10-03T09:30', shiftDate: '2026-10-03', shiftSlot: '白班', temp: -23.8, resumed: false, operator: '王建国', note: '' },
      { id: 2, holeId: 1, holeCode: 'D01', measuredAt: '2026-10-04T09:40', shiftDate: '2026-10-04', shiftSlot: '白班', temp: -25.4, resumed: false, operator: '王建国', note: '' },
      { id: 3, holeId: 2, holeCode: 'D02', measuredAt: '2026-10-03T09:35', shiftDate: '2026-10-03', shiftSlot: '白班', temp: -24.1, resumed: false, operator: '王建国', note: '' },
      { id: 4, holeId: 2, holeCode: 'D02', measuredAt: '2026-10-04T09:45', shiftDate: '2026-10-04', shiftSlot: '白班', temp: -25.2, resumed: false, operator: '王建国', note: '' },
      { id: 5, holeId: 3, holeCode: 'D03', measuredAt: '2026-10-03T09:36', shiftDate: '2026-10-03', shiftSlot: '白班', temp: -22.6, resumed: false, operator: '王建国', note: '' },
      { id: 6, holeId: 3, holeCode: 'D03', measuredAt: '2026-10-04T09:46', shiftDate: '2026-10-04', shiftSlot: '白班', temp: -24.0, resumed: false, operator: '王建国', note: '' },
      { id: 7, holeId: 4, holeCode: 'D04', measuredAt: '2026-10-03T09:40', shiftDate: '2026-10-03', shiftSlot: '白班', temp: -24.9, resumed: false, operator: '王建国', note: '' },
      { id: 8, holeId: 4, holeCode: 'D04', measuredAt: '2026-10-04T09:50', shiftDate: '2026-10-04', shiftSlot: '白班', temp: -26.3, resumed: false, operator: '王建国', note: '' },
      { id: 9, holeId: 5, holeCode: 'D05', measuredAt: '2026-10-03T09:42', shiftDate: '2026-10-03', shiftSlot: '白班', temp: -23.5, resumed: false, operator: '王建国', note: '' },
      { id: 10, holeId: 5, holeCode: 'D05', measuredAt: '2026-10-04T09:52', shiftDate: '2026-10-04', shiftSlot: '白班', temp: -24.7, resumed: false, operator: '王建国', note: '' },
      { id: 11, holeId: 6, holeCode: 'D06', measuredAt: '2026-10-03T09:45', shiftDate: '2026-10-03', shiftSlot: '白班', temp: -21.9, resumed: false, operator: '王建国', note: '' },
      { id: 12, holeId: 6, holeCode: 'D06', measuredAt: '2026-10-04T09:55', shiftDate: '2026-10-04', shiftSlot: '白班', temp: -23.2, resumed: false, operator: '王建国', note: '' },
      // 2026-10-05 白班：测温到 D04 前中断，只录到 D01-D03，断点孔为 D04
      { id: 13, holeId: 1, holeCode: 'D01', measuredAt: '2026-10-05T08:20', shiftDate: '2026-10-05', shiftSlot: '白班', temp: -26.1, resumed: false, operator: '李秀英', note: '' },
      { id: 14, holeId: 2, holeCode: 'D02', measuredAt: '2026-10-05T08:25', shiftDate: '2026-10-05', shiftSlot: '白班', temp: -25.7, resumed: false, operator: '李秀英', note: '' },
      { id: 15, holeId: 3, holeCode: 'D03', measuredAt: '2026-10-05T08:30', shiftDate: '2026-10-05', shiftSlot: '白班', temp: -25.1, resumed: false, operator: '李秀英', note: '' },
    ],
    emptyShifts: [
      {
        id: 1,
        shiftDate: '2026-10-04',
        shiftSlot: '夜班',
        reason: '夜间冻结站供电柜跳闸，22:10 起全站断电，巡检无法取数；已报机电班，05:40 恢复供电，本班无任何有效读数，禁止沿用上一班数据。',
        operator: '赵守夜',
        createdAt: '2026-10-05T07:55',
      },
    ],
    advances: [],
    linings: [],
    hazards: [
      {
        id: 1,
        code: 'LDD-20261004-001',
        source: '未达标强行开挖',
        level: '较大',
        content: '2026-10-04 夜班断电空班后，冻土帷幕温度无法判定，仍试图登记开挖进尺，被台账退回。',
        unqualifiedCount: 4,
        status: '待整改',
        createdAt: '2026-10-05T07:58',
        closureNote: '',
        closedAt: '',
      },
      {
        id: 2,
        code: 'LDD-20261004-002',
        source: '存量孔缺温度',
        level: '一般',
        content: '存量冻结孔 D07、D08 回填资料缺温度记录，未完成现场补测前不计入达标孔。',
        unqualifiedCount: 2,
        status: '已闭环',
        createdAt: '2026-10-05T08:05',
        closureNote: '已挂“缺测待补”牌，禁止用旧读数/邻孔数据顶替，安排测温班自 D07 起逐孔现场实测，待补测读数录入后销项。',
        closedAt: '2026-10-05T08:10',
      },
    ],
    logs: [
      { id: 1, at: '2026-10-05T07:55', kind: '提示', action: '系统恢复', detail: '夜间取数中断，2026-10-04 夜班登记整班空态，本班无有效读数，次日不得照抄旧数据。', operator: '赵守夜' },
      { id: 2, at: '2026-10-05T07:58', kind: '退回', action: '登记开挖进尺', detail: '冻土帷幕未达标（D04/D06 温度不达标，D07/D08 缺测），强行开挖登记退回；已写入待整改清单。', operator: '值班管理员' },
      { id: 3, at: '2026-10-05T08:02', kind: '退回', action: '测温上送', detail: 'D01 在 2026-10-05T08:20 的读数重复上传，同孔同时刻只留一条，重复件未再次入库。', operator: '李秀英' },
    ],
    seq: {
      reading: 15,
      emptyShift: 1,
      advance: 0,
      lining: 0,
      hazard: 2,
      log: 3,
    },
  }
}

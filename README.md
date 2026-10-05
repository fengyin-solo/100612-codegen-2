# 盾构隧道掘进施工管理平台

面向盾构机台账、掘进环次、管片拼装、同步注浆、渣土外运、地表沉降监测与轴线纠偏的一体化盾构隧道施工管理平台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   ├── src/features/freezing/  联络通道冻结与开挖工序台账（领域规则 + 独立持久化，双入口同源）
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 盾构机台账 | `shield` | 盾构机 | 盾构机编号、盾构机型号、开挖直径 |
| 掘进环次 | `ring` | 掘进环 | 环号、起始里程、掘进速度 |
| 管片拼装 | `segment` | 管片环 | 管片环号、管片型号、拼装点位 |
| 同步注浆 | `grouting` | 注浆记录 | 注浆编号、对应环号、浆液配比 |
| 渣土外运 | `muck` | 渣土运输单 | 运输单号、对应环号、渣土方量 |
| 地表沉降 | `settlement` | 沉降测点 | 测点编号、测点位置、初始高程 |
| 轴线偏差 | `axis` | 轴线测量 | 测量编号、对应环号、设计轴线 |
| 刀具磨损 | `cutter` | 刀具 | 刀具编号、刀盘位置、刀具类型 |
| 管片生产 | `segmentprod` | 管片 | 管片编号、管片型号、生产模具 |
| 浆液拌制 | `mortar` | 浆液批次 | 批次编号、浆液类型、水泥用量 |
| 洞内通风 | `ventilation` | 通风机组 | 机组编号、风筒长度、送风量 |
| 建筑监测 | `building` | 监测对象 | 对象编号、建筑物名称、结构类型 |
| 管线探查 | `utility` | 地下管线 | 管线编号、管线类型、埋设深度 |
| 进度节点 | `progress` | 进度节点 | 节点编号、节点名称、计划完成日 |
| 试验检测 | `testing` | 试验委托 | 委托编号、试样类型、检测项目 |
| 应急演练 | `drill` | 应急演练 | 演练编号、演练科目、演练日期 |
| 班组进场 | `crew` | 施工班组 | 班组编号、班组名称、主要工种 |
| 安全巡检 | `safety` | 巡检记录 | 巡检编号、巡检区域、巡检项目 |
| 联络通道冻结与开挖工序台账 | `features/freezing`（入口 `crosspassage`、`freeze-monitor`） | 冻结孔/测温/进尺/二衬/隐患 | 孔号、设计温度、测温时刻、实测温度、进尺、浇筑仓段 |

## 联络通道冻结与开挖工序台账

独立于通用元数据 CRUD 的领域特性，代码在 `frontend/src/features/freezing/`，规则全部落在
`rules.ts` 纯函数与 `store.ts` 动作里，页面组件不做业务判断。两个入口
（`/crosspassage` 与 `/freeze-monitor`）以及「安全巡检」页底部的隐患清单读的是同一份
localStorage 数据（键 `crosspassage-freezing:ledger:v1`），多标签页通过 `storage` 事件同步。

落地的硬规则：

- **按孔测温、按设计温度判定**：每个冻结孔最新读数不高于设计温度才算达标；从未取到读数的孔按
  「待补测」计入未达标，缺温度的存量孔不编造历史读数。
- **开挖闸门**：有测温中断/未完成轮次，或冻土帷幕未达标，开挖进尺登记一律挡回；退回信息逐孔写明
  「还差多少度」或断在哪个孔。未达标的强挖不产生任何进尺与隐患。
- **顺序闸门**：没有开挖进尺不能登记二衬浇筑（挡回并指出所缺步骤）；首仓二衬浇筑后进尺台账封闭。
- **中断补测**：轮次中断时记录断掉的孔，恢复后只能从该孔接着补测，禁止跳孔、禁止拿旧读数顶替新数据；
  一整班没取到读数时必须填写原因按「空班」收班，轮次不允许挂在半路。
- **去重与原子性**：同一孔同一时刻（分钟）重复测温只保留第一条；同一单据重复递交只记一次；
  每个动作先校验后一次落库，写不成就不留半条。
- **隐患同源**：异常开挖进尺在同一事务里写入巡检待整改清单，并快照登记瞬间的未达标孔数，
  台账与安全巡检两处条数、孔数完全一致；闭环处理结论回写后两处同步可见。
- **存量回填**：「存量冻结孔按布孔日期重新入库」幂等执行，已存在孔位保留历史读数，仅补缺并按布孔
  日期（同日按孔号）重排测温顺序。

规则冒烟测试（纯 Node，经 esbuild 打包）：

```bash
cd frontend
npx esbuild scripts/smoke-freezing.mjs --bundle --platform=node --format=esm --outfile=/tmp/s1.mjs && node /tmp/s1.mjs
npx esbuild scripts/smoke-store.mjs  --bundle --platform=node --format=esm --outfile=/tmp/s2.mjs && node /tmp/s2.mjs
```


## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 想回到初始数据：清掉浏览器里 `shield-tunnel-construction:entries` 这一项，或调用 `resetModule(模块)`。

# 法盾 next_level.md 改造落地方案（基于当前代码审查）

> 目标：把“用户驱动的工具”逐步升级为“目标驱动的协作者（Case Agent）”，并确保每一步都能在现有 `Vue3 + Fastify + Prisma(SQLite)` 架构中稳定交付。

---

## 0. 当前现状（代码审查结论）

### 0.1 主流程
- 建案：用户填写表单 → 并发生成“证据分组 + 案情分析”  
  - 后端：`server/src/routes/ai.js`（`POST /api/ai/init`）  
  - Prompt：`server/src/services/ai.js`（`generateGroups` / `generateAnalysis`）
- 证据：先上传到服务器并落库（`status=pending`）→ 用户在“待认证”里手动勾选 → 批量调用 AI 视觉进行归类认证  
  - 后端：`server/src/routes/evidence.js`（`POST /api/evidence/upload` + `POST /api/evidence/verify`）  
  - 前端：`client/src/components/evidence/EvidenceUpload.vue` + `client/src/components/evidence/EvidenceList.vue`
- 文书：点击生成 → LLM 生成文书 JSON 并持久化到 Case，案件标记为 `done`  
  - 后端：`server/src/routes/ai.js`（`POST /api/ai/document`）+ `server/src/services/ai.js`（`generateDocument`）

### 0.2 与 next_level.md 的差距（概览）
- **证据格式**：阶段一已完成多格式接入（`image/pdf/docx/txt`）。
- **异步与进度**：后端已完成任务化与 SSE 推送；前端认证已接入任务流。上传后的解析进度前端尚未接线展示（剩余优化项）。
- **Agent Loop**：目前仍是“固定流程的 Prompt 调用”，尚未进入“工具化 + 自主决策循环”。
- **主动性**：尚未实现事件触发/定时巡检。

### 0.3 需要优先修的底座问题（阻塞项）
- `llmChat` 内存在 `chatOpts` 定义前访问 `chatOpts.model` 的错误，可能导致文本类 AI 调用直接抛 `ReferenceError`：  
  - 位置：`server/src/services/providers/index.js`

---

## 1. 阶段一：夯实基础（当前功能基线）

> 目标：证据链路实现“多格式接入 + 后台任务化 + 可追踪进度 + 稳定写库”，为后续 Agent 化提供可复用底座。

### 1.1 已完成：数据层与任务模型

`server/prisma/schema.prisma` 已落地：
- `Evidence` 增强字段：`ext`、`size`、`sha256`、`text`、`meta`、`processedAt`
- 新增 `Task` 模型：`type/status/progress/payload/result/error` 及时间戳
- `User`、`Case` 与 `Task` 关系已建立

### 1.2 已完成：多格式上传与落盘

后端（`server/src/routes/evidence.js`）：
- 上传支持 `image/*, pdf, docx, txt`（mimetype + 扩展名校验）
- 采用流式写入（避免大文件内存峰值）
- 上传后落库并创建 `evidence_parse` 任务

前端（`client/src/components/evidence/EvidenceUpload.vue`）：
- `accept` 已支持 `image/*,.pdf,.docx,.txt`
- 图片压缩保留，非图片跳过压缩
- 不支持格式时可提示并正确关闭上传态

### 1.3 已完成：解析服务与任务执行

解析服务（`server/src/services/fileParser.js`）：
- TXT / PDF / DOCX 已支持文本提取（`pdf-parse`、`mammoth`）
- 图片在 parse 阶段不做 OCR（避免与 analyze 阶段重复调用 LLM）

任务执行（`server/src/services/taskRunner.js`）：
- `evidence_parse`：解析后回写 `text/meta/processedAt`
- `evidence_analyze`：按文件类型分流（图片走视觉认证，文本走文本认证）
- 批次内单条失败不阻断整体，支持成功/失败计数与状态收敛

### 1.4 已完成：任务查询与 SSE 推送

后端已提供：
- `GET /api/tasks/:id`（任务状态）
- `GET /api/tasks/:id/stream`（SSE 事件流）
- 事件类型覆盖：`progress`、`item_done`、`error`、`all_done`

前端已接入：
- 认证流程通过 `taskId + SSE` 跟踪任务
- 列表具备“按文件显示处理中”能力，支持继续加入认证队列

### 1.5 已完成：认证结果写库策略统一

AI 服务与任务层已统一：
- 图片与文本认证返回统一结构（`valid/evType/group/verdict/ocrText`）
- `valid=false` 时强制 `status=invalid`、`group=null`、`ocrText=''`
- `valid=true` 时写入分类与有效 `ocrText`（仅本案相关信息）

### 1.6 阶段一剩余优化项（不阻塞进入阶段二）

- 上传后的 `evidence_parse` 任务进度尚未在上传组件中实时展示
- 认证列表 `onItemDone` 目前以任务结束后的整表刷新为主，逐条即时刷新可继续优化
- 条目级阶段文案（如 queued/parsing/analyzing）可进一步细化为更明确的状态标签

### 1.7 已新增：案件综述（有效证据驱动）

后端与数据层：
- `Case` 新增 `caseSummary`（JSON 字符串）用于持久化“基于当前有效证据”的综述快照
- 新增接口 `POST /api/ai/case-summary`：按 `caseId` 拉取案件与 `status=valid` 证据，调用 LLM 生成综述并写库
- 综述输出结构覆盖：`factSummary`、`strength`、`strengthNote`、`crossCheck`、`evidenceGaps`、`keyPoints`、`risks`、`suggestion`、`meta`

前端：
- 案件详情“AI 案情分析”区新增“生成/更新案件综述”按钮
- 若存在 `caseSummary` 则优先渲染综述；否则回退显示建案时的 `analysis`
- 综述区展示基于有效证据的动态内容（含缺口提醒与互证/薄弱点）

---

## 2. 阶段二：建立 Agent 内核（CaseAgent + Tools + Loop）

> 目标：让系统具备“自己决定下一步做什么”的能力；先做到可控的工具调用循环，再逐步增强。

### 2.1 工具化（把可执行能力封装成 tools）

建议目录：`server/src/agent/tools/`

最小工具集（与 next_level.md 对齐）：
- `read_evidence({ caseId, evidenceId })`：读取 evidence 文件/解析文本
- `analyze_evidence({ caseId, evidenceId })`：对单条证据做有效性/归类/矛盾检查
- `classify_evidence({ caseId, evidenceId })`：归类到清单
- `check_evidence_gap({ caseId })`：对照清单发现缺口，输出 completeness + gaps
- `notify_user({ userId, caseId, message, level })`：写 DB + 推送到前端
- `write_document({ caseId })`：生成/更新文书
- `save_state({ caseId, patch })`：持久化 agent 过程产物（可选）

### 2.2 Agent Loop（先用“结构化 JSON 决策”实现）

实现建议（不依赖供应商原生 tool-use 也能跑）：
- LLM 输出固定 JSON：
  - `{"action":"tool","name":"check_evidence_gap","args":{...}}`
  - 或 `{"action":"final","content":"..."}` 结束
- 服务端执行 tool，把结果作为“tool_result”追加到上下文，再下一轮
- 加护栏：
  - `maxSteps`（例如 10-20）
  - 工具白名单
  - caseId/userId 权限校验
  - 失败重试与降级（JSON 解析失败可要求模型重输）

### 2.3 状态持久化与可审计

新增表（建议）：`AgentRun`
- `caseId/userId`
- `status`
- `messages`（压缩存储）
- `lastTool/lastResult`
- `createdAt/updatedAt`

好处：可断点续跑、可回放、可定位异常、可做“复盘”数据源。

### 2.4 阶段二入口条件（基于当前代码现状）

当前已具备可直接进入阶段二的基础能力：
- 证据链路已任务化（`Task` + `taskRunner`），可承载 agent 子任务
- SSE 通道已存在，可复用为 agent 执行进度/事件反馈
- AI 调用层已统一封装（`llmChat/llmVision`），适合接入工具决策循环
- 证据结构化写库规则已统一，便于作为工具输入与下游决策依据

建议将阶段二启动门槛定义为：
- 数据库新增 `AgentRun`（最小字段可先落地）
- 建立 `server/src/agent/` 目录与最小执行器（runner + tool registry）
- 打通一个端到端链路：`check_evidence_gap -> notify_user -> 结束`

> 阶段二首版落地（M2 验收前提）
>- 已新增数据表：`AgentRun`、`Notification`（用于审计与通知输出）。
>- 已新增目录：`server/src/agent/`
  - 工具：`server/src/agent/tools/index.js`（`check_evidence_gap`/`notify_user`）
  - Runner：`server/src/agent/runner.js`（JSON 决策 loop，maxSteps<=10）
>- 已接入现有任务体系：
  - `server/src/services/taskRunner.js` 新增 `case_agent_run` 分支
  - `server/src/routes/agent.js` + `server/src/index.js` 新增 `POST /api/agent/run`
>- 前端触发与最小可见性：
  - `client/src/components/cases/CaseDetail.vue` 增加“运行案件助手”按钮
  - 使用现有 `streamTask` 订阅 `all_done` 并 toast 通知内容

---

#### 阶段二最小开工清单（建议按顺序）

1) 数据结构
- 新增 `AgentRun` 表：`id/userId/caseId/status/messages/lastTool/lastResult/error/createdAt/updatedAt`
- 为 `messages` 约定最小 JSON 结构（system/user/tool/tool_result）

2) 工具注册层
- 新建 `server/src/agent/tools/index.js`，实现工具白名单与参数校验入口
- 首批仅实现 2 个工具：`check_evidence_gap`、`notify_user`

3) 执行循环
- 新建 `server/src/agent/runner.js`：`while + maxSteps + JSON 解析重试`
- 约定模型输出协议：`{ action, name, args } | { action: "final", content }`
- 每一步写入 `AgentRun.messages`，失败写 `error` 与 `status=failed`

4) API 与触发
- 新增 `POST /api/agent/run`（手动触发，入参 `caseId`）
- 内部创建 `Task(type=case_agent_run)` 并复用现有任务执行/推送机制

5) 前端最小可见性
- 案件页增加一次性“运行案件助手”入口（可先隐藏在调试开关后）
- 复用任务流展示运行状态，至少可看到：`queued/running/succeeded/failed`

6) 验收标准（M2 准入）
- 同一案件可稳定完成 1 次 agent run（<=10 steps）
- 至少产出 1 条可解释的缺口提示通知（含来源依据）
- 任一步骤异常不影响系统稳定，且可在 `AgentRun` 中回放定位

---

## 3. 阶段三：给 Agent 主动性（事件驱动 + 定时巡检）

> 目标：用户不操作时，系统也能推进案件（但要“克制、可控、可关闭”）。

### 3.1 事件触发

触发点建议：
- evidence 上传完成
- evidence 解析完成
- evidence AI 分析完成（单条/批次）
- 案情更新（CaseForm 保存）

触发内容（对应 next_level.md）：
- 新证据矛盾检查
- 胜诉概率变化摘要
- 证据清单完整度刷新
- 重要事项通知（`notify_user`）

### 3.2 定时巡检（cron）

引入 `node-cron`（或等价方案）：
- 每天 9:00 扫描 `active` 案件：
  - completeness
  - gaps
  - 距关键日期（如果你后续加开庭日字段）
  - 推送提醒

必要保护：
- 频率限制（同类提醒去重）
- 用户可关闭（每个 case 或全局开关）

### 3.3 队列系统（建议在阶段三引入）

从简到繁：
- 单机：进程内队列 + `p-limit`
- 多进程/更稳：BullMQ + Redis

---

## 4. 阶段四：Agent 自我完善（复盘 + 知识沉淀 + 模板迭代）

> 目标：每个案件不再“从零开始”，而是沉淀可复用的证据策略与经验。

### 4.1 案件复盘
- 新增 `CaseClose` 流程（显式结案）
- 结案触发 agent 复盘并写入 `Knowledge` 表（结构化字段优先）

### 4.2 证据清单模板版本化
- 新增 `EvidenceTemplate`（按 caseType/version 管理）
- agent 只能“提出建议”，默认需要人工审核再生效（避免模型误改）

### 4.3 RAG（最后做）
- 先把复盘结构化数据存好
- 数据规模上来后再做 embedding + 检索增强（否则收益不明显，维护成本高）

---

## 5. 里程碑建议（把大改造拆成可交付的最小闭环）

###  M0（1 天内）：修阻塞
- 已完成：修复 `llmChat` 的 `chatOpts` 引用错误：`server/src/services/providers/index.js`

### M1（1-2 周）：阶段一最小闭环
- 已完成：多格式上传（pdf/docx/txt/image）
- 已完成：evidence 解析入库（`text/meta`）
- 已完成：任务表 + SSE 进度（后端与认证前端已接入；上传解析进度展示可继续优化）

### M2（2-4 周）：阶段二最小 Agent
- tools 抽象 + JSON 决策 loop
- “证据缺口检测 + 通知”能跑通，并可审计

### M3（1-2 个月）：阶段三主动性
- 事件触发（上传/解析/分析后自动补充检查）
- 定时巡检（可关闭、去重、限流）

---

## 6. 风险与注意事项（提前规避）
- 大文件与内存：禁止继续使用 `toBuffer()` 作为长期方案，必须流式落盘。
- 上下文与超时：证据分析需要分批/分条，不要一次把大量图片 base64 塞进单个 LLM 请求。
- JSON 解析脆弱：所有 `JSON.parse` 都应有校验与重试策略（否则 agent loop 很脆）。
- 安全边界：agent 工具必须严格限制为“当前用户/当前案件可访问资源”，并记录审计日志。


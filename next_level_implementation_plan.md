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
- **证据格式**：目前仅支持图片（后端上传处强制过滤 `image/*`；前端 `accept="image/*"`）。
- **异步与进度**：上传有进度，AI 认证没有“逐份完成”的进度推送；认证是一次请求同步阻塞返回。
- **Agent Loop**：目前只有“固定流程的 Prompt 调用”，没有“工具化 + 自主决策循环”。
- **主动性**：没有事件触发/定时巡检。

### 0.3 需要优先修的底座问题（阻塞项）
- `llmChat` 内存在 `chatOpts` 定义前访问 `chatOpts.model` 的错误，可能导致文本类 AI 调用直接抛 `ReferenceError`：  
  - 位置：`server/src/services/providers/index.js`

---

## 1. 阶段一：夯实基础（格式支持 + 异步 + 进度反馈）

> 目标：把“证据处理”做成**可扩展、可追踪、可并发、可显示过程**的流水线，用户体验从“等结果”变成“看过程”。

### 1.1 数据层改造（为异步与可追踪奠基）

建议新增/调整 Prisma 模型（`server/prisma/schema.prisma`）：

1) Evidence 增强（建议字段）
- `ext`：文件扩展名（`.pdf/.docx/.jpg/...`）
- `size`：文件大小
- `sha256`：去重/一致性校验
- `text`：解析后文本（pdf/docx/ocr 输出）
- `meta`：JSON（页数、ocr 置信度、解析来源、错误信息等）
- `processedAt`：解析/识别完成时间

2) 新增 Task/Job 表（最小可用）
- `id`：任务 ID
- `userId` / `caseId`
- `type`：`evidence_parse` / `evidence_analyze` / `case_agent_run` 等
- `status`：`queued/running/succeeded/failed/canceled`
- `progress`：0-100
- `payload`：JSON（evidenceIds 等）
- `result`：JSON（最终摘要）
- `error`：失败原因
- `createdAt/updatedAt`

> 解释：你现在的 `verify` 是同步接口，缺少“中间态”。引入 Task 后，前端可以轮询/订阅进度，后端也能限流与重试。

### 1.2 上传改造（从“只图片”到“多格式证据”）

后端（`server/src/routes/evidence.js`）：
- 放开文件类型限制：允许 `pdf/docx/txt/jpg/png`（按 `mimetype` + 扩展名双重判断）。
- **改为流式落盘**：避免 `part.toBuffer()` 对大文件导致内存峰值飙升。
- 落库时记录 `ext/size/sha256/status=pending`，同时创建 `Task(type=evidence_parse)`。

前端（`client/src/components/evidence/EvidenceUpload.vue`）：
- `accept` 改为 `image/*,.pdf,.docx,.txt`。
- 仍保留图片压缩（对 pdf/docx/txt 跳过压缩）。

### 1.3 文件解析服务（parseToText：PDF/DOCX/OCR/纯文本）

新增服务模块（建议路径：`server/src/services/fileParser.js`）：
- PDF：`pdf-parse` 提取文本；若文本过短（扫描件），进入 OCR。
- DOCX：`mammoth`。
- 图片：`tesseract.js` OCR；OCR 文本过少则可走视觉模型做“场景理解”补充说明（可选）。
- TXT：直接读取。
- 并发限制：`p-limit`（建议 2-4 并发）。

解析完成后：
- 更新 Evidence 的 `text/meta/processedAt`
- 推动下一步 `Task(type=evidence_analyze)`（或让用户点击“认证”再入队）

### 1.4 异步处理与进度推送（SSE 或 WebSocket）

两种可选方案（建议先做 SSE，复杂度更低）：

方案 A：SSE（推荐起步）
- 新增：`GET /api/tasks/:id/stream`（SSE）
- 后端在解析/ocr/分析每个阶段写事件：`progress`、`item_done`、`error`、`all_done`
- 前端用 `EventSource` 订阅，实时更新列表 UI

方案 B：WebSocket/Socket.IO
- 增加 ws 插件，按 `userId` 或 `taskId` 订阅推送

### 1.5 证据认证流程重构（从“同步 verify”到“后台逐份完成”）

后端：
- 保留 `POST /api/evidence/verify` 作为“创建任务”的入口：立即返回 `{ taskId }`
- 后台 worker 分批调用 LLM（避免一次性把大量图片塞进一个请求）
- 每完成 1 份 evidence：更新 Evidence，并推送进度事件

前端（`client/src/components/evidence/EvidenceList.vue`）：
- “认证中…”不再只是按钮 loading，而是：
  - 每个证据条目显示：排队/解析/ocr/分析/完成/失败
  - 支持部分完成：已完成的即时进入分组列表

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

### M0（1 天内）：修阻塞
- 修复 `llmChat` 的 `chatOpts` 引用错误：`server/src/services/providers/index.js`

### M1（1-2 周）：阶段一最小闭环
- 多格式上传（pdf/docx/txt/image）
- evidence 解析入库（`text/meta`）
- 任务表 + SSE 进度（前端可看到逐份完成）

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


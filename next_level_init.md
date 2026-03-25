这是一款pc端应用，名称叫法盾
主线脉络：用户用表单的方式创建案件->ai分享案情，理清脉络->生成ai建议，证据搜集清单->用户上传证据（ai判断证据有效性），按证据清单归类->最后生成诉讼文书。

## 改造的核心方向

从**"用户驱动的工具"**变成**"目标驱动的协作者"**：

```
现在：用户操作 → 系统响应
目标：用户定目标 → Agent 主动推进案件
```

---

## 全局架构升级

```
现在的架构：
用户 → 上传 → 分析 → 看结果

目标架构：
用户 → 描述案件目标
           ↓
      Case Agent（案件负责人）
      ├── 主动规划证据策略
      ├── 监控案件进度
      ├── 发现问题主动预警
      ├── 协调各个子 Agent
      └── 推进到最终文书
```

---

## 分四个阶段实现

---

### 阶段一：夯实基础（你现在能做）

**目标：把现有功能做稳，加上异步和进度反馈**

#### 1. 文件解析全格式支持

```bash
npm install pdf-parse mammoth tesseract.js p-limit
```

```javascript
// file-parser.js
async function parseToText(filePath) {
  const ext = path.extname(filePath).toLowerCase()

  switch(ext) {
    case '.pdf':
      const pdf = await pdfParse(fs.readFileSync(filePath))
      // 扫描件文字少，走 OCR
      if (pdf.text.trim().length < 100) {
        return await ocrPDF(filePath)
      }
      return pdf.text

    case '.docx':
      const doc = await mammoth.extractRawText({ path: filePath })
      return doc.value

    case '.jpg': case '.png':
      const ocr = await tesseract.recognize(filePath, 'chi_sim')
      // 文字少说明是现场照片，走 vision
      if (ocr.data.text.trim().length < 50) {
        return await analyzeImageWithVision(filePath)
      }
      return ocr.data.text

    case '.txt':
      return fs.readFileSync(filePath, 'utf-8')
  }
}
```

#### 2. 异步处理 + 进度推送

```javascript
// 上传立即返回，后台处理
app.post('/upload-evidence', async (req, res) => {
  res.json({ message: '开始分析', taskId })

  // 并行处理，每完成一个推送一个
  const limit = pLimit(3)
  await Promise.all(
    req.files.map(file => limit(async () => {
      const result = await analyzeEvidence(file)
      // 每完成一个，实时推给前端
      io.to(userId).emit('evidence:done', { file: file.name, result })
    }))
  )

  io.to(userId).emit('evidence:all-complete')
})
```

**前端改造：** 上传后显示进度列表，每条证据分析完就渲染一条，用户看到过程而不是等待。

**这个阶段完成后：** 格式支持全了，速度快了，用户体验质变。

---

### 阶段二：建立 Agent 内核（需要学 2-3 周）

**目标：有一个真正的 Agent Loop，LLM 自己决策**

#### 1. 实现 Agent Loop

```javascript
// agent-core.js
class CaseAgent {
  constructor(caseId) {
    this.caseId = caseId
    this.messages = []
    this.tools = [
      readEvidenceTool,      // 读取证据内容
      analyzeEvidenceTool,   // 分析单条证据
      classifyEvidenceTool,  // 归类到清单
      checkEvidenceGapTool,  // 检查证据缺口
      notifyUserTool,        // 推送通知给用户
      writeDocumentTool,     // 生成法律文书
      saveToDatabaseTool,    // 保存结果
    ]
  }

  async run(goal) {
    this.messages.push({ role: 'user', content: goal })

    while (true) {
      const response = await this.callLLM()

      if (response.stop_reason === 'end_turn') {
        return response.content
      }

      if (response.stop_reason === 'tool_use') {
        await this.handleToolUse(response)
        // 继续循环，LLM 自己决定下一步
      }
    }
  }
}
```

#### 2. System Prompt 给 Agent 目标感

```javascript
const systemPrompt = `
你是一名资深律师助理，负责推进案件 ${caseId}。

你的唯一目标：帮助当事人做好诉讼准备。

主动行为原则：
- 发现证据缺口，主动标记并通知用户
- 发现证据矛盾，主动分析原因
- 每次分析完，评估案件胜诉概率变化
- 不确定时询问用户，不要猜测

边界约束：
- 只能访问当前案件的文件
- 不能删除任何原始证据
- 法律结论必须标注"仅供参考，请咨询执业律师"

案件基本信息：
${caseContext}

当前证据清单：
${evidenceList}
`
```

**这个阶段完成后：** Agent 能自主分析一批证据，自己决定调用哪些工具，自己判断什么时候结束。

---

### 阶段三：给 Agent 主动性（最有价值）

**目标：Agent 不只响应用户，还主动推进案件**

#### 1. 案件状态监控（定时触发）

```javascript
// 每天定时跑，不等用户操作
cron.schedule('0 9 * * *', async () => {
  const activeCases = await db.cases.findActive()

  for (const case_ of activeCases) {
    const agent = new CaseAgent(case_.id)

    await agent.run(`
      主动检查案件状态：
      1. 证据清单的完整度是多少？
      2. 哪些关键证据还缺失？
      3. 距开庭日期还有多久？
      4. 有什么紧急事项需要通知用户？
      
      如果有需要用户关注的事项，调用 notifyUser 工具推送通知。
    `)
  }
})
```

#### 2. 事件触发的主动行为

```javascript
// 用户上传新证据时，Agent 主动做更多
async function onEvidenceUploaded(caseId, newEvidence) {
  const agent = new CaseAgent(caseId)

  await agent.run(`
    用户刚上传了新证据：${newEvidence.name}
    
    请你：
    1. 分析这份证据
    2. 检查它是否与已有证据有矛盾
    3. 评估它对案件胜诉概率的影响
    4. 更新证据清单的完整度
    5. 如果发现重要信息，主动通知用户
  `)
}
```

#### 3. 证据缺口检测工具

```javascript
// Agent 可以调用这个工具主动发现问题
const checkEvidenceGapTool = {
  name: 'check_evidence_gap',
  description: '检查当前证据与胜诉所需证据之间的差距',
  execute: async ({ caseId }) => {
    const requiredEvidence = await db.evidenceLists.getRequired(caseId)
    const uploadedEvidence = await db.evidence.getUploaded(caseId)
    
    const gaps = requiredEvidence.filter(
      req => !uploadedEvidence.find(up => up.category === req.category)
    )
    
    return {
      completeness: `${uploadedEvidence.length}/${requiredEvidence.length}`,
      gaps: gaps.map(g => ({
        category: g.category,
        importance: g.importance,
        suggestion: g.obtainSuggestion
      }))
    }
  }
}
```

**这个阶段完成后：** 用户不操作系统，系统也在帮他推进案件。这是体验的巨大跃升。

---

### 阶段四：Agent 自我完善（长期方向）

**目标：Agent 能从每个案件中学习，越用越好**

#### 案件复盘机制

```javascript
// 案件结束后，Agent 自己总结经验
async function onCaseClosed(caseId, outcome) {
  const agent = new CaseAgent(caseId)

  await agent.run(`
    案件已结束，结果：${outcome}
    
    请复盘：
    1. 哪些证据起到了关键作用？
    2. 哪些证据收集晚了影响了准备？
    3. 对于同类案件，有哪些经验可以沉淀？
    
    将经验总结写入知识库，供未来类似案件参考。
  `)
}
```

#### 动态优化证据清单模板

```javascript
// Agent 发现某类案件总是缺某种证据
// 自动更新该类案件的证据清单模板
const updateEvidenceTemplateTool = {
  name: 'update_evidence_template',
  description: '根据案件经验更新证据清单模板',
  execute: async ({ caseType, newItem, reason }) => {
    await db.evidenceTemplates.addItem({ caseType, newItem, reason })
  }
}
```

---

## 你的学习路径对应关系

```
阶段一（1-2周）
  学：pdf-parse mammoth tesseract Promise.all WebSocket
  做：文件全格式解析 + 异步进度推送

阶段二（2-4周）
  学：Tool Use / Agent Loop / System Prompt 设计
  做：CaseAgent 核心类

阶段三（1-2个月）
  学：BullMQ / cron / 事件驱动设计
  做：主动监控 + 事件触发行为

阶段四（长期）
  学：RAG / 向量数据库 / 知识沉淀
  做：从案件中学习的机制
```

---

## 最重要的一件事

每个阶段都围绕**一个真实用户的真实痛点**来做，不要为了技术而技术。

```
阶段一解决：等太久、格式不支持
阶段二解决：分析不够智能、需要手动操作太多
阶段三解决：用户容易遗漏、没有人帮他盯着
阶段四解决：每个案件从零开始、经验无法积累
```

> 你已经有产品、有用户、有场景，这是最稀缺的。技术只是把你已经理解的业务价值，用更好的方式表达出来。
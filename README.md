# 法盾 · AI 法律援助平台

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite + Pinia + Vue Router |
| 后端 | Node.js + Fastify + Prisma |
| 数据库 | SQLite |
| AI | Anthropic Claude API |
| 认证 | JWT（7 天有效期） |

## 快速启动

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入：
# JWT_SECRET=（任意长随机字符串）
# ANTHROPIC_API_KEY=（你的 API Key）
```

### 2. 安装依赖 + 初始化数据库

```bash
npm run setup
```

### 3. 一键启动前后端

```bash
npm run dev
```

- 前端：http://localhost:5173  
- 后端：http://localhost:3000  
- API：http://localhost:3000/api

## 项目结构

```
fadun/
├── package.json          # 根配置，concurrently 一键启动
├── .env.example
├── server/
│   ├── src/
│   │   ├── index.js               # Fastify 入口
│   │   ├── plugins/               # db、jwt、static、cors
│   │   ├── middleware/auth.js     # JWT 验证
│   │   ├── routes/
│   │   │   ├── auth.js            # 注册 / 登录
│   │   │   ├── cases.js           # 案件 CRUD
│   │   │   ├── evidence.js        # 证据上传 / 删除
│   │   │   └── ai.js              # AI 分析 / 文书生成
│   │   └── services/
│   │       ├── claude.js          # 所有 Prompt 逻辑
│   │       ├── auth.js            # 密码加密 / JWT
│   │       └── demo.js            # 新用户演示案件
│   ├── prisma/schema.prisma
│   └── uploads/                   # 证据图片存储
└── client/
    └── src/
        ├── stores/                # Pinia（auth、cases）
        ├── api/                   # axios 封装
        ├── components/
        │   ├── auth/              # LoginModal、RegisterModal
        │   ├── cases/             # CaseList、CaseForm、CaseDetail
        │   ├── evidence/          # Guide、List、Item、Upload
        │   ├── analysis/          # CaseAnalysis
        │   ├── document/          # DocViewer + PDF 下载
        │   ├── layout/            # AppNav、AppToast
        │   └── ui/                # BaseModal
        └── assets/css/            # tokens、base、components
```

## 核心功能

- **注册 / 登录**：手机号 + 密码，bcrypt 加密，JWT 认证
- **演示案件**：每个新账号自动生成一条带「示例」标记的演示案件
- **案情录入**：保存时并发调用 Claude 生成个性化证据分组 + 案情分析
- **证据上传**：批量上传图片，Claude 视觉分析证明力并自动归类
- **维权文书**：Claude 基于案情和证据生成正式维权陈述书，支持下载 PDF

## Prompt 位置

所有 Prompt 均在 `server/src/services/ai.js`，包含：
- `generateGroups` — 个性化证据分组
- `generateAnalysis` — 案情分析（胜诉可能性、关键要点、风险）
- `analyzeEvidence` — 批量图片证明力判断
- `generateDocument` — 维权陈述书正文生成

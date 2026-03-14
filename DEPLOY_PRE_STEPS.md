# 生产部署 · 执行脚本前的步骤

在运行 `python deploy_production.py` 之前，请完成以下步骤。

## 1. 准备代码与运行环境

- 将项目放到服务器（如 `git clone` 或上传后解压）。
- 安装 **Node.js 18+**、**npm**；安装 **Python 3**（用于执行部署脚本）。

## 2. 配置环境变量

在**项目根目录**：

```bash
cp .env.example .env
```

编辑 `.env`，至少完成：

- **JWT_SECRET**：改为生产环境专用的长随机字符串（建议 32 位以上）。
- **PORT**：后端监听端口，如 `3000`。
- **DATABASE_URL**：生产建议用绝对路径，例如  
  `DATABASE_URL="file:/var/app/fadun/data/fadun.db"`  
  若使用绝对路径，先创建目录：  
  `mkdir -p /var/app/fadun/data`  
  并保证运行用户对该目录有写权限。
- **LLM**：按实际使用的服务填写（如 `LLM_PROVIDER=anthropic` 与 `ANTHROPIC_API_KEY`，或 OpenAI/DeepSeek 对应变量）。

## 3. 确认当前目录

在项目根目录执行部署脚本（根目录下应存在 `package.json`、`server/`、`client/`、`deploy_production.py`）：

```bash
python deploy_production.py
```

## 4. 脚本执行完成后

脚本会执行：`npm install` → `npm run build` → 创建 `server/uploads`、`server/logs` → `npm run db:push --workspace=server`。

完成后需**手动启动服务**，例如：

- `NODE_ENV=production node server/src/index.js`
- 或：`pm2 start ecosystem.config.cjs`（需先 `npm install -g pm2`）

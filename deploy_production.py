#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
法盾 · 生产环境部署脚本

执行本脚本【之前】请完成以下步骤：
────────────────────────────────────────────────────────────
1. 将项目代码放到服务器（git clone 或上传压缩包解压）。
2. 安装 Node.js 18+ 和 npm（以及 Python 3，用于运行本脚本）。
3. 在项目根目录创建 .env：
   - 复制 .env.example 为 .env
   - 必改：JWT_SECRET（生产用长随机串）、PORT（如 3000）
   - 数据库：生产建议用绝对路径，例如
     DATABASE_URL="file:/var/app/fadun/data/fadun.db"
   - 若用绝对路径，请先创建目录，例如：mkdir -p /var/app/fadun/data
   - 按需填写 LLM 配置（ANTHROPIC_API_KEY 或 OPENAI_API_KEY 等）
4. 确认当前在项目根目录（存在 package.json、server/、client/）。
────────────────────────────────────────────────────────────

本脚本将依次执行：npm install → npm run build → 创建 uploads/logs 目录 → db:push。
脚本结束后需手动启动服务（见输出提示）。
"""

import os
import sys
import subprocess
from pathlib import Path


def run(cmd: str, cwd: Path, env=None) -> int:
    print(f"\n>>> {cmd}")
    env = env or os.environ.copy()
    ret = subprocess.run(
        cmd,
        cwd=cwd,
        shell=True,
        env=env,
    )
    return ret.returncode


def main() -> int:
    root = Path(__file__).resolve().parent

    if not (root / "package.json").exists():
        print("错误：未在项目根目录找到 package.json，请于项目根目录执行本脚本。", file=sys.stderr)
        return 1
    if not (root / "server").is_dir() or not (root / "client").is_dir():
        print("错误：未找到 server/ 或 client/ 目录。", file=sys.stderr)
        return 1

    env_file = root / ".env"
    if not env_file.exists():
        print("错误：未找到 .env，请先复制 .env.example 为 .env 并填写生产配置。", file=sys.stderr)
        return 1

    print("正在项目根目录执行部署步骤：", root)

    if run("npm install --include=dev", root) != 0:
        print("npm install 失败", file=sys.stderr)
        return 1

    if run("npm run build", root) != 0:
        print("npm run build 失败", file=sys.stderr)
        return 1

    (root / "server" / "uploads").mkdir(parents=True, exist_ok=True)
    (root / "server" / "logs").mkdir(parents=True, exist_ok=True)
    print("\n>>> 已确保 server/uploads 与 server/logs 存在")

    if run("npm run db:push --workspace=server", root) != 0:
        print("db:push 失败，请检查 .env 中 DATABASE_URL 及数据库目录权限。", file=sys.stderr)
        return 1

    print("\n" + "=" * 60)
    print("部署脚本执行完毕。请手动启动服务：")
    print("  方式一：NODE_ENV=production node server/src/index.js")
    print("  方式二：pm2 start ecosystem.config.cjs  （需先 npm install -g pm2）")
    print("=" * 60 + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

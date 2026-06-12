# Memoirs of the Old World

Memoirs of the Old World（旧世界回忆录 / 临终笔记）是一个课程实验项目。网站以旧档案馆、房间记忆、公共留言墙等形式，引导用户留下个人记忆，并把部分公开档案数据作为“人如何被记录、理解和记住”的研究材料。

当前项目采用静态 HTML/CSS/JavaScript + Node.js/Express 后端结构，数据库使用 Neon PostgreSQL，登录使用 GitHub OAuth。

## 项目结构

```text
website/
├─ index.html
├─ styles.css
├─ script.js
├─ pages/
├─ assets/
│  ├─ css/
│  ├─ js/
│  └─ images/
├─ server/
├─ tools/
├─ 数据/
├─ package.json
├─ package-lock.json
├─ .env.example
└─ .gitignore
```

## 本地运行

```bash
cd website
npm install
copy .env.example .env
npm start
```

服务默认运行在：

```text
http://localhost:3100
```

常用入口：

```text
http://localhost:3100/
http://localhost:3100/pages/login.html
http://localhost:3100/pages/memory-hall.html
http://localhost:3100/pages/community.html
```

## 环境变量

请在 `website/.env` 中配置真实值。不要提交 `.env`。

```env
DATABASE_URL=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
SESSION_SECRET=
PORT=3100
GITHUB_CALLBACK_URL=http://localhost:3100/auth/github/callback
N8N_NEWS_WEBHOOK_URL=
N8N_GENERATE_DIARY_WEBHOOK_URL=
DEEPSEEK_API_KEY=
```

说明：

- `DATABASE_URL`：Neon PostgreSQL 连接字符串。
- `GITHUB_CLIENT_ID`：GitHub OAuth App Client ID。
- `GITHUB_CLIENT_SECRET`：GitHub OAuth App Client Secret，只能在后端使用。
- `SESSION_SECRET`：Express session 加密密钥。
- `PORT`：后端服务端口，本地默认 3100。
- `GITHUB_CALLBACK_URL`：GitHub OAuth 回调地址。
- `N8N_NEWS_WEBHOOK_URL`：Memory Hall 新闻工作流 Webhook，只在后端使用。
- `N8N_GENERATE_DIARY_WEBHOOK_URL`：Memory Hall 归档日记工作流 Webhook，只在后端使用。
- `DEEPSEEK_API_KEY`：数据重建或翻译脚本使用，非网站运行必需。

## 数据库

数据库使用 Neon PostgreSQL。后端会在启动时确保创建登录、Memory Hall、社区交互相关表。与数据库相关的初始化 SQL 和脚本位于：

```text
server/
```

检查数据库说明可参考：

```text
DATABASE_GUIDE.txt
DATABASE_INSPECTION_RESULT.txt
```

## GitHub OAuth

本地开发时，GitHub OAuth App 配置：

```text
Homepage URL:
http://localhost:3100

Authorization callback URL:
http://localhost:3100/auth/github/callback
```

部署后需要把 GitHub OAuth App 的 callback URL 和 `.env` 中的 `GITHUB_CALLBACK_URL` 改为公网域名。

## 部署说明：阿里云 ECS + Ubuntu + Node + PM2 + Nginx

推荐部署流程：

```bash
sudo apt update
sudo apt install -y nodejs npm nginx
sudo npm install -g pm2
git clone <your-repo-url>
cd <repo>/website
npm ci
cp .env.example .env
nano .env
pm2 start server/index.js --name memoirs-old-world
pm2 save
pm2 startup
```

Nginx 可反向代理到 Node 服务：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用后：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 安全注意

- 不要提交 `.env`。
- 不要提交 Neon 连接字符串、GitHub Secret、n8n Webhook、DeepSeek API Key。
- `node_modules/` 不需要提交。
- 大体积原始图片库建议放在外部存储或 Git LFS，不建议直接提交普通 Git 仓库。

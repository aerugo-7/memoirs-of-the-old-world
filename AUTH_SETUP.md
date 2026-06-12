# GitHub OAuth 登录接入说明

本项目使用 Express 后端完成真实 GitHub OAuth 登录。前端只跳转到 `/auth/github`，不会保存或读取 `GITHUB_CLIENT_SECRET`。真实登录状态以后端 session 为准。

## 环境变量

请在 `website/.env` 中配置：

```env
DATABASE_URL=postgresql://user:password@host/db?sslmode=require
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
SESSION_SECRET=replace_with_a_long_random_secret
PORT=3100
GITHUB_CALLBACK_URL=http://localhost:3100/auth/github/callback
N8N_NEWS_WEBHOOK_URL=https://your-n8n-news-webhook.example
N8N_GENERATE_DIARY_WEBHOOK_URL=https://your-n8n-generate-diary-webhook.example
```

不要把 `.env`、`GITHUB_CLIENT_SECRET`、`DATABASE_URL` 或任何真实密钥提交到 GitHub。

## GitHub OAuth App 配置

本地开发时，在 GitHub OAuth App 中设置：

```text
Homepage URL:
http://localhost:3100

Authorization callback URL:
http://localhost:3100/auth/github/callback
```

scope 使用：

```text
read:user user:email
```

部署到公网后，需要把 `GITHUB_CALLBACK_URL` 和 GitHub OAuth App 的 callback URL 同步改成公网域名，例如：

```text
https://your-domain.com/auth/github/callback
```

## 启动服务

```bash
cd website
npm install
npm start
```

启动后访问：

```text
http://localhost:3100/pages/login.html
```

点击“使用 GitHub 登录”后：

1. 前端跳转到 `/auth/github`
2. 后端跳转 GitHub 授权页
3. GitHub 回调 `/auth/github/callback`
4. 后端换取 `access_token`
5. 后端读取 GitHub 用户信息与邮箱
6. 用户写入 Neon PostgreSQL 的 `users` 表
7. 后端写入 session
8. 登录成功后跳回 `/pages/login.html?login=success`

## 数据库表

服务启动时会确保创建 `users` 表：

```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  github_id TEXT UNIQUE NOT NULL,
  username TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

也可以手动执行：

```bash
psql "$DATABASE_URL" -f server/schema-auth.sql
```

## 前端状态

`pages/login.html` 通过 `assets/js/login.js` 请求：

```text
GET /api/me
```

如果后端 session 已登录，页面显示“已登录”和“下一页”。前端可以把基础显示状态写入 `localStorage.oldWorldAuth` 作为显示缓存，但真实登录状态必须以后端 session 为准。

## DBeaver 检查

登录成功后，在 DBeaver 中执行：

```sql
SELECT id, github_id, username, email, avatar_url, created_at, last_login_at
FROM users
ORDER BY last_login_at DESC;
```

能看到最新 GitHub 用户记录，即表示用户已写入数据库。

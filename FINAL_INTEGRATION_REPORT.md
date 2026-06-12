# 期末网站整合报告

生成时间：2026-06-13 00:00 左右  
整合目标：把组员问答页面、档案馆页面、墓碑设计页面接入 Memoirs of the Old World / 临终笔记现有网站动线，并同步到干净 GitHub 仓库。

## 一、扫描到的 other 文件夹内容

`临终笔记数据/other` 下主要内容：

- `期末网站/`
  - `pages/memory-table.html`：问答主页面，主题为“吃什么 / 记忆餐桌”。
  - `pages/drifting.html`：问答主页面，主题为“留在旧世界的烦恼 / 遗言遗书”。
  - `pages/css/memory-table.css`、`sea.css`、`mosaic.css`：三个主页面或模块样式。
  - `pages/js/memory-table.js`、`sea.js`、`mosaic.js`：三个主页面或模块脚本。
  - `assets/image/table-scene.jpg`、`assets/image/记忆漂流瓶.png`：主页面视觉资源。
  - `.env`、`node_modules/`、`DATABASE_GUIDE.txt`：包含环境配置、依赖、数据库说明，未复制到线上页面结构。
- `eating-static-embedded.html`：吃相关档案馆，单文件嵌入式页面。
- `trouble-static-embedded.html`：遗言 / 遗书相关档案馆，单文件嵌入式页面。
- `keyword-static-embedded.html`：墓地故事相关档案馆，单文件嵌入式页面。
- `tombstone design(1).html`：墓碑设计页面。

发现情况：

- `other/期末网站` 中没有独立的“人生关键词” HTML 页面，只有 `mosaic.css` 与 `mosaic.js`。本次新增了规范页面壳 `pages/journey/keyword.html` 来承载该模块。
- `other/期末网站` 中存在 `.env`、`node_modules/`、旧服务端脚本和数据库说明，未作为页面资源复制。

## 二、复制和改名情况

已复制并规范命名：

- `other/期末网站/pages/memory-table.html` → `pages/journey/food.html`
- `other/期末网站/pages/drifting.html` → `pages/journey/trouble.html`
- 新建 `pages/journey/keyword.html`，接入 `mosaic.css` / `mosaic.js`
- `other/tombstone design(1).html` → `pages/journey/tombstone.html`
- `other/eating-static-embedded.html` → `pages/archives/eating.html`
- `other/trouble-static-embedded.html` → `pages/archives/trouble.html`
- `other/keyword-static-embedded.html` → `pages/archives/keyword.html`
- 新建 `pages/archives/index.html`，作为档案馆索引页

资源整理：

- `pages/css/memory-table.css` → `assets/css/journey/memory-table.css`
- `pages/css/sea.css` → `assets/css/journey/sea.css`
- `pages/css/mosaic.css` → `assets/css/journey/mosaic.css`
- 新建 `assets/css/journey/integration-nav.css`
- `pages/js/memory-table.js` → `assets/js/journey/memory-table.js`
- `pages/js/sea.js` → `assets/js/journey/sea.js`
- `pages/js/mosaic.js` → `assets/js/journey/mosaic.js`
- `assets/image/table-scene.jpg` → `assets/images/journey/table-scene.jpg`
- `assets/image/记忆漂流瓶.png` → `assets/images/journey/memory-bottle.png`

以上改动已同步到：

- 原始项目：`临终笔记数据/website`
- 干净 GitHub 仓库：`memoirs-of-the-old-world`

## 三、新增页面

新增页面：

- `pages/journey/food.html`
- `pages/journey/trouble.html`
- `pages/journey/keyword.html`
- `pages/journey/tombstone.html`
- `pages/archives/eating.html`
- `pages/archives/trouble.html`
- `pages/archives/keyword.html`
- `pages/archives/index.html`

新增后端文件：

- `server/journey-data.js`

新增后端接口：

- `GET /api/journey-data/ping`
- `GET /api/stats`
- `GET /api/meals/random`
- `GET /api/meals/:id`
- `GET /api/search/food`
- `GET /api/words`
- `GET /api/word-stats`
- `GET /api/words/random`
- `GET /api/words/:id`
- `GET /api/recipes`
- `GET /api/recipes/:id`
- `GET /api/recipes/:id/image/:index`
- `GET /api/stories`
- `GET /api/stories/:id`
- `GET /api/stories/:id/image/:index`
- `GET /api/letters`
- `GET /api/letters/:id`

这些接口复用现有 Neon PostgreSQL 数据表，不新建登录系统，不影响 Memory Hall 和社区功能。

## 四、修改的现有页面和文件

修改：

- `pages/login.html`
  - 登录成功后的“下一页”从 `memory-hall.html` 改为 `journey/food.html`。
- `pages/community.html`
  - 删除“AI 档案管理员”入口、侧栏卡片和聊天视图。
  - 新增“进入档案馆”入口，链接到三个档案馆页面。
- `assets/js/community.js`
  - 移除 AI 档案管理员相关前端逻辑。
  - 保留留言墙、分享社区、我的发布、帖子详情、评论、“🕯 来过”等功能。
- `assets/css/community.css`
  - 新增档案馆入口卡片样式。
- `server/index.js`
  - 注册 `server/journey-data.js` 中的旅程数据接口。
- `server/auth-github.js`
  - 默认本地 callback 改为 `http://localhost:3100/auth/github/callback`。
  - 启动日志改为输出实际 `GITHUB_CALLBACK_URL`。

## 五、最终网站动线

最终动线：

1. `index.html`
2. `pages/login.html`
3. `pages/journey/food.html`
4. `pages/archives/eating.html` 可选访问
5. `pages/journey/trouble.html`
6. `pages/archives/trouble.html` 可选访问
7. `pages/journey/keyword.html`
8. `pages/archives/keyword.html` 可选访问
9. `pages/journey/tombstone.html`
10. `pages/memory-hall.html`
11. `pages/community.html`
12. `pages/archives/index.html` 可从社区进入

## 六、路径修复情况

已修复：

- 组员页面 CSS 引用路径。
- 组员页面 JS 引用路径。
- `memory-table.css` 中桌面背景图路径。
- 组员 JS 中旧的 `http://localhost:3000/api`，改为同源 `/api`。
- 档案馆页面之间的互链。
- 档案馆页面返回问题页、继续下一步的导航。
- 墓碑设计页的返回与下一步。
- 登录页下一步。

## 七、缺失资源和注意项

未发现新增页面缺失本地图片资源。

注意项：

- 三个档案馆页面是嵌入式大 HTML，单文件较大：
  - `pages/archives/eating.html` 约 8.6MB
  - `pages/archives/keyword.html` 约 8.4MB
  - 这不是原始图片库，但会增加 Git 仓库体积。课程展示可接受；长期维护建议拆分资源或压缩。
- `other/期末网站` 中没有独立关键词主页面，本次用 `mosaic.css/js` 新建了承载页面。
- 当前 3100 端口测试时发现已有旧 Node 进程占用。更新后需要重启服务，才能看到新增 `/api/meals/random` 等接口。

## 八、敏感文件检查

未复制：

- `.env`
- `node_modules/`
- `Connection string.txt`
- `other/期末网站/DATABASE_GUIDE.txt`
- 旧数据库连接说明中的真实连接字符串
- 大体积原始图片库

`.gitignore` 已覆盖：

- `node_modules/`
- `.env`
- `.env.*`
- `!.env.example`
- `Connection string.txt`
- `logs/`
- `*.log`
- `dist/`
- `build/`
- `coverage/`
- `uploads/`
- `Thumbs.db`
- 备份与临时文件

## 九、本地测试入口

本地正式端口应为 3100：

- `http://localhost:3100/`
- `http://localhost:3100/pages/login.html`
- `http://localhost:3100/pages/journey/food.html`
- `http://localhost:3100/pages/journey/trouble.html`
- `http://localhost:3100/pages/journey/keyword.html`
- `http://localhost:3100/pages/journey/tombstone.html`
- `http://localhost:3100/pages/memory-hall.html`
- `http://localhost:3100/pages/community.html`
- `http://localhost:3100/pages/archives/index.html`
- `http://localhost:3100/pages/archives/eating.html`
- `http://localhost:3100/pages/archives/trouble.html`
- `http://localhost:3100/pages/archives/keyword.html`

验证结果：

- 使用临时端口 `3199` 启动新代码验证通过。
- 页面访问通过：
  - `pages/journey/food.html`
  - `pages/journey/trouble.html`
  - `pages/journey/keyword.html`
  - `pages/journey/tombstone.html`
  - `pages/archives/eating.html`
  - `pages/archives/index.html`
  - `pages/memory-hall.html`
  - `pages/community.html`
- API 验证通过：
  - `GET /api/journey-data/ping`
  - `GET /api/meals/random?count=2`
  - `GET /api/word-stats`

## 十、GitHub 仓库提交建议

在干净仓库目录执行：

```bash
cd "E:\课程资料\6-大三下\实验数字档案馆\临终笔记\memoirs-of-the-old-world"
git status
git add .
git commit -m "Integrate final journey archive pages"
git push
```

## 十一、服务器更新提醒

服务器部署更新时执行：

```bash
cd /root/memoirs-of-the-old-world
git pull
npm install
pm2 restart memoirs --update-env
```

如果服务端已经有旧进程占用端口，请先用 PM2 重启，而不是只刷新浏览器。

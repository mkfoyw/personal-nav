# 栖点 · 个人导航

使用 **Next.js App Router + TypeScript + Tailwind CSS v4 + shadcn/ui（Radix / Nova）** 重新实现的个人导航站。

浏览器访问 Next.js 的同源 `/api` 接口，Next.js 服务端连接本机 `mongodb://localhost:27017/`。仍使用 `personal_nav` 数据库中的 `links` 集合，兼容已有收藏，无需导入或搬迁数据。

## 本地启动

需要 Node.js 20.9+ 和正在运行的本地 MongoDB。

```sh
make setup
make run
```

打开 http://localhost:8788。`make run` / `make dev` 启动开发模式并自动更新页面，不再需要单独启动旧数据桥接服务。

可将 `.env.example` 复制为 `.env.local` 来修改数据库连接。端口通过 `PORT=3000 make run` 指定（Next.js 在读取 `.env.local` 前已经确定监听端口）。默认只监听 `127.0.0.1`。

## 使用已发布的 Sites 页面

打开 Sites 页面前，在本机运行：

```sh
make bridge
```

桥接服务监听 `http://127.0.0.1:8788/api`，由 Chrome 从 Sites 页面访问，再连接本机 MongoDB。它也会在 http://localhost:8788 提供同一份静态页面。需要更换 Sites 域名时，把新地址加入 `.env.local` 的 `ALLOWED_ORIGINS`。

## 生产运行与检查

```sh
make check          # ESLint、TypeScript 和输入/API 校验测试
make build          # 生产构建
make sites-build    # 生成 Sites 静态产物到 dist/
make start          # 启动生产版本
npm run test:integration # 使用独立临时数据库验证实际 CRUD，需先 build
```

## 功能

- 添加、编辑、删除收藏，删除前确认。
- 默认分组、全部收藏、多分类筛选；搜索名称、网址、备注和分类。
- 八种标识色彩、明暗主题、响应式布局，保留旧版 `qidian-theme` 偏好。
- `⌘K` / `Ctrl+K` 聚焦搜索，`Esc` 清空搜索。
- 真实连接状态、加载占位、空状态、失败重试和操作反馈。
- 支持浏览器提供的 WebMCP：列出和新增导航链接。

仅在数据库首次初始化且收藏为空时填充默认链接。清空收藏后不再自动恢复默认内容。旧版单一 `category` 字段读取时自动兼容为 `categories`。

## 目录

```text
app/                 Next.js 页面及 /api/links、/api/health
components/          导航页、收藏卡片和编辑弹窗
components/ui/       官方 shadcn/ui 组件源码
lib/                 数据校验、MongoDB 连接、API 工具
hooks/               WebMCP 集成
tests/              校验测试与独立数据库集成测试
legacy/              重构前的静态页面和桥接服务备份
```

后续添加组件可运行 `npx shadcn@latest add <组件名>`；配置见 `components.json`。使用规范参考 https://ui.shadcn.com/docs/skills.md。

Sites 发布配置位于 `.openai/hosting.json`。发布版本是 Next.js 生成的静态前端；数据读写通过浏览器访问本机桥接服务，因此使用线上地址时仍需运行 `make bridge`。

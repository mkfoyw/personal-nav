# 栖点 · 个人导航

使用 **Next.js App Router + TypeScript + Tailwind CSS v4 + shadcn/ui（Radix / Nova）** 重新实现的个人导航站。

全部收藏直接保存在当前浏览器的 **IndexedDB** 中。网站不需要服务器数据库、MongoDB 或本地桥接服务。

## 本地启动

需要 Node.js 20.9+。

```sh
make setup
make run
```

打开 http://localhost:8788。端口通过 `PORT=3000 make run` 指定，默认只监听 `127.0.0.1`。

## 使用已发布的 Sites 页面

直接打开 Sites 地址即可使用。数据属于当前浏览器和当前站点来源；更换浏览器、设备或清除网站数据前，请先使用页面顶部的数据菜单导出 JSON 备份。

## 生产运行与检查

```sh
make check          # ESLint、TypeScript 和数据导入校验测试
make build          # 生产构建
make sites-build    # 生成 Sites 静态产物到 dist/
make start          # 启动生产版本
```

## 功能

- 添加、编辑、删除收藏，删除前确认。
- IndexedDB 本地持久化，不依赖 MongoDB 和本地服务。
- JSON 导入、导出；首次导入会替换示例数据，之后按 ID 或网址合并，避免重复。
- 默认分组、全部收藏、多分类筛选；搜索名称、网址、备注和分类。
- 八种标识色彩、明暗主题、响应式布局，保留旧版 `qidian-theme` 偏好。
- `⌘K` / `Ctrl+K` 聚焦搜索，`Esc` 清空搜索。
- 浏览器存储状态、加载占位、空状态、失败重试和操作反馈。
- 支持浏览器提供的 WebMCP：列出和新增导航链接。

仅在当前站点的 IndexedDB 首次初始化时填充默认链接。清空收藏后不会自动恢复默认内容。导入时兼容旧版单一 `category` 字段。

## 目录

```text
app/                 Next.js 页面
components/          导航页、收藏卡片和编辑弹窗
components/ui/       官方 shadcn/ui 组件源码
lib/                 数据校验、IndexedDB 和导入导出工具
hooks/               WebMCP 集成
tests/              数据校验与导入导出测试
```

后续添加组件可运行 `npx shadcn@latest add <组件名>`；配置见 `components.json`。使用规范参考 https://ui.shadcn.com/docs/skills.md。

Sites 发布配置位于 `.openai/hosting.json`。发布版本是 Next.js 生成的静态前端，数据只保存在访问者自己的浏览器中。

# 个人导航站

页面发布在 Sites，导航数据保存在你电脑上的 MongoDB 中。浏览器不能直接连接 MongoDB，因此项目包含一个本地数据桥接服务；它把页面的 HTTP 请求安全地转成对 `mongodb://localhost:27017/` 的读写。

## 本地使用

1. 确保 MongoDB 已启动并监听 `localhost:27017`。
2. 在本目录运行 `npm install`。
3. 复制 `.env.example` 为 `.env`（默认配置通常无需修改）。
4. 运行 `npm start`。
5. 打开 `http://localhost:8788`。

从 Sites 发布地址访问时，也需要让本地服务保持运行。页面会访问当前设备的 `http://127.0.0.1:8788/api`，数据只进入本机 MongoDB 的 `personal_nav` 数据库。


# dsh-webserver-keepalive

dsh 宿主 HTTP 网关的 `keepAliveTimeout` 补丁。

## 治的是什么

`@deepseek-ai/dsh-host-webserver` 里是 `createServer(listener)`，**没设任何超时**，
于是走 Node 默认 `keepAliveTimeout = 5s`。浏览器（renderer）的连接池留得更久，
空闲一会儿后发起的 POST 会落在“服务端已关、FIN 还没感知到”的半死连接上：

```
gateway/internal: client api: session/selectModel failed: Failed to fetch
gateway/internal: client api: session/create     failed: Failed to fetch
```

GET 会被浏览器静默重试（看不见），POST 不能安全重试（直接报错）——
所以只有“改模型 / 建会话”这类低频操作偶尔失败，聊天流不受影响。

实测：`GET /` 得到 401 后空闲 **6.0s** 收到 EOF。

## 做了什么

`ctx.webServer.server.keepAliveTimeout = 600000`（10 分钟）。
配 `keepAliveTimeoutMs: 0` = 永不因空闲关闭。

只改超时，不碰路由、监听地址、压缩等其他行为。

## 生效与验证

改完需要**重启 dsh 桌面端**。启动后看：

```
~/.dsh/logs/webserver-keepalive.log
```

出现 `applied keepAliveTimeout=600000 headersTimeout=605000` 即生效。

## 回退

从 `~/.dsh/profiles/desktop/` 里找 `package.json.bak-keepalive-*` 还原，
或把 bundles 里的 `@local/dsh-webserver-keepalive` 一行删掉。

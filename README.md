# CCCore - Claude Code 核心系统

- 版本：1.0.1
- 作者：LostAbaddon

CCCore，一个为 Claude Code 提供统一的日志管理、提醒转发和浏览器集成服务的 Node.js 项目。

## 相关项目

- [CCExtension](https://github.com/LostAbaddon/CCExtension) - 配套的 Chrome 浏览器插件，提供通知和页面跟踪功能

## 功能概览

- **日志管理**：接收、缓冲和管理日志记录
- **提醒转发**：将提醒转发给 CCExtension (Chrome 插件)
- **网页控制**：通过 CCExtension 打开网页并激活标签页
- **页面跟踪**：跟踪浏览器中的页面变化

## 启动

### 安装依赖

```bash
cd CCCore
npm install
```

### 启动守护进程

```bash
npm start
```

或在开发模式下：

```bash
npm run dev
```

### 验证运行

```bash
# 使用客户端检查守护进程是否运行
npm run client -- ping
```

## 环境变量配置

可以通过环境变量自定义 CCCore 的行为：

```bash
# HTTP 服务端口（默认 3579）
export CCCORE_HTTP_PORT=3579

# WebSocket 服务端口（默认 3578）
export CCCORE_WS_PORT=3578

# Socket IPC 文件路径（默认 /tmp/cccore_socket 或 \\.\pipe\cccore_socket）
export CCCORE_SOCKET_PATH=/tmp/cccore_socket

# 服务器主机地址（默认 localhost）
export CCCORE_HOST=localhost

# 日志目录（默认 ~/action-logger）
export ACTION_LOGGER_PATH=~/action-logger

# 日志缓冲大小（默认 10 条）
export CCCORE_LOG_BUFFER_SIZE=10

# 日志刷盘间隔（默认 5000ms）
export CCCORE_LOG_FLUSH_INTERVAL=5000

# WebSocket 心跳间隔（默认 30000ms）
export CCCORE_WS_HEARTBEAT=30000

# WebSocket 客户端超时（默认 60000ms）
export CCCORE_WS_TIMEOUT=60000

# Chrome 进程名（可选，用于检查 Chrome 是否运行）
export CHROME_PROCESS=chrome

# 日志级别（默认 info）
export CCCORE_LOG_LEVEL=info

# 开发模式
export NODE_ENV=development
```

## 服务接口

### HTTP 服务

基地址：`http://localhost:3579`

#### 健康检查

```
GET /health
```

响应：
```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

#### 获取日志

```
GET /api/logs?limit=5
```

参数：
- `limit` (可选): 返回的日志条数，默认 5

响应：
```json
{
  "success": true,
  "logs": [
    {
      "source": "Claude Code",
      "timestamp": "2025-10-30 15:30:45",
      "cwd": "/Users/zhanglei/MyWorks",
      "sessionId": "session_123",
      "content": "用户输入的内容"
    }
  ],
  "count": 1
}
```

#### 添加日志

```
POST /api/log
Content-Type: application/json

{
  "source": "Claude Code",
  "cwd": "/Users/zhanglei/MyWorks",
  "sessionId": "session_123",
  "timestamp": 1698668445000,
  "content": "用户输入的内容"
}
```

响应：
```json
{
  "success": true,
  "message": "日志已添加"
}
```

#### 创建提醒

```
POST /api/reminder
Content-Type: application/json

{
  "title": "提醒标题",
  "message": "提醒内容",
  "triggerTime": 1698668445000
}
```

响应（成功，Extension 已连接）：
```json
{
  "success": true,
  "data": { "status": "sent" }
}
```

响应（失败，需要降级）：
```json
{
  "success": false,
  "error": "CCExtension 未连接",
  "fallback": true
}
```

#### 打开网页

```
POST /api/page
Content-Type: application/json

{
  "url": "https://example.com",
  "activate": true
}
```

### WebSocket 服务

地址：`ws://localhost:3578`

#### Extension 连接流程

1. Extension 连接到 WebSocket
2. Extension 发送注册消息：
```json
{
  "type": "REGISTER",
  "clientType": "extension"
}
```

3. 服务器响应：
```json
{
  "type": "REGISTER_ACK",
  "clientId": "client_xxx",
  "message": "Extension 已注册"
}
```

#### 消息格式

**请求格式**（服务器→Extension）：
```json
{
  "type": "REQUEST",
  "messageId": "msg_123",
  "action": "CREATE_NOTIFICATION",
  "data": {
    "title": "提醒标题",
    "message": "提醒内容",
    "triggerTime": 1698668445000
  }
}
```

**响应格式**（Extension→服务器）：
```json
{
  "type": "RESPONSE",
  "messageId": "msg_123",
  "data": { "status": "success" }
}
```

### Socket IPC 服务

路径：`/tmp/cccore_socket 或 \\.\pipe\cccore_socket`（可通过环境变量配置）

命令格式（JSON 逐行发送）：

```json
{"action": "PING"}
{"action": "ADD_LOG", "data": {"source": "Claude Code", "content": "...", ...}}
{"action": "GET_LOGS", "data": {"limit": 5}}
{"action": "CREATE_REMINDER", "data": {"title": "...", "message": "...", "triggerTime": ...}}
{"action": "OPEN_PAGE", "data": {"url": "...", "activate": true}}
```

## 命令行客户端

使用 `bin/client.js` 与守护进程通讯：

```bash
# 检查守护进程
node bin/client.js ping

# 获取日志
node bin/client.js get-logs 10

# 添加日志
echo '{"source": "Claude Code", "cwd": "/path/to/cwd", "sessionId": "session_123", "content": "..."}' | \
  node bin/client.js add-log

# 创建提醒
echo '{"title": "提醒", "message": "内容", "triggerTime": 1698668445000}' | \
  node bin/client.js create-reminder

# 打开网页
echo '{"url": "https://example.com", "activate": true}' | \
  node bin/client.js open-page
```

## 架构

### 组件

- **LoggerManager**: 日志缓冲和文件管理
- **BrowserManager**: Chrome 进程检查
- **ExtensionManager**: 提醒转发
- **WSManager**: WebSocket 通讯管理
- **Server**: HTTP 服务器
- **SocketHandler**: Socket IPC 服务器

### 数据流

```
┌─────────────┐
│ DailyReport │
│   Skill     │
└──────┬──────┘
       │ HTTP/Socket
       ▼
┌─────────────────────────┐
│     CCCore              │
├─────────────────────────┤
│ • LoggerManager         │
│ • ExtensionManager      │
│ • WSManager             │
└────────────┬────────────┘
             │ WebSocket
             ▼
┌─────────────────────────┐
│    CCExtension          │
│  (Chrome Plugin)        │
├─────────────────────────┤
│ • Notification API      │
│ • Page Tracking         │
└─────────────────────────┘
```

## 容错机制

1. **日志写入失败**: 缓冲区继续接受新日志，后续刷盘时重试
2. **Extension 未连接**: 提醒请求返回 `fallback: true`，客户端可选择降级方案
3. **WebSocket 超时**: 自动清理超时连接，释放资源
4. **Chrome 进程不存在**: 拒绝发送提醒/打开网页请求

## 日志文件格式

日志按日期存储在 `ACTION_LOGGER_PATH` 下，文件名为 `YYYY-MM-DD.log`。

每条日志的格式：
```
============================================================
| SOURCE   : Claude Code
| TIMESTAMP: 2025-10-30 15:30:45
| WORKSPACE: /Users/zhanglei/MyWorks
| SessionID: session_123
============================================================

用户输入的内容
```

## 故障排查

### 无法连接到守护进程

1. 检查守护进程是否运行：`ps aux | grep daemon.js`
2. 检查 Socket 文件是否存在：`ls /tmp/cccore_socket 或 \\.\pipe\cccore_socket`
3. 检查日志文件：`tail -f logs/daemon.log`

### Extension 无法连接

1. 检查 WebSocket 服务是否在运行：`netstat -an | grep 3578`
2. 检查浏览器控制台错误
3. 确保 Extension 的 `manifest.json` 中 WebSocket 连接地址正确

### 日志丢失

1. 检查 `ACTION_LOGGER_PATH` 目录是否可写
2. 检查磁盘空间是否充足
3. 查看是否有文件权限问题

## 开发

### 启用开发模式日志

```bash
NODE_ENV=development npm start
```

会在 `lib/reminder-server.log` 中记录详细日志。

### 依赖项

- `ws`: WebSocket 服务器库

## 许可证

[MIT](./LICENSE)

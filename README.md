# CCCore - Claude Code 核心系统

- 版本：1.1.5
- 作者：[LostAbaddon](lostabaddon@gmail.com)

CCCore 是一个为 Claude Code 提供统一的日志管理、提醒管理、浏览器集成服务和 Claude Code 调用能力的 Node.js 守护进程项目。

## 相关项目

- [CCExtension](https://github.com/LostAbaddon/CCExtension) - 配套的 Chrome 浏览器插件，提供通知和页面跟踪功能
- [Claudius](https://github.com/LostAbaddon/Claudius) - Web 前端项目，通过 CCCore 调用 Claude Code

## 功能概览

- **日志管理**：接收、缓冲和管理日志记录，按日期存储日志文件
- **提醒管理**：
  - 创建、查询、取消提醒
  - 提醒支持携带会话标识（sessionId），可关联特定对话
  - 持久化存储提醒数据
  - 自动清理过期提醒
  - 将提醒转发给 CCExtension（Chrome 插件）
- **配置管理**：管理应用配置（如 stop-reminder 配置）
- **网页控制**：通过 CCExtension 打开网页并激活标签页
- **工具事件转发**：接收来自 HeadlessKnight 的工具使用事件并转发给 CCExtension
- **Claude Code 调用**：
  - 通过 Worker 线程调用 Claude Code，避免阻塞主进程
  - 支持指定工作目录、模型、prompt 和会话恢复
  - 对话 Session 与浏览器标签页绑定
  - 支持 Claudius 等 Web 前端调用
- **用户输入事件**：接收用户输入事件并转发给 CCExtension
- **文件系统浏览**：支持获取指定目录的文件夹列表

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

# Claude Code 命令（默认 claude）
export CLAUDE_CODE_COMMAND=claude

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
- `limit`（可选）：返回的日志条数，默认 5，-1 表示获取全部

响应：
```json
{
  "ok": true,
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
  "ok": true,
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
  "sessionId": "session_123",
  "triggerTime": 1698668445000
}
```

参数说明：
- `title`（必需）：提醒标题
- `message`（必需）：提醒内容
- `sessionId`（可选）：关联的会话标识
- `triggerTime`（可选）：触发时间戳，默认为当前时间

响应（成功，Extension 已连接）：
```json
{
  "ok": true,
  "data": {
    "status": "sent",
    "reminderId": "reminder_1234567890_abc123"
  }
}
```

响应（成功，Extension 未连接，已保存到本地）：
```json
{
  "ok": true,
  "data": {
    "status": "saved",
    "reminderId": "reminder_1234567890_abc123"
  },
  "fallback": true
}
```

响应（失败）：
```json
{
  "ok": false,
  "error": "错误信息"
}
```

#### 获取所有活跃提醒

```
GET /api/reminders
```

响应：
```json
{
  "ok": true,
  "data": {
    "reminders": [
      {
        "id": "reminder_1234567890_abc123",
        "title": "提醒标题",
        "message": "提醒内容",
        "sessionId": "session_123",
        "triggerTime": 1698668445000,
        "created": 1698668400000,
        "timeLeft": 45000
      }
    ],
    "count": 1
  }
}
```

#### 获取单个提醒

```
GET /api/reminder/:id
```

响应：
```json
{
  "ok": true,
  "data": {
    "id": "reminder_1234567890_abc123",
    "title": "提醒标题",
    "message": "提醒内容",
    "sessionId": "session_123",
    "triggerTime": 1698668445000,
    "created": 1698668400000,
    "timeLeft": 45000,
    "isExpired": false
  }
}
```

#### 取消提醒

```
DELETE /api/reminder/:id
```

响应：
```json
{
  "ok": true,
  "message": "提醒 \"reminder_1234567890_abc123\" 已取消"
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

响应：
```json
{
  "ok": true,
  "data": { ... }
}
```

#### 获取 stop-reminder 配置

```
GET /api/config/stop-reminder
```

响应：
```json
{
  "ok": true,
  "data": {
    "enabled": true,
    "delay": 30000
  }
}
```

#### 设置 stop-reminder 配置

```
POST /api/config/stop-reminder
Content-Type: application/json

{
  "enabled": true,
  "delay": 30000
}
```

响应：
```json
{
  "ok": true,
  "data": {
    "enabled": true,
    "delay": 30000
  }
}
```

#### 提交工具事件

```
POST /api/tool-event
Content-Type: application/json

{
  "sessionId": "session_123",
  "toolName": "Read",
  "eventType": "start",
  "timestamp": 1698668445000
}
```

响应：
```json
{
  "ok": true,
  "message": "事件已接收"
}
```

#### 提交用户输入事件

```
POST /api/user-input
Content-Type: application/json

{
  "sessionId": "session_123",
  "content": "用户输入的内容"
}
```

响应：
```json
{
  "ok": true,
  "message": "用户输入事件已转发"
}
```

#### 获取文件夹列表

```
GET /api/folders?path=/Users/zhanglei
```

参数：
- `path`（必需）：要浏览的目录路径

响应（成功）：
```json
{
  "ok": true,
  "data": {
    "path": "/Users/zhanglei",
    "folders": [
      "Documents",
      "Downloads",
      "Desktop"
    ]
  }
}
```

响应（失败）：
```json
{
  "ok": false,
  "error": "错误信息"
}
```

#### Claudius 调用 Claude Code

**提交对话**：

```
POST /claudius/:tabId/submit
Content-Type: application/json

{
  "workDir": "/Users/zhanglei/MyWorks",
  "prompt": "帮我写一个函数",
  "model": "sonnet"
}
```

参数说明：
- `tabId`（URL 参数）：浏览器标签页 ID
- `workDir`（可选）：工作目录
- `prompt`（必需）：用户输入
- `model`（可选）：使用的模型，默认 sonnet

响应：
```json
{
  "ok": true,
  "data": {
    "session_id": "session_xxx",
    "reply": "Claude Code 的回复内容",
    "usage": {
      "input": 100,
      "output": 200
    }
  }
}
```

**清空会话**：

```
POST /claudius/:tabId/clear
```

响应：
```json
{
  "ok": true,
  "message": "会话已清空"
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
    "id": "reminder_1234567890_abc123",
    "title": "提醒标题",
    "message": "提醒内容",
    "sessionId": "session_123",
    "triggerTime": 1698668445000,
    "created": 1698668400000
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

**支持的 action 类型**：
- `CREATE_NOTIFICATION`：创建提醒
- `CANCEL_NOTIFICATION`：取消提醒
- `OPEN_PAGE`：打开网页
- `REMINDER_LIST_UPDATE`：提醒列表更新通知（单向，无需响应）
- `STOP_REMINDER_CONFIG_UPDATE`：stop-reminder 配置更新通知（单向，无需响应）
- `TOOL_EVENT`：工具使用事件（单向，无需响应）
- `USER_INPUT_EVENT`：用户输入事件（单向，无需响应）

### Socket IPC 服务

路径：`/tmp/cccore_socket 或 \\.\pipe\cccore_socket`（可通过环境变量配置）

命令格式（JSON 逐行发送）：

```json
{"action": "PING"}
{"action": "ADD_LOG", "data": {"source": "Claude Code", "content": "...", ...}}
{"action": "GET_LOGS", "data": {"limit": 5}}
{"action": "CREATE_REMINDER", "data": {"title": "...", "message": "...", "sessionId": "...", "triggerTime": ...}}
{"action": "GET_REMINDERS"}
{"action": "GET_REMINDER", "data": {"id": "reminder_id"}}
{"action": "CANCEL_REMINDER", "data": {"id": "reminder_id"}}
{"action": "OPEN_PAGE", "data": {"url": "...", "activate": true}}
{"action": "GET_CONFIG", "data": {"key": "stop-reminder"}}
{"action": "SEND_REMINDER", "data": {"title": "...", "message": "...", "sessionId": "...", "triggerTime": ...}}
{"action": "TOOL_EVENT", "data": {"sessionId": "...", "toolName": "...", "eventType": "...", "timestamp": ...}}
```

## 命令行客户端

使用 `bin/client.js` 与守护进程通讯：

```bash
# 检查守护进程
node bin/client.js ping

# 添加日志
node bin/client.js add-log "这是一条日志消息"

# 获取日志
node bin/client.js get-logs 10

# 创建提醒（支持命名参数）
node bin/client.js add-reminder --title="会议提醒" --message="参加团队会议" --time="in 30 minutes"
node bin/client.js add-reminder --title="任务提醒" --message="完成报告" --time="2025-11-10T15:00:00"

# 列出所有活跃提醒
node bin/client.js list-reminders

# 获取单个提醒详情
node bin/client.js get-reminder reminder_1234567890_abc123

# 取消提醒
node bin/client.js cancel-reminder reminder_1234567890_abc123

# 打开网页
echo '{"url": "https://example.com", "activate": true}' | \
  node bin/client.js open-page
```

## 架构

### 组件

- **LoggerManager**：日志缓冲和文件管理
- **ConfigManager**：应用配置管理和持久化
- **BrowserManager**：Chrome 进程检查
- **ReminderManager**：提醒的存储、生命周期管理和过期清理
- **ExtensionManager**：提醒转发和网页控制
- **WSManager**：WebSocket 通讯管理
- **Server**：HTTP 服务器
- **SocketHandler**：Socket IPC 服务器
- **ClaudeCodeWorker**：Worker 线程中调用 Claude Code

### 数据流

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│ DailyReport  │     │ HeadlessKnight│     │  Claudius    │
│   Skill      │     │    Plugin     │     │  (Web UI)    │
└──────┬───────┘     └──────┬────────┘     └──────┬───────┘
       │ HTTP/Socket        │ HTTP                │ HTTP
       ▼                    ▼                     ▼
┌────────────────────────────────────────────────────┐
│                    CCCore                          │
├────────────────────────────────────────────────────┤
│ • LoggerManager                                    │
│ • ConfigManager                                    │
│ • ReminderManager                                  │
│ • ExtensionManager                                 │
│ • WSManager                                        │
│ • Server (HTTP)                                    │
│ • SocketHandler (IPC)                              │
│ • ClaudeCodeWorker (Worker Threads)                │
└────────────┬───────────────────────────────────────┘
             │ WebSocket
             ▼
┌────────────────────────────────────────────────────┐
│              CCExtension                           │
│            (Chrome Plugin)                         │
├────────────────────────────────────────────────────┤
│ • Notification API                                 │
│ • Page Tracking                                    │
│ • Stop Reminder                                    │
│ • Tool Usage Display                               │
└────────────────────────────────────────────────────┘
```

### 数据持久化

- **日志文件**：`~/action-logger/YYYY-MM-DD.log`
- **提醒数据**：`~/.cccore-reminders/reminders.json`
- **应用配置**：`~/.cccore/config.json`

## 容错机制

1. **日志写入失败**：缓冲区继续接受新日志，后续刷盘时重试
2. **Extension 未连接**：
  - 提醒仍会保存到本地，返回 `fallback: true`
  - Extension 连接后会同步提醒列表
3. **WebSocket 超时**：自动清理超时连接，释放资源
4. **过期提醒清理**：每分钟自动清理过期的提醒
5. **提醒持久化**：提醒数据保存到磁盘，守护进程重启后恢复
6. **Claude Code 调用**：
  - 使用 Worker 线程避免阻塞主进程
  - 增强输出解析容错性
  - 会话 Session 与标签页绑定管理

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
2. 检查 Socket 文件是否存在：
  - macOS/Linux：`ls /tmp/cccore_socket`
  - Windows：检查命名管道 `\\.\pipe\cccore_socket`
3. 尝试重启守护进程：`npm start`

### Extension 无法连接

1. 检查 WebSocket 服务是否在运行：
  - macOS/Linux：`netstat -an | grep 3578`
  - Windows：`netstat -an | findstr 3578`
2. 检查浏览器控制台错误
3. 确保 Extension 的 WebSocket 连接地址正确
4. 检查防火墙设置

### 日志丢失

1. 检查 `ACTION_LOGGER_PATH` 目录是否可写
2. 检查磁盘空间是否充足
3. 查看是否有文件权限问题

### 提醒未触发

1. 确认 CCExtension 已连接到 CCCore
2. 检查提醒时间是否正确设置
3. 查看 `~/.cccore-reminders/reminders.json` 确认提醒已保存
4. 检查浏览器通知权限设置

### Claude Code 调用失败

1. 确认 Claude Code CLI 已正确安装
2. 检查 `CLAUDE_CODE_COMMAND` 环境变量是否设置正确
3. 查看 Worker 线程的错误日志
4. 确认工作目录权限正确

## 开发

### 启用开发模式

```bash
NODE_ENV=development npm start
```

开发模式下会输出更详细的日志信息。

### 依赖项

- `ws`：WebSocket 服务器库（用于与 CCExtension 通信）

### 项目结构

```
CCCore/
├── bin/
│   ├── daemon.js            # 守护进程主入口
│   └── client.js            # 命令行客户端
├── lib/
│   ├── logger-manager.js    # 日志管理器
│   ├── config-manager.js    # 配置管理器
│   ├── reminder-manager.js  # 提醒管理器
│   ├── extension-manager.js # Extension 管理器
│   ├── ws-manager.js        # WebSocket 管理器
│   ├── browser-manager.js   # 浏览器进程管理器
│   ├── claudeCodeWorker.js  # Claude Code Worker 线程
│   ├── server.js            # HTTP 服务器
│   ├── socket-handler.js    # Socket IPC 处理器
│   └── utils.js             # 工具函数
├── config/
│   └── default.js           # 默认配置
├── package.json
└── README.md
```

## 更新日志

### 版本 1.1.4

**改进优化**：
- 增强 Worker 线程日志记录功能，开发模式下自动记录日志到文件
- 优化 ClaudeCode 输出日志的可读性，增加 JSON 解析日志标识
- 完善日志记录的错误处理机制

### 版本 1.1.3

**新增功能**：
- 新增目录浏览功能，支持通过 `/api/folders` 接口获取指定路径的文件夹列表
- 提醒功能支持携带会话标识（sessionId），实现提醒与对话的关联
- 新增配置获取命令（GET_CONFIG）到 Socket IPC 服务
- 新增提醒发送命令（SEND_REMINDER）到 Socket IPC 服务
- 新增工具事件转发命令（TOOL_EVENT）到 Socket IPC 服务
- 新增用户输入事件接口（/api/user-input）及 WebSocket 转发
- 新增 Claudius Web 前端调用 Claude Code 的接口（/claudius/:tabId/submit 和 /claudius/:tabId/clear）
- 支持 Claude Code 会话 Session 与浏览器标签页的绑定

**改进优化**：
- 将阻塞式的 Claude Code 调用调整到 Worker 线程中完成，避免阻塞主进程
- 增强 ClaudeCode 输出解析的容错性，提高稳定性
- 完善工具使用事件的显示和转发机制
- 完善对话记录缓存与标签页切换的处理

**Bug 修复**：
- 修复 ClaudeCode Worker 输出解析中的异常处理
- 优化日志获取，支持 limit=-1 获取全部日志

### 版本 1.1.2

**新增功能**：
- 新增配置管理器（ConfigManager）
- 新增获取文件夹列表接口

**改进优化**：
- 浏览器行为过滤优化
- 过滤浏览器发来的空 URL 日志

**Bug 修复**：
- 修复时间戳格式化中小时计算错误

### 版本 1.1.1

**新增功能**：
- 新增提醒管理功能及完整的 HTTP API

**改进优化**：
- ReminderManager 重命名为 ExtensionManager
- CLI 客户端功能完善
- 代码规范化处理

### 版本 1.1.0

**新增功能**：
- 实现 CCCore 守护进程核心功能
- 异步化服务启动
- 提取工具函数

## 许可证

[MIT](./LICENSE)

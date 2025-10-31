/**
 * CCCore 默认配置
 */

const path = require('path');
const os = require('os');

module.exports = {
  // 服务配置
  server: {
    // HTTP/HTTPS 服务端口
    httpPort: process.env.CCCORE_HTTP_PORT || 3579,
    httpsPort: process.env.CCCORE_HTTPS_PORT || 3580,

    // WebSocket 服务端口
    wsPort: process.env.CCCORE_WS_PORT || 3578,

    // Socket IPC 文件路径
    socketPath: process.env.CCCORE_SOCKET_PATH || path.join(os.tmpdir(), 'cccore.sock'),

    // 主机地址
    host: process.env.CCCORE_HOST || 'localhost',
  },

  // 日志配置
  logger: {
    // 日志文件目录
    logDir: process.env.ACTION_LOGGER_PATH || path.join(os.homedir(), 'action-logger'),

    // 日志缓冲大小（条数）
    bufferSize: parseInt(process.env.CCCORE_LOG_BUFFER_SIZE || '10'),

    // 日志刷盘间隔（毫秒）
    flushInterval: parseInt(process.env.CCCORE_LOG_FLUSH_INTERVAL || '5000'),
  },

  // 浏览器配置
  browser: {
    // Chrome 进程名称（用于process检查）
    processNames: ['chrome', 'google-chrome', 'chromium', 'Google Chrome'],

    // Chrome 环境变量路径（优先级：环境变量 > 默认值）
    chromeProcessEnv: process.env.CHROME_PROCESS || null,
  },

  // WebSocket 配置
  websocket: {
    // 心跳间隔（毫秒）
    heartbeatInterval: parseInt(process.env.CCCORE_WS_HEARTBEAT || '30000'),

    // 客户端超时时间（毫秒）
    clientTimeout: parseInt(process.env.CCCORE_WS_TIMEOUT || '60000'),
  },

  // 开发模式
  isDev: process.env.NODE_ENV === 'development',

  // 日志级别
  logLevel: process.env.CCCORE_LOG_LEVEL || 'info', // 'error', 'warn', 'info', 'debug'
};

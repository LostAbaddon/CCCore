/**
 * Socket IPC 处理器
 * 负责处理来自命令行客户端的 Socket 连接
 */

const net = require('net');
const fs = require('fs');

class SocketHandler {
  constructor(config, managers) {
    this.socketPath = config.server.socketPath;
    this.managers = managers;
    this.server = null;
  }

  /**
   * 启动 Socket IPC 服务器
   */
  start() {
    // 移除旧的 socket 文件
    try {
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
      }
    } catch (error) {
      console.warn('[SocketHandler] 移除旧 socket 文件失败:', error.message);
    }

    this.server = net.createServer((socket) => {
      this.handleNewConnection(socket);
    });

    this.server.listen(this.socketPath, () => {
      console.log(`[SocketHandler] Socket IPC 服务器启动在 ${this.socketPath}`);
      // 设置文件权限
      try {
        fs.chmodSync(this.socketPath, 0o666);
      } catch (error) {
        console.warn('[SocketHandler] 设置 socket 权限失败:', error.message);
      }
    });

    this.server.on('error', (error) => {
      console.error('[SocketHandler] 服务器错误:', error.message);
    });
  }

  /**
   * 处理新连接
   */
  handleNewConnection(socket) {
    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();

      // 检查是否收到完整的命令（以换行符结尾）
      if (!buffer.includes('\n')) {
        return;
      }

      const lines = buffer.split('\n');
      buffer = lines[lines.length - 1]; // 保留未完成的行

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const command = JSON.parse(line);
            const response = await this.handleCommand(command);
            socket.write(JSON.stringify(response) + '\n');
          } catch (error) {
            socket.write(
              JSON.stringify({
                success: false,
                error: error.message,
              }) + '\n'
            );
          }
        }
      }
    });

    socket.on('end', () => {
      // 连接关闭
    });

    socket.on('error', (error) => {
      console.error('[SocketHandler] 客户端错误:', error.message);
    });
  }

  /**
   * 处理命令
   */
  async handleCommand(command) {
    const { action, data } = command;

    switch (action) {
      case 'ADD_LOG':
        return this.commandAddLog(data);

      case 'GET_LOGS':
        return await this.commandGetLogs(data);

      case 'CREATE_REMINDER':
        return await this.commandCreateReminder(data);

      case 'OPEN_PAGE':
        return await this.commandOpenPage(data);

      case 'PING':
        return { success: true, message: 'PONG' };

      default:
        return { success: false, error: `未知的命令: ${action}` };
    }
  }

  /**
   * 添加日志命令
   */
  commandAddLog(data) {
    if (!data) {
      return { success: false, error: '缺少数据' };
    }

    const result = this.managers.loggerManager.addLog(data);
    return {
      success: result,
      message: result ? '日志已添加' : '日志添加失败',
    };
  }

  /**
   * 获取日志命令
   */
  async commandGetLogs(data) {
    const limit = (data && data.limit) || 5;
    const logs = await this.managers.loggerManager.getLogs(limit);

    return {
      success: true,
      logs,
      count: logs.length,
    };
  }

  /**
   * 创建提醒命令
   */
  async commandCreateReminder(data) {
    if (!data) {
      return { success: false, error: '缺少数据' };
    }

    const result = await this.managers.reminderManager.createReminder(data);
    return result;
  }

  /**
   * 打开网页命令
   */
  async commandOpenPage(data) {
    if (!data) {
      return { success: false, error: '缺少数据' };
    }

    const result = await this.managers.reminderManager.openWebPage(data);
    return result;
  }

  /**
   * 关闭服务器
   */
  close() {
    if (this.server) {
      this.server.close();
      console.log('[SocketHandler] Socket IPC 服务器已关闭');
    }
  }
}

module.exports = SocketHandler;

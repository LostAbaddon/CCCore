/**
 * 日志管理器
 * 负责日志缓冲、定时刷盘、文件管理
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class LoggerManager {
  constructor(config) {
    this.logDir = config.logger.logDir;
    this.bufferSize = config.logger.bufferSize;
    this.flushInterval = config.logger.flushInterval;

    // 日志缓冲区
    this.buffer = [];

    // 定时刷盘任务
    this.flushTimer = null;

    // 初始化
    this.init();
  }

  /**
   * 初始化
   */
  async init() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      // 启动定时刷盘
      this.startFlushTimer();
    } catch (error) {
      console.error('[LoggerManager] 初始化失败:', error.message);
    }
  }

  /**
   * 获取今天的日期字符串 YYYY-MM-DD
   */
  getDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 获取当前时间戳（毫秒）
   */
  getCurrentTimestamp() {
    return Date.now();
  }

  /**
   * 添加日志记录到缓冲区
   * @param {Object} logEntry 日志对象
   * @param {string} logEntry.source 日志来源（如 'Claude Code', 'Web Page'）
   * @param {string} logEntry.cwd 当前工作目录
   * @param {string} logEntry.sessionId Session ID
   * @param {string} logEntry.content 日志内容
   */
  addLog(logEntry) {
    // 验证必要字段
    if (!logEntry.source || !logEntry.content) {
      console.error('[LoggerManager] 日志记录缺少必要字段', logEntry);
      return false;
    }

    // 补充时间戳和工作目录
    const entry = {
      source: logEntry.source,
      cwd: logEntry.cwd || process.cwd(),
      sessionId: logEntry.sessionId || 'unknown',
      timestamp: logEntry.timestamp || this.getCurrentTimestamp(),
      content: logEntry.content,
    };

    this.buffer.push(entry);

    // 如果缓冲区已满，立即刷盘
    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }

    return true;
  }

  /**
   * 获取日志记录（支持分页）
   * @param {number} limit 返回的记录数
   * @returns {Array} 日志记录数组（倒序）
   */
  async getLogs(limit = 5) {
    try {
      const logFile = path.join(this.logDir, this.getDateString() + '.log');

      let content = '';
      try {
        content = await fs.readFile(logFile, 'utf-8');
      } catch {
        return [];
      }

      // 解析日志内容
      const records = this.parseLogFile(content);

      // 返回最后的 limit 条记录
      return records.slice(-limit).reverse();
    } catch (error) {
      console.error('[LoggerManager] 获取日志失败:', error.message);
      return [];
    }
  }

  /**
   * 解析日志文件内容
   * @param {string} content 文件内容
   * @returns {Array} 解析后的记录数组
   */
  parseLogFile(content) {
    if (!content) return [];

    // 按 ============== 分割记录
    const records = [];
    const parts = content.split(/^={60,}$/m);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      try {
        const record = this.parseLogRecord(trimmed);
        if (record) {
          records.push(record);
        }
      } catch (error) {
        // 解析失败的记录跳过
      }
    }

    return records;
  }

  /**
   * 解析单条日志记录
   */
  parseLogRecord(text) {
    const lines = text.split('\n');
    const record = {};

    // 解析头部信息
    for (const line of lines) {
      const match = line.match(/^\|\s*([^:]+):\s*(.+)$/);
      if (match) {
        const key = match[1].trim().toLowerCase();
        const value = match[2].trim();
        if (key === 'source') record.source = value;
        else if (key === 'timestamp') record.timestamp = value;
        else if (key === 'workspace') record.cwd = value;
        else if (key === 'sessionid') record.sessionId = value;
      }
    }

    // 内容部分：去掉头部信息和分隔符
    let contentStart = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^={60,}$/)) {
        contentStart = i + 1;
        break;
      }
    }

    if (contentStart > 0) {
      const contentLines = lines.slice(contentStart);
      record.content = contentLines.join('\n').trim();
    }

    return record;
  }

  /**
   * 刷盘：将缓冲区的日志写入文件
   */
  async flush() {
    if (this.buffer.length === 0) {
      return;
    }

    try {
      const logFile = path.join(this.logDir, this.getDateString() + '.log');

      // 读取现有内容
      let history = '';
      try {
        history = await fs.readFile(logFile, 'utf-8');
        history = (history || '').trim();
      } catch {
        history = '';
      }

      // 格式化新记录
      const newRecords = this.buffer.map(entry => this.formatLogEntry(entry)).join('\n\n');

      // 合并并写入
      let content = history;
      if (history) {
        content = history + '\n\n' + newRecords;
      } else {
        content = newRecords;
      }

      await fs.writeFile(logFile, content, 'utf-8');

      // 清空缓冲区
      this.buffer = [];
    } catch (error) {
      console.error('[LoggerManager] 刷盘失败:', error.message);
    }
  }

  /**
   * 格式化日志条目
   */
  formatLogEntry(entry) {
    const dateStr = new Date(entry.timestamp).toLocaleString();
    return `============================================================
| SOURCE   : ${entry.source}
| TIMESTAMP: ${dateStr}
| WORKSPACE: ${entry.cwd}
| SessionID: ${entry.sessionId}
============================================================

${entry.content}`;
  }

  /**
   * 启动定时刷盘
   */
  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * 停止定时刷盘
   */
  stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * 关闭管理器
   */
  async close() {
    this.stopFlushTimer();
    await this.flush();
  }
}

module.exports = LoggerManager;

/**
 * 日志管理器
 * 负责日志缓冲、定时刷盘、文件管理
 */

const fs = require('fs').promises;
const path = require('path');
const { getCurrentTimstampString, formatLogEntry } = require("./utils");

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
		}
		catch (error) {
			console.error('[LoggerManager] 初始化失败:', error.message);
		}
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
			return {
				ok: false,
				error: "日志记录缺少必要字段",
			};
		}
		console.log('[LoggerManager] 新日志:', logEntry);

		// 补充时间戳和工作目录
		const entry = {
			source: logEntry.source,
			timestamp: logEntry.timestamp,
			content: logEntry.content,
		};
		if (logEntry.source === 'Claude Code') {
			entry.sessionId = logEntry.sessionId || '(UNKNOWN)';
			entry.workspace = logEntry.workspace || '(UNKNOWN)';
		}
		else if (logEntry.source === 'Chrome') {
			entry.tabId = logEntry.tabId || '(UNKNOWN)';
		}
		else if (logEntry.source === 'CLI') {
			entry.pid = logEntry.pid || '(UNKNOWN)';
		}

		this.buffer.push(entry);
		this.startFlushTimer();

		// 如果缓冲区已满，立即刷盘
		if (this.buffer.length >= this.bufferSize) this.flush();

		return true;
	}
	/**
	 * 获取日志记录（支持分页）
	 * @param {number} limit 返回的记录数
	 * @returns {Array} 日志记录数组（倒序）
	 */
	async getLogs(limit = 5) {
		try {
			const logFile = path.join(this.logDir, getCurrentTimstampString() + '.log');

			let content = '';
			try {
				content = await fs.readFile(logFile, 'utf-8');
			}
			catch {
				return [];
			}

			// 解析日志内容
			const records = this.parseLogFile(content);

			// 返回最后的 limit 条记录
			return limit >= 0 ? records.slice(-limit).reverse() : records.reverse();
		}
		catch (error) {
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
		const parts = ('\n' + content).split(/\n={20,}/);

		// 第一个元素必然是空白
		for (let idx = 1; idx < parts.length; idx += 2) {
			// 按照格式，第一块应该是元数据
			const head = (parts[idx] || '').trim().split(/\|/).map(l => l.trim()).filter(i => i);
			// 按照格式，第二块应该是 content
			const content = (parts[idx + 1] || '').trim();
			if (!content) continue;

			const log = { content };
			head.forEach(line => {
				line = line.split(':');
				const name = line.shift().trim().toLowerCase();
				if (!name) return;
				line = line.join(':').trim();
				if (!line) return;
				log[name] = line;
			});
			records.push(log);
		}

		return records;
	}

	/**
	 * 刷盘：将缓冲区的日志写入文件
	 */
	async flush() {
		this.stopFlushTimer();

		const logCount = this.buffer.length;
		if (logCount === 0) return;

		try {
			const logFile = path.join(this.logDir, getCurrentTimstampString() + '.log');
			console.log('[LoggerManager] 开始写入日志文件:', logFile);

			// 读取现有内容
			let history = '';
			try {
				history = await fs.readFile(logFile, 'utf-8');
				history = (history || '').trim();
			}
			catch {
				history = '';
			}

			// 格式化新记录
			const newRecords = this.buffer.map(entry => formatLogEntry(entry)).join('\n\n');
			this.buffer.splice(0);

			// 合并并写入
			if (history) {
				history = history + '\n\n' + newRecords;
			}
			else {
				history = newRecords;
			}
			await fs.writeFile(logFile, history, 'utf-8');
			console.error('[LoggerManager] 新增 ' + logCount + ' 条新日志');
		}
		catch (error) {
			console.error('[LoggerManager] 写入日志失败:', error.message);
		}
	}
	/**
	 * 启动定时刷盘
	 */
	startFlushTimer() {
		this.flushTimer = setTimeout(() => {
			console.log('[LoggerManager] 开始定时写入日志');
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
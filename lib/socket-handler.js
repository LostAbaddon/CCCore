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
		return new Promise(res => {
			// 移除旧的 socket 文件
			try {
				if (fs.existsSync(this.socketPath)) {
					fs.unlinkSync(this.socketPath);
				}
			}
			catch (error) {
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
				}
				catch (error) {
					console.warn('[SocketHandler] 设置 socket 权限失败:', error.message);
				}
				res();
			});
			this.server.on('error', (error) => {
				console.error('[SocketHandler] 服务器错误:', error.message);
			});
		});
	}
	/**
	 * 处理新连接
	 */
	handleNewConnection(socket) {
		console.log('[SocketHandler] 新客户端连接成功');
		let buffer = '';

		socket.on('data', async (data) => {
			buffer += data.toString();

			// 检查是否收到完整的命令（以换行符结尾）
			if (!buffer.match(/\n\s*$/)) {
				return;
			}

			const lines = buffer.split('\n');
			buffer = lines[lines.length - 1]; // 保留未完成的行

			for (let i = 0; i < lines.length - 1; i++) {
				const line = lines[i].trim();
				if (line) {
					let reply;
					try {
						const command = JSON.parse(line);
						console.log('[SocketHandler] 客户端请求：', command);
						const response = await this.handleCommand(command);
						reply = JSON.stringify(response);
					}
					catch (error) {
						reply = JSON.stringify({
							ok: false,
							error: error.message,
						});
					}
					console.log('[SocketHandler] 返回信息：', reply);
					socket.write(reply + '\n');
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
		console.log('::::::::::::::::>>>>', action, data);

		switch (action) {
			case 'ADD_LOG':
				return this.commandAddLog(data);
			case 'GET_LOGS':
				return await this.commandGetLogs(data);
			case 'CREATE_REMINDER':
				return await this.commandCreateReminder(data);
			case 'GET_REMINDERS':
				return this.commandGetReminders(data);
			case 'GET_REMINDER':
				return this.commandGetReminder(data);
			case 'CANCEL_REMINDER':
				return this.commandCancelReminder(data);
			case 'USER_INPUT':
				return this.commandUserInput(data);
			case 'OPEN_PAGE':
				return await this.commandOpenPage(data);
			case 'GET_CONFIG':
				return this.commandGetConfig(data);
			case 'SEND_REMINDER':
				return await this.commandSendReminder(data);
			case 'TOOL_EVENT':
				return await this.commandToolEvent(data);
			case 'PING':
				return { ok: true, message: 'PONG' };
			default:
				return { ok: false, error: `未知的命令: ${action}` };
		}
	}

	/**
	 * 添加日志命令
	 */
	commandAddLog(data) {
		if (!data) {
			return { ok: false, error: '缺少数据' };
		}

		try {
			const result = this.managers.loggerManager.addLog(data);
			return {
				ok: result,
				message: result ? '日志已添加' : '日志添加失败',
			};
		}
		catch (err) {
			return {
				ok: false,
				error: err.message
			}
		}
	}
	/**
	 * 获取日志命令
	 */
	async commandGetLogs(data) {
		const limit = (data && data.limit) || 5;
		const logs = await this.managers.loggerManager.getLogs(limit);

		return {
			ok: true,
			message: {
				count: logs.length,
				logs,
			},
		};
	}

	/**
	 * 创建提醒命令
	 */
	async commandCreateReminder(data) {
		if (!data) {
			return { ok: false, error: '缺少数据' };
		}

		const result = await this.managers.extManager.createReminder(data);
		return result;
	}

	/**
	 * 获取所有活跃提醒命令
	 */
	commandGetReminders(data) {
		const result = this.managers.extManager.getActiveReminders();
		return result;
	}

	/**
	 * 获取单个提醒命令
	 */
	commandGetReminder(data) {
		if (!data || !data.id) {
			return { ok: false, error: '缺少提醒 ID' };
		}

		const result = this.managers.extManager.getReminderById(data.id);
		return result;
	}

	/**
	 * 取消提醒命令
	 */
	commandCancelReminder(data) {
		if (!data || !data.id) {
			return { ok: false, error: '缺少提醒 ID' };
		}

		const result = this.managers.extManager.cancelReminder(data.id);
		return result;
	}

	async commandUserInput(data) {
		if (!data) {
			return { ok: false, error: '缺少数据' };
		}

		const { sessionId, content } = data;

		// 转发给 CCExtension
		if (this.managers.wsManager.isExtensionConnected()) {
			await this.managers.wsManager.sendToExtension({
				action: 'USER_INPUT_EVENT',
				data: {
					sessionId,
					content,
				},
			});
		}
		return {
			ok: true
		};
	}

	/**
	 * 打开网页命令
	 */
	async commandOpenPage(data) {
		if (!data) {
			return { ok: false, error: '缺少数据' };
		}

		const result = await this.managers.extManager.openWebPage(data);
		return result;
	}

	/**
	 * 获取配置命令
	 */
	commandGetConfig(data) {
		if (!data || !data.key) {
			return { ok: false, error: '缺少配置键' };
		}

		try {
			if (data.key === 'stop-reminder') {
				const config = this.managers.configManager.getStopReminderConfig();
				return { ok: true, data: config };
			}
			else {
				return { ok: false, error: `未知的配置键: ${data.key}` };
			}
		}
		catch (error) {
			return { ok: false, error: error.message };
		}
	}

	/**
	 * 发送提醒命令（立即触发）
	 */
	async commandSendReminder(data) {
		if (!data) {
			return { ok: false, error: '缺少数据' };
		}

		const { title, message, triggerTime } = data;
		if (!title || !message) {
			return { ok: false, error: '缺少必要参数 title 或 message' };
		}

		try {
			const result = await this.managers.extManager.createReminder({
				title,
				message,
				triggerTime: triggerTime || Date.now(),
			});
			return result;
		}
		catch (error) {
			return { ok: false, error: error.message };
		}
	}

	/**
	 * 处理工具事件命令
	 */
	async commandToolEvent(data) {
		if (!data) {
			return { ok: false, error: '缺少数据' };
		}

		const { sessionId, toolName, eventType, timestamp } = data;
		if (!sessionId || !toolName || !eventType) {
			return { ok: false, error: '缺少必要参数' };
		}

		try {
			// 转发给 CCExtension
			if (this.managers.wsManager.isExtensionConnected()) {
				await this.managers.wsManager.sendToExtension({
					action: 'TOOL_EVENT',
					data: {
						sessionId,
						toolName,
						eventType,
						timestamp: timestamp || Date.now(),
					},
				});
			}

			return { ok: true, message: '事件已接收' };
		}
		catch (error) {
			return { ok: false, error: error.message };
		}
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

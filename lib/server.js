/**
 * HTTP 服务器
 * 负责处理 HTTP 请求（日志查询、提醒创建等）
 */

const http = require('http');
const url = require('url');
const path = require('path');
const { Worker } = require('worker_threads');

/**
 * 调用 Claude Code
 */
const runClaudeCode = ({ workDir, prompt, model, resumeSid }) => new Promise((res, rej) => {
	const worker = new Worker(path.resolve(__dirname, 'claudeCodeWorker.js'), {
		workerData: { workDir, prompt, model, resumeSid }
	});
	worker.on('message', msg => {
		if (msg.ok) {
			console.log('[WorkerServer]', msg.data);
			res(msg.data);
		}
		else {
			console.error('[WorkerServer]', msg.error);
			rej(msg.error);
		}
		worker.terminate();
	});
	worker.on('error', err => {
		console.error('[WorkerServer]', err);
		rej(err);
		if (worker) worker.terminate();
	});
});

class Server {
	constructor(config, managers) {
		this.port = config.server.httpPort;
		this.host = config.server.host;
		this.managers = managers; // { loggerManager, extManager, wsManager }
		this.server = null;
		this.sessions = {};
	}

	/**
	 * 启动 HTTP 服务器
	 */
	start() {
		return new Promise(res => {
			this.server = http.createServer((req, res) => {
				this.handleRequest(req, res);
			});
			this.server.listen(this.port, this.host, () => {
				console.log(`[Server] HTTP 服务器启动在 http://${this.host}:${this.port}`);
				res();
			});
			this.server.on('error', (error) => {
				console.error('[Server] 服务器错误:', error.message);
			});
		});
	}

	/**
	 * 处理 HTTP 请求
	 */
	async handleRequest(req, res) {
		const parsedUrl = url.parse(req.url, true);
		const pathname = parsedUrl.pathname;
		const query = parsedUrl.query;
		console.log('~~~~~~~~~~~~~~~~~~~~~~~~~>', pathname, req.method, query);

		// 设置 CORS 头
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
		res.setHeader('Content-Type', 'application/json');

		// OPTIONS 请求处理
		if (req.method === 'OPTIONS') {
			res.writeHead(200);
			res.end();
			return;
		}

		try {
			// 路由处理
			if (pathname === '/health' && req.method === 'GET') {
				res.writeHead(200);
				res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
				return;
			}

			if (pathname === '/api/logs' && req.method === 'GET') {
				await this.handleGetLogs(req, res, query);
				return;
			}

			if (pathname === '/api/log' && req.method === 'POST') {
				await this.handleAddLog(req, res);
				return;
			}

			if (pathname === '/api/reminder' && req.method === 'POST') {
				await this.handleCreateReminder(req, res);
				return;
			}

			if (pathname === '/api/reminders' && req.method === 'GET') {
				await this.handleGetReminders(req, res);
				return;
			}

			if (pathname === '/api/page' && req.method === 'POST') {
				await this.handleOpenPage(req, res);
				return;
			}

			if (pathname === '/api/config/stop-reminder' && req.method === 'GET') {
				await this.handleGetStopReminderConfig(req, res);
				return;
			}

			if (pathname === '/api/config/stop-reminder' && req.method === 'POST') {
				await this.handleSetStopReminderConfig(req, res);
				return;
			}

			if (pathname === '/api/tool-event' && req.method === 'POST') {
				await this.handleToolEvent(req, res);
				return;
			}

			if (pathname === '/api/user-input' && req.method === 'POST') {
				await this.handleUserInputEvent(req, res);
				return;
			}

			if (pathname === '/api/folders' && req.method === 'GET') {
				await this.handleGetFolders(req, res, query);
				return;
			}

			// 处理 /api/reminder/:id 的 GET 和 DELETE
			const reminderIdMatch = pathname.match(/^\/api\/reminder\/(.+)$/);
			if (reminderIdMatch) {
				const reminderId = decodeURIComponent(reminderIdMatch[1]);
				if (req.method === 'GET') {
					await this.handleGetReminderById(req, res, reminderId);
					return;
				}
				if (req.method === 'DELETE') {
					await this.handleCancelReminder(req, res, reminderId);
					return;
				}
			}

			// 处理 /claudius/:sessionId/submit|clear 的 POST
			const claudiusMatch = pathname.match(/^\/claudius\/([^/]+)\/(submit|clear)$/);
			if (claudiusMatch && claudiusMatch[1] && req.method === 'POST') {
				const tabId = decodeURIComponent(claudiusMatch[1]);
				if (claudiusMatch[2] === 'submit') {
					await this.handleClaudiusSubmit(req, res, tabId);
					return;
				}
				else if (claudiusMatch[2] === 'clear') {
					await this.handleClaudiusClear(req, res, tabId);
					return;
				}
			}

			// 404
			res.writeHead(404);
			res.end(JSON.stringify({ error: '未找到该路由' }));
		}
		catch (error) {
			res.writeHead(500);
			res.end(JSON.stringify({ error: error.message }));
		}
	}

	/**
	 * 获取日志列表
	 */
	async handleGetLogs(req, res, query) {
		const limit = parseInt(query.limit) || 5;
		const logs = await this.managers.loggerManager.getLogs(limit);

		res.writeHead(200);
		res.end(
			JSON.stringify({
				ok: true,
				logs,
				count: logs.length,
			})
		);
	}
	/**
	 * 添加日志
	 */
	async handleAddLog(req, res) {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
		});

		req.on('end', () => {
			try {
				const logEntry = JSON.parse(body);

				const result = this.managers.loggerManager.addLog(logEntry);

				res.writeHead(result ? 200 : 400);
				res.end(
					JSON.stringify({
						ok: result,
						message: result ? '日志已添加' : '日志添加失败',
					})
				);
			} catch (error) {
				res.writeHead(400);
				res.end(JSON.stringify({ ok: false, error: error.message }));
			}
		});
	}

	/**
	 * 创建提醒
	 */
	async handleCreateReminder(req, res) {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
		});

		req.on('end', async () => {
			try {
				const reminder = JSON.parse(body);
				const result = await this.managers.extManager.createReminder(reminder);
				res.writeHead(result.success ? 200 : 400);
				res.end(JSON.stringify(result));
			}
			catch (error) {
				res.writeHead(400);
				res.end(JSON.stringify({ ok: false, error: error.message }));
			}
		});
	}

	/**
	 * 获取所有活跃提醒列表
	 */
	async handleGetReminders(req, res) {
		try {
			const result = this.managers.extManager.getActiveReminders();
			res.writeHead(200);
			res.end(JSON.stringify(result));
		} catch (error) {
			res.writeHead(500);
			res.end(JSON.stringify({ ok: false, error: error.message }));
		}
	}

	/**
	 * 通过 ID 获取单个提醒
	 */
	async handleGetReminderById(req, res, reminderId) {
		try {
			const result = this.managers.extManager.getReminderById(reminderId);
			res.writeHead(result.ok ? 200 : 404);
			res.end(JSON.stringify(result));
		} catch (error) {
			res.writeHead(500);
			res.end(JSON.stringify({ ok: false, error: error.message }));
		}
	}

	/**
	 * 取消/删除提醒
	 */
	async handleCancelReminder(req, res, reminderId) {
		try {
			const result = this.managers.extManager.cancelReminder(reminderId);
			res.writeHead(result.ok ? 200 : 404);
			res.end(JSON.stringify(result));
		} catch (error) {
			res.writeHead(500);
			res.end(JSON.stringify({ ok: false, error: error.message }));
		}
	}

	/**
	 * 打开网页
	 */
	async handleOpenPage(req, res) {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
		});

		req.on('end', async () => {
			try {
				const options = JSON.parse(body);
				const result = await this.managers.extManager.openWebPage(options);

				res.writeHead(result.success ? 200 : 400);
				res.end(JSON.stringify(result));
			} catch (error) {
				res.writeHead(400);
				res.end(JSON.stringify({ ok: false, error: error.message }));
			}
		});
	}

	/**
	 * 获取 stop-reminder 配置
	 */
	async handleGetStopReminderConfig(req, res) {
		try {
			const config = this.managers.configManager.getStopReminderConfig();
			res.writeHead(200);
			res.end(JSON.stringify({ ok: true, data: config }));
		}
		catch (error) {
			res.writeHead(500);
			res.end(JSON.stringify({ ok: false, error: error.message }));
		}
	}

	/**
	 * 设置 stop-reminder 配置
	 */
	async handleSetStopReminderConfig(req, res) {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
		});

		req.on('end', async () => {
			try {
				const { enabled, delay } = JSON.parse(body);
				const config = await this.managers.configManager.setStopReminderConfig(enabled, delay);

				// 通知 CCExtension 配置已更新
				try {
					await this.managers.wsManager.sendToExtension({
						action: 'STOP_REMINDER_CONFIG_UPDATE',
						data: config,
					});
				}
				catch (e) {
					// Extension 可能未连接，忽略错误
				}

				res.writeHead(200);
				res.end(JSON.stringify({ ok: true, data: config }));
			}
			catch (error) {
				res.writeHead(400);
				res.end(JSON.stringify({ ok: false, error: error.message }));
			}
		});
	}

	/**
	 * 处理工具使用事件（从 HeadlessKnight 发来）
	 */
	async handleToolEvent(req, res) {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
		});
		req.on('end', async () => {
			try {
				const event = JSON.parse(body);
				const { sessionId, toolName, eventType, timestamp } = event;

				// 转发给 CCExtension
				if (this.managers.wsManager.isExtensionConnected()) {
					await this.managers.wsManager.sendToExtension({
						action: 'TOOL_EVENT',
						data: {
							sessionId,
							toolName,
							eventType, // 'start' 或 'end'
							timestamp: timestamp || Date.now(),
						},
					});
				}

				res.writeHead(200);
				res.end(JSON.stringify({ ok: true, message: '事件已接收' }));
			}
			catch (error) {
				res.writeHead(400);
				res.end(JSON.stringify({ ok: false, error: error.message }));
			}
		});
	}

	/**
	 * 处理用户输入事件，转发给 Claudius
	 */
	async handleUserInputEvent(req, res) {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
		});
		req.on('end', async () => {
			try {
				const event = JSON.parse(body);
				const { sessionId, content, eventType, timestamp } = event;

				// 转发给 CCExtension
				if (this.managers.wsManager.isExtensionConnected()) {
					await this.managers.wsManager.sendToExtension({
						action: 'USER_INPUT_EVENT',
						data: {
							sessionId,
							content,
							eventType,
							timestamp: timestamp || Date.now(),
						},
					});
				}

				res.writeHead(200);
				res.end(JSON.stringify({ ok: true, message: '事件已接收' }));
			}
			catch (error) {
				res.writeHead(400);
				res.end(JSON.stringify({ ok: false, error: error.message }));
			}
		});
	}

	/**
	 * 获取文件夹列表
	 */
	async handleGetFolders(req, res, query) {
		const fs = require('fs').promises;
		const path = require('path');
		const os = require('os');

		try {
			// 获取目标路径，如果没有提供则使用 homedir
			let targetPath = query.path || os.homedir();

			// 解析路径（处理相对路径）
			targetPath = path.resolve(targetPath);

			// 读取目录
			const entries = await fs.readdir(targetPath, { withFileTypes: true });

			// 检查是否需要包含文件
			const includeFiles = query.includeFiles === 'true';

			// 过滤出文件夹（排除隐藏文件夹）
			const folders = entries
				.filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
				.map(entry => ({
					name: entry.name,
					path: path.join(targetPath, entry.name),
				}))
				.sort((a, b) => a.name.localeCompare(b.name));

			// 如果需要，过滤出文件（排除隐藏文件）
			let files = [];
			if (includeFiles) {
				files = entries
					.filter(entry => entry.isFile() && !entry.name.startsWith('.'))
					.map(entry => ({
						name: entry.name,
						path: path.join(targetPath, entry.name),
					}))
					.sort((a, b) => a.name.localeCompare(b.name));
			}

			res.writeHead(200);
			res.end(JSON.stringify({
				ok: true,
				currentPath: targetPath,
				folders: folders,
				files: files,
				folderCount: folders.length,
				fileCount: files.length,
			}));
		}
		catch (error) {
			res.writeHead(500);
			res.end(JSON.stringify({
				ok: false,
				error: error.message,
			}));
		}
	}

	/**
	 * 处理 Claudius 消息提交
	 */
	async handleClaudiusSubmit(req, res, tabId) {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
		});
		req.on('end', async () => {
			try {
				const { workDir, prompt, model } = JSON.parse(body);

				if (!workDir || !prompt) {
					res.writeHead(400);
					res.end(JSON.stringify({ ok: false, error: 'workDir 和 prompt 不能为空' }));
					return;
				}

				// 获取或初始化 session
				if (!this.sessions[tabId]) {
					this.sessions[tabId] = { id: null };
				}
				const session = this.sessions[tabId];

				try {
					// 调用 Claude Code
					const result = await runClaudeCode({
						workDir,
						prompt,
						model,
						resumeSid: session.id,
					});

					// 更新 session 的 id
					if (result.session_id && !session.id) {
						session.id = result.session_id;
					}

					res.writeHead(200);
					res.end(JSON.stringify({
						ok: true,
						tabId,
						sessionId: session.id,
						reply: result.reply,
						usage: result.usage,
					}));
				}
				catch (err) {
					res.writeHead(200);
					res.end(JSON.stringify({
						ok: false,
						tabId,
						sessionId: session.id,
						error: err.message || err.msg || err.data || err.toString(),
					}));
				}
			}
			catch (error) {
				console.error('[Server] Claudius 提交失败:', error);
				res.writeHead(500);
				res.end(JSON.stringify({ ok: false, error: error.message }));
			}
		});
	}

	/**
	 * 处理 Claudius 会话清除
	 */
	async handleClaudiusClear(req, res, tabId) {
		try {
			// 清除 session 数据
			if (this.sessions[tabId]) {
				delete this.sessions[tabId];
			}

			res.writeHead(200);
			res.end(JSON.stringify({
				ok: true,
				message: '会话已清除',
			}));
		}
		catch (error) {
			console.error('[Server] Claudius 清除失败:', error);
			res.writeHead(500);
			res.end(JSON.stringify({ ok: false, error: error.message }));
		}
	}

	/**
	 * 关闭服务器
	 */
	close() {
		if (this.server) {
			this.server.close();
			console.log('[Server] HTTP 服务器已关闭');
		}
	}
}

module.exports = Server;

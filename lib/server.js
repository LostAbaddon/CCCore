/**
 * HTTP 服务器
 * 负责处理 HTTP 请求（日志查询、提醒创建等）
 */

const http = require('http');
const url = require('url');

class Server {
	constructor(config, managers) {
		this.port = config.server.httpPort;
		this.host = config.server.host;
		this.managers = managers; // { loggerManager, extManager, wsManager }
		this.server = null;
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
		console.log('~~~~~~~~~~~~~>', req.url, parsedUrl);
		const pathname = parsedUrl.pathname;
		const query = parsedUrl.query;

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

			if (pathname === '/api/page' && req.method === 'POST') {
				await this.handleOpenPage(req, res);
				return;
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

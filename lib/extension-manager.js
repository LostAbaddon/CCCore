/**
 * 提醒管理器
 * 负责转发提醒到 CCExtension（通过 WebSocket）
 */

class ExtensionManager {
	constructor(config, wsManager, reminderManager) {
		this.wsManager = wsManager;
		this.reminderManager = reminderManager;
		this.extensionNotificationPreference = {}; // 存储各 Extension 的通知偏好
	}

	/**
	 * 创建提醒并转发给 Extension
	 * @param {Object} reminder
	 * @param {string} reminder.title 提醒标题
	 * @param {string} reminder.message 提醒消息
	 * @param {number} reminder.triggerTime 触发时间戳
	 * @returns {Object} 结果对象
	 */
	async createReminder(reminder) {
		// 首先保存到 ReminderManager
		const savedReminder = this.reminderManager.addReminder(reminder);

		// 检查是否有可用的 Extension 连接
		if (!this.wsManager.isExtensionConnected()) {
			return {
				ok: true,
				data: {
					status: 'saved',
					reminderId: savedReminder.id,
				},
				fallback: true,
			};
		}

		try {
			// 转发给 Extension
			const result = await this.wsManager.sendToExtension({
				action: 'CREATE_NOTIFICATION',
				data: savedReminder,
			});

			return result;
		}
		catch (error) {
			console.error(error);
			return {
				ok: false,
				data: {
					status: 'saved',
					reminderId: savedReminder.id,
				},
				fallback: true,
			};
		}
	}
	/**
	 * 获取所有活跃提醒列表
	 * @returns {Object} 包含提醒列表的结果对象
	 */
	getActiveReminders() {
		const reminders = this.reminderManager.getActiveReminders();
		return {
			ok: true,
			data: {
				reminders,
				count: reminders.length,
			},
		};
	}
	/**
	 * 通过 ID 获取单个提醒
	 * @param {string} id - 提醒 ID
	 * @returns {Object} 提醒对象或错误信息
	 */
	getReminderById(id) {
		const reminder = this.reminderManager.getReminderById(id);
		if (!reminder) {
			return {
				ok: false,
				error: `提醒 "${id}" 不存在`,
			};
		}

		const now = Date.now();
		return {
			ok: true,
			data: {
				...reminder,
				timeLeft: Math.max(0, reminder.triggerTime - now),
				isExpired: reminder.triggerTime <= now,
			},
		};
	}
	/**
	 * 取消/删除提醒
	 * @param {string} id - 提醒 ID
	 * @returns {Object} 操作结果
	 */
	async cancelReminder(id) {
		const success = this.reminderManager.cancelReminder(id);
		try {
			// 转发给 Extension
			const result = await this.wsManager.sendToExtension({
				action: 'CANCEL_NOTIFICATION',
				data: id,
			});
		}
		catch {}

		if (!success) {
			return {
				ok: false,
				error: `提醒 "${id}" 不存在`,
			};
		}

		return {
			ok: true,
			message: `提醒 "${id}" 已取消`,
		};
	}

	/**
	 * 打开网页
	 * @param {Object} options
	 * @param {string} options.url 网页 URL
	 * @param {boolean} options.activate 是否激活标签页（action为true时）
	 * @returns {Object} 结果对象
	 */
	async openWebPage(options) {
		// 检查是否有可用的 Extension 连接
		if (!this.wsManager.isExtensionConnected()) {
			return {
				ok: false,
				error: 'CCExtension 未连接',
				fallback: true,
			};
		}

		try {
			const result = await this.wsManager.sendToExtension({
				action: 'OPEN_PAGE',
				data: {
					url: options.url,
					activate: options.activate !== false,
				},
			});

			return {
				ok: true,
				data: result,
			};
		} catch (error) {
			return {
				ok: false,
				error: error.message,
				fallback: true,
			};
		}
	}
}

module.exports = ExtensionManager;

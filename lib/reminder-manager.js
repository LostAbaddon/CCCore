/**
 * 提醒管理器
 * 负责提醒的存储、生命周期管理和过期清理
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const platform = os.platform();

const DATA_DIR = path.join(os.homedir(), '.cccore-reminders');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
}

class ReminderManager {
	constructor(config, managers) {
		this.managers = managers;
		this.config = config;
		this.reminders = this.loadReminders();
		this.cleanupInterval = null;

		this.localReminders = {};

		// 启动定期清理过期提醒（每分钟检查一次）
		this.startCleanupTimer();
	}

	/**
	 * 从磁盘加载提醒列表
	 */
	loadReminders() {
		try {
			if (fs.existsSync(REMINDERS_FILE)) {
				const data = fs.readFileSync(REMINDERS_FILE, 'utf-8');
				return JSON.parse(data);
			}
		}
		catch (error) {
			console.error('[ReminderManager] 加载提醒文件失败:', error.message);
		}
		return [];
	}
	/**
	 * 将提醒列表保存到磁盘
	 */
	saveReminders() {
		try {
			fs.writeFileSync(REMINDERS_FILE, JSON.stringify(this.reminders, null, 2), 'utf-8');
		}
		catch (error) {
			console.error('[ReminderManager] 保存提醒文件失败:', error.message);
		}
	}

	/**
	 * 启动定期清理定时器
	 */
	startCleanupTimer() {
		// 防止重复启动
		if (this.cleanupInterval) {
			return;
		}

		this.cleanupInterval = setInterval(() => {
			this.cleanupExpiredReminders();
		}, 60000); // 每分钟检查一次

		console.log('[ReminderManager] 已启动定期清理定时器（每分钟检查一次）');
	}
	/**
	 * 停止清理定时器
	 */
	stopCleanupTimer() {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
			console.log('[ReminderManager] 已停止定期清理定时器');
		}
	}
	/**
	 * 清理过期提醒
	 */
	cleanupExpiredReminders() {
		const now = Date.now();
		const before = this.reminders.length;
		this.reminders = this.reminders.filter(r => r.triggerTime > now);

		if (before !== this.reminders.length) {
			const removed = before - this.reminders.length;
			console.log(`[ReminderManager] 清理了 ${removed} 个过期提醒`);
			this.saveReminders();
			// 通知 Extension 提醒列表已更新
			this.notifyExtensionOfUpdate();
		}
	}

	/**
	 * 添加提醒
	 * @param {Object} reminderData
	 * @param {string} reminderData.title - 提醒标题
	 * @param {string} reminderData.message - 提醒消息
	 * @param {number} reminderData.triggerTime - 触发时间戳
	 * @returns {Object} 创建的提醒对象
	 */
	addReminder(reminderData, needNotify=true) {
		const now = Date.now();
		const reminder = {
			id: `reminder_${now}_${Math.random().toString(36).substr(2, 9)}`,
			created: now,
			...reminderData
		};

		this.reminders = this.reminders.filter(r => r.triggerTime > now);
		this.reminders.push(reminder);
		this.saveReminders();

		console.log(`[ReminderManager] 已添加提醒: ${reminder.id}`);
		// 通知 Extension 提醒列表已更新
		if (needNotify) this.notifyExtensionOfUpdate();

		return reminder;
	}
	/**
	 * 取消/删除提醒
	 * @param {string} id - 提醒 ID
	 * @returns {boolean} 是否成功删除
	 */
	cancelReminder(id) {
		if (this.localReminders[id]) {
			clearTimeout(this.localReminders[id]);
			delete this.localReminders[id];
		}

		const before = this.reminders.length;
		this.reminders = this.reminders.filter(r => r.id !== id);

		if (before !== this.reminders.length) {
			console.log(`[ReminderManager] 已取消提醒: ${id}`);
			this.saveReminders();
			// 通知 Extension 提醒列表已更新
			this.notifyExtensionOfUpdate();
			return true;
		}

		return false;
	}

	/**
	 * 获取所有提醒
	 * @returns {Array} 提醒列表
	 */
	getAllReminders() {
		const now = Date.now();
		this.reminders = this.reminders.filter(r => r.triggerTime > now);
		return this.reminders;
	}
	/**
	 * 获取活跃提醒列表（未过期的）
	 * @returns {Array} 活跃提醒列表，包含剩余时间信息
	 */
	getActiveReminders() {
		const now = Date.now();
		this.reminders = this.reminders.filter(r => r.triggerTime > now);
		return this.reminders.map(r => ({
			...r,
			timeLeft: r.triggerTime - now,
		}));
	}
	/**
	 * 通过 ID 获取提醒
	 * @param {string} id - 提醒 ID
	 * @returns {Object|null} 提醒对象或 null
	 */
	getReminderById(id) {
		return this.reminders.find(r => r.id === id) || null;
	}

	/**
	 * 通知 Extension 提醒列表已更新
	 * @private
	 */
	notifyExtensionOfUpdate() {
		if (this.managers.wsManager && this.managers.wsManager.isExtensionConnected()) {
			const activeReminders = this.getActiveReminders();
			try {
				this.managers.wsManager.sendToExtension({
					action: 'REMINDER_LIST_UPDATE',
					data: {
						reminders: activeReminders,
						count: activeReminders.length,
					},
				}).catch(error => {
					console.error('[ReminderManager] 通知 Extension 失败:', error.message);
				});
			}
			catch (error) {
				console.error('[ReminderManager] 发送更新通知时出错:', error.message);
			}
		}
	}

	async createReminder(data) {
		try {
			const statusCheck = await this.managers.extManager.checkSessionFocusStatus(data.sessionId);
			console.log("[RemidnerManager] Get Reminder Info", statusCheck);
			// 如果正常返回
			if (!!statusCheck && statusCheck.ok) {
				// 如果前端可以发送通知
				if (statusCheck.available) {
					await this.managers.extManager.createReminder(data);
					console.log("[RemidnerManager] Create Remote Reminder Done");
				}
				// 如果需要后端发送通知
				else if (statusCheck.needed) {
					this.createReminderLocally(data);
					console.log("[RemidnerManager] Create Local Reminder Done");
				}
				// 如果前后端都不需要发送通知
				else {
					console.log("[RemidnerManager] No Need Reminder");
				}
			}
			// 如果返回异常，则强制使用本地通知
			else {
				this.createReminderLocally(data);
				console.log("[RemidnerManager] Create Local Reminder Done");
			}
		}
		catch (error) {
			console.error('[RemidnerManager] Create Reminder Failed', error);
		}
	}
	createReminderLocally (reminder) {
		const {title, message} = reminder || {};

		// macOS
		if (platform === 'darwin') {
			const escapedTitle = title.replace(/"/g, '\\"');
			const escapedMessage = message.replace(/"/g, '\\"');
			const script = `display dialog "${escapedMessage}" with title "${escapedTitle}" with icon caution buttons {"好的"} default button "好的"`;
			const cmd = `osascript -e '${script}'`;
			exec(cmd, { stdio: 'pipe' });
		}
		// Windows
		else if (platform === 'win32') {
			const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$template = @"
<toast>
<visual>
	<binding template="ToastText02">
		<text id="1">${title.replace(/"/g, '""')}</text>
		<text id="2">${message.replace(/"/g, '""')}</text>
	</binding>
</visual>
</toast>
"@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("HeadlessKnight")
$notifier.Show($toast)
			`.trim();

			exec(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, { windowsHide: true });
		}
		// Linux
		else if (platform === 'linux') {
			exec(`notify-send "${title.replace(/"/g, '\\"')}" "${message.replace(/"/g, '\\"')}" --urgency=normal`);
		}

		delete this.localReminders[reminder.id];
		this.cleanupExpiredReminders();
		this.notifyExtensionOfUpdate();
	}

	/**
	 * 销毁管理器，清理资源
	 */
	destroy() {
		this.stopCleanupTimer();
	}
}

module.exports = ReminderManager;

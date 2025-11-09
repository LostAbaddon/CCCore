/**
 * 配置管理器
 * 负责管理和持久化应用配置
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class ConfigManager {
	constructor(config) {
		this.configDir = path.join(os.homedir(), '.cccore');
		this.configFile = path.join(this.configDir, 'config.json');
		this.config = {
			stopReminder: {
				enabled: true,
				delay: 30000, // 默认 30 秒
			},
		};
	}

	/**
	 * 初始化配置管理器
	 */
	async init() {
		try {
			// 确保配置目录存在
			if (!fs.existsSync(this.configDir)) {
				fs.mkdirSync(this.configDir, { recursive: true });
			}

			// 加载配置文件
			if (fs.existsSync(this.configFile)) {
				const data = await fs.promises.readFile(this.configFile, 'utf-8');
				const loaded = JSON.parse(data);
				this.config = { ...this.config, ...loaded };
				console.log('[ConfigManager] 配置已加载:', this.configFile);
			}
			else {
				// 创建默认配置文件
				await this.saveConfig();
				console.log('[ConfigManager] 已创建默认配置文件:', this.configFile);
			}
		}
		catch (error) {
			console.error('[ConfigManager] 初始化失败:', error.message);
		}
	}

	/**
	 * 保存配置到文件
	 */
	async saveConfig() {
		try {
			await fs.promises.writeFile(
				this.configFile,
				JSON.stringify(this.config, null, '\t'),
				'utf-8'
			);
			console.log('[ConfigManager] 配置已保存');
		}
		catch (error) {
			console.error('[ConfigManager] 保存配置失败:', error.message);
			throw error;
		}
	}

	/**
	 * 获取 stop-reminder 配置
	 */
	getStopReminderConfig() {
		return {
			enabled: this.config.stopReminder.enabled,
			delay: this.config.stopReminder.delay,
		};
	}

	/**
	 * 设置 stop-reminder 配置
	 */
	async setStopReminderConfig(enabled, delay) {
		if (typeof enabled === 'boolean') {
			this.config.stopReminder.enabled = enabled;
		}
		if (typeof delay === 'number' && delay >= 0) {
			this.config.stopReminder.delay = delay;
		}
		await this.saveConfig();
		return this.getStopReminderConfig();
	}
}

module.exports = ConfigManager;

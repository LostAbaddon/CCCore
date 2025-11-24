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
			workspaces: {
				searchWorkspace: path.join(os.homedir(), 'Searching'),
				writingWorkspace: path.join(os.homedir(), 'Writing'),
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

	/**
	 * 获取工作区配置
	 */
	getWorkspacesConfig() {
		return {
			searchWorkspace: this.config.workspaces.searchWorkspace,
			writingWorkspace: this.config.workspaces.writingWorkspace,
		};
	}

	/**
	 * 设置工作区配置
	 * @param {string} searchWorkspace - 搜索工作区路径
	 * @param {string} writingWorkspace - 写作工作区路径
	 */
	async setWorkspacesConfig(searchWorkspace, writingWorkspace) {
		// 处理路径中的 ~
		const expandPath = (p) => {
			if (p && p.startsWith('~')) {
				return path.join(os.homedir(), p.slice(1));
			}
			return p;
		};

		if (searchWorkspace) {
			this.config.workspaces.searchWorkspace = expandPath(searchWorkspace);
		}
		if (writingWorkspace) {
			this.config.workspaces.writingWorkspace = expandPath(writingWorkspace);
		}

		// 确保工作区目录存在
		await this.ensureWorkspaceExists(this.config.workspaces.searchWorkspace);
		await this.ensureWorkspaceExists(this.config.workspaces.writingWorkspace);

		await this.saveConfig();
		return this.getWorkspacesConfig();
	}

	/**
	 * 确保工作区目录存在，并创建必要的配置文件
	 * @param {string} workspacePath - 工作区路径
	 */
	async ensureWorkspaceExists(workspacePath) {
		try {
			// 创建工作区目录
			if (!fs.existsSync(workspacePath)) {
				fs.mkdirSync(workspacePath, { recursive: true });
				console.log(`[ConfigManager] 已创建工作区目录: ${workspacePath}`);
			}

			// 创建 .claude 目录
			const claudeDir = path.join(workspacePath, '.claude');
			if (!fs.existsSync(claudeDir)) {
				fs.mkdirSync(claudeDir, { recursive: true });
				console.log(`[ConfigManager] 已创建 .claude 目录: ${claudeDir}`);
			}

			// 创建 CLAUDE.md 文件（如果不存在）
			const claudeMdPath = path.join(workspacePath, 'CLAUDE.md');
			if (!fs.existsSync(claudeMdPath)) {
				const defaultContent = `# 工作区说明\n\n这是一个由 CCExtension 自动创建的工作区。\n\n## 使用说明\n\n在这里添加你的项目说明和 Claude Code 的使用指引。\n`;
				await fs.promises.writeFile(claudeMdPath, defaultContent, 'utf-8');
				console.log(`[ConfigManager] 已创建 CLAUDE.md: ${claudeMdPath}`);
			}
		}
		catch (error) {
			console.error(`[ConfigManager] 创建工作区失败: ${workspacePath}`, error.message);
		}
	}
}

module.exports = ConfigManager;

/**
 * 提醒管理器
 * 负责转发提醒到 CCExtension（通过 WebSocket）
 */

class ReminderManager {
  constructor(config, wsManager) {
    this.wsManager = wsManager;
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
    // 检查是否有可用的 Extension 连接
    if (!this.wsManager.isExtensionConnected()) {
      return {
        success: false,
        error: 'CCExtension 未连接',
        fallback: true,
      };
    }

    try {
      // 转发给 Extension
      const result = await this.wsManager.sendToExtension({
        action: 'CREATE_NOTIFICATION',
        data: {
          title: reminder.title,
          message: reminder.message,
          triggerTime: reminder.triggerTime,
        },
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fallback: true,
      };
    }
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
        success: false,
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
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fallback: true,
      };
    }
  }
}

module.exports = ReminderManager;

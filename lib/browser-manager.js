/**
 * 浏览器管理器
 * 负责检查 Chrome 进程状态
 */

const { execSync } = require('child_process');

class BrowserManager {
  constructor(config) {
    this.processNames = config.browser.processNames;
    this.chromeProcessEnv = config.browser.chromeProcessEnv;
  }

  /**
   * 检查 Chrome 是否正在运行
   * @returns {boolean}
   */
  isChromeRunning() {
    // 如果设置了环境变量，优先使用
    if (this.chromeProcessEnv) {
      return this.checkProcessByName(this.chromeProcessEnv);
    }

    // 尝试检查多个 Chrome 进程名
    for (const processName of this.processNames) {
      if (this.checkProcessByName(processName)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 按进程名检查进程是否运行
   * @param {string} processName 进程名
   * @returns {boolean}
   */
  checkProcessByName(processName) {
    try {
      let command;
      const platform = process.platform;

      if (platform === 'darwin') {
        // macOS
        command = `pgrep -x "${processName}" | wc -l`;
      } else if (platform === 'linux') {
        // Linux
        command = `pgrep -x "${processName}" | wc -l`;
      } else if (platform === 'win32') {
        // Windows
        command = `tasklist | find "${processName}" | find /c /v ""`;
      } else {
        return false;
      }

      const result = execSync(command, { encoding: 'utf-8' }).trim();
      return parseInt(result) > 0;
    } catch (error) {
      // 命令执行失败时返回 false
      return false;
    }
  }
}

module.exports = BrowserManager;

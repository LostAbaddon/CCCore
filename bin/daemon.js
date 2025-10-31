#!/usr/bin/env node

/**
 * Claude Code Core 守护进程
 * 启动所有服务：HTTP、WebSocket、Socket IPC
 */

const config = require('../config/default');
const LoggerManager = require('../lib/logger-manager');
const BrowserManager = require('../lib/browser-manager');
const ReminderManager = require('../lib/reminder-manager');
const WSManager = require('../lib/ws-manager');
const Server = require('../lib/server');
const SocketHandler = require('../lib/socket-handler');

class CCCoreDaemon {
  constructor() {
    this.config = config;
    this.managers = {};
    this.servers = [];
  }

  /**
   * 初始化所有管理器
   */
  async initManagers() {
    console.log('[CCCoreDaemon] 初始化管理器...');

    // 初始化日志管理器
    this.managers.loggerManager = new LoggerManager(this.config);
    await new Promise((resolve) => setTimeout(resolve, 100)); // 等待初始化完成

    // 初始化浏览器管理器
    this.managers.browserManager = new BrowserManager(this.config);

    // 初始化 WebSocket 管理器
    this.managers.wsManager = new WSManager(this.config);

    // 初始化提醒管理器（依赖 WebSocket 管理器）
    this.managers.reminderManager = new ReminderManager(this.config, this.managers.wsManager);

    console.log('[CCCoreDaemon] 管理器初始化完成');
  }

  /**
   * 启动所有服务
   */
  startServices() {
    console.log('[CCCoreDaemon] 启动服务...');

    // 启动 WebSocket 服务
    this.managers.wsManager.start();
    this.managers.wsManager.startHeartbeat();
    this.servers.push(this.managers.wsManager);

    // 启动 HTTP 服务
    const httpServer = new Server(this.config, this.managers);
    httpServer.start();
    this.servers.push(httpServer);

    // 启动 Socket IPC 服务
    const socketHandler = new SocketHandler(this.config, this.managers);
    socketHandler.start();
    this.servers.push(socketHandler);

    console.log('[CCCoreDaemon] 所有服务已启动');
    this.printStartupInfo();
  }

  /**
   * 打印启动信息
   */
  printStartupInfo() {
    console.log('\n' + '='.repeat(50));
    console.log('  Claude Code Core 守护进程已启动');
    console.log('='.repeat(50));
    console.log(`HTTP 服务：      http://${this.config.server.host}:${this.config.server.httpPort}`);
    console.log(`WebSocket 服务：  ws://${this.config.server.host}:${this.config.server.wsPort}`);
    console.log(`Socket IPC：      ${this.config.server.socketPath}`);
    console.log(`日志目录：        ${this.config.logger.logDir}`);
    console.log(`日志缓冲大小：    ${this.config.logger.bufferSize} 条`);
    console.log(`日志刷盘间隔：    ${this.config.logger.flushInterval}ms`);
    console.log('='.repeat(50) + '\n');
  }

  /**
   * 处理优雅关闭
   */
  async shutdown() {
    console.log('\n[Claude Code Core] 正在关闭...');

    // 关闭所有服务
    for (const server of this.servers) {
      try {
        await server.close();
      } catch (error) {
        console.error('[CCCoreDaemon] 关闭服务失败:', error.message);
      }
    }

    // 关闭日志管理器
    if (this.managers.loggerManager) {
      await this.managers.loggerManager.close();
    }

    console.log('[Claude Code Core] 已关闭');
    process.exit(0);
  }

  /**
   * 启动守护进程
   */
  async start() {
    try {
      await this.initManagers();
      this.startServices();

      // 信号处理
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
    } catch (error) {
      console.error('[Claude Code Core] 启动失败:', error.message);
      process.exit(1);
    }
  }
}

// 启动守护进程
const daemon = new CCCoreDaemon();
daemon.start().catch((error) => {
  console.error('[Claude Code Core] 启动失败:', error);
  process.exit(1);
});

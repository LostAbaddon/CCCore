/**
 * WebSocket 管理器
 * 负责管理与 CCExtension 的 WebSocket 连接
 */

const WebSocket = require('ws');

class WSManager {
  constructor(config) {
    this.port = config.server.wsPort;
    this.host = config.server.host;
    this.heartbeatInterval = config.websocket.heartbeatInterval;
    this.clientTimeout = config.websocket.clientTimeout;

    // WebSocket 服务器
    this.server = null;

    // 连接的客户端
    this.clients = new Map();

    // Extension 连接
    this.extensionClient = null;

    // 消息队列（等待响应）
    this.pendingMessages = new Map();

    // 消息ID计数器
    this.messageIdCounter = 0;
  }

  /**
   * 启动 WebSocket 服务器
   */
  start() {
    this.server = new WebSocket.Server({ port: this.port, host: this.host });

    this.server.on('connection', (ws) => {
      this.handleNewConnection(ws);
    });

    this.server.on('error', (error) => {
      console.error('[WSManager] WebSocket 服务器错误:', error.message);
    });

    console.log(`[WSManager] WebSocket 服务器启动在 ws://${this.host}:${this.port}`);
  }

  /**
   * 处理新连接
   */
  handleNewConnection(ws) {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 保存客户端
    const clientData = {
      id: clientId,
      ws: ws,
      type: null, // 'extension' 或其他
      lastHeartbeat: Date.now(),
      isAlive: true,
    };
    this.clients.set(clientId, clientData);

    // 初始化消息处理
    ws.on('message', (data) => {
      this.handleMessage(clientId, data);
    });

    ws.on('close', () => {
      this.handleClientDisconnect(clientId);
    });

    ws.on('error', (error) => {
      console.error(`[WSManager] 客户端 ${clientId} 错误:`, error.message);
    });

    ws.on('pong', () => {
      clientData.isAlive = true;
      clientData.lastHeartbeat = Date.now();
    });

    console.log(`[WSManager] 新客户端连接: ${clientId}`);
  }

  /**
   * 处理客户端消息
   */
  handleMessage(clientId, data) {
    try {
      const message = JSON.parse(data);
      const clientData = this.clients.get(clientId);

      if (!clientData) return;

      // 心跳包
      if (message.type === 'PING') {
        clientData.ws.send(JSON.stringify({ type: 'PONG' }));
        clientData.isAlive = true;
        clientData.lastHeartbeat = Date.now();
        return;
      }

      // Extension 注册
      if (message.type === 'REGISTER' && message.clientType === 'extension') {
        clientData.type = 'extension';
        this.extensionClient = clientData;
        clientData.ws.send(
          JSON.stringify({
            type: 'REGISTER_ACK',
            clientId: clientId,
            message: 'Extension 已注册',
          })
        );
        console.log(`[WSManager] Extension 已连接: ${clientId}`);
        return;
      }

      // 响应消息
      if (message.type === 'RESPONSE' && message.messageId) {
        const pendingMessage = this.pendingMessages.get(message.messageId);
        if (pendingMessage) {
          pendingMessage.resolve(message.data);
          this.pendingMessages.delete(message.messageId);
        }
        return;
      }

      // Extension 发送的页面信息
      if (message.type === 'PAGE_INFO' && clientData.type === 'extension') {
        this.handlePageInfo(message.data);
        return;
      }

      console.log(`[WSManager] 收到消息 (${clientId}):`, message);
    } catch (error) {
      console.error(`[WSManager] 处理消息失败:`, error.message);
    }
  }

  /**
   * 处理页面信息（从 Extension 发来）
   */
  handlePageInfo(pageInfo) {
    // 这里可以将页面信息转发给日志管理器
    // 页面信息包括：url, title, timestamp
    console.log('[WSManager] 页面信息:', pageInfo);
  }

  /**
   * 处理客户端断开连接
   */
  handleClientDisconnect(clientId) {
    const clientData = this.clients.get(clientId);

    if (clientData) {
      if (clientData.type === 'extension') {
        this.extensionClient = null;
        console.log(`[WSManager] Extension 已断开连接: ${clientId}`);
      }

      this.clients.delete(clientId);
      console.log(`[WSManager] 客户端断开连接: ${clientId}`);
    }

    // 清理待处理的消息
    for (const [messageId, pending] of this.pendingMessages) {
      if (pending.clientId === clientId) {
        pending.reject(new Error('客户端已断开连接'));
        this.pendingMessages.delete(messageId);
      }
    }
  }

  /**
   * 向 Extension 发送消息
   * @param {Object} message 消息对象
   * @returns {Promise} 等待响应
   */
  sendToExtension(message) {
    return new Promise((resolve, reject) => {
      if (!this.extensionClient) {
        reject(new Error('Extension 未连接'));
        return;
      }

      const messageId = `msg_${++this.messageIdCounter}`;
      const messageToSend = {
        type: 'REQUEST',
        messageId: messageId,
        ...message,
      };

      // 保存待处理的消息
      this.pendingMessages.set(messageId, {
        clientId: this.extensionClient.id,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.pendingMessages.delete(messageId);
          reject(new Error('Extension 响应超时'));
        }, this.clientTimeout),
      });

      try {
        this.extensionClient.ws.send(JSON.stringify(messageToSend));
      } catch (error) {
        this.pendingMessages.delete(messageId);
        reject(error);
      }
    });
  }

  /**
   * 检查 Extension 是否已连接
   */
  isExtensionConnected() {
    return this.extensionClient !== null && this.extensionClient.ws.readyState === WebSocket.OPEN;
  }

  /**
   * 启动心跳
   */
  startHeartbeat() {
    setInterval(() => {
      for (const [clientId, clientData] of this.clients) {
        if (clientData.ws.readyState !== WebSocket.OPEN) {
          continue;
        }

        if (!clientData.isAlive) {
          console.log(`[WSManager] 客户端 ${clientId} 心跳超时，断开连接`);
          clientData.ws.terminate();
          this.handleClientDisconnect(clientId);
          continue;
        }

        clientData.isAlive = false;
        clientData.ws.ping();
      }
    }, this.heartbeatInterval);
  }

  /**
   * 关闭服务器
   */
  close() {
    if (this.server) {
      this.server.close();
      console.log('[WSManager] WebSocket 服务器已关闭');
    }
  }
}

module.exports = WSManager;

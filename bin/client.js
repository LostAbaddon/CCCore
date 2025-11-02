#!/usr/bin/env node

/**
 * Claude Code Core 命令行客户端
 * 用于与守护进程通过 Socket IPC 通讯
 */

const net = require('net');
const { cccoreSocket, formatLogEntry } = require("../lib/utils");

const socketPath = process.env.CCCORE_SOCKET_PATH || cccoreSocket();

/**
 * Parse named arguments in the format --name=value
 * Supports spaces in values until the next --xxx= pattern
 * @param {Array} args - Array of command line arguments
 * @returns {Object} - Parsed arguments as key-value pairs
 */
function parseNamedArgs(args) {
	const result = {};
	let currentKey = null;
	let currentValue = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const match = arg.match(/^--([^=]+)=([\w\W]*)$/);

		if (match) {
			// Save previous key-value pair if exists
			if (currentKey !== null) {
				result[currentKey] = currentValue.join(' ').trim();
			}

			// Start new key-value pair
			currentKey = match[1];
			currentValue = [match[2]];
		}
		else if (currentKey !== null) {
			// Continue accumulating value for current key
			currentValue.push(arg);
		}
	}

	// Save the last key-value pair
	if (currentKey !== null) {
		result[currentKey] = currentValue.join(' ').trim();
	}

	return result;
}
/**
 * 发送命令到守护进程
 */
function sendCommand(command) {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection(socketPath);

		socket.on('connect', () => {
			socket.write(JSON.stringify(command) + '\n');
		});

		socket.on('data', (data) => {
			try {
				const response = JSON.parse(data.toString());
				socket.destroy();
				resolve(response);
			} catch (error) {
				socket.destroy();
				reject(new Error('无效的响应格式'));
			}
		});

		socket.on('error', (error) => {
			reject(new Error(`连接失败: ${error.message}`));
		});

		setTimeout(() => {
			socket.destroy();
			reject(new Error('命令执行超时'));
		}, 5000);
	});
}

/**
 * 解析命令行参数
 */
async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.log('用法: cccore-client <command> [options]');
		console.log('\n命令:');
		console.log('  ping                 - 检查守护进程是否运行');
		console.log('  add-log              - 添加日志（从标准输入读取 JSON）');
		console.log('  get-logs [limit]     - 获取日志（默认 5 条）');
		console.log('  add-reminder         - 创建提醒（从标准输入读取 JSON）');
		console.log('  open-page            - 打开网页（从标准输入读取 JSON）');
		process.exit(1);
	}
	const command = args.shift();
	const param = [...args];

	try {
		let result;

		switch (command) {
			case 'ping': {
				result = await sendCommand({ action: 'PING' });
				break;
			}

			case 'add-log': {
				const msg = param.join(' ');
				result = await sendCommand({
					action: 'ADD_LOG',
					data: {
						source: "CLI",
						timestamp: Date.now(),
						pid: process.pid,
						content: msg,
					},
				});
				break;
			}

			case 'get-logs': {
				const limit = param[0] ? parseInt(param[0]) : 5;
				result = await sendCommand({
					action: 'GET_LOGS',
					data: { limit },
				});
				if (result?.message?.logs && result?.message?.logs?.length > 0) {
					const list = [];
					list.push(`获取到 ${result?.message?.count || 0} 条日志:`);
					list.push('');
					const records = result.message.logs.map(item => formatLogEntry(item)).join('\n\n');
					list.push(records);
					list.push('');
					result = list.join('\n');
				}
				else {
					result = '暂无日志记录';
				}
				break;
			}

			case 'add-reminder': {
				const reminderData = parseNamedArgs(args);
				let time = reminderData.time || reminderData.timestamp;
				const relativeMatch = time.match(/^in\s+(\d+)\s+(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)$/i);
				let triggerTime;
				if (relativeMatch) {
					const amount = parseInt(relativeMatch[1]);
					const unit = relativeMatch[2].toLowerCase();
					const now = Date.now();

					if (unit.startsWith('second')) triggerTime = now + amount * 1000;
					else if (unit.startsWith('minute')) triggerTime = now + amount * 60 * 1000;
					else if (unit.startsWith('hour')) triggerTime = now + amount * 60 * 60 * 1000;
					else if (unit.startsWith('day')) triggerTime = now + amount * 24 * 60 * 60 * 1000;
					else if (unit.startsWith('week')) triggerTime = now + amount * 7 * 24 * 60 * 60 * 1000;
					else if (unit.startsWith('month')) triggerTime = now + amount * 30 * 24 * 60 * 60 * 1000;
					else if (unit.startsWith('year')) triggerTime = now + amount * 365 * 24 * 60 * 60 * 1000;
				}
				else {
					triggerTime = new Date(time).getTime();
				}
				if (isNaN(triggerTime)) {
					throw new Error(`Error: Invalid time format "${time}". Use ISO datetime or relative time (e.g., "in 10 seconds", "in 30 minutes", "in 2 hours", "in 1 day", "in 2 weeks", "in 1 month", "in 1 year")`);
				}

				result = await sendCommand({
					action: 'CREATE_REMINDER',
					data: {
						title: reminderData.title,
						message: reminderData.message,
						triggerTime,
					},
				});
				console.log(result);
				break;
			}

			case 'open-page': {
				const pageData = await readStdin();
				const options = JSON.parse(pageData);
				result = await sendCommand({
					action: 'OPEN_PAGE',
					data: options,
				});
				console.log(result);
				break;
			}

			default: {
				console.error(`未知的命令: ${command}`);
				process.exit(1);
			}
		}

		if (result) {
			if (result.error) {
				console.error(`错误: ${result.error}`);
			}
			else if (result.message) {
				console.log('反馈:', result.message);
			}
		}
		process.exit(1);
	}
	catch (error) {
		console.error(`错误: ${error.message}`);
		process.exit(1);
	}
}

/**
 * 从标准输入读取数据
 */
function readStdin() {
	return new Promise((resolve, reject) => {
		let data = '';
		process.stdin.on('data', (chunk) => {
			data += chunk;
		});
		process.stdin.on('end', () => {
			resolve(data);
		});
		process.stdin.on('error', reject);
	});
}

main();

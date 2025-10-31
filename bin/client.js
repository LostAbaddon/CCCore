#!/usr/bin/env node

/**
 * Claude Code Core 命令行客户端
 * 用于与守护进程通过 Socket IPC 通讯
 */

const net = require('net');
const { cccoreSocket, formatLogEntry } = require("../lib/utils");

const socketPath = process.env.CCCORE_SOCKET_PATH || cccoreSocket();

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
		console.log('  create-reminder      - 创建提醒（从标准输入读取 JSON）');
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
					console.log(`获取到 ${result?.message?.count || 0} 条日志:`);
					console.log('');
					const records = result.message.logs.map(item => formatLogEntry(item)).join('\n\n');
					console.log(records);
					console.log('');
				}
				else {
					console.log('暂无日志记录');
				}
				process.exit(1);
				break;
			}

			case 'create-reminder': {
				const reminderData = await readStdin();
				const reminder = JSON.parse(reminderData);
				result = await sendCommand({
					action: 'CREATE_REMINDER',
					data: reminder,
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

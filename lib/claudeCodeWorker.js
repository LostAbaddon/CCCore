const fs = require('fs');
const os = require('os');
const path = require('path');
const { parentPort, workerData, threadId } = require('worker_threads');
const { workDir, prompt, model, resumeSid } = workerData;
const { spawnSync } = require('child_process');

const HomeDir = process.env.HOME || os.homedir();

const log = (level, ...msg) => {
	(console[level || 'log']	|| console.log)('[Worker:' + process.pid + ':' + threadId + ']', ...msg);
};

const replyTask = (data) => {
	parentPort.postMessage({
		ok: true,
		data
	});
};
const throwError = (error) => {
	parentPort.postMessage({
		ok: false,
		error
	});
};

const prepareEnvironment = (cliName, customEnv = {}, defEnv={}) => {
	customEnv = Object.assign({}, defEnv, customEnv);

	const env = {};
	const envFile = path.join(HomeDir, 'headlessknight.env.json');
	if (fs.existsSync(envFile)) {
		try {
			let json = fs.readFileSync(envFile);
			json = JSON.parse(json);
			if (json.default) Object.assign(env, json.default);
			if (json[cliName]) Object.assign(env, json[cliName]);
		}
		catch (err) {
			log('error', 'Read ENV file failed:\n', err);
		}
	}

	const OLD_ENV = {...process.env};
	// for (let key in OLD_ENV) {
	// 	if (key.match(/api_?key|proxy/i)) {
	// 		if (env[key]) continue;
	// 		env[key] = OLD_ENV[key];
	// 	}
	// }

	return Object.assign({}, OLD_ENV, env, customEnv);
};

log('log', `Start ${model || "sonnet"} @${workDir}${resumeSid ? ' #' + resumeSid : ''}`);

// 构建命令参数
const args = (process.env.CLAUDE_CODE_COMMAND || 'claude').split(' ');
const command = args[0];
args.splice(0, 1);
args.push(
	'--output-format', 'json',
	'--dangerously-skip-permissions',
	'--permission-mode', 'bypassPermissions',
	'--model', model || "sonnet",
);
// 如果指定的模型不是 Haiku，则设置 fallback 模型
if (model !== 'haiku') {
	args.push('--fallback-model', 'haiku');
}
// 如果有 resumeSid，添加 --resume 参数
if (resumeSid) {
	args.push('--resume', resumeSid);
}
// 添加 prompt
args.push('-p', prompt);
log('log', '开始调用 Claude Code:', command, args);

const result = spawnSync(command, args, {
	stdio: ['pipe', 'pipe', 'pipe'],
	env: prepareEnvironment('claude'),
	cwd: workDir || HomeDir,
	windowsHide: true,
});
log('log', 'Claude Code 执行结束');
if (result.stdout) result.stdout = result.stdout.toString();
if (result.stderr) result.stderr = result.stderr.toString();
log('log', result); // for test
if (!result.stdout) {
	log('error', 'Claude Execute Failed:', result.stderr || "ClaudeCode 运行时出错");
	throwError(result.stderr || "ClaudeCode 运行时出错");
}
else {
	const json = JSON.parse(result.stdout);
	log('log', json);
	if (json.is_error) {
		log('error', 'Claude Reply Failed:', result.stderr || "ClaudeCode 返回出错");
		throwError(result.stderr || "ClaudeCode 返回出错");
	}
	else {
		replyTask({
			session_id: json.session_id,
			reply: json.result,
			usage: {
				input: json.usage?.input_tokens,
				output: json.usage?.output_tokens
			}
		});
	}
}

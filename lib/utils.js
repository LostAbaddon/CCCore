const Utils = {};

Utils.cccoreSocket = (socketName='cccore_socket') => {
	const platform = process.platform;

	if (platform === 'win32') {
		return `\\\\.\\pipe\\${socketName}`;
	}
	else {
		return `/tmp/${socketName}`;
	}
};

// 获取当前时间的 YYYY-MM-DD 格式字符串
Utils.getCurrentTimstampString = (timestamp, dateOnly=true) => {
	const now = timestamp ? new Date(timestamp) : new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	if (dateOnly) return `${year}-${month}-${day}`;
	const hour = String(now.getHours()).padStart(2, '0');
	const minute = String(now.getMinutes()).padStart(2, '0');
	const second = String(now.getSeconds()).padStart(2, '0');
	return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

// 将日志数据转化为 LOG 记录
Utils.formatLogEntry = (entry) => {
	let middleEntry = "";
	if (entry.source === 'Claude Code') {
		middleEntry= `| WORKSPACE: ${entry.workspace}
| SESSIONID: ${entry.sessionId || entry.sessionid}`;
	}
	else if (entry.source === 'Chrome') {
		middleEntry= `| TABID    : ${entry.tabId || entry.tabid}`;
	}
	else if (entry.source === 'CLI') {
		middleEntry= `| PID      : ${entry.pid}`;
	}

	const dateStr = Utils.getCurrentTimstampString(entry.timestamp, false);
	return `============================================================
| SOURCE   : ${entry.source}
| TIMESTAMP: ${dateStr}
${middleEntry}
============================================================

${entry.content}`;
};

module.exports = Utils;
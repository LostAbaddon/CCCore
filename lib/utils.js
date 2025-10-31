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
  const hour = String(now.getHours() + 1).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};


module.exports = Utils;
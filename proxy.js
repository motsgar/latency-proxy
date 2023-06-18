const net = require('net');

const printInvalidArgumentsErrorAndExit = () => {
	console.error('Invalid arguments');
	console.error('Format: node proxy.js <connect port> <listen port> <proxy delay> [proxy jitter]');
	console.error('Example: node proxy.js 4000 4001 100 50');
	process.exit(1);
};

const args = process.argv.slice(2);
if (args.length !== 4 && args.length !== 3) printInvalidArgumentsErrorAndExit();
if (args.length === 3) {
	args.push(0);
}

const connectPort = args[0];
const listenPort = args[1];
const proxyDelay = parseInt(args[2]);
const proxyJitter = parseInt(args[3]);

if (isNaN(proxyDelay) || isNaN(proxyJitter) || proxyDelay < 0 || proxyJitter < 0 || proxyJitter > proxyDelay) printInvalidArgumentsErrorAndExit();

const server = net.createServer({ noDelay: true }, socket => {
	console.log('client connected');

	const serverConnection = net.createConnection({ host: 'localhost', port: connectPort, noDelay: true }, () => {
		console.log('client is proxied to server');

		let serverDataQueue = [];
		let isServerDataProcessing = false;

		let clientDataQueue = [];
		let isClientDataProcessing = false;

		const processServerData = async () => {
			if (!isServerDataProcessing && serverDataQueue.length > 0) {
				isServerDataProcessing = true;
				const { data, timestamp } = serverDataQueue.shift();
				const delay = calculateDelay(timestamp);
				previousServerPacketTime = timestamp;
				await delayPromise(delay);
				if (socket.destroyed) return;
				socket.write(data);
				isServerDataProcessing = false;
				processServerData();
			}
		};

		const processClientData = async () => {
			if (!isClientDataProcessing && clientDataQueue.length > 0) {
				isClientDataProcessing = true;
				const { data, timestamp } = clientDataQueue.shift();
				const delay = calculateDelay(timestamp);
				previousClientPacketTime = timestamp;
				await delayPromise(delay);
				if (socket.destroyed) return;
				serverConnection.write(data);
				isClientDataProcessing = false;
				processClientData();
			}
		};

		const calculateDelay = delayStartTime => {
			const adjustedDelay = proxyDelay - (Date.now() - delayStartTime);
			const randomDelay = Math.random() * proxyJitter * 2 - proxyJitter;
			return Math.max(0, adjustedDelay + randomDelay);
		};

		const delayPromise = ms => new Promise(resolve => setTimeout(resolve, ms));

		serverConnection.on('data', data => {
			serverDataQueue.push({ data, timestamp: Date.now() });
			processServerData();
			console.log('data from server', data);
		});

		socket.on('data', data => {
			clientDataQueue.push({ data, timestamp: Date.now() });
			processClientData();
			console.log('data from client', data);
		});

		socket.on('close', () => {
			serverConnection.destroy();
		});
	});

	serverConnection.on('error', () => {
		socket.destroy();
	});

	serverConnection.on('close', () => {
		socket.destroy();
	});
});

server.listen(listenPort, () => {
	console.log('proxy is listening on port', listenPort);
});

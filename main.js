var SerialPort = require('serialport').SerialPort,
	serialPort = new SerialPort('/dev/ttyUSB0', {
		baudrate: 19200
	}),
	Printer = require('thermalprinter'),
	io = require('socket.io-client'),
	Queue = require('./queue'),
	client;

// open serial port
serialPort.on('open',function() {
	// printer conf
	var opts = {
		maxPrintingDots: 15,
		heatingTime: 150,
		heatingInterval: 4,
		commandDelay: 5
	};
	// instanciate the printer on the opened serial port
	var printer = new Printer(serialPort, opts);
	printer.on('ready', function() {
		console.log('[Printer] ready');
		var queue = new Queue(printer);
		// handle incoming data in the queue
		queue.on('data', function() {
			queue.process();
		});

		// connect the program to the WS
		client = io.connect('http://dashboard.sidlee.com/', { secure: true, transports: ['websocket'] });
		client.on('connect', function() {
			console.log('[Websocket] connected');
		});
		client.on('event', function(data) {
			// add the event to the queue
			queue.add(data);
			// notify that there is some new data that can be printed
			queue.emit('data');
		});
		client.on('disconnect', function() {
			console.log('disconnected');
		});
	});
});

// shutdown hook
var cleanup = function () {
	console.log('[Printer] closing...');
	serialPort.close(function() {
		process.exit();
	});
};
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

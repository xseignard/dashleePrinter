var fs = require('fs'),
	rimraf = require('rimraf'),
	SerialPort = require('serialport').SerialPort,
	async = require('async'),
	Printer = require('thermalprinter'),
	io = require('socket.io-client'),
	keypress = require('keypress'),
	Queue = require('./queue'),
	numberOfPrinters = 5,
	ports = Array.apply(null, Array(numberOfPrinters)).map(function (x, i) { return i + 1; }),
	printers = [],
	queue,
	client;

// printer opts
var opts = {
	maxPrintingDots: 15,
	heatingTime: 150,
	heatingInterval: 4,
	commandDelay: 5
};

// tmp dir
var tmpDir = '/tmp/dashboard/';
// cleanup tmp dir
if (fs.existsSync(tmpDir)) rimraf.sync(tmpDir);
// recreate dir (cleaned!)
fs.mkdirSync(tmpDir);

// open all serial ports and instanciate all printers
async.eachSeries(
	ports,
	function(index, callback) {
		var serialPort = new SerialPort('/dev/printer' + index, {
			baudrate: 19200
		});
		serialPort.on('open',function() {
			var printer = new Printer(serialPort, opts);
			printers.push(printer);
			printer.on('ready', function() {
				console.log('[Printer]: ' + serialPort.path + ': ready');
				callback();
			});
		});
	},
	function(err) {
		console.log('[Printer]: all ready!');
		queue = new Queue(printers, tmpDir);
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
	}
);

// button count
var buttonCount = 0;

// handle keypress (test before button)
// make `process.stdin` begin emitting "keypress" events
keypress(process.stdin);

// listen for the "keypress" event
process.stdin.on('keypress', function (ch, key) {
	if (key && key.ctrl && key.name == 'c') {
		process.emit('SIGTERM');
	}
	else {
		buttonCount++;
		var str = buttonCount.toString();
		var length = str.length;
		for (var i = length; i < 5; i++) {
			str = 0 + str + '';
		}
		queue.printHello(str.split('').reverse());
	}
});

process.stdin.setRawMode(true);
process.stdin.resume();

// shutdown hook
var cleanup = function () {
	console.log('[Printer] closing...');
	async.each(
		queue.printers,
		function(printer, callback) {
			printer.serialPort.close(function() {
				callback();
			});
		},
		function(err) {
			// cleanup tmp dir
			if (fs.existsSync(tmpDir)) rimraf.sync(tmpDir);
			process.exit();
		}
	);
};
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

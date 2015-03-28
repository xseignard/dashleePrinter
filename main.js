var fs = require('fs'),
	rimraf = require('rimraf'),
	SerialPort = require('serialport').SerialPort,
	async = require('async'),
	Printer = require('thermalprinter'),
	io = require('socket.io-client'),
	Queue = require('./queue'),
	numberOfPrinters = 5,
	ports = Array.apply(null, Array(numberOfPrinters)).map(function (x, i) { return i; }),
	printers = [],
	queue,
	client;

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
async.each(
	ports,
	function(index, callback) {
		var serialPort = new SerialPort('/dev/ttyUSB' + index, {
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

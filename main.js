var fs = require('fs'),
	rimraf = require('rimraf'),
	SerialPort = require('serialport').SerialPort,
	async = require('async'),
	Printer = require('thermalprinter'),
	io = require('socket.io-client'),
	five = require('johnny-five'),
	request = require('request'),
	Queue = require('./queue'),
	numberOfPrinters = 10,
	ports = Array.apply(null, Array(numberOfPrinters)).map(function (x, i) { return i + 1; }),
	printers = [],
	queue,
	client,
	board,
	button,
	led;

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

		// request today values
		var url = 'http://dashboard.sidlee.com/api/1/event/today';
		request(url, function (error, response, body) {
			if (!error && response.statusCode == 200) {
				queue = new Queue(printers, body, tmpDir);
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
		});
	}
);

// flag to check wether the button is active or not
// it's not active for 10 minutes after being pressed
var buttonActive = true;
var buttonTimeout = 3000;
// handle button press
board = new five.Board({
	port: '/dev/ttyACM0'
});

// push a button click
var postPush = function() {
	var url = 'http://dashboard.sidlee.com/api/1/event';

	var event = {
		name: 'lightswitch',
		value: 1,
		unit: 'click',
		token: 'c7f2ad85-a221-6fbf-22e2-9bcca6994c75'
	};

	request.post({ method: "POST", url: url, json: true, body: event });
};

board.on('ready', function() {

	button = new five.Button({
		pin: 2,
		isPullup: true
	});

	led = new five.Led(6);
	led.pulse(2000);

	button.on('down', function(value) {
		if (buttonActive) {
			console.log('[Button] pressed');
			buttonActive = false;
			led.off();
			postPush();
			// reactivate the button after 10 minutes
			setTimeout(function() {
				led.pulse(2000);
				buttonActive = true;
			}, buttonTimeout);
		}
	});
});

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

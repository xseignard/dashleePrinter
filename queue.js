var util = require('util'),
	EventEmitter = require('events').EventEmitter,
	async = require('async'),
	fs = require('fs'),
	svg2png = require('svg2png'),
	cheerio = require('cheerio'),
	uuid = require('node-uuid'),
	gm = require('gm'),
	conf = require('./sensorsConf');

/**
 * Queue constructor
 */
var Queue = function(printers, tmpDir) {
	this.printers = printers;
	this.queue = [];
	this.availablePrinters = this.printers.slice(0);
	this.tmpDir = tmpDir;
	this.canPrint = true;
};
util.inherits(Queue, EventEmitter);

// object to maintain sum/avg for each sensors
var values = {};
for (var sensor in conf) {
	values[sensor] = 0;
}
var currentVisits = 0;
var currentLikes = 0;

/**
 * Add the events to the queue, waiting to be printed
 */
Queue.prototype.add = function(data) {
	// trick for multiple visits and likes events
	// we can recieive the same likes or visits events multiple times
	// only add a likes or visits events to the queue if the value is
	// not the same as the current one
	if (data._id === 'visits') {
		if (data.value !== currentVisits) {
			currentVisits = data.value;
			this.queue.push(data);
		}
	}
	else if (data._id === 'likes') {
		if (data.value !== currentLikes) {
			currentLikes = data.likes;
			this.queue.push(data);
		}
	}
	// normal case
	else {
		this.queue.push(data);
	}
};

/**
 * Prints the hello message. Stops the printing que while printing it
 */
Queue.prototype.printHello = function(countArray) {
	var _self = this;
	// prevent new prints
	this.canPrint = false;
	// wait for all printers available
	var interval = setInterval(function() {
		if (_self.availablePrinters.length === _self.printers.length) {
			clearInterval(interval);
			// since the printers are in the good order in the array, no need to sort them
			async.each(
				_self.printers,
				function(printer, callback) {
					var index = _self.printers.indexOf(printer);
					// print the hello message
					if (index < 5) {
						var file = __dirname + '/images/hello/' + index + '.png';
						printer
							.printImage(file)
							.print(function() {
								callback();
							});
					}
					// print the count
					else {
						_self.generateHelloNumber(countArray[index - 5], function(err, dest) {
							if (dest && !err) {
								printer
									.printImage(dest)
									.print(function() {
										callback();
									});
							}
						});
					}

				},
				function(err) {
					console.log('[Printer] hello printed');
					_self.canPrint = true;
				}
			);
		}
	}, 1000);
};

Queue.prototype.process = function() {
	var _self = this;
	// there is something to print and the printer is available
	if (this.queue.length >= 1 && this.availablePrinters.length > 0 && this.canPrint) {
		// get firt available printer
		var printer = this.availablePrinters.shift();
		// get the event to print
		var current = _self.queue.shift();
		console.log('[Queue] ' + current._id + ', ' + current.value);
		console.log('[Queue] ' + this.queue.length);

		// if the event to print is a sum, do the sum
		if (conf[current._id].sum) {
			values[current._id] += current.value;
		}
		// else keep the current value
		else {
			values[current._id] = current.value;
		}
		// update the value to be printed
		current.value = values[current._id];

		// generate the set of values to be repalced on the SVG
		var printValues = this.handleValues(current);

		// generate the image and send its path to the printer
		this.generateImage(current._id, printValues, function(err, dest) {
			// generation is a success
			if (dest && !err) {
				printer
					.printImage(dest)
					.print(function() {
						console.log('[Printer] done');
						_self.availablePrinters.push(printer);
						_self.emit('data');
					});
			}
			// something went wrong, skip the value
			// go on with the next one in the queue
			else {
				console.log('[Printer] cannot print it, skipping it');
				_self.availablePrinters.push(printer);
				_self.emit('data');
			}
		});
	}
};

/**
 * Generate PNG with the correct values from the corresponding SVG file.
 */
Queue.prototype.generateHelloNumber = function(value, callback) {
	var _self = this;
	// try to load the corresponding SVG file
	var file = __dirname + '/images/hello/number.svg';
	fs.readFile(file, function (err, data) {
		if (err) { callback(err, null); return; }
		// start parsing SVG file to modify it
		var $ = cheerio.load(data.toString(), { xmlMode: true });
		// nodes that can be changed in the SVG have an id, replace the text of each given id
		$('#value').text(value + '');
		// get the viewbox width of the SVG to scale it to a 384px wide PNG
		// because the thermal printed can print images at 384px wide max
		var svg = $('svg');
		var content = svg.toString();
		// weird trick to unescape single quote character
		content = content.replace(/&apos;/g, '\'');
		// weird trick to get the xml def node on top of the text content of the svg
		// this is because getting svg node do not return all the svg file
		// this could be done in a smarter way
		content = '<?xml version="1.0" encoding="utf-8"?>' + content;
		// generate a unique id that will be used to suffix generated SVGs and PNGs
		var id = uuid.v1();
		// save SVG in order to generate the corresponding PNG from it
		var newFile = _self.tmpDir + 'number' + id + '.svg';
		fs.writeFile(newFile, content, function(err) {
			if(err) { callback(err, null); return; }
			var destFile = _self.tmpDir + 'number' + id + '.png';
			// generate the scaled PNG from the generated SVG
			svg2png(newFile, destFile, 1, function (err) {
				// flip the image because of the printer way of printing
				gm(destFile)
					.flip()
					.flop()
					.write(destFile, function (err) {
						// now we are good, we have an image ready to be printed
						callback(err, destFile);
					});
			});
		});
	});
};

/**
 * Generate PNG with the correct values from the corresponding SVG file.
 */
Queue.prototype.generateImage = function(key, printValues, callback) {
	var _self = this;
	// odd/even ligthswitch SVG
	if (key === 'lightswitch') {
		key = values.lightswitch % 2 === 0 ? key += '_on' : key += '_off';
	}

	// try to load the corresponding SVG file
	var file = __dirname + '/images/' + key + '.svg';
	fs.readFile(file, function (err, data) {
		if (err) { callback(err, null); return; }
		// start parsing SVG file to modify it
		var $ = cheerio.load(data.toString(), { xmlMode: true });
		// nodes that can be changed in the SVG have an id, replace the text of each given id
		for (value in printValues) {
			$('#' + value).text(printValues[value] + '');
		}
		// get the viewbox width of the SVG to scale it to a 384px wide PNG
		// because the thermal printed can print images at 384px wide max
		var svg = $('svg');
		var width = svg.attr('width');
		var scale = 384/width;
		// add a huuuge white rectangle as the first node of the SVG
		// it will act as a white background while converting it to PNG
		svg.prepend('<rect x="0" y="0" height="1000" width="1000" fill="#FFFFFF"/>');
		// get text content of the SVG
		var content = svg.toString();
		// weird trick to unescape single quote character
		content = content.replace(/&apos;/g, '\'');
		// weird trick to get the xml def node on top of the text content of the svg
		// this is because getting svg node do not return all the svg file
		// this could be done in a smarter way
		content = '<?xml version="1.0" encoding="utf-8"?>' + content;
		// generate a unique id that will be used to suffix generated SVGs and PNGs
		var id = uuid.v1();
		// save SVG in order to generate the corresponding PNG from it
		var newFile = _self.tmpDir + key + id + '.svg';
		fs.writeFile(newFile, content, function(err) {
			if(err) { callback(err, null); return; }
			var destFile = _self.tmpDir + key + id + '.png';
			// generate the scaled PNG from the generated SVG
			svg2png(newFile, destFile, scale, function (err) {
				// flip the image because of the printer way of printing
				var toPNG = gm(destFile)
							.flip()
							.flop();
				if (values.lightswitch % 2 !== 0) {
					toPNG.negative();
				}
				toPNG.write(destFile, function (err) {
					// now we are good, we have an image ready to be printed
					callback(err, destFile);
				});
			});
		});
	});
};

/**
 * Handle values to be printed and the particular cases
 */
Queue.prototype.handleValues = function(current) {
	// get the time
	var date = new Date(current.date);
	var time =
		(date.getHours() < 10 ? '0' + date.getHours() : date.getHours()) + ':' +
		(date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()) + ':' +
		(date.getSeconds() < 10 ? '0' + date.getSeconds() : date.getSeconds());

	// football table needs red and blue score
	if (current._id === 'red' || current._id === 'blue') {
		printValues = {
			red: values.red,
			blue: values.blue,
			date: time
		};
	}
	// for the stairs we need to print previous and next 20 stairs
	else if (current._id === 'stairs') {
		printValues = {
			value: current.value,
			previous: current.value - 20,
			next: current.value + 20,
			date: time
		};
	}
	// undo have a bit more info to display (user, app and date)
	else if (current._id === 'undo') {
		printValues = {
			value: current.value,
			app: current.app,
			user: current.user,
			date: time
		};
	}
	// tracer don't have date
	else if (current._id === 'tracer') {
		printValues = {
			value: current.value
		};
	}
	// water is in cl, divide by 100 
	else if (current._id === 'water') {
		printValues = {
			value: current.value / 100,
			date: time
		};
	}
	// normal case for others
	else {
		printValues = {
			value: current.value,
			date: time
		};
	}
	return printValues;
};

module.exports = Queue;

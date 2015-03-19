var util = require('util'),
	EventEmitter = require('events').EventEmitter,
	fs = require('fs'),
	svg2png = require('svg2png'),
	cheerio = require('cheerio'),
	uuid = require('node-uuid'),
	gm = require('gm'),
	conf = require('./sensorsConf');

/**
 * Queue constructor
 */
var Queue = function(printer) {
	this.printer = printer;
	this.queue = [];
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

Queue.prototype.process = function() {
	var _self = this;
	// there is something to print and the printer is available
	if (this.queue.length >= 1 && this.canPrint) {
		this.canPrint = false;
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
				_self.printer
					.printImage(dest)
					.print(function() {
						console.log('[Printer] done');
						_self.canPrint = true;
						_self.emit('data');
					});
			}
			// something went wrong, skip the value
			// go on with the next one in the queue
			else {
				console.log('[Printer] cannot print it, skipping it');
				_self.canPrint = true;
				_self.emit('data');
			}
		});
	}
};

/**
 * Generate PNG with the correct values from the corresponding SVG file.
 */
Queue.prototype.generateImage = function(key, printValues, callback) {
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
		var newFile = '/tmp/' + key + id + '.svg';
		fs.writeFile(newFile, content, function(err) {
			if(err) { callback(err, null); return; }
			var destFile = '/tmp/' + key + id + '.png';
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
	// football table needs red and blue score
	if (current._id === 'red' || current._id === 'blue') {
		printValues = { red: values.red, blue: values.blue };
	}
	// undo have a bit more info to display (user, app and date)
	else if (current._id === 'undo') {
		var date = new Date(current.date);
		var time = 
			(date.getHours() < 10 ? '0' + date.getHours() : date.getHours()) + ':' + 
			(date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()) + ':' +
			(date.getSeconds() < 10 ? '0' + date.getSeconds() : date.getSeconds());

		printValues = { value: current.value, app: current.app, user: current.user, date: time };
	}
	// normal case for others
	else {
		printValues = { value: current.value };
	}
	return printValues;
};

module.exports = Queue;
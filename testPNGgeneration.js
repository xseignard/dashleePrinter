var svg2png = require('svg2png'),
	cheerio = require('cheerio'),
	fs = require('fs'),
	async = require('async'),
	conf = require('./sensorsConf');

var keys = Object.keys(conf);



var generateImage = function(key, values, callback) {
	if (key === 'lightswitch') key = key + '_on';
	var file = __dirname + '/images/' + key + '.svg';
	fs.readFile(file, function (err, data) {
		if (err) { callback(err, null); return; }
		var $ = cheerio.load(data.toString(), { xmlMode: true });
		for (value in values) {
			$('#' + value).text(values[value]);
		}
		var svg = $('svg');
		var width = svg.attr('width');
		var scale = 384/width;
		console.log(scale);
		svg.prepend('<rect x="0" y="0" height="1000" width="1000" fill="#FFFFFF"/>');
		var content = svg.toString();
		content = content.replace(/&apos;/g, '\'');
		content = '<?xml version="1.0" encoding="utf-8"?>' + content;
		var newFile = '/tmp/' + key + '.svg';
		fs.writeFile(newFile, content, function(err) {
			if(err) { callback(err, null); return; }
			var destFile = __dirname + '/images/test/' + key + '.png';
			svg2png(newFile, destFile, scale, function (err) {
				callback(null, destFile);
			});
		});
	});
}

async.each(
	keys,
	function(key, callback) {
		var values;
		if (key === 'blue' || key === 'red') {
			values = { blue: '50', red: '40' };
		}
		else if (key === 'undo') {
			values = { value: '50', app: 'test', user: 'user', date: '09:08:52' };
		}
		else {
			values = { value: '8' };
		}
		generateImage(key, values, function(err, path) {
			if (path) console.log(path);
			callback();
		});
	},
	function(err){
		if( err ) {
			console.log('A file failed to process');
		}
		else {
			console.log('All files have been processed successfully');
		}
});
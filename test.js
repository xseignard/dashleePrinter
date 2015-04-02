var request = require('request');
var url = 'http://dashboard.sidlee.com/api/1/event/today';

request(url, function (error, response, body) {
	if (!error && response.statusCode == 200) {
		var values = {};

		JSON.parse(body).map(function(current) {
			var id = current._id;
			values[id] = current.value;
		});
		console.log(values);
	}
});

var request = require('request');

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

postPush();

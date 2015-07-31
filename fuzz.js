require('source-map-support/register');

var esfuzz = require('esfuzz');
var checkAndConvert = require('./').checkAndConvert;

var count = 0;

(function repeat() {
	for (var i = 0; i < 100; i++) {
		var code = esfuzz.render(esfuzz.generate());
		checkAndConvert(code);
	}
	console.log(count += 100);
	process.nextTick(repeat);
})();
require('source-map-support/register');

var esfuzz = require('esfuzz');
var checkAndConvert = require('./').checkAndConvert;

var count = 0;
var logStep = 1000;

(function repeat() {
	for (var i = 0; i < logStep; i++) {
		var code = esfuzz.render(esfuzz.generate());
		checkAndConvert(code);
	}
	console.log(count += logStep);
	process.nextTick(repeat);
})();
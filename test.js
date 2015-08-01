require('better-log/install');
require('source-map-support/register');

var acornParse = require('acorn').parse;
var tsParse = require('./').checkAndConvert;
var readFile = require('fs').readFileSync;
var ts = require('typescript');

function diffAST(path) {
	var last = path[path.length - 1];
	var src = last.src;
	var gen = last.gen;
	if (typeof src !== 'object' || src === null || typeof gen !== 'object' || gen === null) {
		if (src !== gen) {
			var owner = path.length >= 2 ? path[path.length - 2] : last;
			console.warn({
				path: path.map(function (item) {
					return item.key;
				}).join('.'),
				src: owner.src,
				gen: owner.gen
			});
		}
		return;
	}
	for (var key in src) {
		if (key !== 'loc' && key !== 'range' && (key in gen)) {
			diffAST(path.concat([{
				key: key,
				src: src[key],
				gen: gen[key]
			}]));
		}
	}
}

function test(name, version, sourceType) {
	console.log(name + '...');
	var sourceCode = readFile(__dirname + '/fixtures/' + name + '.js', 'utf-8');
	var sourceAst = acornParse(sourceCode, {
		ecmaVersion: version,
		locations: true,
		ranges: true,
		sourceType: sourceType,
		sourceFile: 'module.ts'
	});
	var generatedAst = tsParse(sourceCode, {
		target: version === 5 ? ts.ScriptTarget.ES5 : ts.ScriptTarget.ES6
	});
	diffAST([{
		key: 'Program',
		src: sourceAst,
		gen: generatedAst
	}]);
}

test('es5', 5);
//test('es2015-script', 6, 'script');
//test('es2015-module', 6, 'module');

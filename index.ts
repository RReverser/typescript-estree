/// <reference path="typings/node/node.d.ts" />
/// <reference path="node_modules/typescript/bin/typescript.d.ts" />
/// <reference path="typings/estree/estree.d.ts" />
/// <reference path="typings/estree/flow.d.ts" />

import * as ts from 'typescript';

var SyntaxName: { [kind: number]: string } = (<any>ts).SyntaxKind;

// patch SyntaxName in order to provide better names in debug
[
	'FirstAssignment',
	'LastAssignment',
	'FirstReservedWord',
	'LastReservedWord',
	'FirstKeyword',
	'LastKeyword',
	'FirstFutureReservedWord',
	'LastFutureReservedWord',
	'FirstTypeNode',
	'LastTypeNode',
	'FirstPunctuation',
	'LastPunctuation',
	'FirstToken',
	'LastToken',
	'FirstTriviaToken',
	'LastTriviaToken',
	'FirstLiteralToken',
	'LastLiteralToken',
	'FirstTemplateToken',
	'LastTemplateToken',
	'FirstBinaryOperator',
	'LastBinaryOperator',
	'FirstNode'
].forEach(aliasName => {
	var kind = (<any>ts).SyntaxKind[aliasName];
	for (let properName in SyntaxName) {
		if (aliasName !== properName && (<any>ts).SyntaxKind[properName] === kind) {
			SyntaxName[kind] = properName;
			return;
		}
	}
});

function convertPosition(sourceFile: ts.SourceFile, pos: number): ESTree.Position {
	var { line, character: column } = sourceFile.getLineAndCharacterOfPosition(pos);
	return { line, column };
}

function unexpected(node: ts.Node) {
	var { line, column } = convertPosition(node.getSourceFile(), node.pos);
	throw new TypeError(`Unexpected node type ${SyntaxName[node.kind]} (${line}:${column})`);
}

function wrapPos<T extends ESTree.Node>(sourceFile: ts.SourceFile, range: ts.TextRange, props: T): T {
	props.loc = {
		source: sourceFile.fileName,
		start: convertPosition(sourceFile, range.pos),
		end: convertPosition(sourceFile, range.end)
	};
	props.range = [range.pos, range.end];
	return props;
}

function wrap<T extends ESTree.Node>(node: ts.Node, props: T): T {
	return wrapPos(node.getSourceFile(), node, props);
}

function convertNullable<From extends ts.Node, To extends ESTree.Node>(node: From, convert: (node: From) => To): To {
	return node != null ? convert(node) : null;
}

function convertClassDeclaration(node: ts.ClassDeclaration) {
	var superClass: ESTree.Expression = null;
	node.heritageClauses.some(clause => {
		if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
			superClass = convertExpression(clause.types[0].expression);
			return true;
		} else {
			return false;
		}
	});
	return wrap<ESTree.ClassDeclaration>(node, {
		type: 'ClassDeclaration',
		id: convertIdentifier(node.name),
		superClass,
		body: wrapPos<ESTree.ClassBody>(node.getSourceFile(), node.members, {
			type: 'ClassBody',
			body: node.members.map(convertClassElement)
		})
	});
}

type ts_FunctionLikeClassElement = ts.MethodDeclaration | ts.ConstructorDeclaration | ts.AccessorDeclaration;

function convertClassElement(node: ts.ClassElement) {
	if (node.kind === ts.SyntaxKind.IndexSignature) {
		// TODO
		return null;
	}
	return convertFunctionLikeClassElement(<ts_FunctionLikeClassElement>node);
}

function convertFunctionLikeClassElement(node: ts_FunctionLikeClassElement) {
	var kind: string;
	switch (node.kind) {
		case ts.SyntaxKind.MethodDeclaration: kind = 'method'; break;
		case ts.SyntaxKind.Constructor: kind = 'constructor'; break;
		case ts.SyntaxKind.GetAccessor: kind = 'get'; break;
		case ts.SyntaxKind.SetAccessor: kind = 'set'; break;
		default: unexpected(node);
	}
	return wrap<ESTree.MethodDefinition>(node, {
		type: 'MethodDefinition',
		kind,
		key: convertDeclarationName(node.name),
		value: convertFunctionLikeDeclaration(node),
		computed: node.name.kind === ts.SyntaxKind.ComputedPropertyName,
		static: !!(node.flags & ts.NodeFlags.Static)
	});
}

function convertObjectBindingPattern(node: ts.BindingPattern) {
	return wrap<ESTree.ObjectPattern>(node, {
		type: 'ObjectPattern',
		properties: node.elements.map(convertObjectBindingElement)
	});
}

function convertIdentifierOrBindingPattern(node: ts.Identifier | ts.BindingPattern): ESTree.Pattern {
	return node.kind === ts.SyntaxKind.Identifier
		? convertIdentifier(<ts.Identifier>node)
		: convertBindingPattern(<ts.BindingPattern>node);
}

function convertArrayBindingElement(node: ts.BindingElement) {
	convertIdentifier
	var name = convertDeclarationName(node.name);
	if (node.dotDotDotToken) {
		return wrap<ESTree.RestElement>(node, {
			type: 'RestElement',
			argument: name
		});
	} else if (node.initializer) {
		return wrap<ESTree.AssignmentPattern>(node, {
			type: 'AssignmentPattern',
			left: name,
			right: convertExpression(node.initializer)
		});
	} else {
		return name;
	}
}

function convertArrayBindingPattern(node: ts.BindingPattern) {
	return wrap<ESTree.ArrayPattern>(node, {
		type: 'ArrayPattern',
		elements: node.elements.map(convertArrayBindingElement)
	});
}

function convertBindingPattern(node: ts.BindingPattern): ESTree.Pattern {
	switch (node.kind) {
		case ts.SyntaxKind.ObjectBindingPattern:
			return convertObjectBindingPattern(node);

		case ts.SyntaxKind.ArrayBindingPattern:
			return convertArrayBindingPattern(node);

		default:
			unexpected(node);
	}
}

function convertDeclarationName(node: ts.DeclarationName) {
	switch (node.kind) {
		case ts.SyntaxKind.ComputedPropertyName:
			return convertExpression((<ts.ComputedPropertyName>node).expression);

		case ts.SyntaxKind.ObjectBindingPattern:
		case ts.SyntaxKind.ArrayBindingPattern:
			return convertBindingPattern(<ts.BindingPattern>node);

		default:
			return convertExpression(<ts.Expression><any>node);
	}
}

function convertPropertyDeclaration(node: ts.PropertyDeclaration): ESTree.MethodDefinition {
	// TODO
	return null;
}

function convertLiteral(node: ts.LiteralExpression): ESTree.Literal {
	var raw = node.getText();
	switch (node.kind) {
		case ts.SyntaxKind.FalseKeyword:
		case ts.SyntaxKind.TrueKeyword:
			return wrap<ESTree.Literal>(node, {
				type: 'Literal',
				value: node.kind === ts.SyntaxKind.TrueKeyword,
				raw
			});

        case ts.SyntaxKind.NumericLiteral:
			return wrap<ESTree.Literal>(node, {
				type: 'Literal',
				value: Number(node.text),
				raw
			});

        case ts.SyntaxKind.StringLiteral:
			return wrap<ESTree.Literal>(node, {
				type: 'Literal',
				value: node.text,
				raw
			});

        case ts.SyntaxKind.RegularExpressionLiteral: {
			let [, pattern, flags] = raw.match(/^\/(.*)\/([a-z]*)$/);
			return wrap<ESTree.RegExpLiteral>(node, {
				type: 'Literal',
				value: new RegExp(pattern, flags),
				raw,
				regex: {
					pattern,
					flags
				}
			});
        }

        case ts.SyntaxKind.NullKeyword:
        	return wrap<ESTree.Literal>(node, {
        		type: 'Literal',
        		value: null,
        		raw
        	});

        default:
			unexpected(node);
    }
}

function convertExpressionStatement(node: ts.ExpressionStatement) {
	return wrap<ESTree.ExpressionStatement>(node, {
		type: 'ExpressionStatement',
		expression: convertExpression(node.expression)
	});
}

function convertTopStatement(node: ts.ModuleElement): ESTree.Statement | ESTree.ModuleDeclaration {
	switch (node.kind) {
		default:
			return convertStatement(node);
	}
}

function convertStatement(node: ts.Statement | ts.ModuleElement): ESTree.Statement {
	switch (node.kind) {
		case ts.SyntaxKind.Block:
			return convertBlock(<ts.Block>node);

        case ts.SyntaxKind.VariableStatement:
			return convertVariableStatement(<ts.VariableStatement>node);

		case ts.SyntaxKind.SwitchStatement:
			return convertSwitchStatement(<ts.SwitchStatement>node);

		case ts.SyntaxKind.TryStatement:
			return convertTryStatement(<ts.TryStatement>node);

		case ts.SyntaxKind.FunctionDeclaration:
			return convertFunctionDeclaration(<ts.FunctionDeclaration>node);

		case ts.SyntaxKind.ClassDeclaration:
			return convertClassDeclaration(<ts.ClassDeclaration>node);

		case ts.SyntaxKind.DebuggerStatement:
			return wrap<ESTree.DebuggerStatement>(node, { type: 'DebuggerStatement' });

		case ts.SyntaxKind.EmptyStatement:
			return wrap<ESTree.EmptyStatement>(node, { type: 'EmptyStatement' });

		case ts.SyntaxKind.BreakStatement:
		case ts.SyntaxKind.ContinueStatement:
			return convertBreakOrContinuteStatement(<ts.BreakOrContinueStatement>node);

		case ts.SyntaxKind.ReturnStatement:
			return convertReturnStatement(<ts.ReturnStatement>node);

		case ts.SyntaxKind.LabeledStatement:
			return convertLabeledStatement(<ts.LabeledStatement>node);

		case ts.SyntaxKind.ThrowStatement:
			return convertThrowStatement(<ts.ThrowStatement>node);

		case ts.SyntaxKind.ExpressionStatement:
			return convertExpressionStatement(<ts.ExpressionStatement>node);

		case ts.SyntaxKind.WithStatement:
			return convertWithStatement(<ts.WithStatement>node);

		case ts.SyntaxKind.ForInStatement:
			return convertForInStatement(<ts.ForInStatement>node);

		case ts.SyntaxKind.ForStatement:
			return convertForStatement(<ts.ForStatement>node);

		case ts.SyntaxKind.WhileStatement:
		case ts.SyntaxKind.DoStatement:
			return convertWhileStatement(<ts_WhileStatement>node);

		case ts.SyntaxKind.IfStatement:
			return convertIfStatement(<ts.IfStatement>node);

		default:
			unexpected(node);
	}
}

function convertThrowStatement(node: ts.ThrowStatement) {
	return wrap<ESTree.ThrowStatement>(node, {
		type: 'ThrowStatement',
		argument: convertExpression(node.expression)
	});
}

function convertBreakOrContinuteStatement(node: ts.BreakOrContinueStatement) {
	return wrap<ESTree.BreakStatement | ESTree.ContinueStatement>(node, {
		type: node.kind === ts.SyntaxKind.BreakStatement ? 'BreakStatement' : 'ContinueStatement',
		label: convertNullable(node.label, convertIdentifier)
	});
}

function convertReturnStatement(node: ts.ReturnStatement) {
	return wrap<ESTree.ReturnStatement>(node, {
		type: 'ReturnStatement',
		argument: convertNullable(node.expression, convertExpression)
	});
}

function convertExpression(node: ts.Expression): ESTree.Expression {
	switch (node.kind) {
		case ts.SyntaxKind.OmittedExpression:
			return null;

		case ts.SyntaxKind.ThisKeyword:
			return wrap<ESTree.ThisExpression>(node, { type: 'ThisExpression' });

		case ts.SyntaxKind.Identifier:
			return convertIdentifier(<ts.Identifier>node);

		case ts.SyntaxKind.BinaryExpression:
			return convertBinaryExpression(<ts.BinaryExpression>node);

		case ts.SyntaxKind.PrefixUnaryExpression:
		case ts.SyntaxKind.PostfixUnaryExpression:
			return convertPrefixOrPostfixUnaryExpression(<ts_PrefixOrPostfixUnaryExpression>node);

        case ts.SyntaxKind.DeleteExpression:
        case ts.SyntaxKind.TypeOfExpression:
        case ts.SyntaxKind.VoidExpression:
			return convertNamedUnaryExpression(<ts_NamedUnaryExpression>node);

		case ts.SyntaxKind.ConditionalExpression:
			return convertConditionalExpression(<ts.ConditionalExpression>node);

		case ts.SyntaxKind.CallExpression:
		case ts.SyntaxKind.NewExpression:
			return convertCallOrNewExpression(<ts_CallOrNewExpression>node);

		case ts.SyntaxKind.ParenthesizedExpression:
			return convertExpression((<ts.ParenthesizedExpression>node).expression);

		case ts.SyntaxKind.ArrayLiteralExpression:
			return convertArrayLiteralExpression(<ts.ArrayLiteralExpression>node);

		case ts.SyntaxKind.ObjectLiteralExpression:
			return convertObjectLiteralExpression(<ts.ObjectLiteralExpression>node);

		case ts.SyntaxKind.ArrowFunction:
		case ts.SyntaxKind.FunctionExpression:
			return convertFunctionLikeDeclaration(<ts.FunctionExpression>node);

		case ts.SyntaxKind.PropertyAccessExpression:
			return convertPropertyAccessExpression(<ts.PropertyAccessExpression>node);

		case ts.SyntaxKind.ElementAccessExpression:
			return convertElementAccessExpression(<ts.ElementAccessExpression>node);

		default:
			return convertLiteral(<ts.LiteralExpression>node);
	}
}

function convertPropertyAccessExpression(node: ts.PropertyAccessExpression) {
	return wrap<ESTree.MemberExpression>(node, {
		type: 'MemberExpression',
		object: convertExpression(node.expression),
		property: convertIdentifier(node.name),
		computed: false
	});
}

function convertElementAccessExpression(node: ts.ElementAccessExpression) {
	return wrap<ESTree.MemberExpression>(node, {
		type: 'MemberExpression',
		object: convertExpression(node.expression),
		property: convertExpression(node.argumentExpression),
		computed: true
	});
}

export function convertSourceFile(node: ts.SourceFile) {
	return wrap<ESTree.Program>(node, {
		type: 'Program',
		body: node.statements.map(convertTopStatement),
		sourceType: 'module'
	});
}

export function checkAndConvert(input: string, options?: ts.CompilerOptions) {
	options = options ? ts.clone(options) : ts.getDefaultCompilerOptions();
	options.noLib = true;
    options.noResolve = true;
    var inputFileName = "module.ts";
    var sourceFile = ts.createSourceFile(inputFileName, input, options.target);
    // Create a compilerHost object to allow the compiler to read and write files
    var program = ts.createProgram([inputFileName], options, {
    	getSourceFile(fileName, target) { return fileName === inputFileName ? sourceFile : undefined; },
        writeFile(name, text, writeByteOrderMark) {
            throw new Error("Not implemented");
        },
        getDefaultLibFileName() { return "lib.d.ts"; },
        useCaseSensitiveFileNames() { return true; },
        getCanonicalFileName(fileName) { return fileName; },
        getCurrentDirectory() { return ""; },
        getNewLine() { return "\n"; }
    });
    /*
    var diag: Array<ts.Diagnostic> = []
    	.concat(program.getSyntacticDiagnostics())
    	.concat(program.getSemanticDiagnostics())
    	.concat(program.getDeclarationDiagnostics());
    if (diag.length) {
		let { line, column } = convertPosition(diag[0].file, diag[0].start);
		console.warn(`${ts.flattenDiagnosticMessageText(diag[0].messageText, '\n')} at ${line}:${column}`);
    }
    */
    program.getSemanticDiagnostics();
    convertSourceFile(sourceFile);
}

function convertVariableStatement(node: ts.VariableStatement) {
	var { flags, declarations } = node.declarationList;
	return wrap<ESTree.VariableDeclaration>(node, {
		type: 'VariableDeclaration',
		kind: (flags & ts.NodeFlags.Const) ? 'const' : (flags & ts.NodeFlags.Let) ? 'let' : 'var',
		declarations: declarations.map(convertVariableDeclaration)
	});
}

function convertVariableDeclaration(node: ts.VariableDeclaration) {
	return wrap<ESTree.VariableDeclarator>(node, {
		type: 'VariableDeclarator',
		id: convertDeclarationName(node.name),
		init: convertNullable(node.initializer, convertExpression)
	});
}

function convertSwitchStatement(node: ts.SwitchStatement) {
	return wrap<ESTree.SwitchStatement>(node, {
		type: 'SwitchStatement',
		discriminant: convertExpression(node.expression),
		cases: node.caseBlock.clauses.map(convertCaseOrDefaultClause)
	});
}

function convertCaseOrDefaultClause(node: ts.CaseOrDefaultClause) {
	return wrap<ESTree.SwitchCase>(node, {
		type: 'SwitchCase',
		test: node.kind === ts.SyntaxKind.CaseClause ? convertExpression((<ts.CaseClause>node).expression) : null,
		consequent: node.statements.map(convertStatement)
	});
}

function convertLabeledStatement(node: ts.LabeledStatement) {
	return wrap<ESTree.LabeledStatement>(node, {
		type: 'LabeledStatement',
		label: convertIdentifier(node.label),
		body: convertStatement(node.statement)
	});
}

function convertIdentifier(node: ts.Identifier) {
	return wrap<ESTree.Identifier>(node, {
		type: 'Identifier',
		name: node.text
	});
}

function convertBlock(node: ts.Block) {
	return wrap<ESTree.BlockStatement>(node, {
		type: 'BlockStatement',
		body: node.statements.map(convertStatement)
	});
}

function convertTryStatement(node: ts.TryStatement) {
	return wrap<ESTree.TryStatement>(node, {
		type: 'TryStatement',
		block: convertBlock(node.tryBlock),
		handler: convertNullable(node.catchClause, convertCatchClause),
		finalizer: convertNullable(node.finallyBlock, convertBlock)
	});
}

function convertCatchClause(node: ts.CatchClause) {
	return wrap<ESTree.CatchClause>(node, {
		type: 'CatchClause',
		param: convertDeclarationName(node.variableDeclaration.name),
		body: convertBlock(node.block)
	});
}

function convertYieldExpression(node: ts.YieldExpression) {
	return wrap<ESTree.YieldExpression>(node, {
		type: 'YieldExpression',
		argument: convertExpression(node.expression),
		delegate: !!node.asteriskToken
	});
}

type ts_PrefixOrPostfixUnaryExpression = ts.PrefixUnaryExpression | ts.PostfixUnaryExpression;

function convertPrefixOrPostfixUnaryExpression(node: ts_PrefixOrPostfixUnaryExpression) {
	var operator = tryConvertUpdateOperator(node.operator);
	var isUnary = operator === undefined;
	if (isUnary) {
		operator = convertUnaryOperator(node.operator);
	}
	return wrap<ESTree.UnaryExpression | ESTree.UpdateExpression>(node, {
		type: isUnary ? 'UnaryExpression' : 'UpdateExpression',
		operator,
		prefix: node.kind === ts.SyntaxKind.PrefixUnaryExpression,
		argument: convertExpression(node.operand)
	});
}

type ts_NamedUnaryExpression = ts.DeleteExpression | ts.TypeOfExpression | ts.VoidExpression;

function convertNamedUnaryExpression(node: ts_NamedUnaryExpression) {
	var operator: string;
	switch (node.kind) {
		case ts.SyntaxKind.DeleteExpression:
			operator = "delete";
			break;

		case ts.SyntaxKind.TypeOfExpression:
			operator = "typeof";
			break;

		case ts.SyntaxKind.VoidExpression:
			operator = "void";
			break;

		default:
			unexpected(node);
	}
	return wrap<ESTree.UnaryExpression>(node, {
		type: 'UnaryExpression',
		operator,
		prefix: true,
		argument: convertExpression(node.expression)
	});
}

function convertBinaryExpression(node: ts.BinaryExpression): ESTree.BinaryExpression | ESTree.LogicalExpression {
	if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken || node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
		return wrap<ESTree.LogicalExpression>(node, {
			type: 'LogicalExpression',
			operator: node.operatorToken.getText(),
			left: convertExpression(node.left),
			right: convertExpression(node.right)
		});
	}
	return wrap<ESTree.BinaryExpression>(node, {
		type: 'BinaryExpression',
		operator: node.operatorToken.getText(),
		left: convertExpression(node.left),
		right: convertExpression(node.right)
	});
}

function convertConditionalExpression(node: ts.ConditionalExpression) {
	return wrap<ESTree.ConditionalExpression>(node, {
		type: 'ConditionalExpression',
		test: convertExpression(node.condition),
		consequent: convertExpression(node.whenTrue),
		alternate: convertExpression(node.whenFalse)
	});
}

function convertFunctionLikeDeclaration(node: ts.FunctionLikeDeclaration) {
	return wrap<ESTree.FunctionExpression>(node, {
		type: 'FunctionExpression',
		id: node.name ? convertIdentifier(<ts.Identifier>node.name) : null,
		params: node.parameters.map(convertParameterDeclaration),
		body: convertFunctionBody(node.body),
		generator: !!node.asteriskToken
	});
}

function convertFunctionDeclaration(node: ts.FunctionDeclaration) {
	return wrap<ESTree.FunctionDeclaration>(node, {
		type: 'FunctionDeclaration',
		id: convertIdentifier(node.name),
		params: node.parameters.map(convertParameterDeclaration),
		body: convertBlock(node.body),
		generator: !!node.asteriskToken
	});
}

function convertFunctionBody(node: ts.Block | ts.Expression) {
	return node.kind === ts.SyntaxKind.Block ? convertBlock(<ts.Block>node) : convertExpression(<ts.Expression>node);
}

function convertParameterDeclaration(node: ts.ParameterDeclaration): ESTree.Pattern {
	var name = convertDeclarationName(node.name);
	if (node.dotDotDotToken) {
		return wrap<ESTree.RestElement>(node, {
			type: 'RestElement',
			argument: name
		});
	} else if (node.initializer) {
		return wrap<ESTree.AssignmentPattern>(node, {
			type: 'AssignmentPattern',
			left: name,
			right: convertExpression(node.initializer)
		});
	} else {
		return name;
	}
}

function convertIfStatement(node: ts.IfStatement) {
	return wrap<ESTree.IfStatement>(node, {
		type: 'IfStatement',
		test: convertExpression(node.expression),
		consequent: convertStatement(node.thenStatement),
		alternate: convertNullable(node.elseStatement, convertStatement)
	});
}

type ts_WhileStatement = ts.WhileStatement | ts.DoStatement;

function convertWhileStatement(node: ts_WhileStatement) {
	return wrap<ESTree.WhileStatement | ESTree.DoWhileStatement>(node, {
		type: node.kind === ts.SyntaxKind.WhileStatement ? 'WhileStatement' : 'DoWhileStatement',
		test: convertExpression(node.expression),
		body: convertStatement(node.statement)
	});
}

function convertVariableDeclarationOrExpression(node: ts.VariableDeclarationList | ts.Expression): ESTree.VariableDeclaration | ESTree.Expression {
	return node.kind === ts.SyntaxKind.VariableDeclarationList
		? wrapPos<ESTree.VariableDeclaration>(node.getSourceFile(), node, {
			type: 'VariableDeclaration',
			kind: 'var',
			declarations: (<ts.VariableDeclarationList>node).declarations.map(convertVariableDeclaration)
		})
		: convertExpression(<ts.Expression>node);
}

function convertForStatement(node: ts.ForStatement) {
	return wrap<ESTree.ForStatement>(node, {
		type: 'ForStatement',
		init: convertNullable(node.initializer, convertVariableDeclarationOrExpression),
		test: convertNullable(node.condition, convertExpression),
		update: convertNullable(node.incrementor, convertExpression),
		body: convertStatement(node.statement)
	});
}

function convertForInStatement(node: ts.ForInStatement) {
	return wrap<ESTree.ForInStatement>(node, {
		type: 'ForInStatement',
		left: convertVariableDeclarationOrExpression(node.initializer),
		right: convertExpression(node.expression),
		body: convertStatement(node.statement)
	});
}

function convertWithStatement(node: ts.WithStatement) {
	return wrap<ESTree.WithStatement>(node, {
		type: 'WithStatement',
		object: convertExpression(node.expression),
		body: convertStatement(node.statement)
	});
}

type ts_CallOrNewExpression = ts.CallExpression | ts.NewExpression;

function convertCallOrNewExpression(node: ts_CallOrNewExpression) {
	return wrap<ESTree.CallExpression | ESTree.NewExpression>(node, {
		type: node.kind === ts.SyntaxKind.CallExpression ? 'CallExpression' : 'NewExpression',
		callee: convertExpression(node.expression),
		arguments: node.arguments ? node.arguments.map(convertExpression) : []
	});
}

function convertArrayLiteralExpression(node: ts.ArrayLiteralExpression) {
	return wrap<ESTree.ArrayExpression>(node, {
		type: 'ArrayExpression',
		elements: node.elements.map(convertExpression)
	});
}

function convertObjectLiteralExpression(node: ts.ObjectLiteralExpression) {
	return wrap<ESTree.ObjectExpression>(node, {
		type: 'ObjectExpression',
		properties: node.properties.map(convertObjectLiteralElement)
	});
}

function convertObjectLiteralElement(node: ts.ObjectLiteralElement) {
	switch (node.kind) {
		case ts.SyntaxKind.ShorthandPropertyAssignment:
		case ts.SyntaxKind.PropertyAssignment:
		case ts.SyntaxKind.MethodDeclaration:
			return convertObjectLiteralPropertyElement(<ts_ObjectLiteralPropertyElement>node);

		case ts.SyntaxKind.GetAccessor:
		case ts.SyntaxKind.SetAccessor:
			return convertObjectLiteralFunctionLikeElement(<ts_ObjectLiteralFunctionLikeElement>node);

		default:
			unexpected(node);
	}
}

type ts_ObjectLiteralPropertyElement = ts.ShorthandPropertyAssignment | ts.PropertyAssignment;

function convertObjectLiteralPropertyElement(node: ts_ObjectLiteralPropertyElement) {
	var isShorthand = node.kind === ts.SyntaxKind.ShorthandPropertyAssignment;
	return wrap<ESTree.Property>(node, {
		type: 'Property',
		key: convertDeclarationName(node.name),
		value: (
			isShorthand
				? convertIdentifier((<ts.ShorthandPropertyAssignment>node).name)
				: convertExpression((<ts.PropertyAssignment>node).initializer)
			),
		kind: 'init',
		method: false,
		shorthand: isShorthand,
		computed: node.name.kind === ts.SyntaxKind.ComputedPropertyName
	});
}

function convertObjectBindingElement(node: ts.BindingElement) {
	var isShorthand = node.kind === ts.SyntaxKind.ShorthandPropertyAssignment;
	var value = isShorthand
		? convertDeclarationName(node.name)
		: convertExpression(node.initializer);
	if (node.initializer) {
		value = <ESTree.AssignmentPattern>{
			type: 'AssignmentPattern',
			left: value,
			right: convertExpression(node.initializer)
		};
	}
	return wrap<ESTree.Property>(node, {
		type: 'Property',
		key: convertDeclarationName(node.name),
		value,
		kind: 'init',
		method: false,
		shorthand: isShorthand,
		computed: node.name.kind === ts.SyntaxKind.ComputedPropertyName
	});
}

type ts_ObjectLiteralFunctionLikeElement = ts.MethodDeclaration | ts.AccessorDeclaration;

function convertObjectLiteralFunctionLikeElement(node: ts_ObjectLiteralFunctionLikeElement) {
	return wrap<ESTree.Property>(node, {
		type: 'Property',
		key: convertDeclarationName(node.name),
		value: convertFunctionLikeDeclaration(node),
		kind: node.kind === ts.SyntaxKind.GetAccessor ? 'get' : node.kind === ts.SyntaxKind.SetAccessor ? 'set' : 'init',
		method: node.kind === ts.SyntaxKind.MethodDeclaration,
		shorthand: false,
		computed: node.name.kind === ts.SyntaxKind.ComputedPropertyName
	});
}

function convertUnaryOperator(op: ts.SyntaxKind): ESTree.UnaryOperator {
	switch (op) {
		case ts.SyntaxKind.MinusToken:
			return "-";

		case ts.SyntaxKind.PlusToken:
			return "+";

		case ts.SyntaxKind.ExclamationToken:
			return "!";

		case ts.SyntaxKind.TildeToken:
			return "~";

		default:
			throw new TypeError(`Unknown unary operator: ${SyntaxName[op]}`);
	}
}

function tryConvertUpdateOperator(op: ts.SyntaxKind): ESTree.UpdateOperator {
	switch (op) {
		case ts.SyntaxKind.PlusPlusToken:
			return "++";

		case ts.SyntaxKind.MinusMinusToken:
			return "--";
	}
}
/// <reference path="typings/node/node.d.ts" />
/// <reference path="node_modules/typescript/bin/typescript.d.ts" />
/// <reference path="typings/estree/estree.d.ts" />
/// <reference path="typings/estree/flow.d.ts" />
var ts = require('typescript');
var SyntaxName = ts.SyntaxKind;
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
].forEach(function (aliasName) {
    var kind = ts.SyntaxKind[aliasName];
    for (var properName in SyntaxName) {
        if (aliasName !== properName && ts.SyntaxKind[properName] === kind) {
            SyntaxName[kind] = properName;
            return;
        }
    }
});
function convertPosition(sourceFile, pos) {
    var _a = sourceFile.getLineAndCharacterOfPosition(pos), line = _a.line, column = _a.character;
    line++; // TypeScript uses 0-based lines while ESTree uses 1-based
    return { line: line, column: column };
}
function unexpected(node) {
    var _a = convertPosition(node.getSourceFile(), node.pos), line = _a.line, column = _a.column;
    throw new TypeError("Unexpected node type " + SyntaxName[node.kind] + " (" + line + ":" + column + ")");
}
function wrapPos(owner, range, props) {
    var sourceFile = owner.getSourceFile();
    props.loc = {
        source: sourceFile.fileName,
        start: convertPosition(sourceFile, range.pos),
        end: convertPosition(sourceFile, range.end)
    };
    props.range = [range.pos, range.end];
    return props;
}
function wrap(node, props) {
    return wrapPos(node, {
        pos: node.getStart(),
        end: node.getEnd()
    }, props);
}
function convertNullable(node, convert) {
    return node != null ? convert(node) : null;
}
function convertClassLikeDeclaration(node, asExpression) {
    var superClass = null;
    (node.heritageClauses || []).some(function (clause) {
        if (clause.token === 77 /* ExtendsKeyword */) {
            superClass = convertExpression(clause.types[0].expression);
            return true;
        }
        else {
            return false;
        }
    });
    return wrap(node, {
        type: asExpression ? 'ClassExpression' : 'ClassDeclaration',
        id: asExpression ? convertNullable(node.name, convertIdentifier) : convertIdentifier(node.name),
        superClass: superClass,
        body: wrapPos(node, node.members, {
            type: 'ClassBody',
            body: node.members.filter(function (element) { return element.kind !== ts.SyntaxKind.SemicolonClassElement; }).map(convertClassElement)
        })
    });
}
function convertClassElement(node) {
    if (node.kind === 131 /* IndexSignature */) {
        // TODO
        unexpected(node);
    }
    return convertFunctionLikeClassElement(node);
}
function convertFunctionLikeClassElement(node) {
    var kind;
    switch (node.kind) {
        case ts.SyntaxKind.MethodDeclaration:
            kind = 'method';
            break;
        case 126 /* Constructor */:
            kind = 'constructor';
            break;
        case 127 /* GetAccessor */:
            kind = 'get';
            break;
        case 128 /* SetAccessor */:
            kind = 'set';
            break;
        default: unexpected(node);
    }
    var key;
    if (node.kind !== 126 /* Constructor */) {
        key = convertDeclarationName(node.name);
    }
    else {
        var token = node.getFirstToken();
        key = wrap(token, {
            type: 'Identifier',
            name: token.getText()
        });
    }
    return wrap(node, {
        type: 'MethodDefinition',
        kind: kind,
        key: key,
        value: convertFunctionLikeDeclaration(node, 2 /* Ignore */),
        computed: node.name != null && node.name.kind === 121 /* ComputedPropertyName */,
        static: !!(node.flags & 128 /* Static */)
    });
}
function convertObjectBindingPattern(node) {
    return wrap(node, {
        type: 'ObjectPattern',
        properties: node.elements.map(convertObjectBindingElement)
    });
}
function convertIdentifierOrBindingPattern(node) {
    return node.kind === 63 /* Identifier */
        ? convertIdentifier(node)
        : convertBindingPattern(node);
}
function convertArrayBindingElement(node) {
    if (node.name == null)
        return null;
    var name = convertDeclarationName(node.name);
    if (node.dotDotDotToken) {
        return wrap(node, {
            type: 'RestElement',
            argument: name
        });
    }
    else if (node.initializer) {
        return wrap(node, {
            type: 'AssignmentPattern',
            left: name,
            right: convertExpression(node.initializer)
        });
    }
    else {
        return name;
    }
}
function convertArrayBindingPattern(node) {
    return wrap(node, {
        type: 'ArrayPattern',
        elements: node.elements.map(convertArrayBindingElement)
    });
}
function convertBindingPattern(node) {
    switch (node.kind) {
        case ts.SyntaxKind.ObjectBindingPattern:
            return convertObjectBindingPattern(node);
        case ts.SyntaxKind.ArrayBindingPattern:
            return convertArrayBindingPattern(node);
        default:
            unexpected(node);
    }
}
function convertExpressionAsBindingPattern(node) {
    switch (node.kind) {
        case 142 /* ObjectLiteralExpression */:
            return wrap(node, {
                type: 'ObjectPattern',
                properties: node.properties.map(function (node) {
                    switch (node.kind) {
                        case 199 /* ShorthandPropertyAssignment */:
                        case 198 /* PropertyAssignment */: {
                            var isShorthand = node.kind === 199 /* ShorthandPropertyAssignment */;
                            return wrap(node, {
                                type: 'Property',
                                key: convertDeclarationName(node.name),
                                value: (isShorthand
                                    ? convertIdentifier(node.name)
                                    : convertExpressionAsBindingPattern(node.initializer)),
                                kind: 'init',
                                method: false,
                                shorthand: isShorthand,
                                computed: node.name.kind === 121 /* ComputedPropertyName */
                            });
                        }
                        default:
                            unexpected(node);
                    }
                })
            });
        case 141 /* ArrayLiteralExpression */:
            return wrap(node, {
                type: 'ArrayPattern',
                elements: node.elements.map(function (elem) { return convertNullable(elem, convertExpressionAsBindingPattern); })
            });
        case 63 /* Identifier */:
            return convertIdentifier(node);
        case 144 /* ElementAccessExpression */:
            return wrap(node, {
                type: 'MemberExpression',
                object: convertExpressionAsBindingPattern(node.expression),
                property: convertExpression(node.argumentExpression),
                computed: true
            });
        case 143 /* PropertyAccessExpression */:
            return wrap(node, {
                type: 'MemberExpression',
                object: convertExpressionAsBindingPattern(node.expression),
                property: convertIdentifier(node.name),
                computed: false
            });
        default:
            unexpected(node);
    }
}
function convertDeclarationName(node) {
    switch (node.kind) {
        case 121 /* ComputedPropertyName */:
            return convertExpression(node.expression);
        case ts.SyntaxKind.ObjectBindingPattern:
        case ts.SyntaxKind.ArrayBindingPattern:
            return convertBindingPattern(node);
        default:
            return convertExpression(node);
    }
}
function convertPropertyDeclaration(node) {
    // TODO
    unexpected(node);
}
function convertLiteral(node) {
    var raw = node.getText();
    switch (node.kind) {
        case 78 /* FalseKeyword */:
        case 93 /* TrueKeyword */:
            return wrap(node, {
                type: 'Literal',
                value: node.kind === 93 /* TrueKeyword */,
                raw: raw
            });
        case 6 /* NumericLiteral */:
            return wrap(node, {
                type: 'Literal',
                value: Number(node.text),
                raw: raw
            });
        case 9 /* NoSubstitutionTemplateLiteral */:
            return wrap(node, {
                type: 'TemplateLiteral',
                quasis: [wrapPos(node, {
                        pos: node.getStart() + 1,
                        end: node.getEnd() - 1
                    }, {
                        type: 'TemplateElement',
                        value: {
                            cooked: node.text,
                            raw: raw.slice(1, -1)
                        },
                        tail: true
                    })],
                expressions: []
            });
        case 7 /* StringLiteral */:
            return wrap(node, {
                type: 'Literal',
                value: node.text,
                raw: raw
            });
        case 8 /* RegularExpressionLiteral */: {
            var _a = raw.match(/^\/(.*)\/([a-z]*)$/), pattern = _a[1], flags = _a[2];
            var value;
            try {
                value = new RegExp(pattern, flags);
            }
            catch (e) {
                value = null;
            }
            return wrap(node, {
                type: 'Literal',
                value: value,
                raw: raw,
                regex: {
                    pattern: pattern,
                    flags: flags
                }
            });
        }
        case 87 /* NullKeyword */:
            return wrap(node, {
                type: 'Literal',
                value: null,
                raw: raw
            });
        default:
            unexpected(node);
    }
}
function convertTemplateSpanLiteral(node, isFirst, isLast) {
    return wrapPos(node, {
        pos: node.getStart() + 1,
        end: node.getEnd() - (isLast ? 1 : 2)
    }, {
        type: 'TemplateElement',
        value: {
            cooked: node.text,
            raw: node.getText().slice(1, isLast ? -1 : -2)
        },
        tail: isLast
    });
}
function convertTemplateExpression(node) {
    var spansCount = node.templateSpans.length;
    var quasis = [convertTemplateSpanLiteral(node.head, true, spansCount === 0)];
    var expressions = [];
    node.templateSpans.forEach(function (_a, i) {
        var expression = _a.expression, literal = _a.literal;
        expressions.push(convertExpression(expression));
        quasis.push(convertTemplateSpanLiteral(literal, false, i === spansCount - 1));
    });
    return wrap(node, {
        type: 'TemplateLiteral',
        quasis: quasis,
        expressions: expressions
    });
}
function convertTaggedTemplateExpression(node) {
    var tmpl = node.template;
    return wrap(node, {
        type: 'TaggedTemplateExpression',
        tag: convertExpression(node.tag),
        quasi: tmpl.kind === 159 /* TemplateExpression */
            ? convertTemplateExpression(tmpl)
            : convertLiteral(tmpl)
    });
}
function convertExpressionStatement(node) {
    return wrap(node, {
        type: 'ExpressionStatement',
        expression: convertExpression(node.expression)
    });
}
function convertTopStatement(node) {
    if (node.flags & 1 /* Export */) {
        if (node.flags & ts.NodeFlags.Default) {
            var declaration;
            switch (node.kind) {
                case 184 /* FunctionDeclaration */:
                    declaration = convertFunction(node, node.name ? 'FunctionDeclaration' : 'FunctionExpression', 0 /* AllowMissing */);
                    break;
                case 185 /* ClassDeclaration */:
                    declaration = convertClassLikeDeclaration(node, !node.name);
                    break;
                default:
                    unexpected(node);
            }
            return wrap(node, {
                type: 'ExportDefaultDeclaration',
                declaration: declaration
            });
        }
        else {
            return wrap(node, {
                type: 'ExportNamedDeclaration',
                declaration: convertStatement(node),
                specifiers: [],
                source: null
            });
        }
    }
    switch (node.kind) {
        case 191 /* ImportDeclaration */:
            return convertImportDeclaration(node);
        case ts.SyntaxKind.ExportDeclaration:
            return convertExportDeclaration(node);
        case 192 /* ExportAssignment */:
            return convertExportAssignment(node);
        default:
            return convertStatement(node);
    }
}
function convertImportDeclaration(node) {
    if (node.moduleSpecifier.kind !== 7 /* StringLiteral */) {
        unexpected(node.moduleSpecifier);
    }
    return wrap(node, {
        type: 'ImportDeclaration',
        specifiers: convertImportClause(node.importClause),
        source: convertLiteral(node.moduleSpecifier)
    });
}
function convertImportClause(node) {
    var specifiers = [];
    if (node == null)
        return specifiers;
    var name = node.name, namedBindings = node.namedBindings;
    if (name) {
        specifiers.push(wrap(name, {
            type: 'ImportDefaultSpecifier',
            local: convertIdentifier(name)
        }));
    }
    if (namedBindings) {
        switch (namedBindings.kind) {
            case ts.SyntaxKind.NamespaceImport:
                specifiers.push(wrap(namedBindings, {
                    type: 'ImportNamespaceSpecifier',
                    local: convertIdentifier(namedBindings.name)
                }));
                break;
            case ts.SyntaxKind.NamedImports:
                specifiers = specifiers.concat(namedBindings.elements.map(function (binding) {
                    return wrap(binding, {
                        type: 'ImportSpecifier',
                        local: convertIdentifier(binding.name),
                        imported: convertIdentifier(binding.propertyName || binding.name)
                    });
                }));
                break;
            default:
                unexpected(node.namedBindings);
        }
    }
    return specifiers;
}
function convertExportDeclaration(node) {
    var source;
    if (node.moduleSpecifier) {
        if (node.moduleSpecifier.kind !== 7 /* StringLiteral */) {
            unexpected(node.moduleSpecifier);
        }
        source = convertLiteral(node.moduleSpecifier);
    }
    else {
        source = null;
    }
    if (!node.exportClause) {
        return wrap(node, {
            type: 'ExportAllDeclaration',
            source: source
        });
    }
    else {
        return wrap(node, {
            type: 'ExportNamedDeclaration',
            declaration: null,
            specifiers: node.exportClause.elements.map(function (element) {
                return wrap(element, {
                    type: 'ExportSpecifier',
                    local: convertIdentifier(element.propertyName || element.name),
                    exported: convertIdentifier(element.name)
                });
            }),
            source: source
        });
    }
}
function convertExportAssignment(node) {
    return wrap(node, {
        type: 'ExportDefaultDeclaration',
        declaration: convertExpression(node.expression)
    });
}
function convertStatement(node) {
    switch (node.kind) {
        case 163 /* Block */:
            return convertBlock(node);
        case 164 /* VariableStatement */:
            return convertVariableStatement(node);
        case 176 /* SwitchStatement */:
            return convertSwitchStatement(node);
        case 179 /* TryStatement */:
            return convertTryStatement(node);
        case 184 /* FunctionDeclaration */:
            return convertFunctionDeclaration(node);
        case 185 /* ClassDeclaration */:
            return convertClassLikeDeclaration(node);
        case 182 /* DebuggerStatement */:
            return wrap(node, { type: 'DebuggerStatement' });
        case 165 /* EmptyStatement */:
            return wrap(node, { type: 'EmptyStatement' });
        case 173 /* BreakStatement */:
        case 172 /* ContinueStatement */:
            return convertBreakOrContinuteStatement(node);
        case 174 /* ReturnStatement */:
            return convertReturnStatement(node);
        case 177 /* LabeledStatement */:
            return convertLabeledStatement(node);
        case 178 /* ThrowStatement */:
            return convertThrowStatement(node);
        case 166 /* ExpressionStatement */:
            return convertExpressionStatement(node);
        case 175 /* WithStatement */:
            return convertWithStatement(node);
        case 171 /* ForInStatement */:
        case ts.SyntaxKind.ForOfStatement:
            return convertForInOrOfStatement(node);
        case 170 /* ForStatement */:
            return convertForStatement(node);
        case 169 /* WhileStatement */:
        case 168 /* DoStatement */:
            return convertWhileStatement(node);
        case 167 /* IfStatement */:
            return convertIfStatement(node);
        default:
            unexpected(node);
    }
}
function convertThrowStatement(node) {
    return wrap(node, {
        type: 'ThrowStatement',
        argument: convertExpression(node.expression)
    });
}
function convertBreakOrContinuteStatement(node) {
    return wrap(node, {
        type: node.kind === 173 /* BreakStatement */ ? 'BreakStatement' : 'ContinueStatement',
        label: convertNullable(node.label, convertIdentifier)
    });
}
function convertReturnStatement(node) {
    return wrap(node, {
        type: 'ReturnStatement',
        argument: convertNullable(node.expression, convertExpression)
    });
}
function convertExpression(node) {
    switch (node.kind) {
        case 161 /* OmittedExpression */:
            return null;
        case 91 /* ThisKeyword */:
            return wrap(node, { type: 'ThisExpression' });
        case 89 /* SuperKeyword */:
            return wrap(node, { type: 'Super' });
        case 63 /* Identifier */:
            return convertIdentifier(node);
        case 157 /* BinaryExpression */:
            return convertBinaryExpression(node);
        case 155 /* PrefixUnaryExpression */:
        case 156 /* PostfixUnaryExpression */:
            return convertPrefixOrPostfixUnaryExpression(node);
        case 152 /* DeleteExpression */:
        case 153 /* TypeOfExpression */:
        case 154 /* VoidExpression */:
            return convertNamedUnaryExpression(node);
        case 158 /* ConditionalExpression */:
            return convertConditionalExpression(node);
        case 145 /* CallExpression */:
        case 146 /* NewExpression */:
            return convertCallOrNewExpression(node);
        case 149 /* ParenthesizedExpression */:
            return convertExpression(node.expression);
        case 141 /* ArrayLiteralExpression */:
            return convertArrayLiteralExpression(node);
        case 142 /* ObjectLiteralExpression */:
            return convertObjectLiteralExpression(node);
        case 151 /* ArrowFunction */:
            return convertArrowFunction(node);
        case 150 /* FunctionExpression */:
            return convertFunctionLikeDeclaration(node);
        case ts.SyntaxKind.ClassExpression:
            return convertClassLikeDeclaration(node);
        case 143 /* PropertyAccessExpression */:
            return convertPropertyAccessExpression(node);
        case 144 /* ElementAccessExpression */:
            return convertElementAccessExpression(node);
        case 159 /* TemplateExpression */:
            return convertTemplateExpression(node);
        case ts.SyntaxKind.SpreadElementExpression:
            return convertSpreadElementExpression(node);
        case 160 /* YieldExpression */:
            return convertYieldExpression(node);
        case 147 /* TaggedTemplateExpression */:
            return convertTaggedTemplateExpression(node);
        default:
            return convertLiteral(node);
    }
}
function convertSpreadElementExpression(node) {
    return wrap(node, {
        type: 'SpreadElement',
        argument: convertExpression(node.expression)
    });
}
function convertPropertyAccessExpression(node) {
    return wrap(node, {
        type: 'MemberExpression',
        object: convertExpression(node.expression),
        property: convertIdentifier(node.name),
        computed: false
    });
}
function convertElementAccessExpression(node) {
    return wrap(node, {
        type: 'MemberExpression',
        object: convertExpression(node.expression),
        property: convertExpression(node.argumentExpression),
        computed: true
    });
}
function convertSourceFile(node) {
    return wrapPos(node, node, {
        type: 'Program',
        body: node.statements.map(convertTopStatement),
        sourceType: 'module'
    });
}
exports.convertSourceFile = convertSourceFile;
function checkAndConvert(input, options) {
    options = options ? ts.clone(options) : ts.getDefaultCompilerOptions();
    options.noLib = true;
    options.noResolve = true;
    var inputFileName = "module.ts";
    var sourceFile = ts.createSourceFile(inputFileName, input, options.target);
    // Create a compilerHost object to allow the compiler to read and write files
    var program = ts.createProgram([inputFileName], options, {
        getSourceFile: function (fileName, target) { return fileName === inputFileName ? sourceFile : undefined; },
        writeFile: function (name, text, writeByteOrderMark) {
            throw new Error("Not implemented");
        },
        getDefaultLibFileName: function () { return "lib.d.ts"; },
        useCaseSensitiveFileNames: function () { return true; },
        getCanonicalFileName: function (fileName) { return fileName; },
        getCurrentDirectory: function () { return ""; },
        getNewLine: function () { return "\n"; }
    });
    program.getSemanticDiagnostics();
    return convertSourceFile(sourceFile);
}
exports.checkAndConvert = checkAndConvert;
function convertVariableStatement(node) {
    var _a = node.declarationList, flags = _a.flags, declarations = _a.declarations;
    return wrap(node, {
        type: 'VariableDeclaration',
        kind: (flags & 4096 /* Const */) ? 'const' : (flags & 2048 /* Let */) ? 'let' : 'var',
        declarations: declarations.map(convertVariableDeclaration)
    });
}
function convertVariableDeclaration(node) {
    return wrap(node, {
        type: 'VariableDeclarator',
        id: convertDeclarationName(node.name),
        init: convertNullable(node.initializer, convertExpression)
    });
}
function convertSwitchStatement(node) {
    return wrap(node, {
        type: 'SwitchStatement',
        discriminant: convertExpression(node.expression),
        cases: node.caseBlock.clauses.map(convertCaseOrDefaultClause)
    });
}
function convertCaseOrDefaultClause(node) {
    return wrap(node, {
        type: 'SwitchCase',
        test: node.kind === 194 /* CaseClause */ ? convertExpression(node.expression) : null,
        consequent: node.statements.map(convertStatement)
    });
}
function convertLabeledStatement(node) {
    return wrap(node, {
        type: 'LabeledStatement',
        label: convertIdentifier(node.label),
        body: convertStatement(node.statement)
    });
}
function convertIdentifier(node) {
    return wrap(node, {
        type: 'Identifier',
        name: node.text
    });
}
function convertBlock(node) {
    return wrap(node, {
        type: 'BlockStatement',
        body: node.statements.map(convertStatement)
    });
}
function convertTryStatement(node) {
    return wrap(node, {
        type: 'TryStatement',
        block: convertBlock(node.tryBlock),
        handler: convertNullable(node.catchClause, convertCatchClause),
        finalizer: convertNullable(node.finallyBlock, convertBlock)
    });
}
function convertCatchClause(node) {
    return wrap(node, {
        type: 'CatchClause',
        param: convertDeclarationName(node.variableDeclaration.name),
        body: convertBlock(node.block)
    });
}
function convertYieldExpression(node) {
    return wrap(node, {
        type: 'YieldExpression',
        argument: convertNullable(node.expression, convertExpression),
        delegate: !!node.asteriskToken
    });
}
function convertPrefixOrPostfixUnaryExpression(node) {
    var operator = tryConvertUpdateOperator(node.operator);
    var isUnary = operator === undefined;
    if (isUnary) {
        operator = convertUnaryOperator(node.operator);
    }
    return wrap(node, {
        type: isUnary ? 'UnaryExpression' : 'UpdateExpression',
        operator: operator,
        prefix: node.kind === 155 /* PrefixUnaryExpression */,
        argument: convertExpression(node.operand)
    });
}
function convertNamedUnaryExpression(node) {
    var operator;
    switch (node.kind) {
        case 152 /* DeleteExpression */:
            operator = "delete";
            break;
        case 153 /* TypeOfExpression */:
            operator = "typeof";
            break;
        case 154 /* VoidExpression */:
            operator = "void";
            break;
        default:
            unexpected(node);
    }
    return wrap(node, {
        type: 'UnaryExpression',
        operator: operator,
        prefix: true,
        argument: convertExpression(node.expression)
    });
}
function convertBinaryExpression(node) {
    switch (node.operatorToken.kind) {
        case 48 /* BarBarToken */:
        case 47 /* AmpersandAmpersandToken */:
            return wrap(node, {
                type: 'LogicalExpression',
                operator: node.operatorToken.getText(),
                left: convertExpression(node.left),
                right: convertExpression(node.right)
            });
        case 22 /* CommaToken */: {
            var expressions = [];
            var expr = node;
            do {
                expressions.unshift(convertExpression(expr.right));
                expr = expr.left;
            } while (expr.kind === 157 /* BinaryExpression */ && expr.operatorToken.kind === 22 /* CommaToken */);
            expressions.unshift(convertExpression(expr));
            return wrap(node, {
                type: 'SequenceExpression',
                expressions: expressions
            });
        }
        default:
            if (isAssignmentOperator(node.operatorToken.kind)) {
                return wrap(node, {
                    type: 'AssignmentExpression',
                    operator: node.operatorToken.getText(),
                    left: convertExpressionAsBindingPattern(node.left),
                    right: convertExpression(node.right)
                });
            }
            else {
                return wrap(node, {
                    type: 'BinaryExpression',
                    operator: node.operatorToken.getText(),
                    left: convertExpression(node.left),
                    right: convertExpression(node.right)
                });
            }
    }
}
function convertConditionalExpression(node) {
    return wrap(node, {
        type: 'ConditionalExpression',
        test: convertExpression(node.condition),
        consequent: convertExpression(node.whenTrue),
        alternate: convertExpression(node.whenFalse)
    });
}
function convertFunction(node, type, idBehavior, allowExpressionBody) {
    var body = node.body;
    if (body.kind !== 163 /* Block */ && !allowExpressionBody) {
        unexpected(body);
    }
    return wrap(node, {
        type: type,
        id: idBehavior === 1 /* Enforce */ || idBehavior === 0 /* AllowMissing */ && node.name ? convertIdentifier(node.name) : null,
        params: node.parameters.map(convertParameterDeclaration),
        body: body.kind === 163 /* Block */ ? convertBlock(body) : convertExpression(body),
        generator: !!node.asteriskToken
    });
}
function convertFunctionLikeDeclaration(node, idBehavior) {
    if (idBehavior === void 0) { idBehavior = 0 /* AllowMissing */; }
    return convertFunction(node, 'FunctionExpression', idBehavior);
}
function convertArrowFunction(node) {
    var arrowFn = convertFunction(node, 'ArrowFunctionExpression', 2 /* Ignore */, true);
    arrowFn.expression = node.body.kind !== 163 /* Block */;
    return arrowFn;
}
function convertFunctionDeclaration(node) {
    return convertFunction(node, 'FunctionDeclaration', 1 /* Enforce */);
}
function convertParameterDeclaration(node) {
    var name = convertDeclarationName(node.name);
    if (node.dotDotDotToken) {
        return wrap(node, {
            type: 'RestElement',
            argument: name
        });
    }
    else if (node.initializer) {
        return wrap(node, {
            type: 'AssignmentPattern',
            left: name,
            right: convertExpression(node.initializer)
        });
    }
    else {
        return name;
    }
}
function convertIfStatement(node) {
    return wrap(node, {
        type: 'IfStatement',
        test: convertExpression(node.expression),
        consequent: convertStatement(node.thenStatement),
        alternate: convertNullable(node.elseStatement, convertStatement)
    });
}
function convertWhileStatement(node) {
    return wrap(node, {
        type: node.kind === 169 /* WhileStatement */ ? 'WhileStatement' : 'DoWhileStatement',
        test: convertExpression(node.expression),
        body: convertStatement(node.statement)
    });
}
function convertVariableDeclarationOrExpression(node) {
    return node.kind === ts.SyntaxKind.VariableDeclarationList
        ? wrapPos(node, node, {
            type: 'VariableDeclaration',
            kind: 'var',
            declarations: node.declarations.map(convertVariableDeclaration)
        })
        : convertExpression(node);
}
function convertForStatement(node) {
    return wrap(node, {
        type: 'ForStatement',
        init: convertNullable(node.initializer, convertVariableDeclarationOrExpression),
        test: convertNullable(node.condition, convertExpression),
        update: convertNullable(node.incrementor, convertExpression),
        body: convertStatement(node.statement)
    });
}
function convertForInOrOfStatement(node) {
    return wrap(node, {
        type: node.kind === 171 /* ForInStatement */ ? 'ForInStatement' : 'ForOfStatement',
        left: convertVariableDeclarationOrExpression(node.initializer),
        right: convertExpression(node.expression),
        body: convertStatement(node.statement)
    });
}
function convertWithStatement(node) {
    return wrap(node, {
        type: 'WithStatement',
        object: convertExpression(node.expression),
        body: convertStatement(node.statement)
    });
}
function convertCallOrNewExpression(node) {
    return wrap(node, {
        type: node.kind === 145 /* CallExpression */ ? 'CallExpression' : 'NewExpression',
        callee: convertExpression(node.expression),
        arguments: node.arguments ? node.arguments.map(convertExpression) : []
    });
}
function convertArrayLiteralExpression(node) {
    return wrap(node, {
        type: 'ArrayExpression',
        elements: node.elements.map(convertExpression)
    });
}
function convertObjectLiteralExpression(node) {
    return wrap(node, {
        type: 'ObjectExpression',
        properties: node.properties.map(convertObjectLiteralElement)
    });
}
function convertObjectLiteralElement(node) {
    switch (node.kind) {
        case 199 /* ShorthandPropertyAssignment */:
        case 198 /* PropertyAssignment */:
            return convertObjectLiteralPropertyElement(node);
        case ts.SyntaxKind.MethodDeclaration:
        case 127 /* GetAccessor */:
        case 128 /* SetAccessor */:
            return convertObjectLiteralFunctionLikeElement(node);
        default:
            unexpected(node);
    }
}
function convertObjectLiteralPropertyElement(node) {
    var isShorthand = node.kind === 199 /* ShorthandPropertyAssignment */;
    return wrap(node, {
        type: 'Property',
        key: convertDeclarationName(node.name),
        value: (isShorthand
            ? convertIdentifier(node.name)
            : convertExpression(node.initializer)),
        kind: 'init',
        method: false,
        shorthand: isShorthand,
        computed: node.name.kind === 121 /* ComputedPropertyName */
    });
}
function convertObjectBindingElement(node) {
    var isShorthand = !node.propertyName;
    var value = convertIdentifierOrBindingPattern(node.name);
    if (node.initializer) {
        value = {
            type: 'AssignmentPattern',
            left: value,
            right: convertExpression(node.initializer)
        };
    }
    return wrap(node, {
        type: 'Property',
        key: convertIdentifierOrBindingPattern(node.propertyName || node.name),
        value: value,
        kind: 'init',
        method: false,
        shorthand: isShorthand,
        computed: node.name.kind === 121 /* ComputedPropertyName */
    });
}
function convertObjectLiteralFunctionLikeElement(node) {
    return wrap(node, {
        type: 'Property',
        key: convertDeclarationName(node.name),
        value: convertFunctionLikeDeclaration(node, 2 /* Ignore */),
        kind: node.kind === 127 /* GetAccessor */ ? 'get' : node.kind === 128 /* SetAccessor */ ? 'set' : 'init',
        method: node.kind === ts.SyntaxKind.MethodDeclaration,
        shorthand: false,
        computed: node.name.kind === 121 /* ComputedPropertyName */
    });
}
function isAssignmentOperator(op) {
    switch (op) {
        case 51 /* EqualsToken */:
        case 52 /* PlusEqualsToken */:
        case 53 /* MinusEqualsToken */:
        case 54 /* AsteriskEqualsToken */:
        case 55 /* SlashEqualsToken */:
        case 56 /* PercentEqualsToken */:
        case 57 /* LessThanLessThanEqualsToken */:
        case 58 /* GreaterThanGreaterThanEqualsToken */:
        case 59 /* GreaterThanGreaterThanGreaterThanEqualsToken */:
        case 61 /* BarEqualsToken */:
        case 62 /* CaretEqualsToken */:
        case 60 /* AmpersandEqualsToken */:
            return true;
        default:
            return false;
    }
}
function convertUnaryOperator(op) {
    switch (op) {
        case 33 /* MinusToken */:
            return "-";
        case 32 /* PlusToken */:
            return "+";
        case 45 /* ExclamationToken */:
            return "!";
        case 46 /* TildeToken */:
            return "~";
        default:
            throw new TypeError("Unknown unary operator: " + SyntaxName[op]);
    }
}
function tryConvertUpdateOperator(op) {
    switch (op) {
        case 37 /* PlusPlusToken */:
            return "++";
        case 38 /* MinusMinusToken */:
            return "--";
    }
}

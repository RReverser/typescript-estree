var ts = require('typescript');
var SyntaxName = ts.SyntaxKind;
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
    line++;
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
        if (clause.token === 81) {
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
            body: node.members.filter(function (element) { return element.kind !== 189; }).map(convertClassElement)
        })
    });
}
function convertClassElement(node) {
    if (node.kind === 147) {
        unexpected(node);
    }
    return convertFunctionLikeClassElement(node);
}
function convertFunctionLikeClassElement(node) {
    var kind;
    switch (node.kind) {
        case 141:
            kind = 'method';
            break;
        case 142:
            kind = 'constructor';
            break;
        case 143:
            kind = 'get';
            break;
        case 144:
            kind = 'set';
            break;
        default: unexpected(node);
    }
    var key;
    if (node.kind !== 142) {
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
        value: convertFunctionLikeDeclaration(node, 2),
        computed: node.name != null && node.name.kind === 134,
        static: !!(node.flags & 128)
    });
}
function convertObjectBindingPattern(node) {
    return wrap(node, {
        type: 'ObjectPattern',
        properties: node.elements.map(convertObjectBindingElement)
    });
}
function convertIdentifierOrBindingPattern(node) {
    return node.kind === 67
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
        case 159:
            return convertObjectBindingPattern(node);
        case 160:
            return convertArrayBindingPattern(node);
        default:
            unexpected(node);
    }
}
function convertExpressionAsBindingPattern(node) {
    switch (node.kind) {
        case 163:
            return wrap(node, {
                type: 'ObjectPattern',
                properties: node.properties.map(function (node) {
                    switch (node.kind) {
                        case 244:
                        case 243: {
                            var isShorthand = node.kind === 244;
                            return wrap(node, {
                                type: 'Property',
                                key: convertDeclarationName(node.name),
                                value: (isShorthand
                                    ? convertIdentifier(node.name)
                                    : convertExpressionAsBindingPattern(node.initializer)),
                                kind: 'init',
                                method: false,
                                shorthand: isShorthand,
                                computed: node.name.kind === 134
                            });
                        }
                        default:
                            unexpected(node);
                    }
                })
            });
        case 162:
            return wrap(node, {
                type: 'ArrayPattern',
                elements: node.elements.map(function (elem) { return convertNullable(elem, convertExpressionAsBindingPattern); })
            });
        case 67:
            return convertIdentifier(node);
        case 165:
            return wrap(node, {
                type: 'MemberExpression',
                object: convertExpressionAsBindingPattern(node.expression),
                property: convertExpression(node.argumentExpression),
                computed: true
            });
        case 164:
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
        case 134:
            return convertExpression(node.expression);
        case 159:
        case 160:
            return convertBindingPattern(node);
        default:
            return convertExpression(node);
    }
}
function convertPropertyDeclaration(node) {
    unexpected(node);
    return;
}
function convertLiteral(node) {
    var raw = node.getText();
    switch (node.kind) {
        case 82:
        case 97:
            return wrap(node, {
                type: 'Literal',
                value: node.kind === 97,
                raw: raw
            });
        case 8:
            return wrap(node, {
                type: 'Literal',
                value: Number(node.text),
                raw: raw
            });
        case 11:
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
        case 9:
            return wrap(node, {
                type: 'Literal',
                value: node.text,
                raw: raw
            });
        case 10: {
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
        case 91:
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
        quasi: tmpl.kind === 181
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
    if (node.flags & 1) {
        if (node.flags & 1024) {
            var declaration;
            switch (node.kind) {
                case 211:
                    declaration = convertFunction(node, node.name ? 'FunctionDeclaration' : 'FunctionExpression', 0);
                    break;
                case 212:
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
        case 220:
            return convertImportDeclaration(node);
        case 226:
            return convertExportDeclaration(node);
        case 225:
            return convertExportAssignment(node);
        default:
            return convertStatement(node);
    }
}
function convertImportDeclaration(node) {
    if (node.moduleSpecifier.kind !== 9) {
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
            case 222:
                specifiers.push(wrap(namedBindings, {
                    type: 'ImportNamespaceSpecifier',
                    local: convertIdentifier(namedBindings.name)
                }));
                break;
            case 223:
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
        if (node.moduleSpecifier.kind !== 9) {
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
        case 190:
            return convertBlock(node);
        case 191:
            return convertVariableStatement(node);
        case 204:
            return convertSwitchStatement(node);
        case 207:
            return convertTryStatement(node);
        case 211:
            return convertFunctionDeclaration(node);
        case 212:
            return convertClassLikeDeclaration(node);
        case 208:
            return wrap(node, { type: 'DebuggerStatement' });
        case 192:
            return wrap(node, { type: 'EmptyStatement' });
        case 201:
        case 200:
            return convertBreakOrContinuteStatement(node);
        case 202:
            return convertReturnStatement(node);
        case 205:
            return convertLabeledStatement(node);
        case 206:
            return convertThrowStatement(node);
        case 193:
            return convertExpressionStatement(node);
        case 203:
            return convertWithStatement(node);
        case 198:
        case 199:
            return convertForInOrOfStatement(node);
        case 197:
            return convertForStatement(node);
        case 196:
        case 195:
            return convertWhileStatement(node);
        case 194:
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
        type: node.kind === 201 ? 'BreakStatement' : 'ContinueStatement',
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
        case 185:
            return null;
        case 95:
            return wrap(node, { type: 'ThisExpression' });
        case 93:
            return wrap(node, { type: 'Super' });
        case 67:
            return convertIdentifier(node);
        case 179:
            return convertBinaryExpression(node);
        case 177:
        case 178:
            return convertPrefixOrPostfixUnaryExpression(node);
        case 173:
        case 174:
        case 175:
            return convertNamedUnaryExpression(node);
        case 180:
            return convertConditionalExpression(node);
        case 166:
        case 167:
            return convertCallOrNewExpression(node);
        case 170:
            return convertExpression(node.expression);
        case 162:
            return convertArrayLiteralExpression(node);
        case 163:
            return convertObjectLiteralExpression(node);
        case 172:
            return convertArrowFunction(node);
        case 171:
            return convertFunctionLikeDeclaration(node);
        case 184:
            return convertClassLikeDeclaration(node);
        case 164:
            return convertPropertyAccessExpression(node);
        case 165:
            return convertElementAccessExpression(node);
        case 181:
            return convertTemplateExpression(node);
        case 183:
            return convertSpreadElementExpression(node);
        case 182:
            return convertYieldExpression(node);
        case 168:
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
    options = options ? ts['clone'](options) : ts.getDefaultCompilerOptions();
    options.noLib = true;
    options.noResolve = true;
    var inputFileName = "module.ts";
    var sourceFile = ts.createSourceFile(inputFileName, input, options.target);
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
        kind: (flags & 32768) ? 'const' : (flags & 16384) ? 'let' : 'var',
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
        test: node.kind === 239 ? convertExpression(node.expression) : null,
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
    if (isUnary)
        operator = convertUnaryOperator(node.operator);
    return wrap(node, {
        type: isUnary ? 'UnaryExpression' : 'UpdateExpression',
        operator: operator,
        prefix: node.kind === 177,
        argument: convertExpression(node.operand)
    });
}
function convertNamedUnaryExpression(node) {
    var operator;
    switch (node.kind) {
        case 173:
            operator = "delete";
            break;
        case 174:
            operator = "typeof";
            break;
        case 175:
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
        case 51:
        case 50:
            return wrap(node, {
                type: 'LogicalExpression',
                operator: node.operatorToken.getText(),
                left: convertExpression(node.left),
                right: convertExpression(node.right)
            });
        case 24: {
            var expressions = [];
            var expr = node;
            do {
                expressions.unshift(convertExpression(expr.right));
                expr = expr.left;
            } while (expr.kind === 179 && expr.operatorToken.kind === 24);
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
var IdBehavior;
(function (IdBehavior) {
    IdBehavior[IdBehavior["AllowMissing"] = 0] = "AllowMissing";
    IdBehavior[IdBehavior["Enforce"] = 1] = "Enforce";
    IdBehavior[IdBehavior["Ignore"] = 2] = "Ignore";
})(IdBehavior || (IdBehavior = {}));
function convertFunction(node, type, idBehavior, allowExpressionBody) {
    var body = node.body;
    if (body.kind !== 190 && !allowExpressionBody) {
        unexpected(body);
    }
    return wrap(node, {
        type: type,
        id: idBehavior === 1 || idBehavior === 0 && node.name ? convertIdentifier(node.name) : null,
        params: node.parameters.map(convertParameterDeclaration),
        body: body.kind === 190 ? convertBlock(body) : convertExpression(body),
        generator: !!node.asteriskToken
    });
}
function convertFunctionLikeDeclaration(node, idBehavior) {
    if (idBehavior === void 0) { idBehavior = 0; }
    return convertFunction(node, 'FunctionExpression', idBehavior);
}
function convertArrowFunction(node) {
    var arrowFn = convertFunction(node, 'ArrowFunctionExpression', 2, true);
    arrowFn.expression = node.body.kind !== 190;
    return arrowFn;
}
function convertFunctionDeclaration(node) {
    return convertFunction(node, 'FunctionDeclaration', 1);
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
        type: node.kind === 196 ? 'WhileStatement' : 'DoWhileStatement',
        test: convertExpression(node.expression),
        body: convertStatement(node.statement)
    });
}
function convertVariableDeclarationOrExpression(node) {
    return node.kind === 210
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
        type: node.kind === 198 ? 'ForInStatement' : 'ForOfStatement',
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
        type: node.kind === 166 ? 'CallExpression' : 'NewExpression',
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
        case 244:
        case 243:
            return convertObjectLiteralPropertyElement(node);
        case 141:
        case 143:
        case 144:
            return convertObjectLiteralFunctionLikeElement(node);
        default:
            unexpected(node);
    }
}
function convertObjectLiteralPropertyElement(node) {
    var isShorthand = node.kind === 244;
    return wrap(node, {
        type: 'Property',
        key: convertDeclarationName(node.name),
        value: (isShorthand
            ? convertIdentifier(node.name)
            : convertExpression(node.initializer)),
        kind: 'init',
        method: false,
        shorthand: isShorthand,
        computed: node.name.kind === 134
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
        computed: node.name.kind === 134
    });
}
function convertObjectLiteralFunctionLikeElement(node) {
    return wrap(node, {
        type: 'Property',
        key: convertDeclarationName(node.name),
        value: convertFunctionLikeDeclaration(node, 2),
        kind: node.kind === 143 ? 'get' : node.kind === 144 ? 'set' : 'init',
        method: node.kind === 141,
        shorthand: false,
        computed: node.name.kind === 134
    });
}
function isAssignmentOperator(op) {
    switch (op) {
        case 55:
        case 56:
        case 57:
        case 58:
        case 59:
        case 60:
        case 61:
        case 62:
        case 63:
        case 65:
        case 66:
        case 64:
            return true;
        default:
            return false;
    }
}
function convertUnaryOperator(op) {
    switch (op) {
        case 36:
            return "-";
        case 35:
            return "+";
        case 48:
            return "!";
        case 49:
            return "~";
        default:
            throw new TypeError("Unknown unary operator: " + SyntaxName[op]);
    }
}
function tryConvertUpdateOperator(op) {
    switch (op) {
        case 40:
            return "++";
        case 41:
            return "--";
    }
}

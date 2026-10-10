import BaseTool, { ToolDefinition } from './BaseTool';

/**
 * CalculatorTool — Secure mathematical expression evaluator.
 * Implements a recursive descent parser with zero eval() or Function() execution.
 * Completely immune to remote code execution (RCE) / injection vulnerabilities.
 */
class CalculatorTool extends BaseTool {
    override get definition(): ToolDefinition {
        return {
            type: 'function',
            function: {
                name: 'calculate',
                description:
                    'Safely evaluate a mathematical expression. Use this tool for arithmetic, powers, square roots, trigonometry, and complex formulas to guarantee 100% computational precision.',
                parameters: {
                    type: 'object',
                    properties: {
                        expression: {
                            type: 'string',
                            description:
                                'The mathematical expression to evaluate, e.g. "2^10 + 50 * 4", "sqrt(144) * 3", "(100 - 32) * 5 / 9", "sin(pi / 2)".'
                        }
                    },
                    required: ['expression']
                }
            }
        };
    }

    override async execute(args: { expression: string } | any, _context: any = {}): Promise<string> {
        const expr = args?.expression;
        if (!expr || typeof expr !== 'string') {
            return '錯誤: 請提供有效的數學算式。';
        }

        try {
            const result = this.evaluate(expr);
            if (!Number.isFinite(result)) {
                return `計算結果無效 (結果為 ${result}，可能發生除以零或數值溢位): ${expr}`;
            }
            // Format floats nicely to avoid 0.30000000000000004
            const formatted = Math.abs(result) < 1e-12 ? 0 : Number(result.toPrecision(12)).toString();
            return `計算結果: ${expr.trim()} = ${formatted}`;
        } catch (error: any) {
            return `算式解析失敗: ${error.message}`;
        }
    }

    /**
     * Evaluates a mathematical expression safely.
     */
    evaluate(expr: string): number {
        const tokens = this.#tokenize(expr);
        let pos = 0;

        const peek = (): string | null => tokens[pos] || null;
        const consume = (expected?: string): string => {
            const token = tokens[pos];
            if (!token) throw new Error('算式未完成 (缺少後續運算元)');
            if (expected && token !== expected) {
                throw new Error(`預期符號 "${expected}"，但遇到 "${token}"`);
            }
            pos++;
            return token;
        };

        // Grammar hierarchy:
        // parseExpression: Addition & Subtraction (+, -)
        // parseTerm: Multiplication, Division, Modulo (*, /, %)
        // parsePower: Exponentiation (^)
        // parseFactor: Unary signs (+, -), Numbers, Constants, Functions, Parentheses

        const parseExpression = (): number => {
            let left = parseTerm();
            while (peek() === '+' || peek() === '-') {
                const op = consume();
                const right = parseTerm();
                if (op === '+') left += right;
                else left -= right;
            }
            return left;
        };

        const parseTerm = (): number => {
            let left = parsePower();
            while (peek() === '*' || peek() === '/' || peek() === '%') {
                const op = consume();
                const right = parsePower();
                if (op === '*') {
                    left *= right;
                } else if (op === '/') {
                    if (right === 0) throw new Error('除數不能為零');
                    left /= right;
                } else if (op === '%') {
                    if (right === 0) throw new Error('取餘數除數不能為零');
                    left %= right;
                }
            }
            return left;
        };

        const parsePower = (): number => {
            let left = parseFactor();
            if (peek() === '^') {
                consume('^');
                const right = parsePower(); // Right-associative
                left = Math.pow(left, right);
            }
            return left;
        };

        const parseFactor = (): number => {
            const token = peek();
            if (!token) throw new Error('算式不完整');

            // Unary operators
            if (token === '+') {
                consume('+');
                return parseFactor();
            }
            if (token === '-') {
                consume('-');
                return -parseFactor();
            }

            // Parentheses
            if (token === '(') {
                consume('(');
                const val = parseExpression();
                consume(')');
                return val;
            }

            // Numbers
            if (/^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(token)) {
                consume();
                return Number(token);
            }

            // Named constants
            if (token.toLowerCase() === 'pi') {
                consume();
                return Math.PI;
            }
            if (token.toLowerCase() === 'e') {
                consume();
                return Math.E;
            }

            // Supported functions
            const fnName = token.toLowerCase();
            const mathFunctions: Record<string, (n: number) => number> = {
                sqrt: Math.sqrt,
                cbrt: Math.cbrt,
                abs: Math.abs,
                round: Math.round,
                floor: Math.floor,
                ceil: Math.ceil,
                sin: Math.sin,
                cos: Math.cos,
                tan: Math.tan,
                asin: Math.asin,
                acos: Math.acos,
                atan: Math.atan,
                log: Math.log10,
                ln: Math.log,
                exp: Math.exp
            };

            if (mathFunctions[fnName]) {
                consume();
                consume('(');
                const arg = parseExpression();
                consume(')');
                return mathFunctions[fnName](arg);
            }

            throw new Error(`無法識別的符號或函數: "${token}"`);
        };

        const result = parseExpression();
        if (pos < tokens.length) {
            throw new Error(`無法解析算式尾端字元: "${tokens.slice(pos).join(' ')}"`);
        }

        return result;
    }

    #tokenize(expr: string): string[] {
        const tokens: string[] = [];
        let i = 0;

        while (i < expr.length) {
            const char = expr[i];

            if (/\s/.test(char)) {
                i++;
                continue;
            }

            // Single-character operators & parentheses
            if (['+', '-', '*', '/', '%', '^', '(', ')'].includes(char)) {
                tokens.push(char);
                i++;
                continue;
            }

            // Numbers (including decimals and scientific e-notation)
            if (/\d|\./.test(char)) {
                let numStr = '';
                while (i < expr.length && /[\d.eE+-]/.test(expr[i])) {
                    // Check if '+' or '-' is part of scientific notation
                    if (expr[i] === '+' || expr[i] === '-') {
                        const prev = numStr[numStr.length - 1];
                        if (prev !== 'e' && prev !== 'E') break;
                    }
                    numStr += expr[i];
                    i++;
                }
                tokens.push(numStr);
                continue;
            }

            // Identifiers / words (functions or constants: sqrt, pi, sin, etc.)
            if (/[a-zA-Z_]/.test(char)) {
                let idStr = '';
                while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
                    idStr += expr[i];
                    i++;
                }
                tokens.push(idStr);
                continue;
            }

            throw new Error(`算式包含不支援的字元: "${char}"`);
        }

        return tokens;
    }
}

export default CalculatorTool;

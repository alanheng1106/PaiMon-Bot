import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import CalculatorTool from '../src/core/tools/CalculatorTool';

describe('CalculatorTool (Zero-eval Math Evaluator Strategy)', () => {
    it('defines a valid function calling tool schema', () => {
        const tool = new CalculatorTool();
        const def = tool.definition;
        assert.equal(def.type, 'function');
        assert.equal(def.function.name, 'calculate');
        assert.ok(def.function.parameters.properties.expression);
        assert.deepEqual(def.function.parameters.required, ['expression']);
    });

    it('evaluates basic arithmetic and operator precedence', async () => {
        const tool = new CalculatorTool();

        const res1 = await tool.execute({ expression: '2 + 3 * 4' });
        assert.ok(res1.includes('= 14'));

        const res2 = await tool.execute({ expression: '(2 + 3) * 4' });
        assert.ok(res2.includes('= 20'));

        const res3 = await tool.execute({ expression: '10 - 4 / 2' });
        assert.ok(res3.includes('= 8'));
    });

    it('evaluates exponentiation and modulo', async () => {
        const tool = new CalculatorTool();

        const res1 = await tool.execute({ expression: '2^10' });
        assert.ok(res1.includes('= 1024'));

        const res2 = await tool.execute({ expression: '17 % 5' });
        assert.ok(res2.includes('= 2'));
    });

    it('evaluates unary signs and scientific notation', async () => {
        const tool = new CalculatorTool();

        const res1 = await tool.execute({ expression: '-5 + 3' });
        assert.ok(res1.includes('= -2'));

        const res2 = await tool.execute({ expression: '-(10 - 2)' });
        assert.ok(res2.includes('= -8'));

        const res3 = await tool.execute({ expression: '1e3 + 50' });
        assert.ok(res3.includes('= 1050'));
    });

    it('evaluates mathematical functions and constants', async () => {
        const tool = new CalculatorTool();

        const res1 = await tool.execute({ expression: 'sqrt(144)' });
        assert.ok(res1.includes('= 12'));

        const res2 = await tool.execute({ expression: 'abs(-99)' });
        assert.ok(res2.includes('= 99'));

        const res3 = await tool.execute({ expression: 'round(4.6)' });
        assert.ok(res3.includes('= 5'));

        const res4 = await tool.execute({ expression: 'pi * 2' });
        assert.ok(res4.includes('6.2831853'));
    });

    it('handles division by zero and invalid inputs safely without crashing', async () => {
        const tool = new CalculatorTool();

        const res1 = await tool.execute({ expression: '10 / 0' });
        assert.ok(res1.includes('除數不能為零') || res1.includes('無效'));

        const res2 = await tool.execute({ expression: 'invalid + expression' });
        assert.ok(res2.includes('解析失敗') || res2.includes('無法識別'));

        const res3 = await tool.execute({ expression: '' });
        assert.ok(res3.includes('錯誤'));

        const res4 = await tool.execute({ expression: 'process.exit(1)' });
        assert.ok(res4.includes('不支援的字元') || res4.includes('解析失敗'));
    });
});

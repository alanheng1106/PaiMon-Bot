import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import DiscordSanitizer from '../src/utils/DiscordSanitizer';

describe('DiscordSanitizer (Defense in Depth Sanitization)', () => {
    it('prevents mass pings for @everyone and @here', () => {
        const input = 'Hello @everyone and @here!';
        const output = DiscordSanitizer.sanitize(input);
        assert.ok(!output.includes('@everyone'));
        assert.ok(!output.includes('@here'));
        assert.ok(output.includes('@\u200beveryone'));
        assert.ok(output.includes('@\u200bhere'));
    });

    it('strips LaTeX environment tags and converts math symbols to Unicode', () => {
        const latexInput = '\\begin{aligned} R &= {(w,2)}\\subseteq A\\times B \\end{aligned} \\boxed{S\\circ R}';
        const output = DiscordSanitizer.sanitize(latexInput);
        assert.ok(!output.includes('\\begin{aligned}'));
        assert.ok(!output.includes('\\end{aligned}'));
        assert.ok(!output.includes('\\boxed'));
        assert.ok(output.includes('⊆'));
        assert.ok(output.includes('×'));
        assert.ok(output.includes('∘'));
    });

    it('converts unrendered Markdown tables into clean Discord bulleted lists', () => {
        // 2-column key-value table
        const table2Col = '| 規格 | 數值 |\n|---|---|\n| 處理器 | A18 Pro |\n| 記憶體 | 8GB |';
        const output2Col = DiscordSanitizer.sanitize(table2Col);
        assert.ok(output2Col.includes('- **處理器**：A18 Pro'));
        assert.ok(output2Col.includes('- **記憶體**：8GB'));
        assert.ok(!output2Col.includes('|---|'));

        // Multi-column entity comparison table
        const table3Col =
            '| 機型 | 晶片 | 螢幕 |\n| :--- | :---: | ---: |\n| iPhone 15 | A16 | 60Hz |\n| iPhone 16 | A18 | 60Hz |';
        const output3Col = DiscordSanitizer.sanitize(table3Col);
        assert.ok(output3Col.includes('- **iPhone 15**：晶片: A16 ｜ 螢幕: 60Hz'));
        assert.ok(output3Col.includes('- **iPhone 16**：晶片: A18 ｜ 螢幕: 60Hz'));
        assert.ok(!output3Col.includes('|---|'));

        // Preserves tables inside code blocks
        const codeWithTable = '```markdown\n| a | b |\n|---|---|\n| 1 | 2 |\n```';
        const outputCode = DiscordSanitizer.sanitize(codeWithTable);
        assert.ok(outputCode.includes('| a | b |'));
        assert.ok(outputCode.includes('|---|---|'));
    });

    it('unwraps LaTeX arrows $→$, formulas, fractions, and preserves currencies', () => {
        const input =
            '`v9.9` $\\rightarrow$ 版本。$9.9 > 9.11$。這是 $→$ 箭頭。價格是 $100 美元，範圍是 $50 - $100。公式 \\frac{1}{\\lambda^4} 和 \\sqrt{x}。$$\\text{太陽} \\rightarrow \\text{地球}$$';
        const output = DiscordSanitizer.sanitize(input);

        // LaTeX arrows unwrapped
        assert.ok(output.includes('`v9.9` → 版本。'));
        assert.ok(output.includes('這是 → 箭頭。'));
        // Math comparison unwrapped
        assert.ok(output.includes('9.9 > 9.11。'));
        // Currencies preserved
        assert.ok(output.includes('$100 美元'));
        assert.ok(output.includes('$50 - $100'));
        // Fractions & roots converted
        assert.ok(output.includes('(1 / λ^4)'));
        assert.ok(output.includes('√(x)'));
        // Block math unwrapped
        assert.ok(output.includes('太陽 → 地球'));
        // No stray raw LaTeX remains
        assert.ok(!output.includes('$→$'));
        assert.ok(!output.includes('\\rightarrow'));
        assert.ok(!output.includes('\\text{'));
    });

    it('exhaustively covers OEIS symbols, functions, binomials, codeblocks, and fallback macros', () => {
        const input =
            '集合 $x \\in \\mathbb{R} \\land y \\in \\mathbb{Z}$，函數 $\\sin(\\theta) \\le \\cos(\\phi)$。' +
            '求和 $\\sum_{i=1}^n x_i$，組合數 $\\binom{n}{k}$，雙向箭頭 $\\Leftrightarrow$。' +
            '任意未知巨集 $\\obscureMacro{data}$ 與 $\\unknownCommand$。' +
            '程式碼 `const formula = "\\alpha";` 與路徑 C:\\Users\\FSOS\\Desktop\\file.ts 均不受影響。';

        const output = DiscordSanitizer.sanitize(input);

        // Sets & Logic
        assert.ok(output.includes('x ∈ ℝ ∧ y ∈ ℤ'));
        // Functions & Greek
        assert.ok(output.includes('sin(θ) ≤ cos(φ)'));
        // Large ops & Binomials
        assert.ok(output.includes('∑_{i=1}^n x_i'));
        assert.ok(output.includes('C(n, k)'));
        // Arrows
        assert.ok(output.includes('⇔'));
        // Fallback unwraps
        assert.ok(output.includes('data'));
        assert.ok(output.includes('unknownCommand'));
        // Codeblock & Windows path protection
        assert.ok(output.includes('`const formula = "\\alpha";`'));
        assert.ok(output.includes('C:\\Users\\FSOS\\Desktop\\file.ts'));
        // No remaining $ delimiters around math
        assert.ok(!output.includes('$\\sin'));
        assert.ok(!output.includes('$\\sum'));
    });

    it('downgrades unsupported #### and ##### headings to ### while preserving code blocks', () => {
        const input = [
            '# 一級標題',
            '## 二級標題',
            '### 三級標題',
            '#### 四級標題（不支援）',
            '##### 五級標題（不支援）',
            '###### 六級標題（不支援）',
            '```python',
            '#### python comment inside block',
            '```',
            '行內 `#### inline code` 也不受影響'
        ].join('\n');

        const output = DiscordSanitizer.sanitize(input);

        // Valid Discord headings untouched
        assert.ok(output.includes('# 一級標題'));
        assert.ok(output.includes('## 二級標題'));
        assert.ok(output.includes('### 三級標題'));

        // Unsupported headings downgraded to ###
        assert.ok(output.includes('### 四級標題（不支援）'));
        assert.ok(output.includes('### 五級標題（不支援）'));
        assert.ok(output.includes('### 六級標題（不支援）'));
        assert.ok(!output.includes('#### 四級標題'));
        assert.ok(!output.includes('##### 五級標題'));
        assert.ok(!output.includes('###### 六級標題'));

        // Code block and inline code protected
        assert.ok(output.includes('#### python comment inside block'));
        assert.ok(output.includes('`#### inline code`'));
    });

    it('converts AI time tags with style flags to Discord timestamps', () => {
        const dateStr = '2026-09-23 15:30:00';
        const expectedUnix = Math.floor(new Date(dateStr).getTime() / 1000);

        const input = `會議時間在 <time:${dateStr}:R>（<time:${dateStr}:F>），簡短是 <time:${dateStr}:d> 和 <time:${dateStr}:t>。`;
        const output = DiscordSanitizer.sanitize(input);

        assert.ok(output.includes(`<t:${expectedUnix}:R>`));
        assert.ok(output.includes(`<t:${expectedUnix}:F>`));
        assert.ok(output.includes(`<t:${expectedUnix}:d>`));
        assert.ok(output.includes(`<t:${expectedUnix}:t>`));
        assert.ok(!output.includes('<time:'));
    });

    it('converts AI time tags without style to Discord timestamp without style flag', () => {
        const dateStr = '2026-09-23 15:30:00';
        const expectedUnix = Math.floor(new Date(dateStr).getTime() / 1000);

        const input = `預定在 <time:${dateStr}> 啟動。`;
        const output = DiscordSanitizer.sanitize(input);

        assert.ok(output.includes(`<t:${expectedUnix}>`));
        assert.ok(!output.includes('<time:'));
    });

    it('supports pipe | separator for style flags', () => {
        const dateStr = '2026-09-23 15:30:00';
        const expectedUnix = Math.floor(new Date(dateStr).getTime() / 1000);

        const input = `發布時間：<time:${dateStr}|R>。`;
        const output = DiscordSanitizer.sanitize(input);

        assert.ok(output.includes(`<t:${expectedUnix}:R>`));
    });

    it('handles date-only strings and raw unix epoch numbers', () => {
        // Date-only format YYYY-MM-DD
        const dateOnlyStr = '2026-09-23';
        const expectedDateUnix = Math.floor(new Date('2026/09/23 00:00:00').getTime() / 1000);

        const inputDateOnly = `活動日期是 <time:${dateOnlyStr}:D>。`;
        const outputDateOnly = DiscordSanitizer.sanitize(inputDateOnly);
        assert.ok(outputDateOnly.includes(`<t:${expectedDateUnix}:D>`));

        // Raw 10-digit unix seconds
        const inputUnix = '倒數時間：<time:1790148600:R> 與 <time:1790148600>。';
        const outputUnix = DiscordSanitizer.sanitize(inputUnix);
        assert.ok(outputUnix.includes('<t:1790148600:R>'));
        assert.ok(outputUnix.includes('<t:1790148600>'));

        // Raw 13-digit unix milliseconds
        const inputMs = '毫秒轉換：<time:1790148600000:f>。';
        const outputMs = DiscordSanitizer.sanitize(inputMs);
        assert.ok(outputMs.includes('<t:1790148600:f>'));
    });

    it('protects code blocks and inline code from timestamp conversion', () => {
        const input = [
            '這是文字中真實的 <time:2026-09-23 15:30:00:R>',
            '這是行內代碼 `<time:2026-09-23 15:30:00:R>` 不應該被轉換',
            '```markdown',
            '<time:2026-09-23 15:30:00:F>',
            '```'
        ].join('\n');

        const output = DiscordSanitizer.sanitize(input);
        const expectedUnix = Math.floor(new Date('2026-09-23 15:30:00').getTime() / 1000);

        // Outside code block converted
        assert.ok(output.includes(`<t:${expectedUnix}:R>`));
        // Inside inline code protected
        assert.ok(output.includes('`<time:2026-09-23 15:30:00:R>`'));
        // Inside block code protected
        assert.ok(output.includes('```markdown\n<time:2026-09-23 15:30:00:F>\n```'));
    });

    it('gracefully handles invalid date strings with fallback', () => {
        const input = '無效時間 <time:not-a-valid-date-str:R> 處理';
        const output = DiscordSanitizer.sanitize(input);

        // Does not throw and falls back cleanly without crashing
        assert.ok(output.includes('not-a-valid-date-str'));
        assert.ok(!output.includes('<time:'));
        assert.ok(!output.includes('NaN'));
    });

    it('converts <t:...> tags with date strings into valid Discord timestamps (handles AI hallucinating <t:DATE:STYLE>)', () => {
        const input = '下一個小版本 26.60 預計會在 <t:2026-10-27 00:00:00:R> (<t:2026-10-27 00:00:00:F>) 發布';
        const expectedUnix = Math.floor(new Date('2026-10-27 00:00:00').getTime() / 1000);
        const output = DiscordSanitizer.sanitize(input);

        assert.ok(output.includes(`<t:${expectedUnix}:R>`));
        assert.ok(output.includes(`<t:${expectedUnix}:F>`));
        assert.ok(!output.includes('<t:2026-10-27'));

        // Preserves already valid Discord numeric timestamps
        const validDiscordTag = '已排定在 <t:1790148600:R> 或 <t:1790148600>。';
        const validOutput = DiscordSanitizer.sanitize(validDiscordTag);
        assert.ok(validOutput.includes('<t:1790148600:R>'));
        assert.ok(validOutput.includes('<t:1790148600>'));
    });

    it('converts Chinese date strings inside <t:...> and <time:...>', () => {
        const input = '會議時間 <t:2026年10月27日 15:30:00:R> 和 <time:2026年10月27日:D>';
        const expectedSec = Math.floor(new Date('2026/10/27 15:30:00').getTime() / 1000);
        const expectedDateSec = Math.floor(new Date('2026/10/27 00:00:00').getTime() / 1000);

        const output = DiscordSanitizer.sanitize(input);
        assert.ok(output.includes(`<t:${expectedSec}:R>`));
        assert.ok(output.includes(`<t:${expectedDateSec}:D>`));
    });

    it('strips leaked DeepSeek DSML protocol tags and tool markers', () => {
        const input =
            '這是一個搜尋結果：<｜｜DSML｜｜ parameter name="query" string="true">"tdtsum" 是誰 帳號</｜｜DSML｜｜ parameter> 找到了相關資訊。<｜tool calls end｜>';
        const output = DiscordSanitizer.sanitize(input);

        assert.ok(!output.includes('DSML'));
        assert.ok(!output.includes('<｜'));
        assert.ok(!output.includes('tool calls end'));
        assert.ok(output.includes('"tdtsum" 是誰 帳號'));
        assert.ok(output.includes('找到了相關資訊。'));
    });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import CodeRunnerTool from '../src/core/tools/CodeRunnerTool';

describe('CodeRunnerTool (Sandboxed Compiler & Execution)', () => {
    it('provides valid OpenAI-compatible function tool definition', () => {
        const tool = new CodeRunnerTool();
        const def = tool.definition;

        assert.equal(def.type, 'function');
        assert.equal(def.function.name, 'run_code');
        assert.ok(def.function.description.includes('沙盒'));
        assert.deepEqual(def.function.parameters.required, ['language', 'code']);
        assert.ok(def.function.parameters.properties.language.enum.includes('nasm'));
        assert.ok(def.function.parameters.properties.language.enum.includes('python'));
        assert.ok(def.function.parameters.properties.language.enum.includes('c'));
        assert.ok(def.function.parameters.properties.language.enum.includes('java'));
    });

    it('normalizes common language aliases accurately', () => {
        const tool = new CodeRunnerTool();

        assert.equal(tool.normalizeLanguage('asm'), 'nasm');
        assert.equal(tool.normalizeLanguage('assembly'), 'nasm');
        assert.equal(tool.normalizeLanguage('nasm64'), 'nasm');
        assert.equal(tool.normalizeLanguage('py'), 'python');
        assert.equal(tool.normalizeLanguage('Python'), 'python');
        assert.equal(tool.normalizeLanguage('js'), 'javascript');
        assert.equal(tool.normalizeLanguage('node'), 'javascript');
        assert.equal(tool.normalizeLanguage('ts'), 'typescript');
        assert.equal(tool.normalizeLanguage('c++'), 'cpp');
        assert.equal(tool.normalizeLanguage('c#'), 'csharp');
        assert.equal(tool.normalizeLanguage('cs'), 'csharp');
        assert.equal(tool.normalizeLanguage('rs'), 'rust');
        assert.equal(tool.normalizeLanguage('golang'), 'go');
        assert.equal(tool.normalizeLanguage('sh'), 'bash');
        assert.equal(tool.normalizeLanguage('shell'), 'bash');
    });

    it('rejects empty or whitespace-only code with friendly error', async () => {
        const tool = new CodeRunnerTool({ primaryEndpoint: 'https://piston.example.com/api/v2/execute' });
        const result = await tool.execute({ language: 'python', code: '   ' });

        assert.ok(result.includes('不能為空'));
    });

    it('returns friendly error when primary endpoint is unconfigured', async () => {
        const originalEnv = process.env.CODE_RUNNER_API_URL;
        const originalPiston = process.env.PISTON_API_URL;
        delete process.env.CODE_RUNNER_API_URL;
        delete process.env.PISTON_API_URL;

        try {
            const tool = new CodeRunnerTool();
            const result = await tool.execute({ language: 'python', code: 'print("hello")' });

            assert.ok(result.includes('【沙盒未配置】'));
            assert.ok(result.includes('CODE_RUNNER_API_URL'));
        } finally {
            process.env.CODE_RUNNER_API_URL = originalEnv;
            process.env.PISTON_API_URL = originalPiston;
        }
    });

    it('formats successful execution result cleanly', async () => {
        // Mock fetch for primary endpoint
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url, options) => {
            return {
                ok: true,
                json: async () => ({
                    language: 'python',
                    version: '3.10.0',
                    run: {
                        stdout: '42\n',
                        stderr: '',
                        code: 0,
                        signal: null,
                        output: '42\n'
                    }
                })
            };
        };

        try {
            const tool = new CodeRunnerTool({ primaryEndpoint: 'https://piston.example.com/api/v2/execute' });
            const output = await tool.execute({ language: 'python', code: 'print(42)' });

            assert.ok(output.includes('piston.example.com'));
            assert.ok(output.includes('42'));
            assert.ok(output.includes('Exit 0'));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('formats compiler errors cleanly and flags compilation failure', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => ({
            ok: true,
            json: async () => ({
                language: 'c',
                version: '10.2.0',
                compile: {
                    stdout: '',
                    stderr: 'main.c:1:1: error: unknown type name "foo"',
                    code: 1,
                    output: 'main.c:1:1: error: unknown type name "foo"'
                },
                run: null
            })
        });

        try {
            const tool = new CodeRunnerTool({ primaryEndpoint: 'https://piston.example.com/api/v2/execute' });
            const output = await tool.execute({ language: 'c', code: 'foo bar;' });

            assert.ok(output.includes('編譯失敗'));
            assert.ok(output.includes('unknown type name "foo"'));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('automatically falls back to public endpoint when primary endpoint fails', async () => {
        const calledUrls = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url) => {
            calledUrls.push(url);
            if (url.includes('primary-piston.internal')) {
                throw new Error('Connection refused (host offline)');
            }
            return {
                ok: true,
                json: async () => ({
                    language: 'nasm',
                    version: '2.15.05',
                    run: {
                        stdout: 'Assembly Success\n',
                        stderr: '',
                        code: 0
                    }
                })
            };
        };

        try {
            const tool = new CodeRunnerTool({
                primaryEndpoint: 'https://primary-piston.internal/api/v2/execute',
                fallbackEndpoint: 'https://emkc.org/api/v2/piston/execute'
            });

            const output = await tool.execute({ language: 'asm', code: 'section .text' });

            assert.equal(calledUrls.length, 2);
            assert.ok(calledUrls[0].includes('primary-piston.internal'));
            assert.ok(calledUrls[1].includes('emkc.org'));
            assert.ok(output.includes('公共備援節點'));
            assert.ok(output.includes('Assembly Success'));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

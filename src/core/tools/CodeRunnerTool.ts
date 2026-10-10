import BaseTool, { ToolDefinition } from './BaseTool';
import { Emojis } from '../../config';

export interface CodeRunnerArgs {
    language: string;
    code: string;
    stdin?: string;
    args?: string[];
}

/**
 * CodeRunnerTool — Enables AI to compile and execute code safely in an isolated sandbox.
 * Supports Python, Java, C, C++, Rust, Assembly (NASM), Go, JavaScript, TypeScript, Bash, etc.
 * Connects to user's private Ubuntu Piston sandbox (100.127.135.112:2000) with automatic public fallback.
 * Follows Strategy Pattern (BaseTool) & Open-Closed Principle (OCP).
 */
class CodeRunnerTool extends BaseTool {
    readonly #primaryEndpoint: string;
    readonly #fallbackEndpoint: string;
    readonly #timeoutMs: number;

    constructor(options: { primaryEndpoint?: string; fallbackEndpoint?: string; timeoutMs?: number } = {}) {
        super();
        this.#primaryEndpoint =
            options.primaryEndpoint ||
            process.env.CODE_RUNNER_API_URL ||
            process.env.PISTON_API_URL ||
            'http://100.127.135.112:2000/api/v2/execute';
        this.#fallbackEndpoint =
            options.fallbackEndpoint ||
            process.env.CODE_RUNNER_FALLBACK_URL ||
            'https://emkc.org/api/v2/piston/execute';
        this.#timeoutMs = options.timeoutMs || 15000;
    }

    override get definition(): ToolDefinition {
        return {
            type: 'function',
            function: {
                name: 'run_code',
                description:
                    '在安全隔離的編譯與執行沙盒中運行程式碼（支援 Python、Java、C、C++、Assembly/NASM、Rust、Go、JavaScript、TypeScript、Bash 等），並獲取編譯日誌、標準輸出 (stdout)、錯誤輸出 (stderr) 與進程退出代碼。當用戶要求執行代碼、驗證算法邏輯、計算數值或除錯時，調用此工具。',
                parameters: {
                    type: 'object',
                    properties: {
                        language: {
                            type: 'string',
                            description:
                                '程式語言名稱，例如 "python", "java", "c", "cpp", "nasm" (組合語言), "rust", "go", "javascript", "typescript", "bash"',
                            enum: [
                                'python',
                                'java',
                                'c',
                                'cpp',
                                'nasm',
                                'rust',
                                'go',
                                'javascript',
                                'typescript',
                                'bash'
                            ]
                        },
                        code: {
                            type: 'string',
                            description: '要編譯與運行的完整原始碼。'
                        },
                        stdin: {
                            type: 'string',
                            description: '可選的標準輸入 (stdin) 內容。'
                        }
                    },
                    required: ['language', 'code']
                }
            }
        };
    }

    /**
     * Normalizes language identifier to match Piston packages.
     */
    normalizeLanguage(lang: string = ''): string {
        const l = lang.trim().toLowerCase();
        switch (l) {
            case 'asm':
            case 'assembly':
            case 'nasm64':
                return 'nasm';
            case 'py':
                return 'python';
            case 'js':
            case 'node':
                return 'javascript';
            case 'ts':
                return 'typescript';
            case 'c++':
                return 'cpp';
            case 'c#':
            case 'cs':
                return 'csharp';
            case 'rs':
                return 'rust';
            case 'golang':
                return 'go';
            case 'sh':
            case 'shell':
                return 'bash';
            default:
                return l;
        }
    }

    override async execute(args: CodeRunnerArgs | any, _context: any = {}): Promise<string> {
        const rawLang = args?.language || '';
        const code = args?.code || '';
        const stdin = args?.stdin || '';

        if (!code || !code.trim()) {
            return '執行失敗：程式碼內容不能為空。';
        }

        const language = this.normalizeLanguage(rawLang);

        const payload = {
            language,
            version: '*',
            files: [{ content: code }],
            stdin,
            compile_timeout: 10000,
            run_timeout: 3000
        };

        // Try primary (Ubuntu host) first; fallback to public endpoint if unreachable
        let responseData: any;
        let endpointUsed = this.#primaryEndpoint;

        try {
            responseData = await this.#postExecution(this.#primaryEndpoint, payload);
        } catch (primaryErr: any) {
            console.warn(
                `[CodeRunnerTool] Primary endpoint (${this.#primaryEndpoint}) failed: ${primaryErr.message}. Attempting public fallback...`
            );
            try {
                endpointUsed = this.#fallbackEndpoint;
                responseData = await this.#postExecution(this.#fallbackEndpoint, payload);
            } catch (fallbackErr: any) {
                return `【沙盒連線失敗】\n- 私有節點 (${this.#primaryEndpoint}): ${primaryErr.message}\n- 公共節點 (${this.#fallbackEndpoint}): ${fallbackErr.message}\n請檢查主機是否已啟動 Piston 容器。`;
            }
        }

        return this.#formatResult(responseData, endpointUsed);
    }

    async #postExecution(endpoint: string, payload: any): Promise<any> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status} (${res.statusText}): ${text || 'Unknown Error'}`);
            }

            return await res.json();
        } finally {
            clearTimeout(timer);
        }
    }

    #formatResult(data: any, endpoint: string): string {
        if (!data) return '錯誤：沙盒未回傳有效資料。';

        const { language, version, compile, run, message } = data;
        if (message) {
            return `沙盒伺服器訊息: ${message}`;
        }

        const sections: string[] = [];
        const isPrivate = endpoint.includes('100.127.135.112');
        const nodeTag = isPrivate ? '私有 Ubuntu 節點 (100.127.135.112)' : '公共備援節點';
        sections.push(`🖥️ 執行環境: ${language} ${version || ''} ｜ 節點: ${nodeTag}`);

        // 1. Compiler output (for C, C++, Java, NASM, Rust, etc.)
        if (compile) {
            const compErr = compile.stderr || compile.output || '';
            if (compile.code !== 0) {
                sections.push(
                    `${Emojis.Error} 【編譯失敗 (Compiler Error - Exit ${compile.code})】:\n\`\`\`\n${compErr.trim()}\n\`\`\``
                );
                return sections.join('\n\n');
            } else if (compErr.trim()) {
                sections.push(`${Emojis.Warning} 【編譯警告 (Compiler Warning)】:\n\`\`\`\n${compErr.trim()}\n\`\`\``);
            }
        }

        // 2. Runtime output
        const runOutput = run?.output || run?.stdout || '';
        const runErr = run?.stderr || '';
        const exitCode = run?.code ?? 0;
        const signal = run?.signal;

        if (runOutput && runOutput.trim()) {
            sections.push(`📤 【標準輸出 (stdout)】:\n\`\`\`\n${runOutput.trim()}\n\`\`\``);
        }

        if (runErr && runErr.trim()) {
            sections.push(`${Emojis.Warning} 【錯誤輸出 (stderr)】:\n\`\`\`\n${runErr.trim()}\n\`\`\``);
        }

        if (!runOutput.trim() && !runErr.trim()) {
            sections.push('（程式執行完畢，無任何輸出）');
        }

        const statusDetail = signal ? `異常中斷 (Signal: ${signal})` : `狀態代碼 Exit ${exitCode}`;
        sections.push(`⏱️ 進程結果: ${statusDetail}`);

        return sections.join('\n\n');
    }
}

export default CodeRunnerTool;

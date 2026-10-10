import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AIErrorDiagnostic, getModelEmoji, getPlatformMeta } from '../src/core/ai/AIErrorDiagnostic';
import { Emojis } from '../src/config';

describe('AIErrorDiagnostic (Transparent AI Error Diagnostics)', () => {
    describe('getModelEmoji', () => {
        it('resolves correct custom emojis for all supported models', () => {
            assert.equal(getModelEmoji('vtc-deepseek'), Emojis.DeepSeek);
            assert.equal(getModelEmoji('vtc-gemini'), Emojis.Gemini);
            assert.equal(getModelEmoji('vtc-gpt'), Emojis.ChatGPT);
            assert.equal(getModelEmoji('vtc-qwen'), Emojis.Qwen);
            assert.equal(getModelEmoji('meowai-grok-4.7'), Emojis.Grok);
            assert.equal(getModelEmoji('ol-kimi-k3'), '🌙');
            assert.equal(getModelEmoji('ol-glm-5.3-flash'), '🪐');
            assert.equal(getModelEmoji('ol-minimax-m3'), '🌟');
            assert.equal(getModelEmoji('unknown-model'), '🤖');
        });
    });

    describe('getPlatformMeta', () => {
        it('resolves correct platform metadata for all platform keys', () => {
            assert.equal(getPlatformMeta('ollama').emoji, Emojis.Ollama);
            assert.equal(getPlatformMeta('vtc').emoji, Emojis.VTC);
            assert.equal(getPlatformMeta('meowai').name, 'MeowAI');
            assert.equal(getPlatformMeta('meowai').emoji, Emojis.MeowAI);
            assert.equal(getPlatformMeta('lmstudio').name, 'Ollama / LM Studio');
            assert.equal(getPlatformMeta('lmstudio').emoji, Emojis.Ollama);
        });
    });

    describe('diagnose', () => {
        it('accurately diagnoses Alibaba Cloud content moderation error (Qwen 3.7 Max)', () => {
            const err = new Error(
                '無法連線至 AI 模型伺服器 [VTC GenAI]: 500 VTC 500: Unknown error occurred while calling qwen3.7-max API: 400 Input data may contain inappropriate content. For details, see: https://www.alibabacloud.com/help/en/model-studio/error-code#inappropriate-content'
            );

            const result = AIErrorDiagnostic.diagnose(err);
            assert.equal(result.category, 'moderation');
            assert.ok(result.title.includes('內容安全審核'));
            assert.ok(result.description.includes('阿里雲'));
            assert.ok(result.suggestions.some((s) => s.includes('/model')));
            assert.ok(result.rawMessage.includes('Input data may contain inappropriate content'));
        });

        it('accurately diagnoses 429 rate limit / quota exceeded errors', () => {
            const err = { message: '429 Too Many Requests: Rate limit exceeded for organization' };
            const result = AIErrorDiagnostic.diagnose(err);
            assert.equal(result.category, 'rate_limit');
            assert.ok(result.title.includes('429'));
            assert.ok(result.suggestions.some((s) => s.includes('稍候')));
        });

        it('accurately diagnoses context length limit errors', () => {
            const err = new Error(
                'This model maximum context length is 32768 tokens. However, your messages resulted in 35000 tokens.'
            );
            const result = AIErrorDiagnostic.diagnose(err);
            assert.equal(result.category, 'context_length');
            assert.ok(result.title.includes('上下文長度超限'));
            assert.ok(result.suggestions.some((s) => s.includes('Qwen') || s.includes('Gemini')));
        });

        it('accurately diagnoses connection timeout errors', () => {
            const err = new Error('The operation was aborted due to timeout');
            const result = AIErrorDiagnostic.diagnose(err);
            assert.equal(result.category, 'timeout');
            assert.ok(result.title.includes('逾時'));
        });

        it('accurately diagnoses 401/403 authorization and API key errors', () => {
            const err = { status: 401, message: 'Invalid API Key provided' };
            const result = AIErrorDiagnostic.diagnose(err);
            assert.equal(result.category, 'auth');
            assert.ok(result.title.includes('金鑰'));
        });

        it('accurately diagnoses 500 upstream server error', () => {
            const err = new Error('500 Internal Server Error from upstream cluster');
            const result = AIErrorDiagnostic.diagnose(err);
            assert.equal(result.category, 'server_error');
            assert.ok(result.title.includes('伺服器'));
        });

        it('accurately diagnoses premature stream cut (VTC ended the reply early)', () => {
            const err = new Error('VTC ended the reply early (no usage line); the reply is incomplete.');
            const result = AIErrorDiagnostic.diagnose(err);
            assert.equal(result.category, 'server_error');
            assert.ok(result.title.includes('服務中斷') || result.title.includes('伺服器'));
            assert.ok(result.rawMessage.includes('ended the reply early'));
        });

        it('unwraps Cloudflare 502 Bad Gateway JSON payload into clean title and detail', () => {
            const cfJson = JSON.stringify({
                type: 'https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-502/',
                title: 'Error 502: Bad gateway',
                status: 502,
                detail: 'The origin web server returned an invalid or incomplete response to Cloudflare. This typically indicates the origin is overloaded or misconfigured.'
            });
            const err = new Error(`無法連線至 AI 模型伺服器 [VTC GenAI (DeepSeek)]: 502 ${cfJson}`);
            const result = AIErrorDiagnostic.diagnose(err);
            assert.equal(result.category, 'server_error');
            assert.ok(result.rawMessage.includes('Error 502: Bad gateway'));
            assert.ok(result.rawMessage.includes('overloaded or misconfigured'));
        });

        it('accurately diagnoses network communication errors', () => {
            const err = new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:11434');
            const result = AIErrorDiagnostic.diagnose(err);
            assert.equal(result.category, 'network');
            assert.ok(result.title.includes('網路通訊連線失敗'));
        });

        it('falls back cleanly to unknown error for unclassified exceptions', () => {
            const err = new Error('Unexpected token < in JSON at position 0');
            const result = AIErrorDiagnostic.diagnose(err);
            assert.equal(result.category, 'unknown');
            assert.ok(result.title.includes('AI 運算處理異常'));
        });
    });

    describe('formatErrorMessage', () => {
        it('formats rich, transparent report with model emoji, platform emoji, raw error block, and suggestions', () => {
            const rawError =
                '500 VTC 500: Unknown error occurred while calling qwen3.7-max API: 400 Input data may contain inappropriate content. For details, see: https://www.alibabacloud.com/help/en/model-studio/error-code#inappropriate-content';

            const output = AIErrorDiagnostic.formatErrorMessage({
                error: new Error(rawError),
                modelId: 'vtc-qwen',
                modelName: 'Qwen 3.7 Max (VTC 旗艦長文本)',
                providerKey: 'vtc'
            });

            assert.ok(output.includes('### <a:cross:1524603300752785550> AI 運算節點回報異常'));
            assert.ok(output.includes(Emojis.Qwen));
            assert.ok(output.includes('`Qwen 3.7 Max`'));
            assert.ok(output.includes(Emojis.VTC));
            assert.ok(output.includes('`VTC GenAI`'));
            assert.ok(output.includes('🛑 內容安全審核攔截'));
            assert.ok(output.includes('```'));
            assert.ok(output.includes('Input data may contain inappropriate content'));
            assert.ok(output.includes('💡 **建議處理方式**：'));
            assert.ok(output.includes('`/model`'));
        });

        it('escapes triple backticks inside raw error string to protect markdown layout', () => {
            const output = AIErrorDiagnostic.formatErrorMessage({
                error: new Error('Dangerous codeblock ```evil``` inside error message'),
                modelId: 'ollama-gemma',
                modelName: 'Gemma 4',
                providerKey: 'ollama'
            });

            // Must not contain unclosed extra ```
            assert.ok(output.includes("'''evil'''"));
        });
    });
});

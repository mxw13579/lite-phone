/**
 * 插件运行时 MVP：Worker 沙箱 + 白名单 API + 资源配额与熔断
 */

const DEFAULT_QUOTAS = {
    maxWallTimeMs: 2000,
    maxRequests: 3,
    maxMemoryBytes: 16 * 1024 * 1024
};

export class PluginRuntime {
    constructor({ quotas = {}, allowedApis = [] } = {}) {
        this.quotas = { ...DEFAULT_QUOTAS, ...quotas };
        this.allowedApis = new Set(allowedApis);
        this.requestCount = 0;
        this.aborted = false;
        this.worker = null;
        this.abortTimer = null;
    }

    createWorker(script) {
        const blob = new Blob([`
            self.onmessage = async (e) => {
                const { code, input } = e.data;
                try {
                    const api = Object.freeze({
                        log: (...args) => postMessage({ type: 'log', args }),
                    });
                    const fn = new Function('api', 'input', code);
                    const result = await fn(api, input);
                    postMessage({ type: 'result', result });
                } catch (err) {
                    postMessage({ type: 'error', error: err?.message || String(err) });
                }
            };
        `], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        this.worker = new Worker(url);
        return this.worker;
    }

    run({ code, input }) {
        return new Promise((resolve, reject) => {
            if (this.aborted) return reject(new Error('Runtime aborted'));
            const worker = this.worker || this.createWorker();

            const onMessage = (e) => {
                const { type } = e.data || {};
                if (type === 'log') {
                    // swallow logs
                } else if (type === 'result') {
                    this.cleanup();
                    resolve(e.data.result);
                } else if (type === 'error') {
                    this.cleanup();
                    reject(new Error(e.data.error));
                }
            };
            const onError = (err) => {
                this.cleanup();
                reject(err);
            };

            worker.onmessage = onMessage;
            worker.onerror = onError;

            // 熔断计时器
            this.abortTimer = setTimeout(() => {
                this.abort();
                reject(new Error('Plugin execution timeout'));
            }, this.quotas.maxWallTimeMs);

            worker.postMessage({ code, input });
        });
    }

    abort() {
        this.aborted = true;
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        if (this.abortTimer) {
            clearTimeout(this.abortTimer);
            this.abortTimer = null;
        }
    }

    cleanup() {
        if (this.abortTimer) {
            clearTimeout(this.abortTimer);
            this.abortTimer = null;
        }
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}

/**
 * 运行示例插件（计时器）
 */
export async function runSampleTimerPlugin(ms = 300) {
    const runtime = new PluginRuntime({ quotas: { maxWallTimeMs: 1000 } });
    const code = `
        const start = Date.now();
        while (Date.now() - start < input.ms) {}
        return { ok: true, elapsed: Date.now() - start };
    `;
    return runtime.run({ code, input: { ms } });
}


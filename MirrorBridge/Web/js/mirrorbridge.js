// 공통 MirrorBridge 구현
class MirrorBridge {
    constructor(clientId, editorEl, statusEl, workerPath = '/js/sharedworker.js') {
        this.clientId = clientId;
        this.editor = typeof editorEl === 'string' ? document.getElementById(editorEl) : editorEl;
        this.status = typeof statusEl === 'string' ? document.getElementById(statusEl) : statusEl;
        this.workerPath = workerPath;
        this.programmaticUpdate = false;

        if (!this.editor) throw new Error('editor element not found');
        if (!this.status) throw new Error('status element not found');

        this._connect();
        this._bindEvents();
    }

    _connect() {
        this.worker = new SharedWorker(this.workerPath);
        this.port = this.worker.port;

        this.port.onmessage = (e) => this._onMessage(e);
        this.port.start();
        this._setStatus('상태: 연결됨');
    }

    _bindEvents() {
        this.editor.addEventListener('input', () => {
            if (this.programmaticUpdate) return;
            this._postMirror(this.editor.value);
            this._setStatus('상태: 전송됨');
            setTimeout(() => this._setStatus('상태: 연결됨'), 600);
        });
    }

    _onMessage(e) {
        const msg = e.data;
        if (msg && msg.type === 'mirror' && msg.source !== this.clientId) {
            this.programmaticUpdate = true;
            this.editor.value = msg.text;
            this.programmaticUpdate = false;
            this._setStatus('상태: 외부에서 업데이트됨');
        }
    }

    _postMirror(text) {
        const payload = { type: 'mirror', source: this.clientId, text };
        this.port.postMessage(payload);
    }

    _setStatus(text) {
        if (this.status) this.status.textContent = text;
    }
}
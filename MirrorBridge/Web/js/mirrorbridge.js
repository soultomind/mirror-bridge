// 공통 MirrorBridge 구현 (핸들러 + 요청/응답 지원 + presence 감지 + connect/disconnect)
class MirrorBridge {
    constructor(clientId, workerPath = '/js/sharedworker.js', autoConnect = true) {
        this.clientId = clientId;
        this.workerPath = workerPath;
        this.programmaticUpdate = false;

        // handlers: action -> [fn...], '*' 은 모든 액션 수신
        this.handlers = {};
        // pending requests: id -> { resolve, reject, timeout }
        this.pending = {};
        this._nextId = 1;

        // presence 관리
        this.peers = {}; // id -> { lastSeen, status, resetTimer }

        // connection state
        this.isConnected = false;
        this._presenceInterval = null;
        this._checkInterval = null;

        if (autoConnect) this.connect();
    }

    _emit(action, payload) {
        const fns = (this.handlers[action] || []).slice();
        const global = (this.handlers['*'] || []).slice();
        const all = fns.concat(global);
        all.forEach(fn => {
            try { fn(payload); } catch (e) { console.error(e); }
        });
    }

    async connect() {
        if (this.isConnected) return;
        this._connect();
        this._startPresence();
        this.isConnected = true;
        this._emit('connection', 'connected');
    }

    disconnect() {
        if (!this.isConnected) return;
        // close port
        try {
            if (this.port && typeof this.port.close === 'function') this.port.close();
        } catch (e) { console.debug('port close failed', e); }

        // stop presence and clear peer timers
        this._stopPresence();

        // reject pending requests
        Object.keys(this.pending).forEach(id => {
            try {
                const p = this.pending[id];
                clearTimeout(p.timeout);
                p.reject(new Error('disconnected'));
            } catch (e) { /* ignore */ }
            delete this.pending[id];
        });

        this.isConnected = false;
        this.peers = {};
        this._emit('connection', 'disconnected');
    }

    _connect() {
        // create SharedWorker and attach port handlers
        try {
            this.worker = new SharedWorker(this.workerPath);
            this.port = this.worker.port;
            this.port.onmessage = (e) => this._onMessage(e);
            this.port.start();
        } catch (e) {
            console.error('SharedWorker connect failed', e);
        }
    }

    _bindEvents() {
        // placeholder for subclasses or external wiring
    }

    _onMessage(e) {
        const msg = e.data;
        if (!msg || msg.type !== 'mirror') return;

        // 응답 메시지 처리
        if (msg.replyTo) {
            const req = this.pending[msg.replyTo];
            if (req) {
                clearTimeout(req.timeout);
                req.resolve(msg.payload);
                delete this.pending[msg.replyTo];
            }
            return;
        }

        // 내 메시지는 무시
        if (msg.source === this.clientId) return;

        const action = msg.action || 'default';
        const payload = msg.payload;

        // presence ping 수신 처리
        if (action === 'presence:ping') {
            const id = msg.source;
            const now = Date.now();
            const prev = this.peers[id];
            if (prev && prev.resetTimer) {
                clearTimeout(prev.resetTimer);
                prev.resetTimer = null;
            }
            const prevStatus = prev ? prev.status : 'waiting';
            this.peers[id] = { lastSeen: now, status: 'connected', resetTimer: null };
            if (prevStatus !== 'connected') {
                this._emit('peer:status', { id, status: 'connected' });
            }
            return;
        }

        // 기본 content:update 처리 (에디터 동기화는 외부에서 on('content:update')로 처리하면 더 유연)
        if (action === 'content:update' && this.editorEl) {
            this.programmaticUpdate = true;
            this.editorEl.value = payload?.text ?? '';
            setTimeout(() => { this.programmaticUpdate = false; }, 0);
        }

        // 등록된 핸들러 호출
        const fns = (this.handlers[action] || []).slice();
        const globalFns = (this.handlers['*'] || []).slice();
        const all = fns.concat(globalFns);
        if (all.length > 0) {
            all.forEach(fn => {
                try {
                    const res = fn(payload, msg);
                    if (msg.id) {
                        Promise.resolve(res)
                            .then(result => this._postReply(msg.id, { result }))
                            .catch(err => this._postReply(msg.id, { error: String(err) }));
                    }
                } catch (err) {
                    if (msg.id) this._postReply(msg.id, { error: String(err) });
                }
            });
        } else {
            if (msg.id) {
                this._postReply(msg.id, { error: 'no-handler' });
            }
        }
    }

    _postReply(replyTo, payload) {
        if (!this.port) return;
        const out = { type: 'mirror', source: this.clientId, replyTo, payload };
        try { this.port.postMessage(out); } catch (e) { console.debug(e); }
    }

    _postMirror(action, payload, expectReply) {
        if (!this.port) return Promise.reject(new Error('not-connected'));
        const id = expectReply ? String(this._nextId++) : undefined;
        const out = { type: 'mirror', source: this.clientId, action, payload };
        if (id) out.id = id;
        try { this.port.postMessage(out); } catch (e) { return Promise.reject(e); }

        if (id) {
            return new Promise((resolve, reject) => {
                const timeoutMs = 5000;
                const to = setTimeout(() => {
                    delete this.pending[id];
                    reject(new Error('timeout'));
                }, timeoutMs);
                this.pending[id] = { resolve, reject, timeout: to };
            });
        } else {
            return Promise.resolve();
        }
    }

    // 브로드캐스트(응답 불필요)
    sendNotification(action, payload) {
        return this._postMirror(action, payload, false);
    }

    // 요청(응답 기대) - Promise 반환
    sendRequest(action, payload, timeoutMs) {
        if (!this.port) return Promise.reject(new Error('not-connected'));
        const id = String(this._nextId++);
        const out = { type: 'mirror', source: this.clientId, action, payload, id };
        try { this.port.postMessage(out); } catch (e) { return Promise.reject(e); }

        return new Promise((resolve, reject) => {
            const toMs = typeof timeoutMs === 'number' ? timeoutMs : 5000;
            const to = setTimeout(() => {
                delete this.pending[id];
                reject(new Error('timeout'));
            }, toMs);
            this.pending[id] = { resolve, reject, timeout: to };
        });
    }

    // presence 관련: 주기적으로 ping 전송 및 peer 상태 검사
    _startPresence() {
        // 즉시 ping 전송
        const sendPing = () => {
            try { this.sendNotification('presence:ping', { ts: Date.now() }); } catch { }
        };
        sendPing();
        if (this._presenceInterval) clearInterval(this._presenceInterval);
        this._presenceInterval = setInterval(sendPing, 1000);

        // peer 상태 체크 루프
        if (this._checkInterval) clearInterval(this._checkInterval);
        this._checkInterval = setInterval(() => {
            const now = Date.now();
            const timeoutMs = 1500; // connected -> disconnected 임계값
            Object.keys(this.peers).forEach(id => {
                const p = this.peers[id];
                if (!p) return;
                if (p.status === 'connected' && (now - p.lastSeen) > timeoutMs) {
                    p.status = 'disconnected';
                    this._emit('peer:status', { id, status: 'disconnected' });
                    // disconnected 후 1.5s 뒤에 waiting 상태로 복귀
                    if (p.resetTimer) clearTimeout(p.resetTimer);
                    p.resetTimer = setTimeout(() => {
                        p.status = 'waiting';
                        this._emit('peer:status', { id, status: 'waiting' });
                        p.resetTimer = null;
                    }, 1500);
                }
            });
        }, 500);
    }

    _stopPresence() {
        if (this._presenceInterval) { clearInterval(this._presenceInterval); this._presenceInterval = null; }
        if (this._checkInterval) { clearInterval(this._checkInterval); this._checkInterval = null; }
        // clear peer reset timers
        Object.keys(this.peers).forEach(id => {
            const p = this.peers[id];
            if (p && p.resetTimer) { clearTimeout(p.resetTimer); p.resetTimer = null; }
        });
    }

    // 이벤트 핸들러 등록
    on(action, fn) {
        if (!this.handlers[action]) this.handlers[action] = [];
        this.handlers[action].push(fn);
    }

    // 특정 핸들러 제거 또는 모든 핸들러 제거
    off(action, fn) {
        if (!this.handlers[action]) return;
        if (!fn) {
            delete this.handlers[action];
            return;
        }
        this.handlers[action] = this.handlers[action].filter(f => f !== fn);
        if (this.handlers[action].length === 0) delete this.handlers[action];
    }
}

class MainMirrorBridge extends MirrorBridge {
    constructor(workerPath = '/js/sharedworker.js', autoConnect = true) {
        super('Main', workerPath, autoConnect);
    }
}

class SubMirrorBridge extends MirrorBridge {
    constructor(workerPath = '/js/sharedworker.js', autoConnect = true) {
        super('Sub', workerPath, autoConnect);
    }
}
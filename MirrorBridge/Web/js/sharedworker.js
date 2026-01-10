// SharedWorker: 연결된 포트들(클라이언트들) 간에 메시지를 브로드캐스트
const ports = [];

self.onconnect = function (e) {
    const port = e.ports[0];
    ports.push(port);

    port.onmessage = function (ev) {
        const msg = ev.data;
        // Broadcast to other ports (do not echo back to sender)
        ports.forEach(p => {
            if (p !== port) {
                self.console.log(`Broadcasting message to other port:${port}'= msg`);
                p.postMessage(msg);
            }
        });
    };

    port.start();
};
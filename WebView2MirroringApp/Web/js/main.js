(function () {
    const editor = document.getElementById('editor');
    const status = document.getElementById('status');
    const clientId = 'main'; // 식별자

    // SharedWorker에 연결 (루트가 동일한 origin이어야 함)
    const worker = new SharedWorker('/js/sharedworker.js');
    const port = worker.port;
    let programmaticUpdate = false;

    port.onmessage = function (e) {
        const msg = e.data;
        if (msg && msg.type === 'mirror') {
            programmaticUpdate = true;
            editor.value = msg.text;
            programmaticUpdate = false;
            status.textContent = '상태: 외부에서 업데이트됨';
        }
    };

    port.start();
    status.textContent = '상태: 연결됨';

    editor.addEventListener('input', function () {
        if (programmaticUpdate) return; // 프로그램적 업데이트는 전송하지 않음
        const payload = { type: 'mirror', source: clientId, text: editor.value };
        port.postMessage(payload);
        status.textContent = '상태: 전송됨';
        setTimeout(() => status.textContent = '상태: 연결됨', 600);
    });
})();
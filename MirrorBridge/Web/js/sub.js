(function () {
    // `mirrorbridge.js`의 `MirrorBridge` 클래스를 사용하여 초기화
    const editor = document.getElementById('editor');
    const status = document.getElementById('status');

    // 클라이언트 식별자 'sub'으로 브리지 생성
    window.subMirror = new MirrorBridge('sub', editor, status);
    
})();
function paintCaption(context, text, width, height) {
    const size = Math.round(height * .033);
    context.font = `600 ${size}px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const lines = [];
    for (const paragraph of text.split('\n')) {
        let line = '';
        for (const char of Array.from(paragraph)) {
            if (line && context.measureText(line + char).width > width * .85) {
                lines.push(line);
                line = char;
            }
            else
                line += char;
        }
        if (line)
            lines.push(line);
    }
    const lineHeight = size * 1.45, boxHeight = lines.length * lineHeight + size * .7;
    const y = height - boxHeight - height * .035;
    context.fillStyle = 'rgba(0,0,0,.78)';
    context.fillRect(width * .05, y, width * .9, boxHeight);
    context.fillStyle = '#fff';
    lines.forEach((line, i) => context.fillText(line, width / 2, y + size * .35 + lineHeight * (i + .5)));
}
/** Record only a same-tab crop. The host owns the slide player and export UI. */
export async function recordPresentationVideo(options) {
    const { surface, signal } = options;
    const view = surface.ownerDocument.defaultView;
    const cropFactory = view.CropTarget;
    if (!cropFactory || !navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined')
        throw new Error('최신 Edge 또는 Chrome의 일반 탭에서 열어 주세요.');
    if (signal.aborted)
        throw new DOMException('취소했습니다.', 'AbortError');
    const crop = await cropFactory.fromElement(surface);
    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: options.fps ?? 30 }, width: { ideal: 1920 }, height: { ideal: 1080 }, cursor: 'never' }, audio: false,
        preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude',
    });
    const video = surface.ownerDocument.createElement('video');
    const canvas = surface.ownerDocument.createElement('canvas');
    canvas.width = options.width ?? 1920;
    canvas.height = options.height ?? 1080;
    const context = canvas.getContext('2d', { alpha: false });
    let output, recorder, frame = 0;
    let fail = () => { };
    const failure = new Promise((_, reject) => { fail = reject; });
    // Avoid an unhandled rejection if cancellation happens while capture is being prepared.
    void failure.catch(() => { });
    const onAbort = () => fail(new DOMException('내보내기를 취소했습니다.', 'AbortError'));
    const onEnded = () => fail(new Error('탭 공유가 중단됐습니다. 영상을 저장하지 않았습니다.'));
    const onHidden = () => { if (surface.ownerDocument.hidden)
        fail(new Error('녹화 탭이 숨겨져 내보내기를 중단했습니다.')); };
    try {
        const track = stream.getVideoTracks()[0];
        if (!track?.cropTo || track.getSettings().displaySurface !== 'browser')
            throw new Error('전체 화면이나 창 대신 현재 «영상 내보내기» 탭을 선택해 주세요.');
        await track.cropTo(crop);
        // Some browsers only honor cursor constraints after the source is selected.
        // Unsupported constraints must not prevent an otherwise usable recording.
        await track.applyConstraints({ cursor: 'never' }).catch(() => { });
        track.addEventListener('ended', onEnded);
        signal.addEventListener('abort', onAbort, { once: true });
        surface.ownerDocument.addEventListener('visibilitychange', onHidden);
        if (signal.aborted)
            throw new DOMException('취소했습니다.', 'AbortError');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(value => MediaRecorder.isTypeSupported(value));
        if (!mime)
            throw new Error('이 브라우저에서 WebM 녹화를 지원하지 않습니다.');
        const started = performance.now();
        const draw = () => {
            const seconds = (performance.now() - started) / 1000;
            context.fillStyle = '#000';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            if (options.burnCaptions) {
                const cue = options.captions?.find(item => item.start <= seconds && seconds < item.end);
                if (cue)
                    paintCaption(context, cue.text, canvas.width, canvas.height);
            }
            options.onTime?.(seconds);
            frame = view.requestAnimationFrame(draw);
        };
        draw();
        output = canvas.captureStream(options.fps ?? 30);
        recorder = new MediaRecorder(output, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
        const chunks = [];
        const stopped = new Promise((resolve, reject) => {
            recorder.ondataavailable = event => { if (event.data.size)
                chunks.push(event.data); };
            recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
            recorder.onerror = () => reject(new Error('영상 녹화에 실패했습니다.'));
        });
        void stopped.catch(() => { });
        recorder.start(1000);
        await Promise.race([options.run(), failure, stopped.then(() => { throw new Error('영상 녹화가 예정보다 일찍 끝났습니다.'); })]);
        recorder.stop();
        const blob = await Promise.race([stopped, failure]);
        if (!blob.size)
            throw new Error('녹화된 영상이 없습니다.');
        return blob;
    }
    finally {
        signal.removeEventListener('abort', onAbort);
        surface.ownerDocument.removeEventListener('visibilitychange', onHidden);
        view.cancelAnimationFrame(frame);
        stream.getVideoTracks().forEach(track => track.removeEventListener('ended', onEnded));
        if (recorder && recorder.state !== 'inactive')
            recorder.stop();
        stream.getTracks().forEach(track => track.stop());
        output?.getTracks().forEach(track => track.stop());
        video.pause();
        video.srcObject = null;
    }
}

"""Encode pre-rendered SVG frames with an existing OpenCV VP8 encoder."""
from pathlib import Path
import hashlib
import json
import shutil
import cv2
import numpy as np

REPO = Path(__file__).resolve().parent.parent
ROOT = REPO / 'build' / 'frames'
ASSETS = REPO / 'assets'
WIDTH, HEIGHT, RATE = 1400, 850, 60


def image(path):
    # imdecode supports non-ASCII paths on Windows.
    pixels = cv2.imdecode(np.frombuffer(path.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
    if pixels is None or pixels.shape != (HEIGHT, WIDTH, 3):
        raise RuntimeError(f'Invalid raster input: {path}')
    return pixels


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(part, count):
    files = sorted((ROOT / f'{part}-frames').glob('*.png'))
    if len(files) != count:
        raise RuntimeError(f'{part}: expected {count} inputs, got {len(files)}')
    output = ASSETS / f'codex-{part}-v8.webm'
    writer = cv2.VideoWriter(str(output), cv2.CAP_FFMPEG,
                             cv2.VideoWriter_fourcc(*'VP80'), RATE, (WIDTH, HEIGHT))
    if not writer.isOpened():
        raise RuntimeError('The installed VP8 encoder did not open.')
    try:
        for path in files:
            writer.write(image(path))
    finally:
        writer.release()
    capture = cv2.VideoCapture(str(output), cv2.CAP_FFMPEG)
    fps = capture.get(cv2.CAP_PROP_FPS)
    reported_count = capture.get(cv2.CAP_PROP_FRAME_COUNT)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    decoded = 0
    errors = []
    samples = {0, count // 2, count - 1}
    while True:
        success, frame = capture.read()
        if not success:
            break
        if frame.shape != (HEIGHT, WIDTH, 3):
            raise RuntimeError('Decoded frame dimensions changed.')
        if decoded in samples:
            original = image(files[decoded])
            mean_error = float(np.mean(np.abs(frame.astype(np.float32) - original.astype(np.float32))))
            errors.append({'frame': decoded, 'mean_channel_error_0_255': mean_error})
            cv2.imencode('.png', frame)[1].tofile(str(ROOT / f'{part}-decoded-{decoded:04}.png'))
        decoded += 1
    capture.release()
    if (fps, decoded, width, height) != (60.0, count, WIDTH, HEIGHT):
        raise RuntimeError(f'Bad decode: {fps}, {decoded}, {width}, {height}')
    if not output.read_bytes().startswith(b'\x1a\x45\xdf\xa3'):
        raise RuntimeError('Output is not an EBML/WebM container.')
    return {'file': output.name, 'codec': 'VP8', 'container': 'WebM',
            'sha256': sha(output), 'bytes': output.stat().st_size, 'width': width,
            'height': height, 'frame_rate': fps, 'reported_frames': reported_count,
            'decoded_frames': decoded, 'duration_seconds': decoded / fps,
            'audio': 'No audio is supplied to OpenCV VideoWriter; writer encodes only video frames.',
            'representative_decode_errors': errors}


def main():
    manifest = json.loads((ROOT / 'render-manifest.json').read_text(encoding='utf8'))
    ASSETS.mkdir(exist_ok=True)
    videos = []
    for part, count in [('story', 456), ('burst', 30)]:
        print(f'Encoding and decoding {part}, {count} frames at {RATE} fps…', flush=True)
        videos.append(encode(part, count))
    images = []
    for name in ['codex-poster-v8.png', 'codex-wait-v8.png', 'codex-burst-final-v8.png']:
        path = ROOT / name
        image(path)
        images.append({'file': name, 'sha256': sha(path), 'bytes': path.stat().st_size})
    shutil.copyfile(ROOT / 'codex-poster-v8.png', ASSETS / 'codex-poster-v8.png')
    report = {'status': 'encoded_and_fully_decoded', 'render': manifest, 'videos': videos,
              'images': images, 'encoding_backend': 'OpenCV VideoWriter with VP8 via CAP_FFMPEG',
              'limits': '60 fps is the encoded media frame rate. Browser playback, GPU decoding, and display frame rate are not measured by this script.'}
    report['files'] = {item['file']: item for item in videos + images}
    (REPO / 'build' / 'media-validation.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps({'status': report['status'], 'videos': videos}, indent=2), flush=True)


if __name__ == '__main__':
    main()

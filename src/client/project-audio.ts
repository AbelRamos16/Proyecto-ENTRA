const fileInput = document.querySelector<HTMLInputElement>('[data-audio-file]');
const preview = document.querySelector<HTMLAudioElement>('[data-preview-audio]');
const message = document.querySelector<HTMLElement>('[data-audio-message]');
let previewUrl: string | undefined;
fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file || !preview) return;
  if (file.size > 10 * 1024 * 1024 || !/\.mp3$/i.test(file.name)) {
    fileInput.value = '';
    if (message) message.textContent = 'Selecciona un MP3 de hasta 10 MB.';
    return;
  }
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl; preview.hidden = false;
});
preview?.addEventListener('loadedmetadata', () => {
  if (message) message.textContent = `Duración: ${preview.duration.toFixed(1)} segundos.`;
  const start = document.querySelector<HTMLInputElement>('[name="hookStart"]');
  const end = document.querySelector<HTMLInputElement>('[name="hookEnd"]');
  if (start && end) {
    start.required = end.required = true;
    start.max = end.max = String(preview.duration);
  }
});
preview?.addEventListener('error', () => { if (message) message.textContent = 'No se pudo reproducir este archivo. Selecciona otro MP3.'; });
const audio = document.querySelector<HTMLAudioElement>('[data-hook-audio]');
const hookButton = document.querySelector<HTMLButtonElement>('[data-play-hook]');
let playingHook = false;
hookButton?.addEventListener('click', async () => {
  if (!audio) return;
  try {
    if (audio.readyState === 0) await new Promise<void>((resolve, reject) => {
      audio.addEventListener('loadedmetadata', () => resolve(), { once: true });
      audio.addEventListener('error', () => reject(new Error('Audio no disponible')), { once: true });
      audio.load();
    });
    audio.currentTime = Number(hookButton.dataset.start);
    playingHook = true;
    await audio.play();
    if (message) message.textContent = 'Reproduciendo el hook.';
  } catch { playingHook = false; if (message) message.textContent = 'No se pudo reproducir el hook. Inténtalo de nuevo.'; }
});
audio?.addEventListener('timeupdate', () => {
  if (playingHook && audio.currentTime >= Number(hookButton?.dataset.end)) {
    audio.pause(); playingHook = false;
    if (message) message.textContent = 'Hook terminado.';
  }
});
audio?.addEventListener('pause', () => { playingHook = false; });

// Selector del hook: la onda se obtiene de las muestras reales del MP3.
const selector = document.querySelector<HTMLElement>('[data-hook-selector]');
const canvas = document.querySelector<HTMLCanvasElement>('[data-hook-wave]');
const startInput = document.querySelector<HTMLInputElement>('[name="hookStart"]');
const endInput = document.querySelector<HTMLInputElement>('[name="hookEnd"]');
const handles = [...document.querySelectorAll<HTMLButtonElement>('[data-hook-handle]')];
const selectionLabel = document.querySelector<HTMLOutputElement>('[data-hook-label]');
const selectionPlay = document.querySelector<HTMLButtonElement>('[data-hook-preview]');
let peaks: number[] = [];
let duration = 0;
let generation = 0;
let selectionPlaying = false;
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;

function drawSelection() {
  if (!canvas || !selector || !startInput || !endInput || !duration) return;
  const width = canvas.getBoundingClientRect().width;
  if (!width) return;
  const height = 112;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio); canvas.height = height * ratio;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(ratio, ratio);
  const start = Number(startInput.value), end = Number(endInput.value);
  const left = start / duration * width, right = end / duration * width;
  context.fillStyle = '#ffc65c22'; context.fillRect(left, 0, right - left, height);
  const count = Math.max(1, Math.floor(width / 4));
  for (let i = 0; i < count; i++) {
    const amplitude = peaks[Math.floor(i / count * peaks.length)] || 0;
    const barHeight = Math.max(3, amplitude * 94);
    context.fillStyle = i * 4 >= left && i * 4 <= right ? '#ffc65c' : '#61728c';
    context.fillRect(i * 4, (height - barHeight) / 2, 2, barHeight);
  }
  for (const handle of handles) {
    const isStart = handle.dataset.hookHandle === 'start';
    const value = isStart ? start : end;
    handle.style.left = `${value / duration * 100}%`;
    handle.setAttribute('aria-valuenow', String(value));
    handle.setAttribute('aria-valuemin', String(isStart ? 0 : start + 0.1));
    handle.setAttribute('aria-valuemax', String(isStart ? end - 0.1 : duration));
    handle.setAttribute('aria-valuetext', formatTime(value));
  }
  if (selectionLabel) selectionLabel.textContent = `${formatTime(start)} — ${formatTime(end)} · ${(end - start).toFixed(1)} s`;
}

function moveBoundary(kind: string, value: number) {
  if (!startInput || !endInput) return;
  const rounded = Math.round(value * 10) / 10;
  const input = kind === 'start' ? startInput : endInput;
  input.value = String(kind === 'start'
    ? Math.max(0, Math.min(rounded, Number(endInput.value) - 0.1))
    : Math.min(duration, Math.max(rounded, Number(startInput.value) + 0.1)));
  if (selectionPlaying) preview?.pause();
  drawSelection();
}

async function loadWaveform() {
  if (!preview || !selector || !startInput || !endInput) return;
  const currentGeneration = ++generation;
  selector.hidden = true;
  if (message) message.textContent = 'Preparando la onda…';
  let audioContext: AudioContext | undefined;
  try {
    const selectedFile = fileInput?.files?.[0];
    const bytes = selectedFile ? await selectedFile.arrayBuffer() : await (await fetch(preview.currentSrc || preview.src)).arrayBuffer();
    audioContext = new AudioContext();
    const decoded = await audioContext.decodeAudioData(bytes);
    if (generation !== currentGeneration) return;
    duration = Math.floor(Math.min(decoded.duration, preview.duration) * 10) / 10;
    if (duration < 0.1) throw new Error('Audio demasiado corto');
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const bins = Math.min(2000, decoded.length);
    const binSize = Math.floor(decoded.length / bins);
    peaks = Array.from({ length: bins }, (_, bin) => {
      let peak = 0;
      for (const channel of channels) {
        for (let i = bin * binSize; i < (bin + 1) * binSize; i++) peak = Math.max(peak, Math.abs(channel[i]));
      }
      return peak;
    });
    const maximum = Math.max(...peaks, 0.01);
    peaks = peaks.map(peak => peak / maximum);
    if (!endInput.value || Number(endInput.value) > duration || Number(startInput.value) >= Number(endInput.value)) {
      startInput.value = '0'; endInput.value = String(Math.min(15, duration));
    }
    selector.hidden = false;
    drawSelection();
    if (message) message.textContent = 'Arrastra los extremos para marcar dónde entra tu colaborador.';
  } catch {
    if (generation === currentGeneration && message) message.textContent = 'No se pudo dibujar la onda. Puedes marcar el tramo con los segundos de abajo.';
  } finally { await audioContext?.close(); }
}
preview?.addEventListener('loadedmetadata', loadWaveform);
if (preview && preview.readyState >= 1) void loadWaveform();
if (canvas) new ResizeObserver(drawSelection).observe(canvas);
for (const input of [startInput, endInput]) input?.addEventListener('input', drawSelection);
for (const handle of handles) {
  let dragging = false;
  const move = (event: PointerEvent) => {
    if (!dragging || !canvas) return;
    const bounds = canvas.getBoundingClientRect();
    moveBoundary(handle.dataset.hookHandle || 'start', (event.clientX - bounds.left) / bounds.width * duration);
  };
  handle.addEventListener('pointerdown', event => {
    dragging = true; handle.setPointerCapture(event.pointerId); event.preventDefault();
  });
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', () => { dragging = false; });
  handle.addEventListener('pointercancel', () => { dragging = false; });
  handle.addEventListener('keydown', event => {
    const kind = handle.dataset.hookHandle || 'start';
    const current = Number(kind === 'start' ? startInput?.value : endInput?.value);
    const step = event.shiftKey ? 1 : 0.1;
    const values: Record<string, number> = { ArrowLeft: current - step, ArrowDown: current - step, ArrowRight: current + step, ArrowUp: current + step, Home: 0, End: duration };
    if (event.key in values) { event.preventDefault(); moveBoundary(kind, values[event.key]); }
  });
}
selectionPlay?.addEventListener('click', async () => {
  if (!preview || !startInput) return;
  if (selectionPlaying) { preview.pause(); return; }
  preview.currentTime = Number(startInput.value);
  selectionPlaying = true;
  try { await preview.play(); if (selectionPlay) selectionPlay.textContent = 'Pausar fragmento'; }
  catch { selectionPlaying = false; if (message) message.textContent = 'No se pudo reproducir el fragmento.'; }
});
preview?.addEventListener('timeupdate', () => {
  if (selectionPlaying && endInput && preview.currentTime >= Number(endInput.value)) preview.pause();
});
preview?.addEventListener('pause', () => {
  selectionPlaying = false;
  if (selectionPlay) selectionPlay.textContent = 'Escuchar fragmento';
});
fileInput?.addEventListener('change', () => {
  generation++; preview?.pause();
  if (selector) selector.hidden = true;
});

// Revisar el límite en cada fotograma evita depender de la frecuencia de timeupdate.
function watchSelectionEnd() {
  if (!selectionPlaying || !preview || !endInput) return;
  if (preview.currentTime >= Number(endInput.value)) { preview.pause(); return; }
  requestAnimationFrame(watchSelectionEnd);
}
preview?.addEventListener('playing', () => { if (selectionPlaying) requestAnimationFrame(watchSelectionEnd); });

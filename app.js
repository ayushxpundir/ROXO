const fileInput = document.getElementById('fileInput');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const output = document.getElementById('asciiOutput');
const playBtn = document.getElementById('playBtn');
const charsetSelect = document.getElementById('charsetSelect');
const status = document.getElementById('status');

const CHARSETS = {
    dense: ' .:-=+*#%@@',
    blocks: ' ░▒▓█',
    binary: ' 01',
    minimal: ' .oO@'
};

let running = false;
let rafId = null;
let currentVideoUrl = null;

// Caching configuration variables globally so the render loop doesn't recalculate them
let cachedCols = 0;
let cachedRows = 0;
let charMetrics = { width: 3.0, height: 5.0 };
let availablePixelWidth = 0;

// --- FPS METRIC TRACKING VARIABLES ---
let lastFrameTime = performance.now();
let fpsArray = []; // Stores recent frame times to provide a smooth, averaged FPS readout

function getCharDimensions() {
    const testSpan = document.createElement('span');
    testSpan.textContent = 'M';
    testSpan.style.fontFamily = "ui-monospace, 'Cascadia Code', 'Courier New', monospace";
    testSpan.style.fontSize = '5px';
    testSpan.style.lineHeight = '1.0';
    testSpan.style.letterSpacing = '0px';
    testSpan.style.position = 'absolute';
    testSpan.style.visibility = 'hidden';
    document.body.appendChild(testSpan);
    
    const rect = testSpan.getBoundingClientRect();
    document.body.removeChild(testSpan);
    
    return {
        width: rect.width || 3.0,
        height: rect.height || 5.0
    };
}

function updateLayoutMetrics() {
    if (!output) return;
    const computedStyle = window.getComputedStyle(output);
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
    
    availablePixelWidth = output.clientWidth - paddingLeft - paddingRight;
    charMetrics = getCharDimensions();
    
    calculateTargetGrid();
}

function calculateTargetGrid() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || !availablePixelWidth) return;

    const cols = Math.floor(availablePixelWidth / charMetrics.width);
    const videoAspectRatio = vh / vw;
    const charAspect = charMetrics.width / charMetrics.height;
    const rows = Math.max(1, Math.round(videoAspectRatio * cols * charAspect));

    if (cols > 0 && rows > 0) {
        if (cols !== cachedCols || rows !== cachedRows) {
            cachedCols = cols;
            cachedRows = rows;
            canvas.width = cols;
            canvas.height = rows;
        }
    }
}

window.addEventListener('resize', updateLayoutMetrics);
video.addEventListener('loadedmetadata', calculateTargetGrid);

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    running = false;
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }

    video.pause();
    output.style.display = 'none';
    output.textContent = '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    playBtn.textContent = 'Play';

    if (currentVideoUrl) {
        URL.revokeObjectURL(currentVideoUrl);
    }

    currentVideoUrl = URL.createObjectURL(file);
    video.src = currentVideoUrl;
    video.load();
    status.textContent = 'Loading video…';
    playBtn.disabled = true;
});

video.addEventListener('loadeddata', () => {
    video.loop = true;
    updateLayoutMetrics();
    status.textContent = 'Ready. Press Play.';
    playBtn.disabled = false;
});

playBtn.addEventListener('click', () => {
    if (!running) {
        output.style.display = 'block'; 
        updateLayoutMetrics(); 
        
        video.play();
        running = true;
        playBtn.textContent = 'Pause';
        
        // Reset FPS timer on startup to avoid huge initial spikes
        lastFrameTime = performance.now();
        fpsArray = [];
        
        renderFrame();
    } else {
        video.pause();
        running = false;
        playBtn.textContent = 'Play';
        if (rafId) cancelAnimationFrame(rafId);
    }
});

function renderFrame() {
    if (!running) return;

    // --- MEASURE FPS ---
    const now = performance.now();
    const delta = now - lastFrameTime;
    lastFrameTime = now;

    // Avoid dividing by zero if frames execute instantly
    if (delta > 0) {
        const currentFps = 1000 / delta;
        fpsArray.push(currentFps);
        
        // Keep a rolling average of the last 30 frames so the text doesn't flicker wildly
        if (fpsArray.length > 30) {
            fpsArray.shift();
        }
    }

    const averageFps = fpsArray.length > 0 
        ? Math.round(fpsArray.reduce((a, b) => a + b, 0) / fpsArray.length) 
        : 0;
    // -------------------

    if (cachedCols && cachedRows) {
        ctx.drawImage(video, 0, 0, cachedCols, cachedRows);

        const frame = ctx.getImageData(0, 0, cachedCols, cachedRows).data;
        const charset = CHARSETS[charsetSelect.value];
        const ramp = charset.length - 1;

        let str = '';
        const totalPixels = cachedCols * cachedRows;

        for (let i = 0; i < totalPixels; i++) {
            const idx = i * 4;
            const r = frame[idx];
            const g = frame[idx + 1];
            const b = frame[idx + 2];

            const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
            const gammaAdjusted = brightness * brightness;

            const charIndex = (gammaAdjusted * ramp) | 0;
            str += charset[charIndex];

            if ((i + 1) % cachedCols === 0) {
                str += '\n';
            }
        }
        output.textContent = str;
        
        // APPEND THE LIVE COUNTER TO THE STATUS BOX
        status.textContent = `Playing characters: ${cachedCols}×${cachedRows}  | Performance: ${averageFps} FPS`;
    }

    rafId = requestAnimationFrame(renderFrame);
}
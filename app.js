const fileInput = document.getElementById('fileInput');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const output = document.getElementById('asciiOutput');
const playBtn = document.getElementById('playBtn');
const charsetSelect = document.getElementById('charsetSelect');
const statusEl = document.getElementById('status'); // Renamed to remove warning

const CHARSETS = {
    dense: ' .:-=+*#%@@',
    blocks: ' ░▒▓█',
    binary: ' 01',
    minimal: ' .oO@'
};

let running = false;
let rafId = null;
let currentVideoUrl = null;

// Caching configuration variables globally
let cachedCols = 0;
let cachedRows = 0;
let charMetrics = { width: 3.0, height: 5.0 };
let availablePixelWidth = 0;

// FPS Metric tracking
let lastFrameTime = performance.now();
let fpsArray = [];

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

    // PERFORMANCE CEILING: Cap columns to protect CPU layout speeds on large displays
    let cols = Math.floor(availablePixelWidth / charMetrics.width);
    const MAX_COLS = 180; 
    if (cols > MAX_COLS) cols = MAX_COLS;

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

        // --- DYNAMIC FONT SCALING ENGINE ---
        const scaledCharWidth = availablePixelWidth / cols;
        const scaledFontSize = scaledCharWidth / (charMetrics.width / 5); 

        output.style.fontSize = `${scaledFontSize}px`;
        output.style.lineHeight = '1.0';
        output.style.width = '100%';
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
    statusEl.textContent = 'Loading video…';
    playBtn.disabled = true;
});

video.addEventListener('loadeddata', () => {
    video.loop = true;
    updateLayoutMetrics();
    statusEl.textContent = 'Ready. Press Play.';
    playBtn.disabled = false;
});

playBtn.addEventListener('click', () => {
    if (!running) {
        output.style.display = 'block'; 
        updateLayoutMetrics(); 
        
        video.play();
        running = true;
        playBtn.textContent = 'Pause';
        
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

    // --- ACCURATE TIME-WINDOW FPS METRIC ---
    const now = performance.now();
    const delta = now - lastFrameTime;
    lastFrameTime = now;

    if (delta > 0) {
        fpsArray.push(delta);
        if (fpsArray.length > 30) fpsArray.shift();
    }

    const averageDelta = fpsArray.length > 0 
        ? fpsArray.reduce((a, b) => a + b, 0) / fpsArray.length 
        : 0;

    const averageFps = averageDelta > 0 ? Math.round(1000 / averageDelta) : 0;

    if (cachedCols && cachedRows) {
        ctx.drawImage(video, 0, 0, cachedCols, cachedRows);

        const frame = ctx.getImageData(0, 0, cachedCols, cachedRows).data;
        const charset = CHARSETS[charsetSelect.value];
        const ramp = charset.length - 1;
        const totalPixels = cachedCols * cachedRows;

        let resultString = '';
        
        for (let i = 0; i < totalPixels; i++) {
            const idx = i << 2; 
            const r = frame[idx];
            const g = frame[idx + 1];
            const b = frame[idx + 2];

            const brightness = (r * 299 + g * 587 + b * 114) / 255000;
            
            const charIndex = Math.round(brightness * brightness * ramp);
            
            resultString += charset[charIndex] || charset[0];

            if ((i + 1) % cachedCols === 0) {
                resultString += '\n';
            }
        }
        
        output.textContent = resultString;
        
        statusEl.textContent = `Playing characters: ${cachedCols}×${cachedRows} | Average FPS : ${averageFps} FPS`;
    }

    rafId = requestAnimationFrame(renderFrame);
}
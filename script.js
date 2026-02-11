/**
 * H5 Sequence Player Script with Physics Interaction
 * Compatible with Chrome 59+, Touch devices, and Mouse input.
 */

(function () {
    // --- Configuration ---
    const TOTAL_FRAMES = 24;
    const AUTO_PLAY_SPEED = 0.2; // Base auto-play speed (frames per tick)
    const FRICTION = 0.9;         // Inertia decay
    const SENSITIVITY = 10;       // Drag sensitivity

    // Debug Mode - Only activates if mock.js is loaded AND ?debug=true
    const DEBUG_MODE = !!(window.__H5_MOCK__) && new URLSearchParams(window.location.search).get('debug') === 'true';

    // Fallback placeholder for failed images (1x1 transparent pixel as data URL)
    const FALLBACK_IMG_SRC = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"%3E%3Crect fill="%231a1a24" width="300" height="400"/%3E%3Ctext x="150" y="200" text-anchor="middle" fill="%23666" font-size="14"%3E%E5%9B%BE%E7%89%87%E5%8A%A0%E8%BD%BD%E5%A4%B1%E8%B4%A5%3C/text%3E%3C/svg%3E';

    // Configuration - loaded from config.json
    let CONFIG = null;

    // Load config from JSON file
    async function loadConfig() {
        try {
            const response = await fetch('config.json');
            CONFIG = await response.json();
            console.log('Config loaded:', CONFIG.version);
            return true;
        } catch (error) {
            console.error('Failed to load config.json:', error);
            // Fallback config
            CONFIG = {
                styles: { 'Style1': { name: '毛毡' }, 'Style2': { name: '水晶' } },
                words: { 'Word1': { name: '冰雪女孩' }, 'Word2': { name: '柴犬' } },
                sequences: {}
            };
            return false;
        }
    }

    // Helper: Get prompt for style + word + version (Chrome 59 compatible)
    function getPrompt(styleId, wordId, version) {
        try {
            var seq = CONFIG.sequences;
            if (seq && seq[styleId] && seq[styleId][wordId] && seq[styleId][wordId][version]) {
                return seq[styleId][wordId][version].prompt || '暂无描述';
            }
            return '暂无描述';
        } catch (e) {
            return '暂无描述';
        }
    }

    // Helper: Get style name (Chrome 59 compatible)
    function getStyleName(styleId) {
        if (CONFIG.styles && CONFIG.styles[styleId] && CONFIG.styles[styleId].name) {
            return CONFIG.styles[styleId].name;
        }
        return styleId;
    }

    // Helper: Get word name (Chrome 59 compatible)
    function getWordName(wordId) {
        if (CONFIG.words && CONFIG.words[wordId] && CONFIG.words[wordId].name) {
            return CONFIG.words[wordId].name;
        }
        return wordId;
    }

    // --- State ---
    const state = {
        currentFrame: 0,
        word: 'Word1',
        style: 'Style1',
        currentVariant: 'v1', // Track current version (v1, v2, v3)
        isDragging: false,
        startX: 0,
        startFrame: 0,
        direction: 1, // 1 for forward, -1 for backward

        // Physics
        velocity: 0,        // Current velocity
        lastX: 0,
        lastTime: 0,
        isAutoPlaying: true, // Should we do base rotation?

        images: [],
        assetsLoaded: false,
        isWaiting: true, // Start in waiting state
        loadingStartTime: 0, // Track when loading started
        typingInterval: null // Track typing effect
    };

    let animationId; // rAF ID

    // --- DOM Elements ---
    // --- DOM Elements ---
    const btnLeft = document.getElementById('btnLeft');
    const btnRight = document.getElementById('btnRight');
    const wordLabel = document.getElementById('wordLabel');
    const canvas = document.getElementById('sequenceCanvas');
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('sequenceContainer');
    const globalLoadingOverlay = document.getElementById('globalLoadingOverlay');
    const sequenceLoadingOverlay = document.getElementById('sequenceLoadingOverlay');
    const matrixCanvas = document.getElementById('matrixCanvas');
    const interactionHint = document.getElementById('interactionHint');
    const hintIcon = document.getElementById('hintIcon');
    const hintText = document.getElementById('hintText');

    // --- Audio Manager ---
    const audioManager = {
        sounds: {
            click: new Audio('assets/sounds/click.mp3'),
            matrix: new Audio('assets/sounds/matrix_loop.mp3'),
            success: new Audio('assets/sounds/success.mp3'),
            bgm: new Audio('assets/sounds/bgm.mp3')
        },
        init() {
            // Configure sounds
            this.sounds.matrix.loop = true;
            this.sounds.bgm.loop = true;
            this.sounds.bgm.volume = 0.5; // Lower volume for BGM

            // Unlock audio on first interaction
            const unlockAudio = () => {
                // Try to play BGM if paused
                if (this.sounds.bgm.paused) {
                    this.sounds.bgm.play().catch(e => console.log('Audio autoplay blocked, waiting for interaction'));
                }
                // Preload others
                this.sounds.click.load();
                this.sounds.success.load();

                // Remove listeners once triggered
                document.removeEventListener('click', unlockAudio);
                document.removeEventListener('touchstart', unlockAudio);
            };

            document.addEventListener('click', unlockAudio);
            document.addEventListener('touchstart', unlockAudio);
        },
        play(name) {
            const sound = this.sounds[name];
            if (sound) {
                if (name === 'click') {
                    // Allow overlapping clicks
                    const clone = sound.cloneNode();
                    clone.volume = sound.volume;
                    clone.play().catch(() => { });
                } else if (name === 'matrix') {
                    sound.play().catch(() => { });
                } else {
                    sound.play().catch(() => { });
                }
            }
        },
        stop(name) {
            const sound = this.sounds[name];
            if (sound) {
                sound.pause();
                sound.currentTime = 0;
            }
        }
    };


    // Matrix Rain Effect - Performance optimized with RAF
    const matrixEffect = {
        canvas: null,
        ctx: null,
        columns: [],
        fontSize: 20, // Larger font size
        drops: [],
        speeds: [], // Variable speeds
        rafId: null, // requestAnimationFrame ID
        isRunning: false,
        lastFrameTime: 0,
        frameInterval: 50, // Target 20fps (50ms per frame)

        init(cvs) {
            this.canvas = cvs;
            this.ctx = cvs.getContext('2d');
            this.resize();
        },

        resize() {
            if (!this.canvas) return;
            const rect = this.canvas.parentElement.getBoundingClientRect();
            this.canvas.width = rect.width * window.devicePixelRatio;
            this.canvas.height = rect.height * window.devicePixelRatio;
            this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

            const columns = Math.floor((rect.width) / this.fontSize);
            this.drops = [];
            this.speeds = [];
            const rows = Math.floor(this.canvas.height / window.devicePixelRatio / this.fontSize); // Calculate max rows

            for (let i = 0; i < columns; i++) {
                // Immediate coverage: Random start position anywhere on screen
                this.drops[i] = Math.floor(Math.random() * rows);
                // Variable speed: Between 0.5 and 1.5
                this.speeds[i] = Math.random() * 1.0 + 0.5;
            }
        },

        draw(timestamp) {
            if (!this.isRunning) return;

            // Throttle to target frame rate
            const elapsed = timestamp - this.lastFrameTime;
            if (elapsed < this.frameInterval) {
                this.rafId = requestAnimationFrame((t) => this.draw(t));
                return;
            }
            this.lastFrameTime = timestamp - (elapsed % this.frameInterval);

            if (!this.ctx) return;

            // Fading trail effect that respects transparency
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.globalCompositeOperation = 'source-over';

            this.ctx.fillStyle = 'rgba(0, 255, 255, 0.8)'; // Cyan

            for (let i = 0; i < this.drops.length; i++) {
                const text = Math.random() > 0.5 ? '1' : '0'; // Binary
                const speed = this.speeds[i];
                const dynamicSize = Math.floor(speed * 20);
                this.ctx.font = `${dynamicSize}px monospace`;

                const x = i * this.fontSize;
                const y = this.drops[i] * this.fontSize;

                this.ctx.fillText(text, x, y);

                // Reset when off screen
                if (y > this.canvas.height / window.devicePixelRatio && Math.random() > 0.975) {
                    this.drops[i] = 0;
                    this.speeds[i] = Math.random() * 1.0 + 0.5;
                }
                this.drops[i] += speed;
            }

            this.rafId = requestAnimationFrame((t) => this.draw(t));
        },

        start() {
            if (!this.canvas) return;
            this.canvas.classList.remove('hidden');
            this.resize();
            this.isRunning = true;
            this.lastFrameTime = 0;
            if (this.rafId) cancelAnimationFrame(this.rafId);
            this.rafId = requestAnimationFrame((t) => this.draw(t));
        },

        stop() {
            this.isRunning = false;
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
            if (this.canvas) {
                this.canvas.classList.add('hidden');
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            }
        }
    };

    // --- Initialization ---
    async function init() {
        // Load config first
        await loadConfig();

        if (matrixCanvas) matrixEffect.init(matrixCanvas);
        audioManager.init(); // Init Audio
        resizeCanvas();
        bindEvents();

        // --- Mock/Debug Integration ---
        // If mock.js is loaded and ?debug=true, initialize the debug module
        if (DEBUG_MODE && window.__H5_MOCK__ && window.__H5_MOCK__.init) {
            window.__H5_MOCK__.init({
                CONFIG: CONFIG,
                state: state,
                matrixEffect: matrixEffect,
                canvas: canvas,
                sequenceCanvas: document.getElementById('sequenceCanvas'),
                sequenceLoadingOverlay: sequenceLoadingOverlay,
                loadSequence: loadSequence,
                updateLoadingText: updateLoadingText,
                updateTextDisplay: updateTextDisplay,
                TOTAL_FRAMES: TOTAL_FRAMES,
                FALLBACK_IMG_SRC: FALLBACK_IMG_SRC
            });
        }

        // Start in "Waiting" state (Global Spinner only, no Matrix Rain)
        if (globalLoadingOverlay) globalLoadingOverlay.classList.remove('hidden');
        if (sequenceLoadingOverlay) sequenceLoadingOverlay.classList.add('hidden');

        // --- Preload Basic UI Assets ---
        const uiAssets = [
            'assets/starry_bg.png',
            'assets/exclude.png',
            'assets/icon_arrow.png',
            'assets/icon_reset.png'
        ];

        try {
            await Promise.all(uiAssets.map(src => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.src = src;
                    img.onload = resolve;
                    img.onerror = () => {
                        console.warn('Failed to preload UI asset:', src);
                        resolve(); // Continue anyway
                    };
                });
            }));
            console.log('UI Assets preloaded');
        } catch (e) {
            console.error('Preload error:', e);
        }

        // Hide Global Overlay only after UI assets are ready
        // But keep it if we are waiting for URL params logic to take over?
        // Actually, the request says "until basic素材都加载完全了才会展示界面". 
        // So we can hide global overlay here IF we are in a mode that doesn't immediately wait for "Generating".
        // However, if we have URL params, we transition to "Generating" (SequenceScope). 
        // If we don't, we show the idle stage.

        // Let's hide the global spinner now that assets are ready.
        // If deep linking starts, it will immediately show the sequence overlay.
        if (globalLoadingOverlay) globalLoadingOverlay.classList.add('hidden');

        // Auto-play BGM immediately after loading (as requested)
        audioManager.play('bgm');
        // updateLoadingText('Loading...'); // Static text in HTML is fine
        // matrixEffect.start(); // Do not start yet

        // Ensure Info Panel is empty/hidden initially
        const infoPanel = document.querySelector('.info-panel');
        if (infoPanel) infoPanel.innerHTML = '';

        startLoop(); // Start the game loop (rendering will just show empty/loading)

        // Dispatch Ready Event for Bridge Handshake
        console.log("H5 Ready: Dispatching 'ready' signal");
        window.parent.postMessage({
            source: "h5",
            cmd: "ready"
        }, "*");

        // Check for URL parameters to trigger playback (Deep Linking)
        const urlParams = new URLSearchParams(window.location.search);
        const urlStyle = urlParams.get('style');
        const urlWord = urlParams.get('word');

        // --- Smart Interaction Hint ---
        // Detect device type and set appropriate hint text + icon
        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (!isTouchDevice) {
            document.body.classList.add('is-pc');
        }
        if (hintText) {
            hintText.textContent = isTouchDevice ? '左右滑动旋转' : '按住拖动旋转';
        }
        // Hint is initially hidden via CSS, will be activated when sequence loads

        if (urlStyle && urlWord) {
            console.log(`URL Params found: style=${urlStyle}, word=${urlWord}`);
            // Small delay to ensure everything is ready
            setTimeout(() => {
                handleExternalCommand({ style: urlStyle, word: urlWord });
            }, 500);
        }
    }

    // --- Asset Loading ---



    let loadTimeoutId = null;

    function loadSequence(styleId, wordId) {
        state.assetsLoaded = false;
        state.loadingStartTime = Date.now(); // Start timer

        // Hide global initial loader if still visible
        if (globalLoadingOverlay) globalLoadingOverlay.classList.add('hidden');

        // UI update for "Generating" state (Sequence Scope)
        if (sequenceLoadingOverlay) sequenceLoadingOverlay.classList.remove('hidden');
        updateLoadingText('正在生成中，请稍候...'); // Helper now targets sequence overlay

        matrixEffect.start(); // Start Matrix Rain
        audioManager.play('matrix'); // Start Matrix Sound

        sequenceCanvas.classList.add('hidden'); // Hide sequence during loading

        // Set 30s Timeout
        if (loadTimeoutId) clearTimeout(loadTimeoutId);
        loadTimeoutId = setTimeout(() => {
            if (!state.assetsLoaded) {
                handleLoadTimeout();
            }
        }, 30000);

        // Determine variant (v1, v2, v3) based on history - MUST be before updateTextDisplay
        const variant = getVariantForSequence(styleId, wordId);
        console.log(`Loading variant: v${variant} for ${styleId}/${wordId}`);
        // Update Info Panel (uses state.currentVariant set above)
        updateTextDisplay(styleId, wordId);

        // Clear existing images to avoid mixing
        state.images = [];

        let loadedCount = 0;
        let failedCount = 0;

        for (let i = 1; i <= TOTAL_FRAMES; i++) {
            const num = i < 10 ? `0${i}` : `${i}`;
            // Base path structure without extension
            // const basePath = `assets/sequences/${styleId}/${wordId}/v${variant}/${num}`;
            // Updated to OSS URL as per request
            const basePath = `https://experience-class.oss-accelerate.aliyuncs.com/btc_py_2_3_3/sequences/${styleId}/${wordId}/v${variant}/${num}`;

            // Strict JPG Loading (No WebP/PNG support)
            const imgJpg = new Image();
            const jpgPath = `${basePath}.jpg`;
            const frameIndex = i - 1; // Capture for closure

            imgJpg.src = jpgPath;
            imgJpg.onload = () => {
                state.images[frameIndex] = imgJpg;
                loadedCount++;
                checkLoadStatus(loadedCount, failedCount, TOTAL_FRAMES);
            };
            imgJpg.onerror = () => {
                console.warn(`Frame ${i} failed to load (JPG): ${jpgPath}`);
                failedCount++;
                // Use 1x1 fallback to prevent crash in draw loop
                const fallbackImg = new Image();
                fallbackImg.src = FALLBACK_IMG_SRC;
                state.images[frameIndex] = fallbackImg;
                loadedCount++; // Count as loaded (but failed) to trigger completion
                checkLoadStatus(loadedCount, failedCount, TOTAL_FRAMES);
            };
        }
    }

    function checkLoadStatus(current, failed, total) {
        if (current >= total) {
            state.assetsLoaded = true;

            // Show warning if some images failed to load
            if (failed > 0) {
                console.warn(`${failed} of ${total} images failed to load. Using fallback placeholders.`);
                showLoadingError(`部分图片加载失败 (${failed}/${total})`);
            }

            // Enforce minimum 5 seconds loading time (Requested optimization)
            const elapsed = Date.now() - state.loadingStartTime;
            const minDuration = 5000;
            const remaining = Math.max(0, minDuration - elapsed);

            setTimeout(() => {
                if (loadTimeoutId) clearTimeout(loadTimeoutId); // Clear timeout on success
                if (sequenceLoadingOverlay) sequenceLoadingOverlay.classList.add('hidden');
                matrixEffect.stop(); // Stop Matrix Rain
                audioManager.stop('matrix'); // Stop Matrix Sound
                audioManager.play('success'); // Play Success Sound
                sequenceCanvas.classList.remove('hidden'); // Reveal sequence

                // Show interaction hint after sequence is revealed
                if (interactionHint) {
                    interactionHint.classList.add('active');
                }
                // Auto-play is already enabled by default in state
            }, remaining);
        }
    }

    // Show loading error message to user (Targeting Sequence Overlay)
    function showLoadingError(message) {
        const target = sequenceLoadingOverlay || document.querySelector('.loading-overlay');
        const loadingText = target.querySelector('.loading-text');
        if (loadingText) {
            loadingText.innerHTML = `<span style="color: #ff6b6b; font-size: 14px;">${message}</span>`;
        }
    }

    function updateLoadingText(text) {
        // Defaults to sequence overlay as that's where dynamic updates happen
        const target = sequenceLoadingOverlay || document.querySelector('.loading-overlay');
        const loadingText = target.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = text;
            loadingText.style.color = '#fff'; // Reset color
        }
    }

    function handleLoadTimeout() {
        if (state.assetsLoaded) return; // Race condition check
        console.error('Loading timed out (30s)');
        updateLoadingText('生成失败 (超时)');
        matrixEffect.stop();
        audioManager.stop('matrix');
        // Keep overlay visible to show error
    }

    function resizeCanvas() {
        if (!canvas) return;
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    // --- Main Loop (Physics & Rendering) ---
    function startLoop() {
        if (!animationId) {
            loop();
        }
    }

    function loop() {
        updatePhysics();
        render();
        animationId = requestAnimationFrame(loop);
    }

    function updatePhysics() {
        if (state.isDragging) return; // Physics paused while holding

        if (!state.assetsLoaded) return;

        // Reset Logic (High Priority)
        if (state.isResetting) {
            // Fast return to 0
            const diff = 0 - state.currentFrame;
            if (Math.abs(diff) < 0.5) {
                state.currentFrame = 0;
                state.velocity = 0;
                state.isResetting = false;
                state.isAutoPlaying = false; // Stop after reset
                state.mode = 'MANUAL';
            } else {
                // Determine shortest path? No, just go direct for "rewind" feel or shortest?
                // Simple rewind:
                state.currentFrame += (diff * 0.1); // Ease out
            }
            updateFrameState(state.currentFrame);
            return;
        }

        // 1. Inertia / Momentum
        // If velocity is faster than auto-play speed, we are in "Inertia Phase"
        if (Math.abs(state.velocity) > AUTO_PLAY_SPEED) {
            updateFrameState(state.currentFrame + state.velocity);
            state.velocity *= FRICTION; // Decay

            // Sync direction in case velocity flipped (unlikely with simple friction but good for safety)
            if (state.velocity !== 0) state.direction = Math.sign(state.velocity);

            // Cancel any idle sway state if user interacted
            state.mode = 'MANUAL';
        }
        // 2. Base Auto-Play
        // If velocity dropped below threshold (or never had high velocity), we switch to constant speed
        else if (state.isAutoPlaying) {
            // Ensure velocity is zeroed if we transitioned from inertia
            state.velocity = 0;

            const nextFrame = state.currentFrame + (AUTO_PLAY_SPEED * state.direction);
            updateFrameState(nextFrame);

            // Check for full loop completion - pause at first frame then repeat
            state.accumulatedFrames = (state.accumulatedFrames || 0) + AUTO_PLAY_SPEED;
            if (state.accumulatedFrames >= TOTAL_FRAMES) {
                // Completed one full loop - pause briefly at first frame
                state.currentFrame = 0;
                state.accumulatedFrames = 0;
                state.isAutoPlaying = false;
                state.mode = 'PAUSE_AT_START';
                state.pauseStartTime = Date.now();
            }
        }
        // 3. Pause at start - wait briefly then restart auto-play
        else if (state.mode === 'PAUSE_AT_START') {
            const PAUSE_DURATION = 1500; // 1.5 seconds pause
            const elapsed = Date.now() - state.pauseStartTime;
            if (elapsed >= PAUSE_DURATION) {
                // Resume auto-play for next loop - preserve current direction
                state.isAutoPlaying = true;
                // Keep state.direction as is (don't reset to 1)
                state.mode = 'AUTO';
            }
        }
    }

    // Pure state update without strictly forcing render (render called in loop)
    function updateFrameState(newVal) {
        let normalized = newVal % TOTAL_FRAMES;
        if (normalized < 0) normalized += TOTAL_FRAMES;
        state.currentFrame = normalized;
    }

    // --- Rendering ---
    function render() {
        const width = canvas.width / window.devicePixelRatio;
        const height = canvas.height / window.devicePixelRatio;

        if (!state.assetsLoaded) return;

        // Draw current frame
        // Use floor to get integer index, but state.currentFrame is float for smoothness
        const frameIndex = Math.floor(state.currentFrame);
        const img = state.images[frameIndex];

        // Optimization: Only clear and draw if we have a valid image
        // This prevents flashing if a specific frame failed to load (network error)
        if (img) {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
        }

        // Update UI logic
        // Only update text on whole frame change to reduce DOM thrashing? 
        // Or just every frame (simple).
        var currentStatus = document.getElementById('currentStatus');
        if (currentStatus) {
            var wordName = (CONFIG.words[state.word] && CONFIG.words[state.word].name) || state.word;
            var styleName = (CONFIG.styles[state.style] && CONFIG.styles[state.style].name) || state.style;
            currentStatus.textContent = wordName + ' - ' + styleName + ' [第 ' + (frameIndex + 1) + ' 帧]';
        }
        // Legacy wordLabel update removed
    }



    function updateTextDisplay(styleId, wordId) {
        const infoPanel = document.querySelector('.info-panel');
        if (!infoPanel) return;

        // Clear previous typing
        if (state.typingInterval) clearInterval(state.typingInterval);
        infoPanel.innerHTML = '';

        const title = "生成信息";
        const contentMap = [
            { key: "style", value: getStyleName(styleId) },
            { key: "word", value: getWordName(wordId) },
            { key: "prompt", value: getPrompt(styleId, wordId, state.currentVariant) }
        ];

        // Create Title
        const titleDiv = document.createElement('div');
        titleDiv.className = 'panel-title';
        titleDiv.textContent = title;
        infoPanel.appendChild(titleDiv);

        // Content Container
        const contentDiv = document.createElement('div');
        contentDiv.className = 'panel-content';
        infoPanel.appendChild(contentDiv);

        // We will push "tokens" to a queue to type out
        let queue = [];

        contentMap.forEach(item => {
            queue.push({ text: item.key + ": ", class: "key-text" });
            queue.push({ text: item.value + "\n", class: "value-text" });
        });

        let currentTokenIndex = 0;
        let charIndex = 0;
        let currentSpan = null;

        // Function to process typing
        state.typingInterval = setInterval(() => {
            if (currentTokenIndex >= queue.length) {
                clearInterval(state.typingInterval);
                state.typingInterval = null;
                return;
            }

            const token = queue[currentTokenIndex];

            if (!currentSpan) {
                currentSpan = document.createElement('span');
                currentSpan.className = token.class;
                contentDiv.appendChild(currentSpan);
            }

            // Append one char
            const char = token.text[charIndex];
            currentSpan.textContent += char;
            charIndex++;

            // Check if token done
            if (charIndex >= token.text.length) {
                currentTokenIndex++;
                charIndex = 0;
                currentSpan = null; // Reset for next token
            }

        }, 10); // Fast typing speed (10ms)
    }

    // --- Interaction ---
    function handleStart(x) {
        state.isDragging = true;
        state.startX = x;
        state.lastX = x;
        state.lastTime = Date.now();
        state.startFrame = state.currentFrame;

        state.velocity = 0;         // Kill momentum
        state.isAutoPlaying = false;// Stop base auto-play

        // Hide interaction hint on first drag
        if (interactionHint && interactionHint.classList.contains('active')) {
            interactionHint.classList.remove('active');
            interactionHint.classList.add('hidden');
        }

        container.style.cursor = 'grabbing';
    }

    function handleMove(x) {
        if (!state.isDragging) return;

        const now = Date.now();
        const deltaTime = now - state.lastTime;
        const deltaX = x - state.startX; // Total movement

        // Direction: Drag Left -> Forward (Positive), Drag Right -> Backward (Negative)
        const frameDelta = -deltaX / SENSITIVITY; // Inverted: left=+, right=-
        updateFrameState(state.startFrame + frameDelta);

        // Update direction based on movement (inverted)
        if (deltaX !== 0) {
            state.direction = deltaX < 0 ? 1 : -1; // Left drag = forward, Right drag = backward
        }

        // Calculate Instant Velocity
        // v = dX / dt 
        // We want frames per tick (16ms).
        // deltaX per Sensitivity gives frames moved.
        // We calculate how many frames moved in this step.
        const stepX = x - state.lastX;
        if (deltaTime > 0) {
            // Rough estimate of frames per tick
            // limit to avoid huge jumps
            const v = (stepX / SENSITIVITY);
            // Smooth it a bit?
            state.velocity = v;
        }

        state.lastX = x;
        state.lastTime = now;
    }

    function handleEnd() {
        state.isDragging = false;
        container.style.cursor = 'grab';

        // Cap max velocity
        const MAX_VEL = 3;
        if (state.velocity > MAX_VEL) state.velocity = MAX_VEL;
        if (state.velocity < -MAX_VEL) state.velocity = -MAX_VEL;

        // If velocity is lower than auto play speed, just resume auto play immediately
        if (Math.abs(state.velocity) <= AUTO_PLAY_SPEED) {
            state.velocity = 0;
            state.isAutoPlaying = true;
        }
        // Otherwise inertia loop takes over
    }

    // --- Events ---
    // Feature-detect passive event listener support (Chrome 51+, older WebViews may not support)
    var supportsPassive = false;
    try {
        var opts = Object.defineProperty({}, 'passive', {
            get: function () { supportsPassive = true; }
        });
        window.addEventListener('testPassive', null, opts);
        window.removeEventListener('testPassive', null, opts);
    } catch (e) { }
    var passiveFalse = supportsPassive ? { passive: false } : false;

    function bindEvents() {
        // Button Interactions
        // Swapped Logic as per request:
        // Left Button -> Forward (Direction 1)
        // Right Button -> Backward (Direction -1)

        if (btnLeft) {
            btnLeft.addEventListener('click', () => {
                audioManager.play('click');
                state.isAutoPlaying = true;
                state.direction = 1; // Now Forward
                state.velocity = 0; // Reset any physics velocity
                state.mode = 'MANUAL';
            });
        }

        if (btnRight) {
            btnRight.addEventListener('click', () => {
                audioManager.play('click');
                state.isAutoPlaying = true;
                state.direction = -1; // Now Backward
                state.velocity = 0;
                state.mode = 'MANUAL'; // Manual override
            });
        }

        const btnReset = document.getElementById('btnReset');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                audioManager.play('click');
                state.isResetting = true;
                state.mode = 'RESET';
            });
        }

        const btnFinish = document.getElementById('btnFinish');
        if (btnFinish) {
            btnFinish.addEventListener('click', function () {
                audioManager.play('success'); // Play positive sound
                console.log('User clicked Finish');
                // Send success result (no alert)
                sendResult({
                    success: true,
                    finished: true,
                    timestamp: Date.now()
                });
            });
        }



        // Canvas Interactions
        container.addEventListener('mousedown', (e) => handleStart(e.clientX));
        window.addEventListener('mousemove', (e) => handleMove(e.clientX));
        window.addEventListener('mouseup', handleEnd);

        container.addEventListener('touchstart', function (e) { handleStart(e.touches[0].clientX); }, passiveFalse);
        window.addEventListener('touchmove', function (e) {
            e.preventDefault();
            handleMove(e.touches[0].clientX);
        }, passiveFalse);
        window.addEventListener('touchend', handleEnd);

        // PostMessage Listener
        window.addEventListener('message', (event) => {
            const data = event.data;
            if (!data || !data.cmd) return;

            // WebView 关闭事件：回传 result（不过关）让 Python 跳出循环
            if (data.cmd === 'onClickClose') {
                console.log('Received onClickClose from WebView');
                sendResult({ success: false, closed: true });
                return;
            }

            // 正常业务指令
            if (data.cmd === 'py_btc_ai2_3_3' && data.content) {
                handleExternalCommand(data.content);
            }
        });

        window.addEventListener('resize', () => {
            resizeCanvas();
        });
    }

    function handleExternalCommand(content) {
        const { style, word } = content;

        // Validate if needed, or just trust/fallback
        // Ideally checking against CONFIG would be good, but for now we trust or let it 404

        let needsUpdate = false;

        if (style && style !== state.style) {
            state.style = style;
            // Sync Debug UI if present (styleSelect is created by mock.js)
            var _styleSelect = document.getElementById('styleSelect');
            if (_styleSelect) _styleSelect.value = style;
            needsUpdate = true;
        }

        if (word && word !== state.word) {
            state.word = word;
            // Sync Debug UI if present (wordSelect is created by mock.js)
            var _wordSelect = document.getElementById('wordSelect');
            if (_wordSelect) _wordSelect.value = word;
            needsUpdate = true;
        }

        if (needsUpdate || state.isWaiting) {
            state.isWaiting = false; // logic enabled
            loadSequence(state.style, state.word);
            console.log('External command applied:', content);
        }
    }

    function getVariantForSequence(style, word) {
        // Temporarily force v1 as requested (Single variant mode)
        return 1;

        /* 
        // Original Logic:
        const key = `h5_seq_count_${style}_${word}`;
        let count = parseInt(localStorage.getItem(key) || '0');
        count++;
        localStorage.setItem(key, count);
        const variantNum = Math.min(count, 3);
        state.currentVariant = `v${variantNum}`; 
        return variantNum;
        */
    }




    // --- Message Protocol Implementation ---

    // Send completion signal to Python backend
    // Validates the protocol: { cmd: 'result', content: { ... } }
    function sendResult(customContent) {
        customContent = customContent || {};
        var content = {
            // Default content fields expected by check scripts
            style: state.style,
            word: state.word,
            timestamp: Date.now()
        };
        // Chrome 59 compatible: use Object.assign instead of spread operator
        Object.assign(content, customContent);
        var payload = {
            cmd: 'result',
            content: content
        };

        console.log('Sending Result to Parent:', payload);

        if (window.parent) {
            window.parent.postMessage(payload, '*');
        } else {
            console.warn('No window.parent found to send result');
        }
    }

    // Expose for external testing if needed
    window.h5Sender = {
        sendResult: sendResult
    };

    // --- Events ---
    // ... (bindEvents is above)

    // Start
    init();

})();

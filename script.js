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

    // Configuration for Styles and Words
    // Mapping internal IDs (folder names) to Display Names
    const CONFIG = {
        styles: {
            'Style1': '毛毡',
            'Style2': '水晶'
        },
        words: {
            'Word1': '奇妙的冰雪女孩',
            'Word2': '柴犬一生爱自由'
        },
        prompts: {
            'Word1': '在一个晶莹剔透的冰雪世界里，一位身着极光色长裙的女孩正与雪花共舞。周围是漂浮的冰晶碎片，折射着彩虹般的光芒。她的眼神清澈如湖水，指尖轻触之处，绽放出冰蓝色的魔法涟漪，充满了神秘与纯净的气息。',
            'Word2': '广阔的绿色草原上，一只充满活力的柴犬正在肆意奔跑。阳光洒在它金黄色的毛发上，闪闪发光。背景是连绵的远山和蓝天白云，它吐着舌头，脸上洋溢着纯粹的快乐与自由，仿佛在追逐着风的脚步，无拘无束。'
        }
    };

    // --- State ---
    const state = {
        currentFrame: 0,
        word: 'Word1',
        style: 'Style1',
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
    const wordSelect = document.getElementById('wordSelect');
    const styleSelect = document.getElementById('styleSelect');
    const currentStatus = document.getElementById('currentStatus');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const matrixCanvas = document.getElementById('matrixCanvas');

    // Matrix Rain Effect
    const matrixEffect = {
        canvas: null,
        ctx: null,
        columns: [],
        fontSize: 20, // Larger font size
        drops: [],
        speeds: [], // Variable speeds
        interval: null,

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

        draw() {
            if (!this.ctx) return;

            // Fading trail effect that respects transparency
            // Use 'destination-out' to clear alpha, keeping background transparent
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.globalCompositeOperation = 'source-over'; // Reset to default

            this.ctx.fillStyle = 'rgba(0, 255, 255, 0.8)'; // Cyan

            for (let i = 0; i < this.drops.length; i++) {
                const text = Math.random() > 0.5 ? '1' : '0'; // Binary
                const speed = this.speeds[i];

                // Variable font size based on speed (slower = smaller)
                // Speed 0.5 -> ~10px, Speed 1.5 -> ~30px
                const dynamicSize = Math.floor(speed * 20);
                this.ctx.font = `${dynamicSize}px monospace`;

                const x = i * this.fontSize;
                const y = this.drops[i] * this.fontSize;

                this.ctx.fillText(text, x, y);

                // Reset when off screen
                if (y > this.canvas.height / window.devicePixelRatio && Math.random() > 0.975) {
                    this.drops[i] = 0;
                    this.speeds[i] = Math.random() * 1.0 + 0.5; // New speed for new drop
                }
                this.drops[i] += speed; // Move by specific speed
            }
        },

        start() {
            if (!this.canvas) return;
            this.canvas.classList.remove('hidden');
            this.resize(); // Ensure size is correct
            if (this.interval) clearInterval(this.interval);
            this.interval = setInterval(() => this.draw(), 50); // 20fps
        },

        stop() {
            if (this.interval) clearInterval(this.interval);
            if (this.canvas) {
                this.canvas.classList.add('hidden');
                // Clear canvas
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            }
        }
    };

    // --- Initialization ---
    function init() {
        if (matrixCanvas) matrixEffect.init(matrixCanvas);
        resizeCanvas();
        bindEvents();

        // Start in "Generating..." state waiting for command
        loadingOverlay.classList.remove('hidden');
        matrixEffect.start();

        // Ensure Info Panel is empty/hidden initially
        const infoPanel = document.querySelector('.info-panel');
        if (infoPanel) infoPanel.innerHTML = '';

        startLoop(); // Start the game loop (rendering will just show empty/loading)
    }

    // --- Asset Loading ---



    function loadSequence(styleId, wordId) {
        state.assetsLoaded = false;
        state.loadingStartTime = Date.now(); // Start timer
        loadingOverlay.classList.remove('hidden'); // Show global spinner
        matrixEffect.start(); // Start Matrix Rain
        sequenceCanvas.classList.add('hidden'); // Hide sequence during loading

        // Update Info Panel
        updateTextDisplay(styleId, wordId);

        // Determine variant (v1, v2, v3) based on history
        const variant = getVariantForSequence(styleId, wordId);
        console.log(`Loading variant: v${variant} for ${styleId}/${wordId}`);

        // Clear existing images to avoid mixing
        state.images = [];

        let loadedCount = 0;

        for (let i = 1; i <= TOTAL_FRAMES; i++) {
            const num = i < 10 ? `0${i}` : `${i}`;
            // Base path structure without extension
            const basePath = `assets/sequences/${styleId}/${wordId}/v${variant}/${num}`;

            // Try PNG first, then fallback to JPG
            const imgPng = new Image();
            const pngPath = `${basePath}.png`;
            const jpgPath = `${basePath}.jpg`;

            imgPng.src = pngPath;
            imgPng.onload = () => {
                state.images[i - 1] = imgPng; // 0-indexed
                loadedCount++;
                checkLoadStatus(loadedCount, TOTAL_FRAMES);
            };
            imgPng.onerror = () => {
                // PNG failed, try JPG
                const imgJpg = new Image();
                imgJpg.src = jpgPath;
                imgJpg.onload = () => {
                    state.images[i - 1] = imgJpg;
                    loadedCount++;
                    checkLoadStatus(loadedCount, TOTAL_FRAMES);
                };
                imgJpg.onerror = () => {
                    console.error(`Failed to load image (png/jpg): ${basePath}`);
                    loadedCount++; // Count to avoid hanging
                    checkLoadStatus(loadedCount, TOTAL_FRAMES);
                };
            };
        }
    }

    function checkLoadStatus(current, total) {
        if (current >= total) {
            state.assetsLoaded = true;

            // Enforce minimum 3 seconds loading time
            const elapsed = Date.now() - state.loadingStartTime;
            const minDuration = 3000;
            const remaining = Math.max(0, minDuration - elapsed);

            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
                matrixEffect.stop(); // Stop Matrix Rain
                sequenceCanvas.classList.remove('hidden'); // Reveal sequence
                // Auto-play is already enabled by default in state
            }, remaining);
        }
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

            // Check for full loop completion to trigger sway
            // Only if moving forward and we pass 0 (roughly) or pass total frames
            // Simplistic check: if we accumulated > TOTAL_FRAMES since start? 
            // Better: Just check if we hit frame 0 again after being > 10?
            // Actually, user wants "after first loop".
            // Let's count total accumulated delta.
            if (!state.hasCompletedInitialLoop) {
                // We don't track total rotation, let's assume if currentFrame wraps around 
                // It's hard to catch exact wrap. 
                // Alternative: increment a counter and check against TOTAL_FRAMES
                state.accumulatedFrames = (state.accumulatedFrames || 0) + AUTO_PLAY_SPEED;
                if (state.accumulatedFrames >= TOTAL_FRAMES) {
                    state.hasCompletedInitialLoop = true;
                    // Switch to IDLE SWAY
                    state.isAutoPlaying = false;
                    state.mode = 'IDLE_SWAY';
                    state.swayTime = 0;
                    // Force frame to 0 to start sway cleanly? Or just blend in.
                    // state.currentFrame = 0; 
                }
            }
        }
        // 3. Idle Sway
        else if (state.mode === 'IDLE_SWAY') {
            state.velocity = 0;
            state.swayTime = (state.swayTime || 0) + 0.05; // Time step
            // Swing +/- 3 frames. Math.sin returns -1 to 1.
            // Center is 0. 
            // 3 * sin(time)
            const swayOffset = 3 * Math.sin(state.swayTime);
            // We want to sway around frame 0.
            // So frame is just swayOffset.
            // But we need to handle negative frames in updateFrameState correctly (it does).
            updateFrameState(swayOffset);
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
        if (currentStatus) {
            currentStatus.textContent = `${CONFIG.words[state.word] || state.word} - ${CONFIG.styles[state.style] || state.style} [第 ${frameIndex + 1} 帧]`;
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
            { key: "style", value: CONFIG.styles[styleId] || styleId },
            { key: "word", value: CONFIG.words[wordId] || wordId },
            { key: "prompt", value: CONFIG.prompts[wordId] || "暂无描述" }
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

        container.style.cursor = 'grabbing';
    }

    function handleMove(x) {
        if (!state.isDragging) return;

        const now = Date.now();
        const deltaTime = now - state.lastTime;
        const deltaX = x - state.startX; // Total movement

        // Direction: Drag Right -> Increase Frame (Positive)
        const frameDelta = deltaX / SENSITIVITY;
        updateFrameState(state.startFrame + frameDelta);

        // Update direction based on movement
        if (deltaX !== 0) {
            state.direction = deltaX > 0 ? 1 : -1;
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
    function bindEvents() {
        // Button Interactions
        // Swapped Logic as per request:
        // Left Button -> Forward (Direction 1)
        // Right Button -> Backward (Direction -1)

        if (btnLeft) {
            btnLeft.addEventListener('click', () => {
                state.isAutoPlaying = true;
                state.direction = 1; // Now Forward
                state.velocity = 0; // Reset any physics velocity
                state.mode = 'MANUAL';
            });
        }

        if (btnRight) {
            btnRight.addEventListener('click', () => {
                state.isAutoPlaying = true;
                state.direction = -1; // Now Backward
                state.velocity = 0;
                state.mode = 'MANUAL'; // Manual override
            });
        }

        const btnReset = document.getElementById('btnReset');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                state.isResetting = true;
                state.mode = 'RESET';
            });
        }



        // Canvas Interactions
        container.addEventListener('mousedown', (e) => handleStart(e.clientX));
        window.addEventListener('mousemove', (e) => handleMove(e.clientX));
        window.addEventListener('mouseup', handleEnd);

        container.addEventListener('touchstart', (e) => handleStart(e.touches[0].clientX), { passive: false });
        window.addEventListener('touchmove', (e) => {
            e.preventDefault();
            handleMove(e.touches[0].clientX);
        }, { passive: false });
        window.addEventListener('touchend', handleEnd);

        // UI Controls
        const debugToggle = document.getElementById('debugToggle');
        const debugPanel = document.getElementById('debugPanel');
        if (debugToggle && debugPanel) {
            debugToggle.addEventListener('click', () => {
                debugPanel.classList.toggle('collapsed');
            });
        }

        wordSelect.addEventListener('change', (e) => {
            // state.word = e.target.value; 
            // Just UI update, don't trigger load
        });
        styleSelect.addEventListener('change', (e) => {
            // state.style = e.target.value;
            // Just UI update, don't trigger load
        });

        // PostMessage Listener
        window.addEventListener('message', (event) => {
            const data = event.data;
            if (data && data.cmd === 'py_btc_ai2_3_3' && data.content) {
                handleExternalCommand(data.content);
            }
        });

        // Simulation Button
        const simulateBtn = document.getElementById('simulateBtn');
        if (simulateBtn) {
            simulateBtn.addEventListener('click', () => {
                const payload = {
                    cmd: 'py_btc_ai2_3_3',
                    content: {
                        style: styleSelect.value, // Read current UI value
                        word: wordSelect.value    // Read current UI value
                    }
                };
                window.postMessage(payload, '*');
                console.log('Simulated PostMessage:', payload);
            });
        }

        // Debug: Toggle Matrix Rain
        const toggleMatrixBtn = document.getElementById('toggleMatrixBtn');
        if (toggleMatrixBtn) {
            toggleMatrixBtn.addEventListener('click', () => {
                if (matrixCanvas.classList.contains('hidden')) {
                    matrixEffect.start();
                    console.log('Matrix FX Started via Debug');
                } else {
                    matrixEffect.stop();
                    console.log('Matrix FX Stopped via Debug');
                }
            });
        }

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
            if (styleSelect) styleSelect.value = style; // Sync UI
            needsUpdate = true;
        }

        if (word && word !== state.word) {
            state.word = word;
            if (wordSelect) wordSelect.value = word; // Sync UI
            needsUpdate = true;
        }

        if (needsUpdate || state.isWaiting) {
            state.isWaiting = false; // logic enabled
            loadSequence(state.style, state.word);
            console.log('External command applied:', content);
        }
    }

    function getVariantForSequence(style, word) {
        const key = `h5_seq_count_${style}_${word}`;
        let count = parseInt(localStorage.getItem(key) || '0');

        // Increment and save
        count++;
        localStorage.setItem(key, count);

        // Cap at 3 (or however many variants we have)
        // If count is 1 -> v1, 2 -> v2, 3 -> v3, 4 -> v3...
        return Math.min(count, 3);
    }

    // Start
    init();

})();

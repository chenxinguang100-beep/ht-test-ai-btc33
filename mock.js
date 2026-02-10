/**
 * H5 Sequence Player — Mock / Debug Module
 * 
 * 此文件为独立的调试模块，仅在开发环境使用。
 * 
 * 机制：
 *   - 此文件注册 window.__H5_MOCK__ 对象
 *   - 主程序 script.js 检测到该对象存在 + URL 含 ?debug=true 时，才启用调试面板
 *   - 上线部署时删除此文件（或不引入），debug=true 将完全失效
 * 
 * 使用：
 *   开发时在 index.html 中添加: <script src="mock.js"></script>（在 script.js 之前）
 *   上线时删除该行即可
 */

(function () {
    'use strict';

    // === 注册标识 ===
    window.__H5_MOCK__ = {
        version: '1.0.0',

        /**
         * 由主程序调用，传入需要的内部引用
         * @param {Object} ctx - 主程序暴露的上下文
         *   ctx.CONFIG          - 配置对象
         *   ctx.state           - 全局状态
         *   ctx.matrixEffect    - 代码雨效果
         *   ctx.canvas          - 序列帧 canvas 元素 
         *   ctx.loadSequence    - 加载序列函数
         *   ctx.updateLoadingText - 更新加载文字函数
         *   ctx.updateTextDisplay - 更新文本显示函数
         *   ctx.TOTAL_FRAMES    - 总帧数
         *   ctx.FALLBACK_IMG_SRC - 回退图片
         *   ctx.sequenceLoadingOverlay
         *   ctx.sequenceCanvas  - 序列帧 canvas DOM
         */
        init: function (ctx) {
            this._ctx = ctx;
            this._createPanel();
            this._bindEvents();
            this._populateControls();
            console.log('[Mock] Debug module initialized');
        },

        /** 动态创建 Debug 面板 DOM */
        _createPanel: function () {
            var panel = document.createElement('div');
            panel.className = 'debug-panel';
            panel.id = 'debugPanel';
            panel.innerHTML =
                '<div class="debug-header" id="debugToggle">' +
                '<h3>Mock 调试</h3>' +
                '<span class="toggle-icon">▼</span>' +
                '</div>' +
                '<div class="debug-content">' +
                '<div class="control-group">' +
                '<label for="wordSelect">词语:</label>' +
                '<select id="wordSelect"></select>' +
                '</div>' +
                '<div class="control-group">' +
                '<label for="styleSelect">风格:</label>' +
                '<select id="styleSelect"></select>' +
                '</div>' +
                '<div class="control-group">' +
                '<button id="simulateBtn" style="width:100%;padding:8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;border-radius:4px;cursor:pointer;">' +
                '模拟接收指令 (Simulate)' +
                '</button>' +
                '</div>' +
                '<div class="control-group">' +
                '<button id="toggleMatrixBtn" style="width:100%;padding:6px;background:rgba(0,255,255,0.1);border:1px solid rgba(0,255,255,0.3);color:#0ff;border-radius:4px;cursor:pointer;margin-top:5px;">' +
                '查看代码雨效果' +
                '</button>' +
                '</div>' +
                '<div class="control-group">' +
                '<label for="customUpload" style="display:block;margin-bottom:5px;">上传本地序列帧 (24张):</label>' +
                '<input type="file" id="customUpload" multiple accept="image/*" style="width:100%;color:#fff;font-size:12px;">' +
                '</div>' +
                '<div class="status-display">' +
                '当前: <span id="currentStatus">第 1 帧</span>' +
                '</div>' +
                '</div>';

            // 插入到 app-container 中
            var appContainer = document.querySelector('.app-container');
            if (appContainer) {
                appContainer.appendChild(panel);
            } else {
                document.body.appendChild(panel);
            }
        },

        /** 绑定 Debug 面板事件 */
        _bindEvents: function () {
            var ctx = this._ctx;

            // Toggle panel collapse
            var debugToggle = document.getElementById('debugToggle');
            var debugPanel = document.getElementById('debugPanel');
            if (debugToggle && debugPanel) {
                debugToggle.addEventListener('click', function () {
                    debugPanel.classList.toggle('collapsed');
                });
            }

            // Simulate PostMessage
            var simulateBtn = document.getElementById('simulateBtn');
            if (simulateBtn) {
                simulateBtn.addEventListener('click', function () {
                    var styleSelect = document.getElementById('styleSelect');
                    var wordSelect = document.getElementById('wordSelect');
                    var payload = {
                        cmd: 'py_btc_ai2_3_3',
                        content: {
                            style: styleSelect ? styleSelect.value : 'Style1',
                            word: wordSelect ? wordSelect.value : 'Word1'
                        }
                    };
                    window.postMessage(payload, '*');
                    console.log('[Mock] Simulated PostMessage:', payload);
                });
            }

            // Toggle Matrix Rain
            var toggleMatrixBtn = document.getElementById('toggleMatrixBtn');
            if (toggleMatrixBtn && ctx.matrixEffect) {
                toggleMatrixBtn.addEventListener('click', function () {
                    if (ctx.matrixEffect.isRunning) {
                        ctx.matrixEffect.stop();
                        if (ctx.state.assetsLoaded && ctx.canvas) {
                            ctx.canvas.classList.remove('hidden');
                        }
                    } else {
                        if (ctx.canvas) ctx.canvas.classList.add('hidden');
                        ctx.matrixEffect.start();
                    }
                });
            }

            // Custom Sequence Upload
            var customUpload = document.getElementById('customUpload');
            if (customUpload) {
                customUpload.addEventListener('change', function (e) {
                    var files = Array.from(e.target.files);
                    if (files.length === 0) return;

                    if (files.length !== 24) {
                        alert('请选择 24 张图片 (当前已选 ' + files.length + ' 张)');
                        return;
                    }

                    files.sort(function (a, b) {
                        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                    });

                    console.log('[Mock] Loading custom sequence...', files.map(function (f) { return f.name; }));

                    ctx.state.images = [];
                    ctx.state.assetsLoaded = false;

                    if (ctx.sequenceLoadingOverlay) ctx.sequenceLoadingOverlay.classList.remove('hidden');
                    if (ctx.updateLoadingText) ctx.updateLoadingText('正在加载本地素材...');
                    if (ctx.sequenceCanvas) ctx.sequenceCanvas.classList.add('hidden');

                    var loadedCount = 0;
                    var failedCount = 0;

                    files.forEach(function (file, index) {
                        if (index >= ctx.TOTAL_FRAMES) return;

                        var reader = new FileReader();
                        reader.onload = function (ev) {
                            var img = new Image();
                            img.onload = function () {
                                ctx.state.images[index] = img;
                                loadedCount++;
                                checkDone(loadedCount, failedCount);
                            };
                            img.onerror = function () {
                                console.error('[Mock] Failed to load custom image: ' + file.name);
                                failedCount++;
                                var fallback = new Image();
                                fallback.src = ctx.FALLBACK_IMG_SRC;
                                ctx.state.images[index] = fallback;
                                loadedCount++;
                                checkDone(loadedCount, failedCount);
                            };
                            img.src = ev.target.result;
                        };
                        reader.readAsDataURL(file);
                    });

                    function checkDone(current, failed) {
                        if (current >= 24) {
                            ctx.state.assetsLoaded = true;
                            if (ctx.sequenceLoadingOverlay) ctx.sequenceLoadingOverlay.classList.add('hidden');
                            if (ctx.sequenceCanvas) ctx.sequenceCanvas.classList.remove('hidden');

                            if (ctx.matrixEffect && ctx.matrixEffect.isRunning) {
                                ctx.matrixEffect.stop();
                            }

                            if (ctx.updateTextDisplay) ctx.updateTextDisplay('Custom', 'Upload');
                            var status = document.getElementById('currentStatus');
                            if (status) status.innerText = 'Custom Sequence Loaded';

                            ctx.state.isAutoPlaying = true;
                            ctx.state.currentFrame = 0;
                            ctx.state.accumulatedFrames = 0;
                            ctx.state.velocity = 0;
                            ctx.state.mode = 'AUTO';

                            console.log('[Mock] Custom sequence loaded successfully');
                        }
                    }
                });
            }
        },

        /** 填充下拉选项 */
        _populateControls: function () {
            var cfg = this._ctx.CONFIG;
            if (!cfg || !cfg.styles || !cfg.words) return;

            var styleSelect = document.getElementById('styleSelect');
            var wordSelect = document.getElementById('wordSelect');

            if (styleSelect) {
                styleSelect.innerHTML = '';
                for (var key in cfg.styles) {
                    if (cfg.styles.hasOwnProperty(key)) {
                        var opt = document.createElement('option');
                        opt.value = key;
                        opt.textContent = cfg.styles[key].name;
                        styleSelect.appendChild(opt);
                    }
                }
            }

            if (wordSelect) {
                wordSelect.innerHTML = '';
                for (var key in cfg.words) {
                    if (cfg.words.hasOwnProperty(key)) {
                        var opt = document.createElement('option');
                        opt.value = key;
                        opt.textContent = cfg.words[key].name;
                        wordSelect.appendChild(opt);
                    }
                }
            }
        }
    };

    console.log('[Mock] Debug module registered (waiting for main script)');
})();

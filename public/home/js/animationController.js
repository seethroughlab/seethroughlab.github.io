/**
 * Animation Controller
 * Manages the animation loop, mouse/touch tracking, and timing
 */

export class AnimationController {
    constructor(renderer, canvas, bgRenderer) {
        this.renderer = renderer;
        this.canvas = canvas;
        this.bgRenderer = bgRenderer || null;
        this.uniforms = renderer.getUniforms();

        this.isRunning = false;
        this.lastTime = 0;
        this.frameCount = 0;
        this.fps = 60;

        // Mouse/touch state
        this.mouseX = 0;
        this.mouseY = 0;
        this.normalizedMouseX = 0;
        this.normalizedMouseY = 0;

        // Auto-ripple state
        this.lastAutoRippleTime = 0;
        this.nextAutoRippleDelay = 3; // first ripple after 3s
        this.autoRippleSectorIndex = Math.floor(Math.random() * 8);

        // Animation parameters
        this.targetNoiseScale = 2.0;
        this.targetNoiseStrength = 0.05;
        this.targetDisplacement = 0.02;

        // Smooth interpolation
        this.currentNoiseScale = this.targetNoiseScale;
        this.currentNoiseStrength = this.targetNoiseStrength;
        this.currentDisplacement = this.targetDisplacement;

        // Setup event listeners
        this.setupEventListeners();
    }

    /**
     * Setup mouse and touch event listeners
     */
    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousemove', (e) => {
            this.handlePointerMove(e.clientX, e.clientY);
        });

        this.canvas.addEventListener('mouseenter', () => {
            this.targetDisplacement = 0.04;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.targetDisplacement = 0.02;
            this.normalizedMouseX = 0;
            this.normalizedMouseY = 0;
            this.uniforms.setMousePosition(0, 0);
        });

        // Touch events
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                this.handlePointerMove(touch.clientX, touch.clientY);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                this.handlePointerMove(touch.clientX, touch.clientY);
            }
            this.targetDisplacement = 0.04;
        });

        this.canvas.addEventListener('touchend', () => {
            this.targetDisplacement = 0.02;
            this.normalizedMouseX = 0;
            this.normalizedMouseY = 0;
            this.uniforms.setMousePosition(0, 0);
        });

        // Resize handling
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        // Initial resize
        this.handleResize();
    }

    /**
     * Handle pointer movement (mouse or touch)
     */
    handlePointerMove(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();

        // Calculate position relative to canvas
        this.mouseX = clientX - rect.left;
        this.mouseY = clientY - rect.top;

        // Normalize to -1 to 1 range
        this.normalizedMouseX = (this.mouseX / rect.width) * 2 - 1;
        this.normalizedMouseY = -((this.mouseY / rect.height) * 2 - 1); // Flip Y

        // Update uniforms
        this.uniforms.setMousePosition(this.normalizedMouseX, this.normalizedMouseY);
    }

    /**
     * Handle canvas resize
     */
    handleResize() {
        const dpr = window.devicePixelRatio || 1;
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        const width = rect.width * dpr;
        const height = rect.height * dpr;

        this.renderer.resize(width, height);

        // Update canvas CSS size to match container
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        // Resize background canvas to full viewport
        if (this.bgRenderer) {
            const bgW = window.innerWidth * dpr;
            const bgH = window.innerHeight * dpr;
            this.bgRenderer.resize(bgW, bgH, dpr);
            this.bgRenderer.canvas.style.width = `${window.innerWidth}px`;
            this.bgRenderer.canvas.style.height = `${window.innerHeight}px`;
        }
    }

    /**
     * Start animation loop
     */
    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.lastTime = performance.now() / 1000;
        this.animate();

        console.log('Animation started');
    }

    /**
     * Stop animation loop
     */
    stop() {
        this.isRunning = false;
        console.log('Animation stopped');
    }

    /**
     * Animation loop
     */
    animate = () => {
        if (!this.isRunning) return;

        const currentTime = performance.now() / 1000;
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        this.frameCount++;

        // Calculate FPS
        if (this.frameCount % 60 === 0) {
            this.fps = Math.round(1 / deltaTime);
        }

        // Smooth parameter interpolation
        const smoothing = 0.95;
        this.currentNoiseScale = this.currentNoiseScale * smoothing +
            this.targetNoiseScale * (1 - smoothing);
        this.currentNoiseStrength = this.currentNoiseStrength * smoothing +
            this.targetNoiseStrength * (1 - smoothing);
        this.currentDisplacement = this.currentDisplacement * smoothing +
            this.targetDisplacement * (1 - smoothing);

        // Auto-ripple
        this.lastAutoRippleTime += deltaTime;
        if (this.lastAutoRippleTime >= this.nextAutoRippleDelay) {
            this.lastAutoRippleTime = 0;
            this.nextAutoRippleDelay = 4 + Math.random() * 2; // 4–6s

            // Pick angle from current sector (8 sectors) with jitter
            const sectorSize = (Math.PI * 2) / 8;
            const jitter = (Math.random() - 0.5) * sectorSize * 0.8;
            const angle = this.autoRippleSectorIndex * sectorSize + jitter;

            // Advance to a non-adjacent sector for variety
            this.autoRippleSectorIndex = (this.autoRippleSectorIndex + 3 + Math.floor(Math.random() * 3)) % 8;

            // Origin outside logo bounds
            const radius = 1.2 + Math.random() * 0.3;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            this.uniforms.triggerRipple(x, y);
        }

        // Update uniforms
        this.uniforms.update(deltaTime);
        this.uniforms.setNoiseParams(this.currentNoiseScale, this.currentNoiseStrength);
        this.uniforms.setDisplacement(this.currentDisplacement);

        // Render background CRT effect
        if (this.bgRenderer) {
            this.bgRenderer.render(deltaTime);
        }

        // Render logo
        this.renderer.render();

        // Continue loop
        requestAnimationFrame(this.animate);
    };

    /**
     * Set animation parameters
     */
    setNoiseScale(scale) {
        this.targetNoiseScale = scale;
    }

    setNoiseStrength(strength) {
        this.targetNoiseStrength = strength;
    }

    setDisplacement(amount) {
        this.targetDisplacement = amount;
    }

    /**
     * Get current FPS
     */
    getFPS() {
        return this.fps;
    }

    /**
     * Get frame count
     */
    getFrameCount() {
        return this.frameCount;
    }
}

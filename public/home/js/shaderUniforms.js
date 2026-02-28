/**
 * Shader Uniforms Manager
 * Handles uniform buffer creation and updates for WebGPU shaders
 */

export class ShaderUniforms {
    constructor(device) {
        this.device = device;

        // Uniform values
        this.values = {
            time: 0.0,
            mouseX: 0.0,
            mouseY: 0.0,
            aspectRatio: 1.0,
            noiseScale: 2.0,
            noiseStrength: 0.05,
            displacementAmount: 0.02,
            animationPhase: 0.0,
            // Scale pulsing (sync to audio)
            scalePulse: 1.0,
            // Parallax strength
            parallaxStrength: 0.0 // Set in main.js to 0.15
        };

        // 4 concurrent ripple slots: each is {x, y, time, strength}
        this.ripples = [
            { x: 0, y: 0, time: -999, strength: 0.8 },
            { x: 0, y: 0, time: -999, strength: 0.8 },
            { x: 0, y: 0, time: -999, strength: 0.8 },
            { x: 0, y: 0, time: -999, strength: 0.8 },
        ];
        this.nextRippleSlot = 0;

        // Create uniform buffer
        // Size: 28 floats * 4 bytes = 112 bytes (must be multiple of 16 for alignment)
        this.bufferSize = 112;
        this.buffer = device.createBuffer({
            size: this.bufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Typed array for updating buffer
        this.uniformData = new Float32Array(28);

        // Events for animation triggers
        this.eventCallbacks = [];

        // Animation phase tracking for events
        this.lastPhase = 0;
        this.phaseThreshold = Math.PI * 2; // Trigger event every full cycle
    }

    /**
     * Update uniform values
     */
    update(deltaTime) {
        this.values.time += deltaTime;
        this.values.animationPhase += deltaTime * 0.5;

        // Check for animation events (threshold crossings)
        if (Math.floor(this.values.animationPhase / this.phaseThreshold) >
            Math.floor(this.lastPhase / this.phaseThreshold)) {
            this.triggerEvent('phase_complete', {
                phase: Math.floor(this.values.animationPhase / this.phaseThreshold),
                time: this.values.time
            });
        }
        this.lastPhase = this.values.animationPhase;

        // Keep animation phase in reasonable range
        if (this.values.animationPhase > 1000) {
            this.values.animationPhase -= Math.floor(this.values.animationPhase / this.phaseThreshold) * this.phaseThreshold;
            this.lastPhase = this.values.animationPhase;
        }
    }

    /**
     * Set mouse position (normalized to -1 to 1)
     */
    setMousePosition(x, y) {
        this.values.mouseX = x;
        this.values.mouseY = y;

        // Trigger event on significant mouse movement
        const movement = Math.sqrt(x * x + y * y);
        if (movement > 0.5 && Math.random() < 0.01) { // Random trigger on movement
            this.triggerEvent('mouse_move', { x, y, movement });
        }
    }

    /**
     * Set aspect ratio
     */
    setAspectRatio(ratio) {
        this.values.aspectRatio = ratio;
    }

    /**
     * Set noise parameters
     */
    setNoiseParams(scale, strength) {
        this.values.noiseScale = scale;
        this.values.noiseStrength = strength;
    }

    /**
     * Set displacement amount
     */
    setDisplacement(amount) {
        this.values.displacementAmount = amount;
    }

    /**
     * Trigger a ripple effect at position (round-robin across 4 slots)
     */
    triggerRipple(x, y) {
        const slot = this.ripples[this.nextRippleSlot];
        slot.x = x;
        slot.y = y;
        slot.time = this.values.time;
        this.nextRippleSlot = (this.nextRippleSlot + 1) % 4;
    }

    /**
     * Set scale pulse amount (1.0 = normal, >1.0 = expanded)
     */
    setScalePulse(scale) {
        this.values.scalePulse = scale;
    }

    /**
     * Set parallax strength
     */
    setParallaxStrength(strength) {
        this.values.parallaxStrength = strength;
    }

    /**
     * Write uniform data to buffer
     */
    writeToBuffer() {
        this.uniformData[0] = this.values.time;
        this.uniformData[1] = this.values.mouseX;
        this.uniformData[2] = this.values.mouseY;
        this.uniformData[3] = this.values.aspectRatio;
        this.uniformData[4] = this.values.noiseScale;
        this.uniformData[5] = this.values.noiseStrength;
        this.uniformData[6] = this.values.displacementAmount;
        this.uniformData[7] = this.values.animationPhase;
        this.uniformData[8] = this.values.scalePulse;
        this.uniformData[9] = this.values.parallaxStrength;
        this.uniformData[10] = 0.0; // padding (vec4 alignment at offset 48)
        this.uniformData[11] = 0.0; // padding
        // 4 ripple slots: each vec4(x, y, time, strength)
        for (let i = 0; i < 4; i++) {
            const r = this.ripples[i];
            const base = 12 + i * 4;
            this.uniformData[base]     = r.x;
            this.uniformData[base + 1] = r.y;
            this.uniformData[base + 2] = r.time;
            this.uniformData[base + 3] = r.strength;
        }

        this.device.queue.writeBuffer(
            this.buffer,
            0,
            this.uniformData.buffer,
            0,
            this.uniformData.byteLength
        );
    }

    /**
     * Get the uniform buffer
     */
    getBuffer() {
        return this.buffer;
    }

    /**
     * Create bind group layout
     */
    static createBindGroupLayout(device) {
        return device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: 'uniform',
                    },
                },
            ],
        });
    }

    /**
     * Create bind group
     */
    createBindGroup(layout) {
        return this.device.createBindGroup({
            layout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.buffer,
                    },
                },
            ],
        });
    }

    /**
     * Register event callback
     */
    on(eventType, callback) {
        this.eventCallbacks.push({ type: eventType, callback });
    }

    /**
     * Trigger an event
     */
    triggerEvent(eventType, data) {
        this.eventCallbacks
            .filter(cb => cb.type === eventType || cb.type === '*')
            .forEach(cb => cb.callback(eventType, data));
    }

    /**
     * Destroy resources
     */
    destroy() {
        if (this.buffer) {
            this.buffer.destroy();
        }
    }
}

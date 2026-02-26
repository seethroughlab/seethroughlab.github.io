/**
 * Background Renderer
 * Renders fullscreen CRT effect on a separate canvas, sharing the WebGPU device
 */

export class BackgroundRenderer {
    constructor(canvas, device, format) {
        this.canvas = canvas;
        this.device = device;
        this.format = format;
        this.pipeline = null;
        this.uniformBuffer = null;
        this.bindGroup = null;
        this.context = null;
        this.time = 0;
        this.resolutionX = 1;
        this.resolutionY = 1;
    }

    /**
     * Initialize the background renderer
     */
    async initialize() {
        // Configure canvas context
        this.context = this.canvas.getContext('webgpu');
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'opaque',
        });

        // Load shaders
        const [vertCode, fragCode] = await Promise.all([
            fetch('/home/shaders/background.vert.wgsl').then(r => r.text()),
            fetch('/home/shaders/background.frag.wgsl').then(r => r.text()),
        ]);

        const vertModule = this.device.createShaderModule({ label: 'BG Vertex', code: vertCode });
        const fragModule = this.device.createShaderModule({ label: 'BG Fragment', code: fragCode });

        // Create uniform buffer (64 bytes = 16 floats, matching the Uniforms struct)
        this.uniformBuffer = this.device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Bind group layout + bind group
        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' },
            }],
        });

        this.bindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: this.uniformBuffer },
            }],
        });

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout],
        });

        this.pipeline = this.device.createRenderPipeline({
            label: 'Background CRT Pipeline',
            layout: pipelineLayout,
            vertex: {
                module: vertModule,
                entryPoint: 'main',
                buffers: [],
            },
            fragment: {
                module: fragModule,
                entryPoint: 'main',
                targets: [{ format: this.format }],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none',
            },
        });

        console.log('BackgroundRenderer initialized');
    }

    /**
     * Resize the background canvas
     */
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.resolutionX = width;
        this.resolutionY = height;
    }

    /**
     * Render one frame
     */
    render(deltaTime) {
        if (!this.pipeline) return;

        this.time += deltaTime;

        // Write uniforms — only time (offset 0) and resolution (offsets 56, 60) matter
        const data = new Float32Array(16);
        data[0] = this.time;       // time
        data[14] = this.resolutionX; // resolutionX (was padding1)
        data[15] = this.resolutionY; // resolutionY (was padding2)

        this.device.queue.writeBuffer(this.uniformBuffer, 0, data.buffer, 0, data.byteLength);

        const textureView = this.context.getCurrentTexture().createView();
        const commandEncoder = this.device.createCommandEncoder();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
        });

        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.draw(3, 1, 0, 0);
        renderPass.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Destroy resources
     */
    destroy() {
        if (this.uniformBuffer) {
            this.uniformBuffer.destroy();
        }
    }
}

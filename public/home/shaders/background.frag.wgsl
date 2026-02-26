// Fullscreen background fragment shader with CRT effects

struct Uniforms {
    time: f32,
    dpr: f32,
    mouseY: f32,
    aspectRatio: f32,
    noiseScale: f32,
    noiseStrength: f32,
    displacementAmount: f32,
    animationPhase: f32,
    rippleX: f32,
    rippleY: f32,
    rippleTime: f32,
    rippleStrength: f32,
    scalePulse: f32,
    parallaxStrength: f32,
    resolutionX: f32,
    resolutionY: f32,
}

struct FragmentInput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Simple hash for noise
fn hash(p: vec2<f32>) -> f32 {
    let h = dot(p, vec2<f32>(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    let screenPos = input.position.xy;
    let cssPos = screenPos / uniforms.dpr;
    let screenCenter = vec2<f32>(uniforms.resolutionX * 0.5, uniforms.resolutionY * 0.5);
    let halfDiag = length(screenCenter);

    // --- SCANLINES ---
    // Period of ~4px gives clear alternating bright/dark rows
    let scanline = sin(cssPos.y * 1.5) * 0.35 + 0.65;

    // --- VIGNETTE ---
    let distFromCenter = length(screenPos - screenCenter) / halfDiag;
    let vignette = 1.0 - (distFromCenter * distFromCenter * 1.0);

    // --- PHOSPHOR RGB SUB-PIXELS ---
    let phosphorWave = sin(cssPos.x * 2.0 + uniforms.time * 0.5);
    let base = 0.18;
    let r = scanline * vignette * (base + phosphorWave * 0.06);
    let g = scanline * vignette * (base * 0.45);
    let b = scanline * vignette * (base - phosphorWave * 0.06);

    var finalColor = vec3<f32>(r, g, b);

    // --- FILM GRAIN / NOISE ---
    let grain = hash(cssPos + vec2<f32>(uniforms.time * 100.0, uniforms.time * 73.0));
    finalColor += (grain - 0.5) * 0.04;

    // --- FLICKER ---
    let flicker = sin(uniforms.time * 60.0) * 0.08 + 0.92;
    finalColor *= flicker;

    return vec4<f32>(max(finalColor, vec3<f32>(0.0)), 1.0);
}

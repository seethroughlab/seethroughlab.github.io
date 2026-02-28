// Fullscreen background fragment shader with CRT effects

struct Uniforms {
    time: f32,
    dpr: f32,
    glitchIntensity: f32,
    glitchSeed: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
    _pad4: f32,
    _pad5: f32,
    _pad6: f32,
    _pad7: f32,
    _pad8: f32,
    _pad9: f32,
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

    // --- HORIZONTAL TEAR ---
    // Slowly drifting band of static, like CRT AC interference
    let normY = screenPos.y / uniforms.resolutionY;
    let normX = screenPos.x / uniforms.resolutionX;

    // Band drifts upward, wrapping around
    let tearY = fract(uniforms.time * 0.06);
    let distFromTear = min(abs(normY - tearY), 1.0 - abs(normY - tearY)); // wrap-aware

    // Soft band shape (~3% screen height with soft edges)
    let tearBand = smoothstep(0.04, 0.015, distFromTear);

    // Horizontal edge fade so canvas boundary stays hidden
    let hFade = smoothstep(0.0, 0.2, normX) * smoothstep(1.0, 0.8, normX);
    let tearStrength = tearBand * hFade;

    // Horizontal offset (tear/jitter)
    let tearJitter = tearStrength * sin(normY * 80.0 + uniforms.time * 4.0) * 10.0;

    // Extra static noise in the band
    let tearNoise = hash(vec2<f32>(cssPos.x + tearJitter, cssPos.y) + vec2<f32>(uniforms.time * 137.0, uniforms.time * 59.0));
    finalColor += tearStrength * (tearNoise - 0.5) * 0.12;

    // Chromatic fringing in the tear band
    finalColor.r += tearStrength * 0.015;
    finalColor.b -= tearStrength * 0.01;

    // Slight brightness boost
    finalColor *= 1.0 + tearStrength * 0.15;

    // --- GLITCH BURST ---
    if (uniforms.glitchIntensity > 0.0) {
        let intensity = uniforms.glitchIntensity;
        let seed = uniforms.glitchSeed;

        // Horizontal tear: offset a band of scanlines
        let bandCenter = seed;  // 0-1 normalized Y position
        let bandWidth = 0.08 + seed * 0.12;  // 8-20% of screen
        let normalizedY = cssPos.y / (uniforms.resolutionY / uniforms.dpr);
        let inBand = step(bandCenter - bandWidth, normalizedY) * step(normalizedY, bandCenter + bandWidth);
        let tearOffset = inBand * intensity * (seed * 2.0 - 1.0) * 40.0; // pixel offset

        // Re-sample with tear (shift the hash for grain variation)
        let tornPos = vec2<f32>(cssPos.x + tearOffset, cssPos.y);
        let tornGrain = hash(tornPos + vec2<f32>(uniforms.time * 100.0, uniforms.time * 73.0));
        finalColor += inBand * (tornGrain - 0.5) * 0.1 * intensity;

        // Chromatic separation: shift R and B channels in opposite x-directions
        let chromaShift = intensity * 0.015;
        let scanlineR = sin((cssPos.y + tearOffset) * 1.5) * 0.35 + 0.65;
        let scanlineB = sin((cssPos.y - tearOffset * 0.5) * 1.5) * 0.35 + 0.65;
        finalColor.r += chromaShift * scanlineR * vignette * 0.3;
        finalColor.b += chromaShift * scanlineB * vignette * 0.3;

        // Brightness flash
        finalColor *= 1.0 + intensity * 0.3;
    }

    return vec4<f32>(max(finalColor, vec3<f32>(0.0)), 1.0);
}

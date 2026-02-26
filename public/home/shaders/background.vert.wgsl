// Background vertex shader — half-screen diagonal triangle
// Generates vertices at (-1,-1), (1,-1), (-1,1) covering the bottom-left
// half of the viewport. The upper-right half shows the black clear color.
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;

    // Half-screen triangle: covers bottom-left diagonal only
    let x = f32((vertexIndex & 1u) << 1u) - 1.0;
    let y = f32((vertexIndex & 2u)) - 1.0;

    output.position = vec4<f32>(x, y, 0.0, 1.0);
    output.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);

    return output;
}

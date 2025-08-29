export const VERT = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const FRAG_NEON_FLOW = `#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

in vec2 v_uv;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = v_uv;
  vec2 mouse = u_mouse / u_res;
  
  vec2 p = uv * 4.0 + u_time * 0.3;
  p += (mouse - 0.5) * 2.0;
  
  float n1 = fbm(p + u_time * 0.1);
  float n2 = fbm(p + vec2(100.0) + u_time * 0.15);
  float n3 = fbm(p + vec2(200.0) + u_time * 0.2);
  
  vec3 color1 = vec3(0.2, 1.0, 0.8);
  vec3 color2 = vec3(1.0, 0.2, 0.8);
  vec3 color3 = vec3(0.8, 0.8, 0.2);
  
  vec3 col = color1 * n1 + color2 * n2 + color3 * n3;
  col = pow(col, vec3(0.8));
  
  float glow = length(col);
  col *= 1.0 + glow * 0.3;
  
  fragColor = vec4(col, 1.0);
}
`;

export const FRAG_BLOCK_GLITCH = `#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

in vec2 v_uv;
out vec4 fragColor;

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;
  vec2 mouse = u_mouse / u_res;
  
  float time = floor(u_time * 8.0) / 8.0;
  
  vec2 blockSize = vec2(32.0, 18.0);
  vec2 blockUV = floor(uv * blockSize) / blockSize;
  
  float blockNoise = hash(blockUV.x + blockUV.y * 100.0 + time * 10.0);
  
  vec2 distortion = vec2(0.0);
  if (blockNoise > 0.7) {
    distortion.x = (hash(blockUV.y + time) - 0.5) * 0.1;
    distortion.y = (hash(blockUV.x + time * 1.3) - 0.5) * 0.05;
  }
  
  distortion += (mouse - 0.5) * 0.05;
  
  vec2 uvR = uv + distortion + vec2(0.005, 0.0);
  vec2 uvG = uv + distortion;
  vec2 uvB = uv + distortion - vec2(0.005, 0.0);
  
  float r = step(0.5, hash(floor(uvR * 200.0).x + floor(uvR * 200.0).y * 100.0 + time * 20.0));
  float g = step(0.5, hash(floor(uvG * 200.0).x + floor(uvG * 200.0).y * 100.0 + time * 15.0));
  float b = step(0.5, hash(floor(uvB * 200.0).x + floor(uvB * 200.0).y * 100.0 + time * 25.0));
  
  vec3 col = vec3(r, g, b);
  
  float scanline = sin(uv.y * u_res.y * 2.0) * 0.1 + 0.9;
  col *= scanline;
  
  if (blockNoise > 0.8) {
    col = mix(col, vec3(1.0), 0.3);
  }
  
  fragColor = vec4(col, 1.0);
}
`;

export const FRAG_CRT_WAVE = `#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

in vec2 v_uv;
out vec4 fragColor;

vec3 palette(float t) {
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.263, 0.416, 0.557);
  
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  vec2 uv = v_uv - 0.5;
  vec2 mouse = (u_mouse / u_res - 0.5) * 2.0;
  
  float distortion = 0.1 + length(mouse) * 0.05;
  uv = uv * (1.0 + distortion * length(uv));
  uv += 0.5;
  
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  
  float wave1 = sin(uv.x * 20.0 + u_time * 2.0) * 0.5 + 0.5;
  float wave2 = sin(uv.y * 15.0 + u_time * 1.5) * 0.5 + 0.5;
  float wave3 = sin((uv.x + uv.y) * 10.0 + u_time * 3.0) * 0.5 + 0.5;
  
  float t = (wave1 + wave2 + wave3) / 3.0;
  t += length(uv - 0.5) * 0.5;
  
  vec3 col = palette(t + u_time * 0.1);
  
  float scanlines = sin(uv.y * u_res.y * 1.5) * 0.1 + 0.9;
  col *= scanlines;
  
  float vignette = 1.0 - length(uv - 0.5) * 0.8;
  col *= vignette;
  
  vec2 chromaOffset = vec2(0.002, 0.0);
  col.r *= 1.0 + sin(uv.y * u_res.y * 3.0) * 0.02;
  col.b *= 1.0 + sin(uv.y * u_res.y * 3.0 + 3.14159) * 0.02;
  
  fragColor = vec4(col, 1.0);
}
`;

export const FRAG_PIXEL_MELT = `#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

in vec2 v_uv;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 uv = v_uv;
  vec2 mouse = u_mouse / u_res;
  
  float pixelSize = 8.0 + length(mouse - 0.5) * 20.0;
  vec2 pixelUV = floor(uv * pixelSize) / pixelSize;
  
  float heat = noise(pixelUV * 10.0 + u_time * 0.5);
  heat += noise(uv * 20.0 + u_time * 1.0) * 0.5;
  heat += length(mouse - uv) * 2.0;
  
  vec2 melt = vec2(0.0);
  melt.y = heat * 0.1 * sin(u_time + pixelUV.x * 10.0);
  melt.x = heat * 0.05 * sin(u_time * 1.3 + pixelUV.y * 8.0);
  
  vec2 meltedUV = pixelUV + melt;
  
  float pattern = sin(meltedUV.x * 30.0) * sin(meltedUV.y * 20.0);
  pattern *= sin(u_time * 2.0 + length(meltedUV - 0.5) * 10.0);
  
  vec3 baseColor = vec3(1.0, 0.3, 0.1);
  vec3 heatColor = vec3(1.0, 1.0, 0.0);
  vec3 coolColor = vec3(0.1, 0.3, 1.0);
  
  vec3 col = mix(coolColor, baseColor, heat);
  col = mix(col, heatColor, smoothstep(0.7, 1.0, heat));
  
  col *= 0.8 + pattern * 0.2;
  
  float edge = abs(sin(pixelUV.x * pixelSize)) + abs(sin(pixelUV.y * pixelSize));
  col *= 0.9 + edge * 0.1;
  
  fragColor = vec4(col, 1.0);
}
`;

export const SHADERS = [FRAG_NEON_FLOW, FRAG_BLOCK_GLITCH, FRAG_CRT_WAVE, FRAG_PIXEL_MELT];

export const NAMES = ['Neon Flow', 'Block Glitch', 'CRT Wave', 'Pixel Melt'];
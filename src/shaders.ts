export const VERT = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const OPTIMIZED_WIDGET_SHADER = `#version 300 es
precision mediump float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_widgetCount;
uniform vec2[20] u_widgetPositions;
uniform float[20] u_widgetAges;
uniform float[20] u_widgetTypes;

in vec2 v_uv;
out vec4 fragColor;

// Fast hash function
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Simple noise - much faster than fbm
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

// Widget colors based on type
vec3 getWidgetColor(float widgetType) {
    if (widgetType < 0.25) return vec3(0.9, 0.3, 0.5); // Pink
    else if (widgetType < 0.5) return vec3(0.3, 0.8, 0.9); // Cyan
    else if (widgetType < 0.75) return vec3(0.8, 0.9, 0.3); // Yellow
    else return vec3(0.5, 0.9, 0.3); // Green
}

void main() {
    vec2 uv = v_uv;
    vec2 mouse = u_mouse / u_res;
    
    // Fast animated background
    float time = u_time * 0.5;
    vec2 p = uv * 2.0;
    
    // Simple flowing background pattern
    float pattern = sin(p.x * 4.0 + time) * sin(p.y * 3.0 + time * 0.8);
    pattern *= sin((p.x + p.y) * 2.0 + time * 1.5);
    pattern = pattern * 0.5 + 0.5;
    
    // Base gradient
    vec3 bg1 = vec3(0.1, 0.05, 0.3);
    vec3 bg2 = vec3(0.05, 0.2, 0.4);
    vec3 background = mix(bg1, bg2, pattern);
    
    // Mouse glow
    float mouseDist = length(uv - mouse);
    vec3 mouseGlow = vec3(0.2, 0.4, 0.8) * exp(-mouseDist * 4.0) * 0.3;
    background += mouseGlow;
    
    // Widget influences - much simpler and faster
    vec3 widgetInfluence = vec3(0.0);
    
    for (int i = 0; i < 20; i++) {
        if (float(i) >= u_widgetCount) break;
        
        vec2 widgetPos = u_widgetPositions[i];
        float age = u_widgetAges[i];
        float widgetType = u_widgetTypes[i];
        
        if (age <= 0.0) continue;
        
        // Simple distance-based influence
        float dist = length(uv - widgetPos);
        float influence = exp(-dist * 3.0) * age;
        
        // Pulsing effect
        influence *= sin(u_time * 5.0 + widgetType * 10.0) * 0.5 + 0.5;
        
        // Add color
        vec3 widgetColor = getWidgetColor(widgetType);
        widgetInfluence += widgetColor * influence * 0.4;
    }
    
    // Combine everything
    vec3 finalColor = background + widgetInfluence;
    
    // Simple vignette
    float vignette = 1.0 - length(uv - 0.5) * 0.6;
    finalColor *= vignette;
    
    // Gamma correction
    finalColor = pow(finalColor, vec3(0.8));
    
    fragColor = vec4(finalColor, 1.0);
}
`;

export const SHADERS = [OPTIMIZED_WIDGET_SHADER];
export const NAMES = ['Widget Bouncer'];
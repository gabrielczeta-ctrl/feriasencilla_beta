export const VERT = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const REACTIVE_ASCII_SHADER = `#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_asciiCount;
uniform vec2[50] u_asciiPositions;
uniform float[50] u_asciiAges;
uniform float[50] u_asciiTypes;

in vec2 v_uv;
out vec4 fragColor;

// Advanced noise functions
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
    for (int i = 0; i < 6; i++) {
        value += amplitude * noise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

// SDF for creating text-like shapes
float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Create dynamic text shapes based on ASCII type
float getAsciiShape(vec2 p, float asciiType) {
    float shape = 1.0;
    
    if (asciiType < 0.2) { // Letters - create cross-like pattern
        shape = min(sdBox(p, vec2(0.02, 0.08)), sdBox(p, vec2(0.08, 0.02)));
    } else if (asciiType < 0.4) { // Numbers - create box pattern
        shape = sdBox(p, vec2(0.06, 0.08));
        shape = max(shape, -sdBox(p, vec2(0.03, 0.05)));
    } else if (asciiType < 0.6) { // Special chars - create star pattern
        float a = atan(p.y, p.x);
        float r = length(p);
        float star = abs(sin(a * 5.0)) * 0.05;
        shape = r - star;
    } else if (asciiType < 0.8) { // Punctuation - create dot/line pattern
        shape = min(length(p) - 0.02, abs(p.y) - 0.005);
    } else { // Symbols - create complex pattern
        float d1 = sdBox(p + vec2(0.03, 0.03), vec2(0.02, 0.05));
        float d2 = sdBox(p - vec2(0.03, 0.03), vec2(0.02, 0.05));
        shape = min(d1, d2);
    }
    
    return shape;
}

// Color palette based on ASCII character influence
vec3 getAsciiColor(float asciiType, float intensity) {
    vec3 colors[5];
    colors[0] = vec3(1.0, 0.3, 0.5); // Red-pink for letters
    colors[1] = vec3(0.3, 0.8, 1.0); // Cyan for numbers  
    colors[2] = vec3(0.9, 0.7, 0.2); // Gold for special chars
    colors[3] = vec3(0.5, 1.0, 0.3); // Green for punctuation
    colors[4] = vec3(0.8, 0.4, 1.0); // Purple for symbols
    
    int index = int(asciiType * 5.0);
    return colors[index] * intensity;
}

// Advanced distortion field
vec2 distortField(vec2 uv, float time) {
    float d1 = fbm(uv * 3.0 + time * 0.2);
    float d2 = fbm(uv * 5.0 - time * 0.15);
    float d3 = fbm(uv * 8.0 + time * 0.1);
    
    vec2 distortion = vec2(d1, d2) * 0.03;
    distortion += vec2(sin(d3 * 10.0), cos(d3 * 10.0)) * 0.01;
    
    return distortion;
}

void main() {
    vec2 uv = v_uv;
    vec2 mouse = u_mouse / u_res;
    
    // Apply subtle distortion
    vec2 distortion = distortField(uv, u_time);
    uv += distortion;
    
    // Base psychedelic background
    float time = u_time * 0.3;
    vec2 p = uv * 4.0;
    
    // Multi-layer noise for complex patterns
    float n1 = fbm(p + time);
    float n2 = fbm(p * 1.5 - time * 0.8);
    float n3 = fbm(p * 2.3 + time * 0.6);
    
    // Create flowing patterns
    float pattern = sin(n1 * 8.0 + time * 2.0) * 0.5 + 0.5;
    pattern *= sin(n2 * 6.0 - time * 1.5) * 0.5 + 0.5;
    pattern *= sin(n3 * 10.0 + time * 3.0) * 0.5 + 0.5;
    
    // Base color influenced by mouse
    vec3 baseColor = vec3(0.1, 0.05, 0.2);
    vec3 mouseInfluence = vec3(0.3, 0.6, 0.9) * exp(-length(uv - mouse) * 3.0);
    baseColor += mouseInfluence;
    
    // Background gradient
    vec3 gradient1 = vec3(0.2, 0.1, 0.4);
    vec3 gradient2 = vec3(0.05, 0.2, 0.3);
    vec3 background = mix(gradient1, gradient2, pattern);
    
    // Energy field visualization
    float energy = 0.0;
    vec3 asciiInfluence = vec3(0.0);
    
    // Process each ASCII character
    for (int i = 0; i < 50; i++) {
        if (float(i) >= u_asciiCount) break;
        
        vec2 asciiPos = u_asciiPositions[i];
        float age = u_asciiAges[i];
        float asciiType = u_asciiTypes[i];
        
        if (age <= 0.0) continue; // Skip dead characters
        
        // Normalize age (0 to 10 seconds -> 1 to 0)
        float normalizedAge = clamp(age / 10.0, 0.0, 1.0);
        
        // Distance from character
        vec2 toAscii = uv - asciiPos;
        float dist = length(toAscii);
        
        // Create expanding rings of influence
        float ringEffect = sin(dist * 20.0 - u_time * 5.0 + asciiType * 10.0) * 0.5 + 0.5;
        ringEffect *= exp(-dist * 2.0);
        ringEffect *= normalizedAge; // Fade with age
        
        // Character shape influence
        vec2 localPos = toAscii * 20.0; // Scale for shape detail
        float shape = getAsciiShape(localPos, asciiType);
        float shapeInfluence = 1.0 - smoothstep(0.0, 0.1, shape);
        shapeInfluence *= normalizedAge;
        
        // Color contribution
        vec3 charColor = getAsciiColor(asciiType, normalizedAge);
        asciiInfluence += charColor * (ringEffect + shapeInfluence * 0.5);
        
        // Energy field contribution
        energy += ringEffect * 0.3 + shapeInfluence * 0.7;
        
        // Distortion waves from character
        float wave = sin(dist * 15.0 - u_time * 8.0 + asciiType * 5.0);
        wave *= normalizedAge * exp(-dist * 1.5);
        
        // Apply local distortion around character
        vec2 waveDir = normalize(toAscii);
        if (dist > 0.0) {
            uv += waveDir * wave * 0.005;
        }
    }
    
    // Combine all influences
    vec3 finalColor = background;
    
    // Add energy field visualization
    vec3 energyColor = vec3(1.0, 0.8, 0.3) * energy * 0.5;
    finalColor += energyColor;
    
    // Add ASCII character influence
    finalColor += asciiInfluence * 0.8;
    
    // Dynamic color shifting based on total energy
    float totalEnergy = energy + length(asciiInfluence);
    finalColor = mix(finalColor, finalColor.zxy, totalEnergy * 0.3);
    
    // Enhance with flowing colors
    float colorShift = sin(u_time * 2.0 + totalEnergy * 5.0) * 0.5 + 0.5;
    finalColor = mix(finalColor, finalColor.yzx, colorShift * 0.2);
    
    // Subtle vignette
    float vignette = 1.0 - length(uv - 0.5) * 0.8;
    finalColor *= vignette;
    
    // Bloom effect
    finalColor += exp(-length(uv - mouse) * 10.0) * vec3(0.1, 0.3, 0.5) * 0.3;
    
    // Final tone mapping for vibrant colors
    finalColor = finalColor / (finalColor + vec3(1.0));
    finalColor = pow(finalColor, vec3(0.8)); // Gamma correction
    
    fragColor = vec4(finalColor, 1.0);
}
`;

export const SHADERS = [REACTIVE_ASCII_SHADER];
export const NAMES = ['Reactive ASCII Field'];
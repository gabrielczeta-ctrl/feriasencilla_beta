// Advanced Web Particle System
// High-performance particle effects for browser canvas

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: { r: number; g: number; b: number; a: number };
  lifetime: number;
  maxLifetime: number;
  rotation: number;
  angularVelocity: number;
  scale: number;
  gravity: number;
  active: boolean;
  trail?: Array<{ x: number; y: number; alpha: number }>;
  behavior?: string;
}

export interface ParticleEffect {
  type: string;
  count: number;
  lifetime: number;
  speed: [number, number];
  size: [number, number];
  colors: Array<{ r: number; g: number; b: number; a: number }>;
  gravity?: number;
  fade?: boolean;
  trail?: boolean;
  sparks?: boolean;
}

export class WebParticleSystem {
  private particles: Particle[] = [];
  private particlePool: Particle[] = [];
  private poolSize = 1000;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private nextId = 0;

  // Predefined effects matching Love2D implementation
  private effects: Record<string, ParticleEffect> = {
    messageSpawn: {
      type: 'messageSpawn',
      count: 15,
      lifetime: 1.5,
      speed: [50, 150],
      size: [2, 6],
      colors: [
        { r: 255, g: 255, b: 255, a: 1 },
        { r: 204, g: 230, b: 255, a: 1 },
        { r: 255, g: 230, b: 204, a: 1 }
      ],
      gravity: -100,
      fade: true
    },

    bounce: {
      type: 'bounce',
      count: 8,
      lifetime: 0.8,
      speed: [30, 100],
      size: [1, 3],
      colors: [
        { r: 255, g: 255, b: 76, a: 1 },
        { r: 255, g: 204, b: 51, a: 1 }
      ],
      gravity: 50,
      fade: true
    },

    collision: {
      type: 'collision',
      count: 20,
      lifetime: 1.2,
      speed: [80, 200],
      size: [1, 4],
      colors: [
        { r: 255, g: 128, b: 51, a: 1 },
        { r: 255, g: 204, b: 102, a: 1 },
        { r: 255, g: 255, b: 255, a: 1 }
      ],
      gravity: 0,
      fade: true,
      sparks: true
    },

    throw: {
      type: 'throw',
      count: 10,
      lifetime: 2.0,
      speed: [20, 80],
      size: [2, 5],
      colors: [
        { r: 76, g: 204, b: 255, a: 1 },
        { r: 128, g: 230, b: 255, a: 1 }
      ],
      gravity: -50,
      fade: true,
      trail: true
    },

    drawing: {
      type: 'drawing',
      count: 3,
      lifetime: 0.5,
      speed: [10, 30],
      size: [1, 2],
      colors: [{ r: 255, g: 255, b: 255, a: 0.8 }],
      gravity: 0,
      fade: true
    }
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.initializePool();
  }

  private initializePool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      this.particlePool.push({
        id: `particle_${i}`,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 1,
        color: { r: 255, g: 255, b: 255, a: 1 },
        lifetime: 0,
        maxLifetime: 1,
        rotation: 0,
        angularVelocity: 0,
        scale: 1,
        gravity: 0,
        active: false,
        behavior: undefined
      });
    }
  }

  private getParticle(): Particle | null {
    // Find inactive particle from pool
    for (const particle of this.particlePool) {
      if (!particle.active) {
        return particle;
      }
    }

    // Pool exhausted, create new particle
    const newParticle: Particle = {
      id: `particle_${this.nextId++}`,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 1,
      color: { r: 255, g: 255, b: 255, a: 1 },
      lifetime: 0,
      maxLifetime: 1,
      rotation: 0,
      angularVelocity: 0,
      scale: 1,
      gravity: 0,
      active: false
    };
    this.particlePool.push(newParticle);
    return newParticle;
  }

  private releaseParticle(particle: Particle): void {
    particle.active = false;
    particle.trail = undefined;
    particle.behavior = undefined;
  }

  // Create particle effect
  createEffect(effectType: string, x: number, y: number, data: any = {}): void {
    const config = this.effects[effectType];
    if (!config) return;

    for (let i = 0; i < config.count; i++) {
      const particle = this.getParticle();
      if (particle) {
        this.initializeParticle(particle, config, x, y, data);
        this.particles.push(particle);
      }
    }
  }

  private initializeParticle(particle: Particle, config: ParticleEffect, x: number, y: number, data: any): void {
    particle.active = true;
    particle.x = x + (Math.random() - 0.5) * 10;
    particle.y = y + (Math.random() - 0.5) * 10;

    // Velocity
    const speed = this.random(config.speed[0], config.speed[1]);
    const angle = Math.random() * Math.PI * 2;
    particle.vx = Math.cos(angle) * speed;
    particle.vy = Math.sin(angle) * speed;

    // Properties
    particle.size = this.random(config.size[0], config.size[1]);
    particle.color = config.colors[Math.floor(Math.random() * config.colors.length)];
    particle.maxLifetime = config.lifetime + (Math.random() - 0.5) * config.lifetime * 0.3;
    particle.lifetime = particle.maxLifetime;
    particle.gravity = config.gravity || 0;

    // Visual properties
    particle.rotation = Math.random() * Math.PI * 2;
    particle.angularVelocity = (Math.random() - 0.5) * 5;
    particle.scale = 1;

    // Special behaviors
    if (config.sparks) {
      particle.behavior = 'sparks';
      particle.vy -= 50; // Sparks fly upward
    }

    if (config.trail) {
      particle.trail = [];
      particle.behavior = 'trail';
    }

    // Data overrides
    if (data.color) {
      particle.color = data.color;
    }
    if (data.velocity) {
      particle.vx += data.velocity.x;
      particle.vy += data.velocity.y;
    }
  }

  private random(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  // Convenience methods for common effects
  messageSpawn(x: number, y: number): void {
    this.createEffect('messageSpawn', x, y);
  }

  bounceEffect(x: number, y: number): void {
    this.createEffect('bounce', x, y);
  }

  collisionSparks(x: number, y: number): void {
    this.createEffect('collision', x, y);
  }

  throwEffect(x: number, y: number, vx: number, vy: number): void {
    const data = {
      velocity: { x: vx * 0.1, y: vy * 0.1 }
    };
    this.createEffect('throw', x, y, data);
  }

  drawingEffect(x: number, y: number, color?: { r: number; g: number; b: number; a: number }): void {
    const data = {
      color: color || { r: 255, g: 255, b: 255, a: 0.8 }
    };
    this.createEffect('drawing', x, y, data);
  }

  // Update particle system
  update(deltaTime: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];

      if (particle.active) {
        this.updateParticle(particle, deltaTime);

        // Remove dead particles
        if (particle.lifetime <= 0) {
          this.releaseParticle(particle);
          this.particles.splice(i, 1);
        }
      } else {
        this.particles.splice(i, 1);
      }
    }
  }

  private updateParticle(particle: Particle, dt: number): void {
    // Update lifetime
    particle.lifetime -= dt;

    // Update position
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;

    // Apply gravity
    if (particle.gravity !== 0) {
      particle.vy += particle.gravity * dt;
    }

    // Update rotation
    particle.rotation += particle.angularVelocity * dt;

    // Update scale and alpha based on lifetime
    const t = 1 - (particle.lifetime / particle.maxLifetime);

    if (this.effects[particle.behavior || 'default']?.fade) {
      particle.color.a = particle.color.a * (particle.lifetime / particle.maxLifetime);
    }

    // Special behaviors
    if (particle.behavior === 'sparks') {
      // Sparks slow down and fade quickly
      particle.vx *= 0.98;
      particle.vy *= 0.98;
      particle.scale = 1 - t * 0.5;

    } else if (particle.behavior === 'trail') {
      // Trail particles leave traces
      if (particle.trail) {
        particle.trail.push({ x: particle.x, y: particle.y, alpha: particle.color.a });

        // Limit trail length
        if (particle.trail.length > 10) {
          particle.trail.shift();
        }

        // Update trail alpha
        for (const point of particle.trail) {
          point.alpha *= 0.95;
        }
      }
    }

    // Size variation based on lifetime
    if (particle.behavior !== 'sparks') {
      particle.scale = 0.5 + 0.5 * Math.sin(t * Math.PI);
    }
  }

  // Render particles
  render(): void {
    this.ctx.save();
    
    // Set additive blending for glow effects
    this.ctx.globalCompositeOperation = 'lighter';
    
    for (const particle of this.particles) {
      if (particle.active && particle.color.a > 0.01) {
        this.renderParticle(particle);
      }
    }
    
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.restore();
  }

  private renderParticle(particle: Particle): void {
    this.ctx.save();
    
    this.ctx.translate(particle.x, particle.y);
    this.ctx.rotate(particle.rotation);
    this.ctx.scale(particle.scale, particle.scale);

    // Draw trail if it exists
    if (particle.trail && particle.trail.length > 1) {
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      
      for (let i = 0; i < particle.trail.length - 1; i++) {
        const p1 = particle.trail[i];
        const p2 = particle.trail[i + 1];
        
        this.ctx.globalAlpha = p1.alpha;
        this.ctx.strokeStyle = `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${p1.alpha})`;
        
        this.ctx.moveTo(p1.x - particle.x, p1.y - particle.y);
        this.ctx.lineTo(p2.x - particle.x, p2.y - particle.y);
      }
      
      this.ctx.stroke();
    }

    // Draw particle
    this.ctx.globalAlpha = particle.color.a;
    this.ctx.fillStyle = `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${particle.color.a})`;

    if (particle.behavior === 'sparks') {
      // Draw sparks as small lines
      this.ctx.lineWidth = particle.size;
      this.ctx.strokeStyle = `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${particle.color.a})`;
      this.ctx.beginPath();
      this.ctx.moveTo(-particle.size/2, 0);
      this.ctx.lineTo(particle.size/2, 0);
      this.ctx.stroke();
    } else {
      // Draw regular particles as circles
      this.ctx.beginPath();
      this.ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
      this.ctx.fill();

      // Add glow effect for larger particles
      if (particle.size > 3) {
        this.ctx.globalAlpha = particle.color.a * 0.3;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, particle.size * 1.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    this.ctx.restore();
  }

  // Create explosion effect
  createExplosion(x: number, y: number, intensity: number = 1): void {
    // Multiple particle effects for explosion
    for (let i = 0; i < Math.ceil(intensity * 3); i++) {
      this.createEffect('collision',
        x + (Math.random() - 0.5) * 20,
        y + (Math.random() - 0.5) * 20);
    }

    // Add some sparks
    for (let i = 0; i < Math.ceil(intensity * 2); i++) {
      const particle = this.getParticle();
      if (particle) {
        const config = this.effects.collision;
        this.initializeParticle(particle, config, x, y, {});
        particle.behavior = 'sparks';
        particle.vx *= 2;
        particle.vy = particle.vy * 2 - 100;
        this.particles.push(particle);
      }
    }
  }

  // Create ripple effect
  createRipple(x: number, y: number, maxRadius: number = 50): void {
    // Create expanding ring effect
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const particle = this.getParticle();
      if (particle) {
        particle.active = true;
        particle.x = x;
        particle.y = y;
        particle.vx = Math.cos(angle) * 100;
        particle.vy = Math.sin(angle) * 100;
        particle.size = 2;
        particle.color = { r: 76, g: 204, b: 255, a: 1 };
        particle.maxLifetime = maxRadius / 100;
        particle.lifetime = particle.maxLifetime;
        particle.gravity = 0;
        particle.behavior = 'ripple';

        this.particles.push(particle);
      }
    }
  }

  // Get particle count
  getCount(): number {
    return this.particles.length;
  }

  // Clear all particles
  clear(): void {
    for (const particle of this.particles) {
      this.releaseParticle(particle);
    }
    this.particles = [];
  }

  // Add custom effect
  addEffect(name: string, effect: ParticleEffect): void {
    this.effects[name] = effect;
  }

  // Resize canvas
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  // Get statistics
  getStats() {
    return {
      activeParticles: this.particles.length,
      poolSize: this.particlePool.length,
      effects: Object.keys(this.effects).length
    };
  }
}
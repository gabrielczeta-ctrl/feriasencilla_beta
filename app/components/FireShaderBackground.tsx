"use client";

import React, { useRef, useEffect } from 'react';

interface FireShaderBackgroundProps {
  setting?: string;
  location?: string;
}

const FireShaderBackground: React.FC<FireShaderBackgroundProps> = ({ setting = 'tavern', location = 'The Prancing Pony' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  // Get theme colors based on setting/location
  const getThemeColors = (setting: string, location: string) => {
    const locationLower = location.toLowerCase();
    const settingLower = setting.toLowerCase();
    
    // Prison/jail settings
    if (locationLower.includes('prison') || locationLower.includes('jail') || locationLower.includes('cell')) {
      return {
        background: ['rgba(25, 25, 35, 0.9)', 'rgba(45, 45, 55, 0.7)', 'rgba(65, 65, 75, 0.5)', 'rgba(85, 85, 95, 0.3)'],
        particles: { hueBase: 200, hueRange: 40, particleCount: 150 }, // Blue-gray tones
        baseStyle: 'linear-gradient(to bottom, #0a0a0a, #1a1a2e, #16213e)'
      };
    }
    
    // Forest/outdoor settings
    if (locationLower.includes('forest') || locationLower.includes('woods') || locationLower.includes('tree')) {
      return {
        background: ['rgba(34, 68, 34, 0.8)', 'rgba(68, 102, 34, 0.6)', 'rgba(102, 136, 68, 0.4)', 'rgba(136, 170, 102, 0.2)'],
        particles: { hueBase: 80, hueRange: 40, particleCount: 200 }, // Green tones
        baseStyle: 'linear-gradient(to bottom, #0f2027, #203a43, #2c5364)'
      };
    }
    
    // Castle/palace settings
    if (locationLower.includes('castle') || locationLower.includes('palace') || locationLower.includes('throne')) {
      return {
        background: ['rgba(75, 0, 130, 0.8)', 'rgba(138, 43, 226, 0.6)', 'rgba(186, 85, 211, 0.4)', 'rgba(221, 160, 221, 0.2)'],
        particles: { hueBase: 270, hueRange: 30, particleCount: 250 }, // Purple tones
        baseStyle: 'linear-gradient(to bottom, #2c1810, #4a2c20, #68403a)'
      };
    }
    
    // Water/ocean/river settings  
    if (locationLower.includes('water') || locationLower.includes('ocean') || locationLower.includes('river') || locationLower.includes('lake')) {
      return {
        background: ['rgba(0, 119, 190, 0.8)', 'rgba(0, 180, 216, 0.6)', 'rgba(144, 224, 239, 0.4)', 'rgba(173, 232, 244, 0.2)'],
        particles: { hueBase: 190, hueRange: 30, particleCount: 180 }, // Blue tones
        baseStyle: 'linear-gradient(to bottom, #0c1445, #1e3c72, #2a5298)'
      };
    }
    
    // Desert settings
    if (locationLower.includes('desert') || locationLower.includes('sand') || locationLower.includes('dune')) {
      return {
        background: ['rgba(194, 154, 108, 0.8)', 'rgba(218, 165, 32, 0.6)', 'rgba(255, 218, 185, 0.4)', 'rgba(255, 239, 213, 0.2)'],
        particles: { hueBase: 30, hueRange: 20, particleCount: 120 }, // Sand tones
        baseStyle: 'linear-gradient(to bottom, #8b4513, #daa520, #f4a460)'
      };
    }
    
    // Default tavern/fire setting
    return {
      background: ['rgba(139, 69, 19, 0.8)', 'rgba(255, 69, 0, 0.6)', 'rgba(255, 140, 0, 0.4)', 'rgba(255, 215, 0, 0.2)'],
      particles: { hueBase: 20, hueRange: 40, particleCount: 300 }, // Fire tones
      baseStyle: 'linear-gradient(to bottom, #1a0b1a, #2d1b2d, #4a1a2a)'
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const updateCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    // Get theme colors for current setting
    const theme = getThemeColors(setting, location);
    
    // Particle simulation  
    let time = 0;
    const particles: FireParticle[] = [];
    
    // Initialize particles with theme settings
    for (let i = 0; i < theme.particles.particleCount; i++) {
      particles.push(new FireParticle(theme.particles.hueBase, theme.particles.hueRange));
    }

    const animate = () => {
      time += 0.016; // ~60fps
      
      // Clear canvas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Create gradient background with theme colors
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, theme.background[0]);
      gradient.addColorStop(0.3, theme.background[1]);
      gradient.addColorStop(0.6, theme.background[2]);
      gradient.addColorStop(1, theme.background[3]);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Update and render particles
      particles.forEach(particle => {
        particle.update(time, canvas.width, canvas.height);
        particle.render(ctx);
      });
      
      // Add ambient particles/noise with theme colors
      for (let i = 0; i < Math.floor(theme.particles.particleCount / 6); i++) {
        const x = Math.random() * canvas.width;
        const y = canvas.height - Math.random() * canvas.height * 0.6;
        const size = Math.random() * 3 + 1;
        const alpha = Math.random() * 0.3;
        
        const hue = theme.particles.hueBase + Math.random() * theme.particles.hueRange;
        ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [setting, location]);

  const theme = getThemeColors(setting, location);
  
  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10"
      style={{ background: theme.baseStyle }}
    />
  );
};

class FireParticle {
  x!: number;
  y!: number;
  vx!: number;
  vy!: number;
  life!: number;
  maxLife!: number;
  size!: number;
  hue!: number;
  hueBase!: number;
  hueRange!: number;
  
  constructor(hueBase: number = 20, hueRange: number = 40) {
    this.hueBase = hueBase;
    this.hueRange = hueRange;
    this.reset();
  }
  
  reset() {
    this.x = Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1920);
    this.y = (typeof window !== 'undefined' ? window.innerHeight : 1080) + 50;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = -Math.random() * 3 - 1;
    this.life = 0;
    this.maxLife = Math.random() * 100 + 50;
    this.size = Math.random() * 4 + 2;
    this.hue = this.hueBase + Math.random() * this.hueRange;
  }
  
  update(time: number, canvasWidth: number, canvasHeight: number) {
    this.life += 1;
    
    if (this.life > this.maxLife) {
      this.reset();
      return;
    }
    
    // Update position with some turbulence
    this.x += this.vx + Math.sin(time + this.x * 0.01) * 0.5;
    this.y += this.vy;
    
    // Add some randomness to velocity
    this.vx += (Math.random() - 0.5) * 0.1;
    this.vy -= 0.02; // Rising effect
    
    // Fade and shrink over time
    const lifeRatio = this.life / this.maxLife;
    this.size = (1 - lifeRatio) * (Math.random() * 4 + 2);
    
    // Change color within theme range
    this.hue = this.hueBase + (this.hueRange * lifeRatio);
  }
  
  render(ctx: CanvasRenderingContext2D) {
    const lifeRatio = this.life / this.maxLife;
    const alpha = (1 - lifeRatio) * 0.8;
    
    if (alpha <= 0 || this.size <= 0) return;
    
    const gradient = ctx.createRadialGradient(
      this.x, this.y, 0,
      this.x, this.y, this.size
    );
    
    gradient.addColorStop(0, `hsla(${this.hue}, 100%, 70%, ${alpha})`);
    gradient.addColorStop(0.5, `hsla(${this.hue}, 100%, 50%, ${alpha * 0.5})`);
    gradient.addColorStop(1, `hsla(${this.hue}, 100%, 30%, 0)`);
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default FireShaderBackground;
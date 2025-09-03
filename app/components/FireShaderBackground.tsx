"use client";

import React, { useRef, useEffect } from 'react';

const FireShaderBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

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

    // Fire shader simulation
    let time = 0;
    const particles: FireParticle[] = [];
    
    // Initialize fire particles
    for (let i = 0; i < 300; i++) {
      particles.push(new FireParticle());
    }

    const animate = () => {
      time += 0.016; // ~60fps
      
      // Clear canvas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Create gradient background
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, 'rgba(139, 69, 19, 0.8)'); // Deep brown
      gradient.addColorStop(0.3, 'rgba(255, 69, 0, 0.6)'); // Red-orange
      gradient.addColorStop(0.6, 'rgba(255, 140, 0, 0.4)'); // Orange
      gradient.addColorStop(1, 'rgba(255, 215, 0, 0.2)'); // Gold
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Update and render fire particles
      particles.forEach(particle => {
        particle.update(time, canvas.width, canvas.height);
        particle.render(ctx);
      });
      
      // Add some flame-like noise
      for (let i = 0; i < 50; i++) {
        const x = Math.random() * canvas.width;
        const y = canvas.height - Math.random() * canvas.height * 0.6;
        const size = Math.random() * 3 + 1;
        const alpha = Math.random() * 0.3;
        
        const hue = 20 + Math.random() * 40; // Orange to red hues
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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10"
      style={{ background: 'linear-gradient(to bottom, #1a0b1a, #2d1b2d, #4a1a2a)' }}
    />
  );
};

class FireParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  
  constructor() {
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
    this.hue = Math.random() * 60; // Red to yellow range
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
    
    // Change color from red to orange to yellow
    this.hue = 60 * lifeRatio; // 0 (red) to 60 (yellow)
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
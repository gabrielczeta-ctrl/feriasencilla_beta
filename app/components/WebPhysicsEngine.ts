// Advanced Web Physics Engine
// Brings Love2D-level physics performance to the browser

export interface PhysicsBody {
  id: string;
  x: number; // World coordinates
  y: number;
  vx: number; // Velocity
  vy: number;
  mass: number;
  restitution: number; // Bounciness 0-1
  friction: number;
  width: number;
  height: number;
  rotation: number;
  angularVelocity: number;
  isStatic: boolean;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  collisionShape: 'box' | 'circle' | 'polygon';
  vertices?: Array<{x: number, y: number}>; // For drawing collision shapes
}

export interface Collision {
  bodyA: PhysicsBody;
  bodyB: PhysicsBody;
  point: {x: number, y: number};
  normal: {x: number, y: number};
  penetration: number;
  relativeVelocity: number;
}

export class WebPhysicsEngine {
  private bodies: Map<string, PhysicsBody> = new Map();
  private gravity = 400; // pixels/second²
  private timestep = 1/120; // 120 Hz simulation
  private accumulator = 0;
  private dampingFactor = 0.995;
  private worldBounds = {
    left: 0,
    right: 1920,
    top: 0,
    bottom: 1080
  };
  private collisionCallbacks: Array<(collision: Collision) => void> = [];

  constructor(worldWidth: number, worldHeight: number) {
    this.worldBounds.right = worldWidth;
    this.worldBounds.bottom = worldHeight;
  }

  // Add physics body to simulation
  addBody(id: string, x: number, y: number, width: number, height: number, options: Partial<PhysicsBody> = {}): PhysicsBody {
    const body: PhysicsBody = {
      id,
      x,
      y,
      vx: 0,
      vy: 0,
      mass: options.mass || 1,
      restitution: options.restitution || 0.8,
      friction: options.friction || 0.3,
      width,
      height,
      rotation: 0,
      angularVelocity: 0,
      isStatic: options.isStatic || false,
      bounds: {
        minX: x - width/2,
        minY: y - height/2,
        maxX: x + width/2,
        maxY: y + height/2
      },
      collisionShape: options.collisionShape || 'box',
      vertices: options.vertices,
      ...options
    };

    this.updateBounds(body);
    this.bodies.set(id, body);
    return body;
  }

  // Create collision body from drawing stroke
  addStrokeCollision(strokeId: string, points: Array<{x: number, y: number}>, strokeWidth: number): PhysicsBody[] {
    const bodies: PhysicsBody[] = [];
    
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      
      const centerX = (p1.x + p2.x) / 2;
      const centerY = (p1.y + p2.y) / 2;
      const length = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      
      if (length > 5) { // Skip tiny segments
        const segmentBody = this.addBody(
          `${strokeId}_segment_${i}`,
          centerX,
          centerY,
          length,
          strokeWidth,
          {
            isStatic: true,
            rotation: angle,
            collisionShape: 'box',
            restitution: 0.6,
            friction: 0.8
          }
        );
        bodies.push(segmentBody);
      }
    }
    
    return bodies;
  }

  // Update physics simulation
  update(deltaTime: number): Collision[] {
    this.accumulator += Math.min(deltaTime, 0.25); // Cap at 250ms
    const collisions: Collision[] = [];

    // Fixed timestep simulation for consistency
    while (this.accumulator >= this.timestep) {
      const stepCollisions = this.physicsStep(this.timestep);
      collisions.push(...stepCollisions);
      this.accumulator -= this.timestep;
    }

    return collisions;
  }

  private physicsStep(dt: number): Collision[] {
    const collisions: Collision[] = [];

    // Apply gravity and update velocities
    for (const body of this.bodies.values()) {
      if (!body.isStatic) {
        // Apply gravity
        body.vy += this.gravity * dt;
        
        // Apply damping
        body.vx *= this.dampingFactor;
        body.vy *= this.dampingFactor;
        
        // Update angular velocity damping
        body.angularVelocity *= 0.98;
      }
    }

    // Detect and resolve collisions
    const bodyArray = Array.from(this.bodies.values());
    for (let i = 0; i < bodyArray.length; i++) {
      for (let j = i + 1; j < bodyArray.length; j++) {
        const bodyA = bodyArray[i];
        const bodyB = bodyArray[j];
        
        if (bodyA.isStatic && bodyB.isStatic) continue;
        
        const collision = this.detectCollision(bodyA, bodyB);
        if (collision) {
          collisions.push(collision);
          this.resolveCollision(collision);
          
          // Notify collision callbacks
          this.collisionCallbacks.forEach(callback => callback(collision));
        }
      }
    }

    // Update positions
    for (const body of this.bodies.values()) {
      if (!body.isStatic) {
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        body.rotation += body.angularVelocity * dt;
        
        this.updateBounds(body);
        this.checkWorldBounds(body);
      }
    }

    return collisions;
  }

  private detectCollision(bodyA: PhysicsBody, bodyB: PhysicsBody): Collision | null {
    // AABB broad phase
    if (!this.aabbIntersect(bodyA.bounds, bodyB.bounds)) {
      return null;
    }

    // Detailed collision detection
    if (bodyA.collisionShape === 'box' && bodyB.collisionShape === 'box') {
      return this.boxBoxCollision(bodyA, bodyB);
    }
    
    // Add more collision shape combinations as needed
    return null;
  }

  private aabbIntersect(a: PhysicsBody['bounds'], b: PhysicsBody['bounds']): boolean {
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
  }

  private boxBoxCollision(bodyA: PhysicsBody, bodyB: PhysicsBody): Collision | null {
    const dx = bodyB.x - bodyA.x;
    const dy = bodyB.y - bodyA.y;
    
    const overlapX = (bodyA.width + bodyB.width) / 2 - Math.abs(dx);
    const overlapY = (bodyA.height + bodyB.height) / 2 - Math.abs(dy);
    
    if (overlapX <= 0 || overlapY <= 0) return null;
    
    // Determine collision normal based on minimum overlap
    let normal: {x: number, y: number};
    let penetration: number;
    let point: {x: number, y: number};
    
    if (overlapX < overlapY) {
      normal = { x: dx > 0 ? 1 : -1, y: 0 };
      penetration = overlapX;
      point = { x: bodyA.x + (dx > 0 ? bodyA.width/2 : -bodyA.width/2), y: bodyA.y };
    } else {
      normal = { x: 0, y: dy > 0 ? 1 : -1 };
      penetration = overlapY;
      point = { x: bodyA.x, y: bodyA.y + (dy > 0 ? bodyA.height/2 : -bodyA.height/2) };
    }
    
    // Calculate relative velocity
    const relVelX = bodyB.vx - bodyA.vx;
    const relVelY = bodyB.vy - bodyA.vy;
    const relativeVelocity = relVelX * normal.x + relVelY * normal.y;
    
    return {
      bodyA,
      bodyB,
      point,
      normal,
      penetration,
      relativeVelocity
    };
  }

  private resolveCollision(collision: Collision): void {
    const { bodyA, bodyB, normal, penetration, relativeVelocity } = collision;
    
    // Separate bodies
    const totalMass = bodyA.mass + bodyB.mass;
    const separationA = bodyA.isStatic ? 0 : (bodyB.mass / totalMass) * penetration;
    const separationB = bodyB.isStatic ? 0 : (bodyA.mass / totalMass) * penetration;
    
    if (!bodyA.isStatic) {
      bodyA.x -= normal.x * separationA;
      bodyA.y -= normal.y * separationA;
    }
    
    if (!bodyB.isStatic) {
      bodyB.x += normal.x * separationB;
      bodyB.y += normal.y * separationB;
    }
    
    // Don't resolve if objects are separating
    if (relativeVelocity > 0) return;
    
    // Calculate impulse
    const restitution = Math.min(bodyA.restitution, bodyB.restitution);
    const impulse = -(1 + restitution) * relativeVelocity;
    const impulseMagnitude = impulse / (1/bodyA.mass + 1/bodyB.mass);
    
    // Apply impulse to velocities
    if (!bodyA.isStatic) {
      bodyA.vx -= impulseMagnitude * normal.x / bodyA.mass;
      bodyA.vy -= impulseMagnitude * normal.y / bodyA.mass;
      
      // Add angular velocity for more realistic physics
      bodyA.angularVelocity += (Math.random() - 0.5) * 2;
    }
    
    if (!bodyB.isStatic) {
      bodyB.vx += impulseMagnitude * normal.x / bodyB.mass;
      bodyB.vy += impulseMagnitude * normal.y / bodyB.mass;
      
      bodyB.angularVelocity += (Math.random() - 0.5) * 2;
    }
    
    this.updateBounds(bodyA);
    this.updateBounds(bodyB);
  }

  private checkWorldBounds(body: PhysicsBody): void {
    let bounced = false;
    
    // Left and right bounds
    if (body.bounds.minX < this.worldBounds.left) {
      body.x = this.worldBounds.left + body.width/2;
      body.vx = Math.abs(body.vx) * body.restitution;
      bounced = true;
    } else if (body.bounds.maxX > this.worldBounds.right) {
      body.x = this.worldBounds.right - body.width/2;
      body.vx = -Math.abs(body.vx) * body.restitution;
      bounced = true;
    }
    
    // Top and bottom bounds
    if (body.bounds.minY < this.worldBounds.top) {
      body.y = this.worldBounds.top + body.height/2;
      body.vy = Math.abs(body.vy) * body.restitution;
      bounced = true;
    } else if (body.bounds.maxY > this.worldBounds.bottom) {
      body.y = this.worldBounds.bottom - body.height/2;
      body.vy = -Math.abs(body.vy) * body.restitution;
      bounced = true;
    }
    
    if (bounced) {
      // Add some randomness to prevent perfect bouncing loops
      body.vx += (Math.random() - 0.5) * 10;
      body.vy += (Math.random() - 0.5) * 10;
      body.angularVelocity += (Math.random() - 0.5) * 3;
      
      this.updateBounds(body);
    }
  }

  private updateBounds(body: PhysicsBody): void {
    body.bounds.minX = body.x - body.width/2;
    body.bounds.minY = body.y - body.height/2;
    body.bounds.maxX = body.x + body.width/2;
    body.bounds.maxY = body.y + body.height/2;
  }

  // Throw object with initial velocity
  throwObject(bodyId: string, vx: number, vy: number): void {
    const body = this.bodies.get(bodyId);
    if (body && !body.isStatic) {
      body.vx = vx;
      body.vy = vy;
      body.angularVelocity = (Math.random() - 0.5) * 5;
    }
  }

  // Get body by ID
  getBody(id: string): PhysicsBody | undefined {
    return this.bodies.get(id);
  }

  // Remove body from simulation
  removeBody(id: string): void {
    this.bodies.delete(id);
  }

  // Get all bodies
  getAllBodies(): PhysicsBody[] {
    return Array.from(this.bodies.values());
  }

  // Add collision callback
  onCollision(callback: (collision: Collision) => void): void {
    this.collisionCallbacks.push(callback);
  }

  // Set world bounds
  setWorldBounds(left: number, top: number, right: number, bottom: number): void {
    this.worldBounds = { left, top, right, bottom };
  }

  // Configure physics parameters
  setGravity(gravity: number): void {
    this.gravity = gravity;
  }

  setDamping(damping: number): void {
    this.dampingFactor = Math.max(0, Math.min(1, damping));
  }

  // Clear all bodies
  clear(): void {
    this.bodies.clear();
  }

  // Get physics statistics
  getStats() {
    return {
      bodyCount: this.bodies.size,
      gravity: this.gravity,
      timestep: this.timestep,
      damping: this.dampingFactor
    };
  }
}
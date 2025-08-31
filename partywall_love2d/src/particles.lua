--[[
  ADVANCED PARTICLE SYSTEM
  
  Features:
  - Multiple particle types and effects
  - Hardware-accelerated rendering
  - Physics-based particle motion
  - Dynamic particle pools for performance
  - Custom particle behaviors and animations
]]--

local Particles = {}
Particles.__index = Particles

function Particles.new()
    local self = setmetatable({}, Particles)
    
    -- Particle systems
    self.systems = {}
    self.activeParticles = {}
    
    -- Particle pools for performance
    self.particlePool = {}
    self.poolSize = 1000
    
    -- Initialize particle pool
    self:initializePool()
    
    -- Effect configurations
    self.effects = {
        messageSpawn = {
            count = 15,
            lifetime = 1.5,
            speed = {50, 150},
            size = {2, 6},
            colors = {{1,1,1,1}, {0.8,0.9,1,1}, {1,0.9,0.8,1}},
            gravity = -100,
            fade = true
        },
        
        bounce = {
            count = 8,
            lifetime = 0.8,
            speed = {30, 100},
            size = {1, 3},
            colors = {{1,1,0.3,1}, {1,0.8,0.2,1}},
            gravity = 50,
            fade = true
        },
        
        collision = {
            count = 20,
            lifetime = 1.2,
            speed = {80, 200},
            size = {1, 4},
            colors = {{1,0.5,0.2,1}, {1,0.8,0.4,1}, {1,1,1,1}},
            gravity = 0,
            fade = true,
            sparks = true
        },
        
        throw = {
            count = 10,
            lifetime = 2.0,
            speed = {20, 80},
            size = {2, 5},
            colors = {{0.3,0.8,1,1}, {0.5,0.9,1,1}},
            gravity = -50,
            fade = true,
            trail = true
        },
        
        drawing = {
            count = 3,
            lifetime = 0.5,
            speed = {10, 30},
            size = {1, 2},
            colors = {{1,1,1,0.8}},
            gravity = 0,
            fade = true
        }
    }
    
    return self
end

function Particles:initializePool()
    for i = 1, self.poolSize do
        table.insert(self.particlePool, {
            active = false,
            x = 0, y = 0,
            vx = 0, vy = 0,
            size = 1,
            color = {1, 1, 1, 1},
            lifetime = 0,
            maxLifetime = 1,
            gravity = 0,
            rotation = 0,
            angularVelocity = 0,
            scale = 1,
            fadeSpeed = 1,
            trail = nil,
            behavior = nil
        })
    end
end

function Particles:getParticle()
    -- Find inactive particle from pool
    for _, particle in ipairs(self.particlePool) do
        if not particle.active then
            return particle
        end
    end
    
    -- Pool exhausted, create new particle (should rarely happen)
    local newParticle = {
        active = false,
        x = 0, y = 0,
        vx = 0, vy = 0,
        size = 1,
        color = {1, 1, 1, 1},
        lifetime = 0,
        maxLifetime = 1,
        gravity = 0,
        rotation = 0,
        angularVelocity = 0,
        scale = 1,
        fadeSpeed = 1,
        trail = nil,
        behavior = nil
    }
    table.insert(self.particlePool, newParticle)
    return newParticle
end

function Particles:releaseParticle(particle)
    particle.active = false
    particle.trail = nil
    particle.behavior = nil
end

function Particles:createEffect(effectType, x, y, data)
    local config = self.effects[effectType]
    if not config then return end
    
    data = data or {}
    
    for i = 1, config.count do
        local particle = self:getParticle()
        if particle then
            self:initializeParticle(particle, config, x, y, data)
            table.insert(self.activeParticles, particle)
        end
    end
end

function Particles:initializeParticle(particle, config, x, y, data)
    particle.active = true
    particle.x = x + (love.math.random() - 0.5) * 10
    particle.y = y + (love.math.random() - 0.5) * 10
    
    -- Velocity
    local speed = love.math.random(config.speed[1], config.speed[2])
    local angle = love.math.random() * math.pi * 2
    particle.vx = math.cos(angle) * speed
    particle.vy = math.sin(angle) * speed
    
    -- Properties
    particle.size = love.math.random(config.size[1], config.size[2])
    particle.color = config.colors[love.math.random(1, #config.colors)]
    particle.maxLifetime = config.lifetime + (love.math.random() - 0.5) * config.lifetime * 0.3
    particle.lifetime = particle.maxLifetime
    particle.gravity = config.gravity or 0
    
    -- Visual properties
    particle.rotation = love.math.random() * math.pi * 2
    particle.angularVelocity = (love.math.random() - 0.5) * 5
    particle.scale = 1
    particle.fadeSpeed = config.fade and 1 or 0
    
    -- Special behaviors
    if config.sparks then
        particle.behavior = "sparks"
        particle.vy = particle.vy - 50 -- Sparks fly upward
    end
    
    if config.trail then
        particle.trail = {}
        particle.behavior = "trail"
    end
    
    -- Data overrides
    if data.color then
        particle.color = data.color
    end
    if data.velocity then
        particle.vx = particle.vx + data.velocity.x
        particle.vy = particle.vy + data.velocity.y
    end
end

function Particles:messageSpawn(x, y)
    self:createEffect("messageSpawn", x, y)
end

function Particles:bounceEffect(x, y)
    self:createEffect("bounce", x, y)
end

function Particles:collisionSparks(x, y)
    self:createEffect("collision", x, y)
end

function Particles:throwEffect(x, y, vx, vy)
    local data = {
        velocity = {x = vx * 0.1, y = vy * 0.1}
    }
    self:createEffect("throw", x, y, data)
end

function Particles:drawingEffect(x, y, color)
    local data = {
        color = color or {1, 1, 1, 0.8}
    }
    self:createEffect("drawing", x, y, data)
end

function Particles:update(dt)
    -- Update all active particles
    for i = #self.activeParticles, 1, -1 do
        local particle = self.activeParticles[i]
        
        if particle.active then
            self:updateParticle(particle, dt)
            
            -- Remove dead particles
            if particle.lifetime <= 0 then
                self:releaseParticle(particle)
                table.remove(self.activeParticles, i)
            end
        else
            table.remove(self.activeParticles, i)
        end
    end
end

function Particles:updateParticle(particle, dt)
    -- Update lifetime
    particle.lifetime = particle.lifetime - dt
    
    -- Update position
    particle.x = particle.x + particle.vx * dt
    particle.y = particle.y + particle.vy * dt
    
    -- Apply gravity
    if particle.gravity ~= 0 then
        particle.vy = particle.vy + particle.gravity * dt
    end
    
    -- Update rotation
    particle.rotation = particle.rotation + particle.angularVelocity * dt
    
    -- Update scale and alpha based on lifetime
    local t = 1 - (particle.lifetime / particle.maxLifetime)
    
    if particle.fadeSpeed > 0 then
        particle.color[4] = particle.color[4] * (particle.lifetime / particle.maxLifetime)
    end
    
    -- Special behaviors
    if particle.behavior == "sparks" then
        -- Sparks slow down and fade quickly
        particle.vx = particle.vx * 0.98
        particle.vy = particle.vy * 0.98
        particle.scale = 1 - t * 0.5
        
    elseif particle.behavior == "trail" then
        -- Trail particles leave traces
        table.insert(particle.trail, {x = particle.x, y = particle.y, alpha = particle.color[4]})
        
        -- Limit trail length
        if #particle.trail > 10 then
            table.remove(particle.trail, 1)
        end
        
        -- Update trail alpha
        for j, point in ipairs(particle.trail) do
            point.alpha = point.alpha * 0.95
        end
    end
    
    -- Size variation based on lifetime
    if particle.behavior ~= "sparks" then
        particle.scale = 0.5 + 0.5 * math.sin(t * math.pi)
    end
end

function Particles:draw()
    love.graphics.push()
    love.graphics.setBlendMode("add") -- Additive blending for glowing effects
    
    for _, particle in ipairs(self.activeParticles) do
        if particle.active and particle.color[4] > 0.01 then
            self:drawParticle(particle)
        end
    end
    
    love.graphics.setBlendMode("alpha")
    love.graphics.pop()
end

function Particles:drawParticle(particle)
    love.graphics.push()
    love.graphics.translate(particle.x, particle.y)
    love.graphics.rotate(particle.rotation)
    love.graphics.scale(particle.scale)
    
    -- Draw trail if it exists
    if particle.trail and #particle.trail > 1 then
        love.graphics.setLineWidth(1)
        for i = 1, #particle.trail - 1 do
            local p1 = particle.trail[i]
            local p2 = particle.trail[i + 1]
            love.graphics.setColor(particle.color[1], particle.color[2], particle.color[3], p1.alpha)
            love.graphics.line(p1.x - particle.x, p1.y - particle.y, 
                             p2.x - particle.x, p2.y - particle.y)
        end
    end
    
    -- Draw particle
    love.graphics.setColor(particle.color[1], particle.color[2], particle.color[3], particle.color[4])
    
    if particle.behavior == "sparks" then
        -- Draw sparks as small lines
        love.graphics.setLineWidth(particle.size)
        love.graphics.line(-particle.size/2, 0, particle.size/2, 0)
    else
        -- Draw regular particles as circles
        love.graphics.circle("fill", 0, 0, particle.size)
        
        -- Add glow effect for larger particles
        if particle.size > 3 then
            love.graphics.setColor(particle.color[1], particle.color[2], particle.color[3], particle.color[4] * 0.3)
            love.graphics.circle("fill", 0, 0, particle.size * 1.5)
        end
    end
    
    love.graphics.pop()
end

function Particles:createExplosion(x, y, intensity)
    intensity = intensity or 1
    
    -- Create multiple particle effects for explosion
    for i = 1, math.ceil(intensity * 3) do
        self:createEffect("collision", 
                         x + (love.math.random() - 0.5) * 20,
                         y + (love.math.random() - 0.5) * 20)
    end
    
    -- Add some sparks
    for i = 1, math.ceil(intensity * 2) do
        local particle = self:getParticle()
        if particle then
            local config = self.effects.collision
            self:initializeParticle(particle, config, x, y)
            particle.behavior = "sparks"
            particle.vx = particle.vx * 2
            particle.vy = particle.vy * 2 - 100
            table.insert(self.activeParticles, particle)
        end
    end
end

function Particles:createRipple(x, y, maxRadius)
    maxRadius = maxRadius or 50
    
    -- Create expanding ring effect
    for angle = 0, math.pi * 2, math.pi / 8 do
        local particle = self:getParticle()
        if particle then
            particle.active = true
            particle.x = x
            particle.y = y
            particle.vx = math.cos(angle) * 100
            particle.vy = math.sin(angle) * 100
            particle.size = 2
            particle.color = {0.3, 0.8, 1, 1}
            particle.maxLifetime = maxRadius / 100
            particle.lifetime = particle.maxLifetime
            particle.gravity = 0
            particle.fadeSpeed = 1
            particle.behavior = "ripple"
            
            table.insert(self.activeParticles, particle)
        end
    end
end

function Particles:getCount()
    return #self.activeParticles
end

function Particles:clear()
    for _, particle in ipairs(self.activeParticles) do
        self:releaseParticle(particle)
    end
    self.activeParticles = {}
end

return Particles
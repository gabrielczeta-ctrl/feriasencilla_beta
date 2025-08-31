--[[
  CAMERA SYSTEM
  
  Features:
  - Smooth panning and zooming
  - Screen shake effects
  - Viewport management
  - World/screen coordinate conversion
]]--

local Camera = {}
Camera.__index = Camera

function Camera.new()
    local self = setmetatable({}, Camera)
    
    -- Camera transform
    self.x = 0
    self.y = 0
    self.zoom = 1
    self.rotation = 0
    
    -- Target transform for smooth movement
    self.targetX = 0
    self.targetY = 0
    self.targetZoom = 1
    
    -- Smoothing
    self.smoothing = 8 -- Higher = more responsive
    
    -- Panning state
    self.panning = false
    self.panStartX = 0
    self.panStartY = 0
    self.panStartCamX = 0
    self.panStartCamY = 0
    
    -- Screen shake
    self.shake = {
        intensity = 0,
        duration = 0,
        timer = 0,
        offsetX = 0,
        offsetY = 0
    }
    
    -- Viewport bounds
    self.bounds = {
        left = -2000,
        right = 2000,
        top = -2000,
        bottom = 2000
    }
    
    -- Zoom limits
    self.minZoom = 0.1
    self.maxZoom = 3.0
    
    return self
end

function Camera:update(dt)
    -- Smooth camera movement
    local lerpFactor = 1 - math.exp(-self.smoothing * dt)
    self.x = self.x + (self.targetX - self.x) * lerpFactor
    self.y = self.y + (self.targetY - self.y) * lerpFactor
    self.zoom = self.zoom + (self.targetZoom - self.zoom) * lerpFactor
    
    -- Apply bounds
    self:applyBounds()
    
    -- Update screen shake
    if self.shake.timer > 0 then
        self.shake.timer = self.shake.timer - dt
        
        local intensity = self.shake.intensity * (self.shake.timer / self.shake.duration)
        self.shake.offsetX = (love.math.random() - 0.5) * intensity * 2
        self.shake.offsetY = (love.math.random() - 0.5) * intensity * 2
        
        if self.shake.timer <= 0 then
            self.shake.offsetX = 0
            self.shake.offsetY = 0
        end
    end
end

function Camera:apply()
    love.graphics.push()
    
    local w, h = love.graphics.getDimensions()
    love.graphics.translate(w/2, h/2)
    love.graphics.scale(self.zoom)
    love.graphics.rotate(self.rotation)
    love.graphics.translate(-self.x + self.shake.offsetX, -self.y + self.shake.offsetY)
end

function Camera:reset()
    love.graphics.pop()
end

function Camera:move(dx, dy)
    self.targetX = self.targetX + dx / self.zoom
    self.targetY = self.targetY + dy / self.zoom
end

function Camera:setPosition(x, y)
    self.targetX = x
    self.targetY = y
end

function Camera:getPosition()
    return self.x, self.y
end

function Camera:zoom(factor)
    local newZoom = self.targetZoom + factor
    self.targetZoom = math.max(self.minZoom, math.min(self.maxZoom, newZoom))
end

function Camera:setZoom(zoom)
    self.targetZoom = math.max(self.minZoom, math.min(self.maxZoom, zoom))
end

function Camera:getZoom()
    return self.zoom
end

function Camera:shake(intensity, duration)
    self.shake.intensity = intensity
    self.shake.duration = duration
    self.shake.timer = duration
end

function Camera:startPan(screenX, screenY)
    self.panning = true
    self.panStartX = screenX
    self.panStartY = screenY
    self.panStartCamX = self.targetX
    self.panStartCamY = self.targetY
end

function Camera:pan(dx, dy)
    if not self.panning then return end
    
    self.targetX = self.panStartCamX - dx / self.zoom
    self.targetY = self.panStartCamY - dy / self.zoom
end

function Camera:stopPan()
    self.panning = false
end

function Camera:isPanning()
    return self.panning
end

function Camera:screenToWorld(screenX, screenY)
    local w, h = love.graphics.getDimensions()
    
    -- Translate to center
    local x = screenX - w/2
    local y = screenY - h/2
    
    -- Apply inverse zoom
    x = x / self.zoom
    y = y / self.zoom
    
    -- Apply inverse camera transform
    local cos_r = math.cos(-self.rotation)
    local sin_r = math.sin(-self.rotation)
    local worldX = x * cos_r - y * sin_r + self.x
    local worldY = x * sin_r + y * cos_r + self.y
    
    return worldX, worldY
end

function Camera:worldToScreen(worldX, worldY)
    local w, h = love.graphics.getDimensions()
    
    -- Apply camera transform
    local x = worldX - self.x
    local y = worldY - self.y
    
    -- Apply rotation
    local cos_r = math.cos(self.rotation)
    local sin_r = math.sin(self.rotation)
    local rotX = x * cos_r - y * sin_r
    local rotY = x * sin_r + y * cos_r
    
    -- Apply zoom
    rotX = rotX * self.zoom
    rotY = rotY * self.zoom
    
    -- Translate from center
    local screenX = rotX + w/2
    local screenY = rotY + h/2
    
    return screenX, screenY
end

function Camera:getViewportBounds()
    local w, h = love.graphics.getDimensions()
    local halfW = w / (2 * self.zoom)
    local halfH = h / (2 * self.zoom)
    
    return self.x - halfW, self.y - halfH, self.x + halfW, self.y + halfH
end

function Camera:isPointVisible(x, y)
    local left, top, right, bottom = self:getViewportBounds()
    return x >= left and x <= right and y >= top and y <= bottom
end

function Camera:applyBounds()
    if self.bounds then
        self.targetX = math.max(self.bounds.left, math.min(self.bounds.right, self.targetX))
        self.targetY = math.max(self.bounds.top, math.min(self.bounds.bottom, self.targetY))
    end
end

function Camera:setBounds(left, top, right, bottom)
    self.bounds = {
        left = left,
        top = top,
        right = right,
        bottom = bottom
    }
end

function Camera:removeBounds()
    self.bounds = nil
end

function Camera:lookAt(x, y)
    self:setPosition(x, y)
end

function Camera:follow(target, lerpFactor)
    lerpFactor = lerpFactor or 0.1
    local targetX = target.x or 0
    local targetY = target.y or 0
    
    self.targetX = self.targetX + (targetX - self.targetX) * lerpFactor
    self.targetY = self.targetY + (targetY - self.targetY) * lerpFactor
end

function Camera:resize(w, h)
    -- Handle window resize
    -- Adjust camera bounds or zoom if needed
end

return Camera
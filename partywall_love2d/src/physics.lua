--[[
  PHYSICS SYSTEM - Advanced Box2D Integration
  
  Features:
  - Native Box2D physics simulation
  - Dynamic message body creation
  - Drawing collision generation
  - Boundary physics
  - Advanced collision callbacks
  - Physics debugging
]]--

local Physics = {}
Physics.__index = Physics

local PIXELS_PER_METER = 64
local GRAVITY = 400 -- pixels/second²

function Physics.new()
    local self = setmetatable({}, Physics)
    
    -- Create Box2D world with gravity
    self.world = love.physics.newWorld(0, GRAVITY, true)
    
    -- Collision callbacks
    self.collisionCallbacks = {}
    self.world:setCallbacks(
        function(...) self:beginContact(...) end,
        function(...) self:endContact(...) end
    )
    
    -- Physics objects
    self.bodies = {}
    self.messageBodyMap = {} -- message.id -> body
    self.strokeBodies = {} -- stroke collision bodies
    
    -- Create world boundaries
    self:createBoundaries()
    
    -- Physics settings
    self.timeAccumulator = 0
    self.fixedTimeStep = 1/120 -- 120 Hz physics
    self.maxFrameTime = 1/30   -- Prevent spiral of death
    
    return self
end

function Physics:createBoundaries()
    local w, h = love.graphics.getDimensions()
    local thickness = 50
    
    -- Ground
    local ground = love.physics.newBody(self.world, w/2, h + thickness/2, "static")
    local groundShape = love.physics.newRectangleShape(w + thickness*2, thickness)
    local groundFixture = love.physics.newFixture(ground, groundShape)
    groundFixture:setUserData({type = "boundary", name = "ground"})
    groundFixture:setRestitution(0.7)
    groundFixture:setFriction(0.3)
    
    -- Ceiling  
    local ceiling = love.physics.newBody(self.world, w/2, -thickness/2, "static")
    local ceilingShape = love.physics.newRectangleShape(w + thickness*2, thickness)
    local ceilingFixture = love.physics.newFixture(ceiling, ceilingShape)
    ceilingFixture:setUserData({type = "boundary", name = "ceiling"})
    ceilingFixture:setRestitution(0.7)
    ceilingFixture:setFriction(0.3)
    
    -- Left wall
    local leftWall = love.physics.newBody(self.world, -thickness/2, h/2, "static")
    local leftShape = love.physics.newRectangleShape(thickness, h + thickness*2)
    local leftFixture = love.physics.newFixture(leftWall, leftShape)
    leftFixture:setUserData({type = "boundary", name = "left"})
    leftFixture:setRestitution(0.7)
    leftFixture:setFriction(0.3)
    
    -- Right wall
    local rightWall = love.physics.newBody(self.world, w + thickness/2, h/2, "static")
    local rightShape = love.physics.newRectangleShape(thickness, h + thickness*2)
    local rightFixture = love.physics.newFixture(rightWall, rightShape)
    rightFixture:setUserData({type = "boundary", name = "right"})
    rightFixture:setRestitution(0.7)
    rightFixture:setFriction(0.3)
    
    self.boundaries = {ground, ceiling, leftWall, rightWall}
end

function Physics:createMessageBody(message)
    if self.messageBodyMap[message.id] then
        self:destroyMessageBody(message.id)
    end
    
    -- Calculate message dimensions
    local width = (message.width or 100)
    local height = (message.height or 30)
    
    -- Create dynamic body
    local body = love.physics.newBody(self.world, message.x, message.y, "dynamic")
    local shape = love.physics.newRectangleShape(width, height)
    local fixture = love.physics.newFixture(body, shape)
    
    -- Set physics properties
    local physics = message.physics or {}
    fixture:setRestitution(physics.restitution or 0.8) -- Bounciness
    fixture:setFriction(physics.friction or 0.3)       -- Surface friction
    body:setMass(physics.mass or 1)                    -- Mass
    
    -- Set initial velocity
    if physics.vx and physics.vy then
        body:setLinearVelocity(physics.vx, physics.vy)
    end
    
    -- Set user data for collision detection
    fixture:setUserData({
        type = "message",
        messageId = message.id,
        message = message
    })
    
    -- Store body reference
    self.messageBodyMap[message.id] = body
    table.insert(self.bodies, body)
    
    return body
end

function Physics:destroyMessageBody(messageId)
    local body = self.messageBodyMap[messageId]
    if body then
        -- Remove from bodies list
        for i = #self.bodies, 1, -1 do
            if self.bodies[i] == body then
                table.remove(self.bodies, i)
                break
            end
        end
        
        -- Destroy physics body
        body:destroy()
        self.messageBodyMap[messageId] = nil
    end
end

function Physics:updateMessageFromBody(message)
    local body = self.messageBodyMap[message.id]
    if body then
        -- Update message position from physics body
        message.x, message.y = body:getPosition()
        message.angle = body:getAngle()
        
        -- Update physics state
        local vx, vy = body:getLinearVelocity()
        if message.physics then
            message.physics.vx = vx
            message.physics.vy = vy
            
            -- Check if still bouncing (has significant velocity)
            local speed = math.sqrt(vx^2 + vy^2)
            message.physics.bouncing = speed > 50
        end
    end
end

function Physics:throwObject(message, vx, vy)
    local body = self.messageBodyMap[message.id]
    if not body then
        -- Create body if it doesn't exist
        body = self:createMessageBody(message)
    end
    
    -- Apply velocity
    body:setLinearVelocity(vx, vy)
    
    -- Update message physics state
    if not message.physics then
        message.physics = {}
    end
    message.physics.vx = vx
    message.physics.vy = vy
    message.physics.bouncing = true
    
    -- Add some angular velocity for realism
    local angularVel = (vx + vy) * 0.01
    body:setAngularVelocity(angularVel)
end

function Physics:createStrokeCollision(stroke)
    if not stroke.points or #stroke.points < 2 then
        return
    end
    
    -- Clear existing collision bodies for this stroke
    if stroke.collisionBodies then
        for _, body in ipairs(stroke.collisionBodies) do
            body:destroy()
        end
    end
    stroke.collisionBodies = {}
    
    -- Create collision segments along the stroke
    for i = 1, #stroke.points - 1 do
        local p1 = stroke.points[i]
        local p2 = stroke.points[i + 1]
        
        local centerX = (p1.x + p2.x) / 2
        local centerY = (p1.y + p2.y) / 2
        local length = math.sqrt((p2.x - p1.x)^2 + (p2.y - p1.y)^2)
        local angle = math.atan2(p2.y - p1.y, p2.x - p1.x)
        
        -- Only create collision for segments longer than minimum
        if length > 10 then
            local body = love.physics.newBody(self.world, centerX, centerY, "static")
            local shape = love.physics.newRectangleShape(length, stroke.size or 5)
            local fixture = love.physics.newFixture(body, shape)
            
            body:setAngle(angle)
            
            -- Set collision properties
            fixture:setRestitution(0.9) -- Very bouncy
            fixture:setFriction(0.1)    -- Low friction
            fixture:setUserData({
                type = "drawing",
                stroke = stroke,
                tool = stroke.tool
            })
            
            table.insert(stroke.collisionBodies, body)
        end
    end
end

function Physics:removeStrokeCollision(stroke)
    if stroke.collisionBodies then
        for _, body in ipairs(stroke.collisionBodies) do
            body:destroy()
        end
        stroke.collisionBodies = nil
    end
end

function Physics:update(dt)
    -- Clamp delta time to prevent instability
    dt = math.min(dt, self.maxFrameTime)
    
    -- Fixed timestep physics simulation
    self.timeAccumulator = self.timeAccumulator + dt
    
    while self.timeAccumulator >= self.fixedTimeStep do
        self.world:update(self.fixedTimeStep)
        self.timeAccumulator = self.timeAccumulator - self.fixedTimeStep
    end
    
    -- Apply damping to prevent objects from spinning forever
    for _, body in ipairs(self.bodies) do
        if body:isActive() then
            -- Linear damping
            local vx, vy = body:getLinearVelocity()
            local speed = math.sqrt(vx^2 + vy^2)
            
            if speed > 0 then
                local damping = 0.99 -- 1% energy loss per frame
                body:setLinearVelocity(vx * damping, vy * damping)
            end
            
            -- Angular damping
            local av = body:getAngularVelocity()
            if math.abs(av) > 0 then
                body:setAngularVelocity(av * 0.98)
            end
            
            -- Sleep very slow objects
            if speed < 10 and math.abs(av) < 0.1 then
                body:setAwake(false)
            end
        end
    end
end

function Physics:beginContact(fixtureA, fixtureB, contact)
    local objA = fixtureA:getUserData()
    local objB = fixtureB:getUserData()
    
    if not objA or not objB then return end
    
    -- Find collision type
    local typeA, typeB = objA.type, objB.type
    local collisionType = typeA .. "_" .. typeB
    
    -- Call registered callbacks
    if self.collisionCallbacks[collisionType] then
        self.collisionCallbacks[collisionType](objA, objB, contact)
    end
    
    -- Try reverse collision type
    local reverseType = typeB .. "_" .. typeA
    if self.collisionCallbacks[reverseType] then
        self.collisionCallbacks[reverseType](objB, objA, contact)
    end
    
    -- Special collision effects
    if (typeA == "message" and typeB == "drawing") or 
       (typeB == "message" and typeA == "drawing") then
        
        -- Get collision point
        local points = {contact:getPositions()}
        if #points >= 2 then
            local x, y = points[1], points[2]
            
            -- Create spark effect at collision point
            -- This would be handled by the particle system
            self:triggerCollisionEffect(x, y, "drawing_collision")
        end
    end
end

function Physics:endContact(fixtureA, fixtureB, contact)
    -- Handle end of collision if needed
end

function Physics:onCollision(typeA, typeB, callback)
    local key = typeA .. "_" .. typeB
    self.collisionCallbacks[key] = callback
end

function Physics:triggerCollisionEffect(x, y, effectType)
    -- This would trigger particle effects, sounds, screen shake, etc.
    -- Called by external systems
    if self.effectCallback then
        self.effectCallback(x, y, effectType)
    end
end

function Physics:setEffectCallback(callback)
    self.effectCallback = callback
end

function Physics:getBodyCount()
    return self.world:getBodyCount()
end

function Physics:getContactCount()
    return self.world:getContactCount()
end

function Physics:drawDebug()
    -- Draw physics world debug info
    love.graphics.push()
    love.graphics.setColor(0, 1, 0, 0.5)
    love.graphics.setLineWidth(1)
    
    -- Draw all fixtures
    for _, body in ipairs(self.world:getBodies()) do
        local fixtures = body:getFixtures()
        for _, fixture in ipairs(fixtures) do
            local shape = fixture:getShape()
            local shapeType = shape:getType()
            
            if shapeType == "polygon" or shapeType == "rectangle" then
                local points = {body:getWorldPoints(shape:getPoints())}
                if #points >= 6 then
                    love.graphics.polygon("line", points)
                end
            elseif shapeType == "circle" then
                local x, y = body:getPosition()
                love.graphics.circle("line", x, y, shape:getRadius())
            end
        end
    end
    
    love.graphics.pop()
end

function Physics:cleanup()
    -- Destroy all bodies
    for _, body in ipairs(self.bodies) do
        if not body:isDestroyed() then
            body:destroy()
        end
    end
    
    -- Clear references
    self.bodies = {}
    self.messageBodyMap = {}
    self.strokeBodies = {}
    
    -- Destroy world
    if self.world then
        self.world:destroy()
    end
end

return Physics
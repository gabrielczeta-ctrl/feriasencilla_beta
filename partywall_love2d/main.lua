--[[
  PARTYWALL LOVE2D - Multiplayer Physics Canvas
  
  A revolutionary multiplayer canvas with native Box2D physics,
  real-time drawing, advanced collision detection, and particle effects.
  
  Features:
  - Native Box2D physics engine
  - Real-time multiplayer networking
  - Advanced drawing system with collision
  - Particle effects and visual feedback
  - Cross-platform distribution
  - Professional game-engine performance
]]--

local GameState = require('src.gamestate')
local Physics = require('src.physics')
local Network = require('src.network')
local UI = require('src.ui')
local Drawing = require('src.drawing')
local Particles = require('src.particles')
local Camera = require('src.camera')
local Audio = require('src.audio')

-- Global game state
local game = {}

function love.load()
    -- Initialize Love2D settings
    love.window.setTitle("PartyWall - Multiplayer Physics Canvas")
    love.window.setMode(1200, 800, {
        vsync = true,
        msaa = 4,
        resizable = true,
        minwidth = 800,
        minheight = 600
    })
    love.graphics.setDefaultFilter("linear", "linear")
    
    -- Initialize game systems
    game.state = GameState.new()
    game.physics = Physics.new()
    game.network = Network.new("ws://localhost:8080/ws")
    game.ui = UI.new()
    game.drawing = Drawing.new()
    game.particles = Particles.new()
    game.camera = Camera.new()
    game.audio = Audio.new()
    
    -- Set up callbacks
    setupCallbacks()
    
    -- Connect to server
    game.network:connect()
    
    print("🎮 PartyWall Love2D loaded successfully!")
    print("🚀 Box2D Physics Engine initialized")
    print("🌐 Connecting to multiplayer server...")
    print()
    print("Controls:")
    print("  Left Click + Drag: Draw")
    print("  Right Click: Create message")
    print("  Middle Click: Pan camera") 
    print("  Scroll: Zoom camera")
    print("  Space: Toggle tool")
    print("  Tab: Toggle UI")
    print("  R: Random physics throw")
    print("  C: Clear all drawings")
    print("  F: Toggle fullscreen")
    print("  Escape: Quit")
end

function setupCallbacks()
    -- Network callbacks
    game.network:onMessage("state", function(data)
        game.state:loadState(data)
    end)
    
    game.network:onMessage("new_message", function(data)
        game.state:addMessage(data)
        game.particles:messageSpawn(data.x, data.y)
        game.audio:play("message_appear")
    end)
    
    game.network:onMessage("drawing_stroke", function(data)
        game.drawing:addStroke(data)
        game.audio:play("draw")
    end)
    
    game.network:onMessage("object_update", function(data)
        game.state:updateObject(data.objectId, data.updates)
    end)
    
    game.network:onMessage("object_throw", function(data)
        local obj = game.state:getObject(data.objectId)
        if obj then
            game.physics:throwObject(obj, data.vx, data.vy)
            game.particles:throwEffect(obj.x, obj.y, data.vx, data.vy)
            game.audio:play("throw")
        end
    end)
    
    -- Physics callbacks
    game.physics:onCollision("message", "boundary", function(objA, objB, contact)
        local message = objA.type == "message" and objA or objB
        game.particles:bounceEffect(message.x, message.y)
        game.audio:play("bounce")
        game.camera:shake(2, 0.1)
    end)
    
    game.physics:onCollision("message", "drawing", function(objA, objB, contact)
        local message = objA.type == "message" and objA or objB
        game.particles:collisionSparks(message.x, message.y)
        game.audio:play("collision")
        game.camera:shake(3, 0.15)
    end)
end

function love.update(dt)
    -- Update all systems
    game.physics:update(dt)
    game.network:update(dt)
    game.ui:update(dt)
    game.drawing:update(dt)
    game.particles:update(dt)
    game.camera:update(dt)
    game.audio:update(dt)
    game.state:update(dt)
    
    -- Cleanup expired objects
    game.state:cleanupExpired()
    game.drawing:cleanupExpired()
end

function love.draw()
    -- Apply camera transform
    game.camera:apply()
    
    -- Draw world space
    drawWorld()
    
    -- Reset camera
    game.camera:reset()
    
    -- Draw UI space (unaffected by camera)
    game.ui:draw()
    
    -- Draw debug info if enabled
    if game.state.showDebug then
        drawDebugInfo()
    end
end

function drawWorld()
    -- Clear with gradient background
    drawBackground()
    
    -- Draw persistent drawings
    game.drawing:draw()
    
    -- Draw physics world (debug mode)
    if game.state.showPhysicsDebug then
        game.physics:drawDebug()
    end
    
    -- Draw messages with physics
    drawMessages()
    
    -- Draw particle effects
    game.particles:draw()
    
    -- Draw current stroke being drawn
    game.drawing:drawCurrentStroke()
end

function drawBackground()
    local w, h = love.graphics.getDimensions()
    
    -- Animated gradient background
    local time = love.timer.getTime()
    local r1 = 0.05 + math.sin(time * 0.3) * 0.02
    local g1 = 0.08 + math.sin(time * 0.4) * 0.03
    local b1 = 0.15 + math.sin(time * 0.2) * 0.05
    
    local r2 = 0.02 + math.sin(time * 0.5) * 0.01
    local g2 = 0.05 + math.sin(time * 0.3) * 0.02
    local b2 = 0.12 + math.sin(time * 0.4) * 0.03
    
    -- Create mesh for gradient
    local mesh = love.graphics.newMesh({
        {0, 0, 0, 0, r1, g1, b1, 1},
        {w, 0, 1, 0, r1, g1, b1, 1},
        {w, h, 1, 1, r2, g2, b2, 1},
        {0, h, 0, 1, r2, g2, b2, 1}
    })
    love.graphics.draw(mesh)
end

function drawMessages()
    for _, message in ipairs(game.state.messages) do
        if not message.expired then
            drawMessage(message)
        end
    end
end

function drawMessage(message)
    local x, y = message.x, message.y
    local angle = message.angle or 0
    local bouncing = message.physics and message.physics.bouncing
    
    love.graphics.push()
    love.graphics.translate(x, y)
    love.graphics.rotate(angle)
    
    -- Calculate message dimensions
    local font = game.ui:getFont("message")
    local text = message.text or "Empty Message"
    local padding = 16
    local textWidth = font:getWidth(text)
    local textHeight = font:getHeight()
    local boxWidth = textWidth + padding * 2
    local boxHeight = textHeight + padding
    
    -- Physics glow effect
    if bouncing then
        love.graphics.setColor(1, 1, 0.2, 0.3)
        love.graphics.circle("fill", 0, 0, math.max(boxWidth, boxHeight) / 2 + 10)
    end
    
    -- Message bubble shadow
    love.graphics.setColor(0, 0, 0, 0.3)
    love.graphics.rectangle("fill", -boxWidth/2 + 2, -boxHeight/2 + 2, boxWidth, boxHeight, 8)
    
    -- Message bubble background
    local age = love.timer.getTime() - message.createdAt
    local alpha = math.max(0.1, 1 - (age / 3600)) -- Fade over 1 hour
    
    if bouncing then
        love.graphics.setColor(1, 0.9, 0.3, alpha * 0.95)
    else
        love.graphics.setColor(0.95, 0.95, 0.98, alpha * 0.9)
    end
    love.graphics.rectangle("fill", -boxWidth/2, -boxHeight/2, boxWidth, boxHeight, 8)
    
    -- Message bubble border
    love.graphics.setColor(0.3, 0.3, 0.4, alpha)
    love.graphics.setLineWidth(2)
    love.graphics.rectangle("line", -boxWidth/2, -boxHeight/2, boxWidth, boxHeight, 8)
    
    -- Message text
    love.graphics.setFont(font)
    love.graphics.setColor(0.1, 0.1, 0.2, alpha)
    love.graphics.printf(text, -boxWidth/2 + padding, -textHeight/2, textWidth, "center")
    
    love.graphics.pop()
    
    -- Store dimensions for collision detection
    message.width = boxWidth
    message.height = boxHeight
end

function drawDebugInfo()
    love.graphics.setColor(1, 1, 1, 0.8)
    love.graphics.setFont(game.ui:getFont("debug"))
    
    local info = {
        "FPS: " .. love.timer.getFPS(),
        "Messages: " .. #game.state.messages,
        "Strokes: " .. #game.drawing.strokes,
        "Particles: " .. game.particles:getCount(),
        "Physics Bodies: " .. game.physics:getBodyCount(),
        "Network Status: " .. game.network:getStatus(),
        "Memory: " .. math.floor(collectgarbage("count")) .. "KB"
    }
    
    for i, line in ipairs(info) do
        love.graphics.print(line, 10, 10 + (i - 1) * 20)
    end
end

-- Input handling
function love.mousepressed(x, y, button)
    local worldX, worldY = game.camera:screenToWorld(x, y)
    
    if game.ui:mousepressed(x, y, button) then
        return -- UI consumed the event
    end
    
    if button == 1 then -- Left click
        if game.state.currentTool == "message" then
            game.ui:showMessageInput(x, y, function(text)
                local message = {
                    text = text,
                    x = worldX,
                    y = worldY,
                    createdAt = love.timer.getTime(),
                    physics = {
                        vx = 0,
                        vy = 0,
                        bouncing = false,
                        mass = 1,
                        friction = 0.3,
                        restitution = 0.8
                    }
                }
                
                game.state:addMessage(message)
                game.network:send("post_message", message)
                game.particles:messageSpawn(worldX, worldY)
                game.audio:play("message_create")
            end)
        else
            game.drawing:startStroke(worldX, worldY, game.state.currentTool)
        end
        
    elseif button == 2 then -- Right click
        local obj = game.state:getObjectAt(worldX, worldY)
        if obj then
            game.ui:showContextMenu(x, y, obj)
        end
        
    elseif button == 3 then -- Middle click
        game.camera:startPan(x, y)
    end
end

function love.mousemoved(x, y, dx, dy)
    local worldX, worldY = game.camera:screenToWorld(x, y)
    
    if game.ui:mousemoved(x, y, dx, dy) then
        return
    end
    
    if game.camera:isPanning() then
        game.camera:pan(dx, dy)
    elseif game.drawing:isDrawing() then
        game.drawing:addPoint(worldX, worldY)
    end
end

function love.mousereleased(x, y, button)
    local worldX, worldY = game.camera:screenToWorld(x, y)
    
    if game.ui:mousereleased(x, y, button) then
        return
    end
    
    if button == 1 and game.drawing:isDrawing() then
        local stroke = game.drawing:finishStroke()
        if stroke then
            game.network:send("drawing_stroke", stroke)
            game.audio:play("draw_finish")
        end
    elseif button == 3 then
        game.camera:stopPan()
    end
end

function love.wheelmoved(x, y)
    if not game.ui:wheelmoved(x, y) then
        game.camera:zoom(y * 0.1)
    end
end

function love.keypressed(key)
    if game.ui:keypressed(key) then
        return
    end
    
    if key == "space" then
        game.state:cycleTool()
    elseif key == "tab" then
        game.ui:toggle()
    elseif key == "r" then
        -- Random physics throw
        local x = love.math.random(100, love.graphics.getWidth() - 100)
        local y = 100
        local vx = love.math.random(-500, 500)
        local vy = love.math.random(-300, -100)
        
        local message = {
            text = "🚀 Random Throw!",
            x = x,
            y = y,
            createdAt = love.timer.getTime(),
            physics = {
                vx = vx,
                vy = vy,
                bouncing = true,
                mass = 1,
                friction = 0.3,
                restitution = 0.8
            }
        }
        
        game.state:addMessage(message)
        game.physics:createMessageBody(message)
        game.network:send("post_message", message)
        game.particles:throwEffect(x, y, vx, vy)
        game.audio:play("throw")
        
    elseif key == "c" then
        game.drawing:clear()
        game.network:send("drawing_clear", {})
        
    elseif key == "f" then
        love.window.setFullscreen(not love.window.getFullscreen())
        
    elseif key == "f1" then
        game.state.showDebug = not game.state.showDebug
        
    elseif key == "f2" then
        game.state.showPhysicsDebug = not game.state.showPhysicsDebug
        
    elseif key == "escape" then
        love.event.quit()
    end
end

function love.textinput(text)
    game.ui:textinput(text)
end

function love.resize(w, h)
    game.camera:resize(w, h)
    game.ui:resize(w, h)
end

function love.quit()
    game.network:disconnect()
    game.audio:cleanup()
    print("👋 Goodbye from PartyWall Love2D!")
end
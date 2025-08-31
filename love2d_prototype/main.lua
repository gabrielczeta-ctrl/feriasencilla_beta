-- Love2D Multiplayer Physics Canvas Prototype
-- Run with: love .

local json = require('json')  -- You'll need lua-cjson
local websocket = require('websocket')  -- You'll need lua-websockets

-- Game state
local world
local messages = {}
local drawings = {}
local currentStroke = {}
local isDrawing = false
local drawingTool = "pen"
local drawingColor = {1, 1, 1}  -- White
local canvasWidth, canvasHeight
local ws

-- Physics boundaries
local boundaries = {}

function love.load()
    -- Set window
    canvasWidth = 1200
    canvasHeight = 800
    love.window.setTitle("Love2D Physics Canvas")
    love.window.setMode(canvasWidth, canvasHeight)
    
    -- Initialize physics world (gravity: 0 horizontal, 300 vertical)
    world = love.physics.newWorld(0, 300, true)
    
    -- Create boundaries
    createBoundaries()
    
    -- Set up collision callbacks
    world:setCallbacks(beginContact, endContact)
    
    -- Initialize WebSocket (pseudo-code, needs real implementation)
    -- ws = websocket.client('ws://localhost:8080/ws')
    
    print("Love2D Physics Canvas loaded!")
    print("Controls:")
    print("- Left click and drag to draw")
    print("- Right click to create message box")
    print("- Space to toggle between pen/brush/eraser")
    print("- R to throw random physics object")
end

function createBoundaries()
    -- Ground
    local ground = {}
    ground.body = love.physics.newBody(world, canvasWidth/2, canvasHeight-10, "static")
    ground.shape = love.physics.newRectangleShape(canvasWidth, 20)
    ground.fixture = love.physics.newFixture(ground.body, ground.shape)
    ground.fixture:setUserData({type = "boundary", name = "ground"})
    table.insert(boundaries, ground)
    
    -- Left wall
    local leftWall = {}
    leftWall.body = love.physics.newBody(world, 10, canvasHeight/2, "static")
    leftWall.shape = love.physics.newRectangleShape(20, canvasHeight)
    leftWall.fixture = love.physics.newFixture(leftWall.body, leftWall.shape)
    leftWall.fixture:setUserData({type = "boundary", name = "left"})
    table.insert(boundaries, leftWall)
    
    -- Right wall
    local rightWall = {}
    rightWall.body = love.physics.newBody(world, canvasWidth-10, canvasHeight/2, "static")
    rightWall.shape = love.physics.newRectangleShape(20, canvasHeight)
    rightWall.fixture = love.physics.newFixture(rightWall.body, rightWall.shape)
    rightWall.fixture:setUserData({type = "boundary", name = "right"})
    table.insert(boundaries, rightWall)
    
    -- Ceiling
    local ceiling = {}
    ceiling.body = love.physics.newBody(world, canvasWidth/2, 10, "static")
    ceiling.shape = love.physics.newRectangleShape(canvasWidth, 20)
    ceiling.fixture = love.physics.newFixture(ceiling.body, ceiling.shape)
    ceiling.fixture:setUserData({type = "boundary", name = "ceiling"})
    table.insert(boundaries, ceiling)
end

function createMessage(text, x, y, vx, vy)
    local message = {}
    message.text = text or "Hello World! 🎈"
    message.id = "msg_" .. love.timer.getTime()
    
    -- Physics body
    message.body = love.physics.newBody(world, x, y, "dynamic")
    message.shape = love.physics.newRectangleShape(string.len(message.text) * 8 + 20, 30)
    message.fixture = love.physics.newFixture(message.body, message.shape)
    
    -- Physics properties
    message.fixture:setRestitution(0.8)  -- Bounciness
    message.fixture:setFriction(0.3)     -- Friction
    message.fixture:setDensity(1)        -- Mass
    message.fixture:setUserData({type = "message", id = message.id, obj = message})
    
    -- Initial velocity
    if vx and vy then
        message.body:setLinearVelocity(vx, vy)
    end
    
    -- Visual properties
    message.color = {love.math.random(), love.math.random(), love.math.random()}
    message.createdAt = love.timer.getTime()
    message.physics = true
    
    table.insert(messages, message)
    return message
end

function addStroke(points, color, tool)
    local stroke = {
        points = points,
        color = color or {1, 1, 1},
        tool = tool or "pen",
        width = tool == "brush" and 5 or 2,
        timestamp = love.timer.getTime()
    }
    table.insert(drawings, stroke)
    
    -- Create invisible physics collision for the stroke
    createStrokeCollision(stroke)
end

function createStrokeCollision(stroke)
    -- Create physics bodies for collision detection along the stroke
    for i = 1, #stroke.points - 1 do
        local x1, y1 = stroke.points[i][1], stroke.points[i][2]
        local x2, y2 = stroke.points[i+1][1], stroke.points[i+1][2]
        
        -- Calculate line segment properties
        local centerX = (x1 + x2) / 2
        local centerY = (y1 + y2) / 2
        local length = math.sqrt((x2-x1)^2 + (y2-y1)^2)
        local angle = math.atan2(y2-y1, x2-x1)
        
        if length > 5 then  -- Only create collision for longer segments
            local segment = {}
            segment.body = love.physics.newBody(world, centerX, centerY, "static")
            segment.shape = love.physics.newRectangleShape(length, 10)
            segment.fixture = love.physics.newFixture(segment.body, segment.shape)
            segment.fixture:setUserData({type = "drawing", stroke = stroke})
            segment.body:setAngle(angle)
            
            stroke.collision = stroke.collision or {}
            table.insert(stroke.collision, segment)
        end
    end
end

function love.update(dt)
    -- Update physics world
    world:update(dt)
    
    -- Update current stroke while drawing
    if isDrawing and love.mouse.isDown(1) then
        local mx, my = love.mouse.getPosition()
        table.insert(currentStroke, {mx, my})
    end
    
    -- Cleanup expired drawings (1 hour = 3600 seconds)
    local now = love.timer.getTime()
    for i = #drawings, 1, -1 do
        if now - drawings[i].timestamp > 3600 then
            -- Remove collision bodies
            if drawings[i].collision then
                for _, segment in ipairs(drawings[i].collision) do
                    segment.body:destroy()
                end
            end
            table.remove(drawings, i)
        end
    end
end

function love.draw()
    -- Clear screen with dark background
    love.graphics.setBackgroundColor(0.1, 0.1, 0.2)
    
    -- Draw boundaries (debug)
    love.graphics.setColor(0.3, 0.3, 0.3)
    for _, boundary in ipairs(boundaries) do
        love.graphics.polygon("fill", boundary.body:getWorldPoints(boundary.shape:getPoints()))
    end
    
    -- Draw persistent drawings
    for _, stroke in ipairs(drawings) do
        love.graphics.setColor(stroke.color[1], stroke.color[2], stroke.color[3])
        love.graphics.setLineWidth(stroke.width)
        
        if #stroke.points > 1 then
            local linePoints = {}
            for _, point in ipairs(stroke.points) do
                table.insert(linePoints, point[1])
                table.insert(linePoints, point[2])
            end
            love.graphics.line(linePoints)
        end
    end
    
    -- Draw current stroke being drawn
    if isDrawing and #currentStroke > 1 then
        love.graphics.setColor(drawingColor[1], drawingColor[2], drawingColor[3])
        love.graphics.setLineWidth(3)
        local linePoints = {}
        for _, point in ipairs(currentStroke) do
            table.insert(linePoints, point[1])
            table.insert(linePoints, point[2])
        end
        love.graphics.line(linePoints)
    end
    
    -- Draw messages with physics
    for _, message in ipairs(messages) do
        local x, y = message.body:getPosition()
        local angle = message.body:getAngle()
        
        love.graphics.push()
        love.graphics.translate(x, y)
        love.graphics.rotate(angle)
        
        -- Message box background
        love.graphics.setColor(message.color[1], message.color[2], message.color[3], 0.8)
        local width, height = message.shape:getDimensions()
        love.graphics.rectangle("fill", -width/2, -height/2, width, height, 5)
        
        -- Message box border
        love.graphics.setColor(1, 1, 1)
        love.graphics.setLineWidth(2)
        love.graphics.rectangle("line", -width/2, -height/2, width, height, 5)
        
        -- Text
        love.graphics.setColor(0, 0, 0)
        local font = love.graphics.getFont()
        local textWidth = font:getWidth(message.text)
        love.graphics.print(message.text, -textWidth/2, -font:getHeight()/2)
        
        love.graphics.pop()
        
        -- Physics glow effect
        if message.physics then
            love.graphics.setColor(1, 1, 0, 0.3)
            love.graphics.circle("fill", x, y, width/2 + 5)
        end
    end
    
    -- Draw UI
    love.graphics.setColor(1, 1, 1)
    love.graphics.print("Tool: " .. drawingTool, 10, 10)
    love.graphics.print("Objects: " .. #messages, 10, 30)
    love.graphics.print("Strokes: " .. #drawings, 10, 50)
    love.graphics.print("Controls: Left-drag: draw, Right-click: message, Space: tool, R: random", 10, canvasHeight - 20)
    
    -- Reset color
    love.graphics.setColor(1, 1, 1)
end

function love.mousepressed(x, y, button)
    if button == 1 then  -- Left click
        if drawingTool == "message" then
            -- Create message input (simplified)
            createMessage("Physics Message!", x, y, love.math.random(-200, 200), -300)
        else
            -- Start drawing
            isDrawing = true
            currentStroke = {{x, y}}
        end
    elseif button == 2 then  -- Right click
        -- Create message at cursor
        createMessage("Right-click Message! 🎮", x, y, 0, -100)
    end
end

function love.mousereleased(x, y, button)
    if button == 1 and isDrawing then
        -- Finish stroke
        isDrawing = false
        if #currentStroke > 1 then
            addStroke(currentStroke, drawingColor, drawingTool)
        end
        currentStroke = {}
    end
end

function love.keypressed(key)
    if key == "space" then
        -- Cycle through tools
        local tools = {"pen", "brush", "eraser", "message"}
        local currentIndex = 1
        for i, tool in ipairs(tools) do
            if tool == drawingTool then
                currentIndex = i
                break
            end
        end
        drawingTool = tools[(currentIndex % #tools) + 1]
        
    elseif key == "r" then
        -- Throw random physics object
        local x = love.math.random(100, canvasWidth - 100)
        local vx = love.math.random(-400, 400)
        local vy = love.math.random(-500, -100)
        createMessage("Random Throw! 🚀", x, 100, vx, vy)
        
    elseif key == "c" then
        -- Clear all drawings
        for _, stroke in ipairs(drawings) do
            if stroke.collision then
                for _, segment in ipairs(stroke.collision) do
                    segment.body:destroy()
                end
            end
        end
        drawings = {}
        
    elseif key == "escape" then
        love.event.quit()
    end
end

-- Physics collision callbacks
function beginContact(a, b, coll)
    local objA = a:getUserData()
    local objB = b:getUserData()
    
    if objA and objB then
        -- Message hitting drawing
        if (objA.type == "message" and objB.type == "drawing") or 
           (objB.type == "message" and objA.type == "drawing") then
            -- Add visual effect or sound here
            print("Message hit drawing!")
        end
        
        -- Message hitting boundary
        if (objA.type == "message" and objB.type == "boundary") or
           (objB.type == "message" and objA.type == "boundary") then
            -- Boundary bounce effect
            print("Message hit boundary!")
        end
    end
end

function endContact(a, b, coll)
    -- Handle end of contact if needed
end

-- Pseudo WebSocket functions (would need real implementation)
function sendToServer(data)
    -- ws:send(json.encode(data))
    print("Would send to server:", json.encode(data))
end

function handleServerMessage(message)
    local data = json.decode(message)
    
    if data.type == "drawing_stroke" then
        addStroke(data.points, data.color, data.tool)
    elseif data.type == "new_message" then
        createMessage(data.text, data.x, data.y, data.vx, data.vy)
    elseif data.type == "object_throw" then
        for _, msg in ipairs(messages) do
            if msg.id == data.objectId then
                msg.body:setLinearVelocity(data.vx, data.vy)
                break
            end
        end
    end
end
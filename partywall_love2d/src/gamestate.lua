--[[
  GAME STATE MANAGEMENT
  
  Manages all game objects, tools, settings and state persistence
]]--

local GameState = {}
GameState.__index = GameState

function GameState.new()
    local self = setmetatable({}, GameState)
    
    -- Game objects
    self.messages = {}
    self.messageMap = {} -- id -> message lookup
    
    -- Current tool and settings
    self.currentTool = "pen"
    self.tools = {"pen", "brush", "eraser", "message", "marker"}
    self.toolIndex = 1
    
    -- Drawing settings
    self.drawingColor = {1, 1, 1, 1} -- White
    self.drawingSize = 3
    
    -- UI state
    self.showUI = true
    self.showDebug = false
    self.showPhysicsDebug = false
    
    -- Performance settings
    self.maxMessages = 1000
    self.cleanupTimer = 0
    self.cleanupInterval = 10 -- seconds
    
    return self
end

function GameState:addMessage(messageData)
    local message = {
        id = messageData.id or self:generateMessageId(),
        text = messageData.text or "Empty Message",
        x = messageData.x or 0,
        y = messageData.y or 0,
        angle = messageData.angle or 0,
        createdAt = messageData.createdAt or love.timer.getTime(),
        expireAt = messageData.expireAt,
        physics = messageData.physics,
        width = messageData.width,
        height = messageData.height,
        expired = false
    }
    
    table.insert(self.messages, message)
    self.messageMap[message.id] = message
    
    -- Limit message count for performance
    if #self.messages > self.maxMessages then
        local removed = table.remove(self.messages, 1)
        self.messageMap[removed.id] = nil
    end
    
    return message
end

function GameState:updateObject(objectId, updates)
    local message = self.messageMap[objectId]
    if message then
        for key, value in pairs(updates) do
            message[key] = value
        end
    end
end

function GameState:getObject(objectId)
    return self.messageMap[objectId]
end

function GameState:getObjectAt(x, y)
    -- Find object at given coordinates
    for i = #self.messages, 1, -1 do -- Check from top to bottom
        local message = self.messages[i]
        if not message.expired then
            local width = message.width or 100
            local height = message.height or 30
            
            if x >= message.x - width/2 and x <= message.x + width/2 and
               y >= message.y - height/2 and y <= message.y + height/2 then
                return message
            end
        end
    end
    return nil
end

function GameState:removeMessage(messageId)
    local message = self.messageMap[messageId]
    if message then
        message.expired = true
        self.messageMap[messageId] = nil
        
        -- Remove from array
        for i = #self.messages, 1, -1 do
            if self.messages[i].id == messageId then
                table.remove(self.messages, i)
                break
            end
        end
    end
end

function GameState:cycleTool()
    self.toolIndex = (self.toolIndex % #self.tools) + 1
    self.currentTool = self.tools[self.toolIndex]
    print("🛠️ Tool changed to:", self.currentTool)
end

function GameState:setTool(tool)
    for i, t in ipairs(self.tools) do
        if t == tool then
            self.toolIndex = i
            self.currentTool = tool
            break
        end
    end
end

function GameState:setDrawingColor(r, g, b, a)
    self.drawingColor = {r, g, b, a or 1}
end

function GameState:setDrawingSize(size)
    self.drawingSize = math.max(1, math.min(50, size))
end

function GameState:loadState(stateData)
    -- Load state from server
    if stateData.messages then
        self.messages = {}
        self.messageMap = {}
        
        for _, messageData in ipairs(stateData.messages) do
            self:addMessage(messageData)
        end
    end
end

function GameState:update(dt)
    self.cleanupTimer = self.cleanupTimer + dt
    
    if self.cleanupTimer >= self.cleanupInterval then
        self:cleanupExpired()
        self.cleanupTimer = 0
    end
end

function GameState:cleanupExpired()
    local now = love.timer.getTime()
    local removed = 0
    
    for i = #self.messages, 1, -1 do
        local message = self.messages[i]
        if message.expireAt and now > message.expireAt then
            message.expired = true
            self.messageMap[message.id] = nil
            table.remove(self.messages, i)
            removed = removed + 1
        end
    end
    
    if removed > 0 then
        print("🧹 Cleaned up", removed, "expired messages")
    end
end

function GameState:generateMessageId()
    return "msg_" .. love.timer.getTime() .. "_" .. love.math.random(1000, 9999)
end

function GameState:getMessageCount()
    return #self.messages
end

function GameState:clear()
    self.messages = {}
    self.messageMap = {}
end

return GameState
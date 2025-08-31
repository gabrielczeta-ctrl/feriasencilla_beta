--[[
  ADVANCED NETWORKING SYSTEM
  
  Features:
  - WebSocket client for real-time multiplayer
  - Automatic reconnection with exponential backoff
  - Message queuing and reliable delivery
  - Protocol compression and batching
  - Network statistics and monitoring
]]--

local Network = {}
Network.__index = Network

local json = require('json')

function Network.new(serverUrl)
    local self = setmetatable({}, Network)
    
    -- Connection settings
    self.serverUrl = serverUrl or "ws://localhost:8080/ws"
    self.socket = nil
    self.status = "disconnected" -- disconnected, connecting, connected
    
    -- Message handling
    self.messageCallbacks = {}
    self.messageQueue = {}
    self.sendQueue = {}
    
    -- Reconnection logic
    self.reconnectAttempts = 0
    self.maxReconnectAttempts = 10
    self.reconnectDelay = 1.0
    self.reconnectTimer = 0
    self.autoReconnect = true
    
    -- Network statistics
    self.stats = {
        messagesReceived = 0,
        messagesSent = 0,
        bytesReceived = 0,
        bytesSent = 0,
        connectionTime = 0,
        lastPing = 0,
        pingTime = 0
    }
    
    -- Heartbeat
    self.heartbeatInterval = 30 -- seconds
    self.heartbeatTimer = 0
    self.awaitingPong = false
    
    -- Message batching for performance
    self.batchMessages = true
    self.batchTimer = 0
    self.batchInterval = 0.1 -- 100ms batching
    self.currentBatch = {}
    
    return self
end

function Network:connect()
    if self.status == "connected" or self.status == "connecting" then
        return
    end
    
    self.status = "connecting"
    print("🌐 Connecting to server:", self.serverUrl)
    
    -- In a real implementation, you would use lua-websockets or similar
    -- For this prototype, we'll simulate the connection
    self:simulateConnection()
end

function Network:simulateConnection()
    -- This simulates a WebSocket connection
    -- In real implementation, replace with actual WebSocket client
    
    love.timer.sleep(0.5) -- Simulate connection delay
    
    self.socket = {
        connected = true,
        send = function(data) 
            self:onDataSent(data)
        end,
        receive = function()
            -- Simulate receiving messages
            return self:simulateReceive()
        end,
        close = function()
            self.socket.connected = false
        end
    }
    
    self.status = "connected"
    self.reconnectAttempts = 0
    self.stats.connectionTime = love.timer.getTime()
    
    print("✅ Connected to multiplayer server!")
    
    -- Send initial hello message
    self:send("hello", {})
end

function Network:simulateReceive()
    -- This would be replaced with actual WebSocket message receiving
    -- For now, return nil (no messages)
    return nil
end

function Network:disconnect()
    if self.socket and self.socket.connected then
        self.socket:close()
    end
    
    self.socket = nil
    self.status = "disconnected"
    self.autoReconnect = false
    
    print("👋 Disconnected from server")
end

function Network:send(messageType, data)
    if not self:isConnected() then
        -- Queue message for sending when reconnected
        table.insert(self.sendQueue, {type = messageType, data = data})
        return false
    end
    
    local message = {
        type = messageType,
        timestamp = love.timer.getTime(),
        data = data
    }
    
    if self.batchMessages then
        table.insert(self.currentBatch, message)
    else
        self:sendImmediate(message)
    end
    
    return true
end

function Network:sendImmediate(message)
    if not self.socket or not self.socket.connected then
        return false
    end
    
    local jsonData = json.encode(message)
    
    -- Send via WebSocket
    local success = pcall(function()
        self.socket:send(jsonData)
    end)
    
    if success then
        self.stats.messagesSent = self.stats.messagesSent + 1
        self.stats.bytesSent = self.stats.bytesSent + #jsonData
        return true
    else
        print("❌ Failed to send message:", message.type)
        self:handleConnectionError()
        return false
    end
end

function Network:sendBatch()
    if #self.currentBatch == 0 then
        return
    end
    
    local batchMessage = {
        type = "batch",
        timestamp = love.timer.getTime(),
        messages = self.currentBatch
    }
    
    self:sendImmediate(batchMessage)
    self.currentBatch = {}
end

function Network:onMessage(messageType, callback)
    if not self.messageCallbacks[messageType] then
        self.messageCallbacks[messageType] = {}
    end
    table.insert(self.messageCallbacks[messageType], callback)
end

function Network:removeMessageCallback(messageType, callback)
    if self.messageCallbacks[messageType] then
        for i, cb in ipairs(self.messageCallbacks[messageType]) do
            if cb == callback then
                table.remove(self.messageCallbacks[messageType], i)
                break
            end
        end
    end
end

function Network:handleMessage(message)
    local messageType = message.type
    local data = message.data or message
    
    -- Update statistics
    self.stats.messagesReceived = self.stats.messagesReceived + 1
    
    -- Handle special system messages
    if messageType == "pong" then
        self.awaitingPong = false
        self.stats.pingTime = love.timer.getTime() - self.stats.lastPing
        return
    elseif messageType == "batch" then
        -- Handle batched messages
        for _, batchedMessage in ipairs(data.messages) do
            self:handleMessage(batchedMessage)
        end
        return
    end
    
    -- Call registered callbacks
    if self.messageCallbacks[messageType] then
        for _, callback in ipairs(self.messageCallbacks[messageType]) do
            local success, err = pcall(callback, data)
            if not success then
                print("❌ Error in message callback:", err)
            end
        end
    else
        print("⚠️ Unhandled message type:", messageType)
    end
end

function Network:update(dt)
    -- Update timers
    self.heartbeatTimer = self.heartbeatTimer + dt
    self.batchTimer = self.batchTimer + dt
    
    -- Handle reconnection
    if self.status == "disconnected" and self.autoReconnect then
        self.reconnectTimer = self.reconnectTimer + dt
        if self.reconnectTimer >= self.reconnectDelay then
            self:attemptReconnect()
        end
    end
    
    -- Process incoming messages
    self:processMessages()
    
    -- Send heartbeat
    if self.status == "connected" and self.heartbeatTimer >= self.heartbeatInterval then
        self:sendHeartbeat()
        self.heartbeatTimer = 0
    end
    
    -- Send batched messages
    if self.batchMessages and self.batchTimer >= self.batchInterval then
        self:sendBatch()
        self.batchTimer = 0
    end
    
    -- Process send queue
    if self.status == "connected" and #self.sendQueue > 0 then
        local message = table.remove(self.sendQueue, 1)
        self:send(message.type, message.data)
    end
end

function Network:processMessages()
    if not self.socket or not self.socket.connected then
        return
    end
    
    -- In real implementation, this would receive WebSocket messages
    local message = self.socket:receive()
    
    if message then
        local success, decoded = pcall(json.decode, message)
        if success then
            self.stats.bytesReceived = self.stats.bytesReceived + #message
            self:handleMessage(decoded)
        else
            print("❌ Failed to decode message:", message)
        end
    end
end

function Network:sendHeartbeat()
    if self.awaitingPong then
        print("⚠️ Server not responding to heartbeat")
        self:handleConnectionError()
        return
    end
    
    self.stats.lastPing = love.timer.getTime()
    self.awaitingPong = true
    self:send("ping", {timestamp = self.stats.lastPing})
end

function Network:attemptReconnect()
    if self.reconnectAttempts >= self.maxReconnectAttempts then
        print("❌ Max reconnection attempts reached")
        self.autoReconnect = false
        return
    end
    
    self.reconnectAttempts = self.reconnectAttempts + 1
    self.reconnectTimer = 0
    
    -- Exponential backoff
    self.reconnectDelay = math.min(30, self.reconnectDelay * 1.5)
    
    print("🔄 Reconnection attempt", self.reconnectAttempts, "of", self.maxReconnectAttempts)
    self:connect()
end

function Network:handleConnectionError()
    if self.status == "connected" then
        print("❌ Connection lost")
    end
    
    if self.socket then
        self.socket:close()
        self.socket = nil
    end
    
    self.status = "disconnected"
    self.reconnectTimer = 0
    
    if self.autoReconnect then
        print("🔄 Will attempt reconnection in", self.reconnectDelay, "seconds")
    end
end

function Network:onDataSent(data)
    -- Called when data is successfully sent
    -- Could be used for logging or statistics
end

function Network:isConnected()
    return self.status == "connected" and self.socket and self.socket.connected
end

function Network:getStatus()
    return self.status
end

function Network:getStats()
    return self.stats
end

function Network:getPing()
    return self.stats.pingTime * 1000 -- Return in milliseconds
end

function Network:getUptime()
    if self.stats.connectionTime == 0 then
        return 0
    end
    return love.timer.getTime() - self.stats.connectionTime
end

function Network:enableBatching(enabled)
    self.batchMessages = enabled
    if not enabled and #self.currentBatch > 0 then
        self:sendBatch() -- Send any pending batched messages
    end
end

function Network:setBatchInterval(interval)
    self.batchInterval = math.max(0.01, interval) -- Minimum 10ms
end

function Network:setHeartbeatInterval(interval)
    self.heartbeatInterval = math.max(5, interval) -- Minimum 5 seconds
end

function Network:clearSendQueue()
    self.sendQueue = {}
end

function Network:getQueueSize()
    return #self.sendQueue
end

-- Real WebSocket implementation stubs
-- These would be replaced with actual WebSocket library calls

function Network:createWebSocket(url)
    -- This would create a real WebSocket connection
    -- Example with lua-websockets:
    --[[
    local websocket = require('websocket')
    local client = websocket.client()
    
    client:connect(url)
    
    client.on_message = function(message)
        self:handleMessage(json.decode(message))
    end
    
    client.on_close = function()
        self:handleConnectionError()
    end
    
    return client
    ]]--
    
    -- For now, return simulated WebSocket
    return {
        connected = false,
        send = function() end,
        receive = function() return nil end,
        close = function() end
    }
end

-- Protocol helpers

function Network:sendDrawingStroke(stroke)
    self:send("drawing_stroke", {
        id = stroke.id,
        tool = stroke.tool,
        color = stroke.color,
        size = stroke.size,
        points = stroke.points,
        timestamp = stroke.timestamp,
        expireAt = stroke.expireAt,
        bounds = stroke.bounds
    })
end

function Network:sendMessage(message)
    self:send("post_message", {
        text = message.text,
        x = message.x,
        y = message.y,
        physics = message.physics
    })
end

function Network:sendObjectUpdate(objectId, updates)
    self:send("object_update", {
        objectId = objectId,
        updates = updates
    })
end

function Network:sendObjectThrow(objectId, vx, vy)
    self:send("object_throw", {
        objectId = objectId,
        vx = vx,
        vy = vy
    })
end

return Network
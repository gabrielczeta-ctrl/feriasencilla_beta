--[[
  ADVANCED UI SYSTEM
  
  Features:
  - Rich drawing tools panel
  - Context menus with physics controls
  - Message input dialogs
  - Settings and debug panels
  - Responsive layout system
]]--

local UI = {}
UI.__index = UI

function UI.new()
    local self = setmetatable({}, UI)
    
    -- UI state
    self.visible = true
    self.panels = {}
    self.activePanel = nil
    
    -- Input state
    self.textInput = nil
    self.messageInputCallback = nil
    
    -- Context menu
    self.contextMenu = nil
    
    -- Fonts
    self.fonts = {
        default = love.graphics.newFont(14),
        large = love.graphics.newFont(18),
        small = love.graphics.newFont(12),
        debug = love.graphics.newFont(10),
        message = love.graphics.newFont(16)
    }
    
    -- Colors
    self.colors = {
        background = {0.1, 0.1, 0.15, 0.9},
        panel = {0.15, 0.15, 0.2, 0.95},
        button = {0.2, 0.25, 0.3, 1},
        buttonHover = {0.25, 0.3, 0.35, 1},
        buttonActive = {0.3, 0.4, 0.5, 1},
        text = {0.9, 0.9, 0.95, 1},
        textDim = {0.6, 0.6, 0.7, 1},
        accent = {0.3, 0.7, 1, 1},
        success = {0.3, 0.8, 0.4, 1},
        warning = {1, 0.8, 0.3, 1},
        error = {1, 0.4, 0.3, 1}
    }
    
    -- Layout
    self.margin = 10
    self.padding = 8
    self.buttonHeight = 32
    self.panelWidth = 250
    
    -- Tool panel
    self.toolPanel = {
        x = 10,
        y = 80,
        width = 200,
        visible = true,
        tools = {
            {id = "pen", name = "Pen", icon = "✏️", hotkey = "1"},
            {id = "brush", name = "Brush", icon = "🖌️", hotkey = "2"},
            {id = "eraser", name = "Eraser", icon = "🧽", hotkey = "3"},
            {id = "marker", name = "Marker", icon = "🖍️", hotkey = "4"},
            {id = "message", name = "Message", icon = "💬", hotkey = "5"}
        },
        colorPresets = {
            {1, 1, 1, 1},      -- White
            {0, 0, 0, 1},      -- Black
            {1, 0.2, 0.2, 1},  -- Red
            {0.2, 0.8, 0.2, 1}, -- Green
            {0.2, 0.4, 1, 1},   -- Blue
            {1, 1, 0.2, 1},     -- Yellow
            {1, 0.4, 1, 1},     -- Magenta
            {0.4, 1, 1, 1}      -- Cyan
        }
    }
    
    -- Connection status
    self.statusPanel = {
        x = 10,
        y = 10,
        width = 200,
        height = 60
    }
    
    return self
end

function UI:update(dt)
    -- Update animations, hover states, etc.
    if self.contextMenu then
        -- Auto-hide context menu after timeout
        self.contextMenu.timer = (self.contextMenu.timer or 0) + dt
        if self.contextMenu.timer > 10 then -- 10 second timeout
            self.contextMenu = nil
        end
    end
end

function UI:draw()
    if not self.visible then return end
    
    love.graphics.push()
    
    -- Draw status panel
    self:drawStatusPanel()
    
    -- Draw tool panel
    if self.toolPanel.visible then
        self:drawToolPanel()
    end
    
    -- Draw context menu
    if self.contextMenu then
        self:drawContextMenu()
    end
    
    -- Draw text input dialog
    if self.textInput then
        self:drawTextInput()
    end
    
    love.graphics.pop()
end

function UI:drawStatusPanel()
    local panel = self.statusPanel
    local game = _G.game -- Access to global game state
    
    -- Background
    love.graphics.setColor(self.colors.panel)
    love.graphics.rectangle("fill", panel.x, panel.y, panel.width, panel.height, 5)
    
    -- Status indicator
    local status = game and game.network:getStatus() or "disconnected"
    local statusColor = status == "connected" and self.colors.success or
                       status == "connecting" and self.colors.warning or
                       self.colors.error
    
    love.graphics.setColor(statusColor)
    love.graphics.circle("fill", panel.x + 15, panel.y + 15, 6)
    
    -- Status text
    love.graphics.setFont(self.fonts.default)
    love.graphics.setColor(self.colors.text)
    love.graphics.print(status:upper(), panel.x + 30, panel.y + 8)
    
    -- Statistics
    if game then
        local stats = game.network:getStats()
        love.graphics.setFont(self.fonts.small)
        love.graphics.setColor(self.colors.textDim)
        love.graphics.print(string.format("Messages: %d | Objects: %d", 
                           stats.messagesReceived, #game.state.messages), 
                           panel.x + 10, panel.y + 30)
        
        if status == "connected" then
            love.graphics.print(string.format("Ping: %.0fms", game.network:getPing()),
                               panel.x + 10, panel.y + 45)
        end
    end
end

function UI:drawToolPanel()
    local panel = self.toolPanel
    local game = _G.game
    
    local panelHeight = 80 + (#panel.tools * 40) + 120 -- Tools + color palette
    
    -- Background
    love.graphics.setColor(self.colors.panel)
    love.graphics.rectangle("fill", panel.x, panel.y, panel.width, panelHeight, 5)
    
    -- Title
    love.graphics.setFont(self.fonts.large)
    love.graphics.setColor(self.colors.text)
    love.graphics.print("Drawing Tools", panel.x + self.padding, panel.y + self.padding)
    
    local y = panel.y + 40
    
    -- Tool buttons
    love.graphics.setFont(self.fonts.default)
    for i, tool in ipairs(panel.tools) do
        local buttonY = y + (i-1) * 35
        local isActive = game and game.state.currentTool == tool.id
        
        -- Button background
        local buttonColor = isActive and self.colors.buttonActive or self.colors.button
        love.graphics.setColor(buttonColor)
        love.graphics.rectangle("fill", panel.x + self.padding, buttonY, 
                               panel.width - self.padding*2, 30, 3)
        
        -- Tool icon and name
        love.graphics.setColor(self.colors.text)
        love.graphics.print(tool.icon .. " " .. tool.name, 
                           panel.x + self.padding*2, buttonY + 6)
        
        -- Hotkey
        love.graphics.setFont(self.fonts.small)
        love.graphics.setColor(self.colors.textDim)
        love.graphics.print("(" .. tool.hotkey .. ")", 
                           panel.x + panel.width - 30, buttonY + 8)
    end
    
    -- Color palette
    y = y + (#panel.tools * 35) + 20
    love.graphics.setFont(self.fonts.default)
    love.graphics.setColor(self.colors.text)
    love.graphics.print("Colors", panel.x + self.padding, y)
    
    y = y + 25
    local colorSize = 20
    local colorsPerRow = 4
    
    for i, color in ipairs(panel.colorPresets) do
        local row = math.floor((i-1) / colorsPerRow)
        local col = (i-1) % colorsPerRow
        local colorX = panel.x + self.padding + col * (colorSize + 5)
        local colorY = y + row * (colorSize + 5)
        
        -- Color swatch
        love.graphics.setColor(color)
        love.graphics.rectangle("fill", colorX, colorY, colorSize, colorSize)
        
        -- Border
        love.graphics.setColor(self.colors.text)
        love.graphics.setLineWidth(1)
        love.graphics.rectangle("line", colorX, colorY, colorSize, colorSize)
    end
    
    -- Size slider (simplified)
    y = y + math.ceil(#panel.colorPresets / colorsPerRow) * 25 + 20
    love.graphics.setColor(self.colors.text)
    love.graphics.print("Size: " .. (game and game.state.drawingSize or 3), 
                       panel.x + self.padding, y)
end

function UI:drawContextMenu()
    local menu = self.contextMenu
    
    local menuWidth = 180
    local menuHeight = #menu.items * 30 + 20
    
    -- Clamp to screen
    local x = math.min(menu.x, love.graphics.getWidth() - menuWidth)
    local y = math.min(menu.y, love.graphics.getHeight() - menuHeight)
    
    -- Background
    love.graphics.setColor(self.colors.panel)
    love.graphics.rectangle("fill", x, y, menuWidth, menuHeight, 5)
    
    -- Border
    love.graphics.setColor(self.colors.accent)
    love.graphics.setLineWidth(1)
    love.graphics.rectangle("line", x, y, menuWidth, menuHeight, 5)
    
    -- Title
    love.graphics.setFont(self.fonts.default)
    love.graphics.setColor(self.colors.text)
    love.graphics.print(menu.title or "Options", x + self.padding, y + 5)
    
    -- Menu items
    for i, item in ipairs(menu.items) do
        local itemY = y + 25 + (i-1) * 25
        
        -- Hover highlight
        local mx, my = love.mouse.getPosition()
        if mx >= x and mx <= x + menuWidth and my >= itemY and my <= itemY + 25 then
            love.graphics.setColor(self.colors.buttonHover)
            love.graphics.rectangle("fill", x + 2, itemY, menuWidth - 4, 25)
        end
        
        -- Item text
        love.graphics.setColor(item.enabled ~= false and self.colors.text or self.colors.textDim)
        love.graphics.print(item.text, x + self.padding, itemY + 3)
    end
end

function UI:drawTextInput()
    local input = self.textInput
    
    local dialogWidth = 300
    local dialogHeight = 100
    local x = (love.graphics.getWidth() - dialogWidth) / 2
    local y = (love.graphics.getHeight() - dialogHeight) / 2
    
    -- Background
    love.graphics.setColor(self.colors.background)
    love.graphics.rectangle("fill", x, y, dialogWidth, dialogHeight, 5)
    
    -- Border
    love.graphics.setColor(self.colors.accent)
    love.graphics.setLineWidth(2)
    love.graphics.rectangle("line", x, y, dialogWidth, dialogHeight, 5)
    
    -- Title
    love.graphics.setFont(self.fonts.default)
    love.graphics.setColor(self.colors.text)
    love.graphics.print("Enter Message:", x + self.padding, y + self.padding)
    
    -- Text input box
    local inputY = y + 35
    love.graphics.setColor(self.colors.button)
    love.graphics.rectangle("fill", x + self.padding, inputY, dialogWidth - self.padding*2, 25)
    
    -- Input text
    love.graphics.setColor(self.colors.text)
    love.graphics.print(input.text .. (love.timer.getTime() % 1 > 0.5 and "|" or ""), 
                       x + self.padding + 5, inputY + 3)
    
    -- Instructions
    love.graphics.setFont(self.fonts.small)
    love.graphics.setColor(self.colors.textDim)
    love.graphics.print("Press Enter to confirm, Escape to cancel", 
                       x + self.padding, y + dialogHeight - 20)
end

function UI:showMessageInput(x, y, callback)
    self.textInput = {
        x = x,
        y = y,
        text = "",
        cursorPos = 0
    }
    self.messageInputCallback = callback
end

function UI:hideMessageInput()
    self.textInput = nil
    self.messageInputCallback = nil
end

function UI:showContextMenu(x, y, object)
    local items = {}
    
    if object then
        if object.physics then
            table.insert(items, {
                text = object.physics.bouncing and "🛑 Stop Physics" or "🎈 Enable Physics",
                action = function() self:toggleObjectPhysics(object) end
            })
        end
        
        table.insert(items, {
            text = "🚀 Random Throw",
            action = function() self:throwObjectRandom(object) end
        })
        
        table.insert(items, {
            text = "📋 Copy Text",
            action = function() self:copyObjectText(object) end
        })
        
        table.insert(items, {
            text = "🗑️ Delete",
            action = function() self:deleteObject(object) end
        })
    else
        table.insert(items, {
            text = "📝 Add Message",
            action = function() self:addMessageHere(x, y) end
        })
        
        table.insert(items, {
            text = "🧹 Clear All",
            action = function() self:clearAll() end
        })
    end
    
    self.contextMenu = {
        x = x,
        y = y,
        object = object,
        items = items,
        timer = 0
    }
end

function UI:hideContextMenu()
    self.contextMenu = nil
end

-- Event handlers
function UI:mousepressed(x, y, button)
    if button == 2 and self.contextMenu then
        -- Right click closes context menu
        self:hideContextMenu()
        return true
    end
    
    if self.contextMenu then
        -- Handle context menu clicks
        local menu = self.contextMenu
        local menuWidth = 180
        local menuHeight = #menu.items * 30 + 20
        
        local menuX = math.min(menu.x, love.graphics.getWidth() - menuWidth)
        local menuY = math.min(menu.y, love.graphics.getHeight() - menuHeight)
        
        if x >= menuX and x <= menuX + menuWidth and y >= menuY and y <= menuY + menuHeight then
            -- Click inside menu
            local itemIndex = math.floor((y - menuY - 25) / 25) + 1
            if itemIndex >= 1 and itemIndex <= #menu.items then
                local item = menu.items[itemIndex]
                if item.action and item.enabled ~= false then
                    item.action()
                end
            end
            self:hideContextMenu()
            return true
        else
            -- Click outside menu - close it
            self:hideContextMenu()
        end
    end
    
    -- Check tool panel clicks
    if self.toolPanel.visible then
        local panel = self.toolPanel
        if x >= panel.x and x <= panel.x + panel.width then
            -- Tool buttons
            local toolY = panel.y + 40
            for i, tool in ipairs(panel.tools) do
                local buttonY = toolY + (i-1) * 35
                if y >= buttonY and y <= buttonY + 30 then
                    if _G.game then
                        _G.game.state:setTool(tool.id)
                    end
                    return true
                end
            end
            
            -- Color palette
            local colorY = toolY + (#panel.tools * 35) + 45
            local colorSize = 20
            local colorsPerRow = 4
            
            for i, color in ipairs(panel.colorPresets) do
                local row = math.floor((i-1) / colorsPerRow)
                local col = (i-1) % colorsPerRow
                local colorX = panel.x + self.padding + col * (colorSize + 5)
                local colorButtonY = colorY + row * (colorSize + 5)
                
                if x >= colorX and x <= colorX + colorSize and 
                   y >= colorButtonY and y <= colorButtonY + colorSize then
                    if _G.game then
                        _G.game.state:setDrawingColor(color[1], color[2], color[3], color[4])
                        _G.game.drawing:setCurrentColor(color[1], color[2], color[3], color[4])
                    end
                    return true
                end
            end
        end
    end
    
    return false
end

function UI:mousemoved(x, y, dx, dy)
    return false
end

function UI:mousereleased(x, y, button)
    return false
end

function UI:wheelmoved(x, y)
    return false
end

function UI:keypressed(key)
    if self.textInput then
        if key == "return" then
            if self.messageInputCallback then
                self.messageInputCallback(self.textInput.text)
            end
            self:hideMessageInput()
            return true
        elseif key == "escape" then
            self:hideMessageInput()
            return true
        elseif key == "backspace" then
            self.textInput.text = self.textInput.text:sub(1, -2)
            return true
        end
    end
    
    -- Tool hotkeys
    if key >= "1" and key <= "5" then
        local toolIndex = tonumber(key)
        if self.toolPanel.tools[toolIndex] then
            if _G.game then
                _G.game.state:setTool(self.toolPanel.tools[toolIndex].id)
            end
            return true
        end
    end
    
    return false
end

function UI:textinput(text)
    if self.textInput then
        self.textInput.text = self.textInput.text .. text
        return true
    end
    return false
end

function UI:toggle()
    self.visible = not self.visible
end

function UI:resize(w, h)
    -- Adjust panel positions if needed
end

-- Context menu actions
function UI:toggleObjectPhysics(object)
    if _G.game then
        local updates = {
            physics = object.physics or {
                vx = 0, vy = 0, bouncing = false, mass = 1, friction = 0.3, restitution = 0.8
            }
        }
        updates.physics.bouncing = not updates.physics.bouncing
        _G.game.network:sendObjectUpdate(object.id, updates)
    end
end

function UI:throwObjectRandom(object)
    if _G.game then
        local vx = love.math.random(-400, 400)
        local vy = love.math.random(-300, -100)
        _G.game.network:sendObjectThrow(object.id, vx, vy)
    end
end

function UI:copyObjectText(object)
    if object.text then
        love.system.setClipboardText(object.text)
        print("📋 Copied text:", object.text)
    end
end

function UI:deleteObject(object)
    if _G.game then
        _G.game.network:send("object_delete", {objectId = object.id})
    end
end

function UI:addMessageHere(x, y)
    self:showMessageInput(x, y, function(text)
        if _G.game then
            local message = {
                text = text,
                x = x,
                y = y,
                createdAt = love.timer.getTime(),
                physics = {vx = 0, vy = 0, bouncing = false, mass = 1, friction = 0.3, restitution = 0.8}
            }
            _G.game.state:addMessage(message)
            _G.game.network:sendMessage(message)
        end
    end)
end

function UI:clearAll()
    if _G.game then
        _G.game.drawing:clear()
        _G.game.state:clear()
        _G.game.network:send("drawing_clear", {})
    end
end

function UI:getFont(fontType)
    return self.fonts[fontType] or self.fonts.default
end

return UI
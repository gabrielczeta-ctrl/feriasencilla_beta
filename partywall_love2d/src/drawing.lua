--[[
  ADVANCED DRAWING SYSTEM
  
  Features:
  - Smooth curve rendering
  - Real-time stroke collision generation
  - Multiple drawing tools (pen, brush, eraser)
  - Stroke expiration and cleanup
  - Optimized rendering with batching
  - Pressure-sensitive drawing
]]--

local Drawing = {}
Drawing.__index = Drawing

function Drawing.new()
    local self = setmetatable({}, Drawing)
    
    -- Drawing state
    self.strokes = {}
    self.currentStroke = nil
    self.isDrawing = false
    
    -- Tool properties
    self.tools = {
        pen = {
            name = "Pen",
            minSize = 1,
            maxSize = 5,
            opacity = 1.0,
            smoothing = 0.5
        },
        brush = {
            name = "Brush",
            minSize = 5,
            maxSize = 20,
            opacity = 0.8,
            smoothing = 0.3
        },
        eraser = {
            name = "Eraser", 
            minSize = 10,
            maxSize = 40,
            opacity = 1.0,
            smoothing = 0.2
        },
        marker = {
            name = "Marker",
            minSize = 3,
            maxSize = 12,
            opacity = 0.6,
            smoothing = 0.4
        }
    }
    
    -- Rendering optimization
    self.strokeBatches = {}
    self.batchDirty = false
    
    -- Physics callback (set by physics system)
    self.physicsCallback = nil
    
    -- Smoothing parameters
    self.smoothingDistance = 3.0
    self.minPointDistance = 2.0
    
    return self
end

function Drawing:startStroke(x, y, tool)
    tool = tool or "pen"
    
    self.currentStroke = {
        tool = tool,
        color = self:getCurrentColor(),
        size = self:getCurrentSize(tool),
        points = {{x = x, y = y, pressure = 1.0}},
        smoothedPoints = {},
        timestamp = love.timer.getTime(),
        expireAt = love.timer.getTime() + 3600, -- 1 hour
        bounds = {minX = x, minY = y, maxX = x, maxY = y}
    }
    
    self.isDrawing = true
    return self.currentStroke
end

function Drawing:addPoint(x, y, pressure)
    if not self.isDrawing or not self.currentStroke then
        return
    end
    
    pressure = pressure or 1.0
    
    -- Check minimum distance to avoid too many points
    local lastPoint = self.currentStroke.points[#self.currentStroke.points]
    local distance = math.sqrt((x - lastPoint.x)^2 + (y - lastPoint.y)^2)
    
    if distance >= self.minPointDistance then
        table.insert(self.currentStroke.points, {x = x, y = y, pressure = pressure})
        
        -- Update bounds
        self.currentStroke.bounds.minX = math.min(self.currentStroke.bounds.minX, x)
        self.currentStroke.bounds.minY = math.min(self.currentStroke.bounds.minY, y)
        self.currentStroke.bounds.maxX = math.max(self.currentStroke.bounds.maxX, x)
        self.currentStroke.bounds.maxY = math.max(self.currentStroke.bounds.maxY, y)
        
        -- Generate smoothed points for better rendering
        self:updateSmoothPoints()
    end
end

function Drawing:finishStroke()
    if not self.currentStroke or #self.currentStroke.points < 2 then
        self.isDrawing = false
        self.currentStroke = nil
        return nil
    end
    
    -- Final smoothing pass
    self:smoothStroke(self.currentStroke)
    
    -- Generate collision bodies if physics callback is set
    if self.physicsCallback then
        self.physicsCallback(self.currentStroke)
    end
    
    -- Add stroke to permanent collection
    self.currentStroke.id = self:generateStrokeId()
    table.insert(self.strokes, self.currentStroke)
    
    -- Mark batches as dirty for re-rendering
    self.batchDirty = true
    
    local finishedStroke = self.currentStroke
    self.currentStroke = nil
    self.isDrawing = false
    
    return finishedStroke
end

function Drawing:updateSmoothPoints()
    if not self.currentStroke or #self.currentStroke.points < 3 then
        return
    end
    
    local points = self.currentStroke.points
    local smoothed = {}
    
    -- Simple smoothing algorithm
    for i = 2, #points - 1 do
        local prev = points[i - 1]
        local curr = points[i]
        local next = points[i + 1]
        
        local smoothX = (prev.x + curr.x + next.x) / 3
        local smoothY = (prev.y + curr.y + next.y) / 3
        local smoothPressure = (prev.pressure + curr.pressure + next.pressure) / 3
        
        table.insert(smoothed, {
            x = smoothX,
            y = smoothY,
            pressure = smoothPressure
        })
    end
    
    self.currentStroke.smoothedPoints = smoothed
end

function Drawing:smoothStroke(stroke)
    if #stroke.points < 3 then
        return
    end
    
    local smoothed = {}
    local points = stroke.points
    
    -- Add first point
    table.insert(smoothed, points[1])
    
    -- Smooth intermediate points using Catmull-Rom spline
    for i = 2, #points - 1 do
        local p0 = points[math.max(1, i - 1)]
        local p1 = points[i]
        local p2 = points[math.min(#points, i + 1)]
        local p3 = points[math.min(#points, i + 2)]
        
        -- Generate interpolated points
        local steps = 3
        for t = 0, 1, 1/steps do
            local x = self:catmullRom(p0.x, p1.x, p2.x, p3.x, t)
            local y = self:catmullRom(p0.y, p1.y, p2.y, p3.y, t)
            local pressure = self:catmullRom(p0.pressure, p1.pressure, p2.pressure, p3.pressure, t)
            
            table.insert(smoothed, {x = x, y = y, pressure = pressure})
        end
    end
    
    -- Add last point
    table.insert(smoothed, points[#points])
    
    stroke.smoothedPoints = smoothed
end

function Drawing:catmullRom(p0, p1, p2, p3, t)
    local t2 = t * t
    local t3 = t2 * t
    
    return 0.5 * ((2 * p1) +
                  (-p0 + p2) * t +
                  (2*p0 - 5*p1 + 4*p2 - p3) * t2 +
                  (-p0 + 3*p1 - 3*p2 + p3) * t3)
end

function Drawing:addStroke(strokeData)
    -- Add stroke received from network
    local stroke = {
        id = strokeData.id,
        tool = strokeData.tool,
        color = strokeData.color,
        size = strokeData.size,
        points = strokeData.points,
        timestamp = strokeData.timestamp,
        expireAt = strokeData.expireAt,
        bounds = strokeData.bounds
    }
    
    -- Smooth the received stroke
    self:smoothStroke(stroke)
    
    -- Generate collision if physics callback is set
    if self.physicsCallback then
        self.physicsCallback(stroke)
    end
    
    table.insert(self.strokes, stroke)
    self.batchDirty = true
end

function Drawing:removeStroke(strokeId)
    for i = #self.strokes, 1, -1 do
        if self.strokes[i].id == strokeId then
            -- Remove physics collision
            if self.physicsCallback then
                self.physicsCallback(self.strokes[i], "remove")
            end
            
            table.remove(self.strokes, i)
            self.batchDirty = true
            break
        end
    end
end

function Drawing:clear()
    -- Remove all strokes and their physics collisions
    for _, stroke in ipairs(self.strokes) do
        if self.physicsCallback then
            self.physicsCallback(stroke, "remove")
        end
    end
    
    self.strokes = {}
    self.currentStroke = nil
    self.isDrawing = false
    self.batchDirty = true
end

function Drawing:update(dt)
    -- Clean up expired strokes
    self:cleanupExpired()
    
    -- Update batch rendering if needed
    if self.batchDirty then
        self:rebuildBatches()
        self.batchDirty = false
    end
end

function Drawing:cleanupExpired()
    local now = love.timer.getTime()
    local removed = false
    
    for i = #self.strokes, 1, -1 do
        local stroke = self.strokes[i]
        if stroke.expireAt and now > stroke.expireAt then
            -- Remove physics collision
            if self.physicsCallback then
                self.physicsCallback(stroke, "remove")
            end
            
            table.remove(self.strokes, i)
            removed = true
        end
    end
    
    if removed then
        self.batchDirty = true
    end
end

function Drawing:rebuildBatches()
    -- Clear existing batches
    self.strokeBatches = {}
    
    -- Group strokes by tool/color for efficient rendering
    local groups = {}
    
    for _, stroke in ipairs(self.strokes) do
        local key = stroke.tool .. "_" .. tostring(stroke.color)
        if not groups[key] then
            groups[key] = {
                tool = stroke.tool,
                color = stroke.color,
                strokes = {}
            }
        end
        table.insert(groups[key].strokes, stroke)
    end
    
    -- Create batches for each group
    for _, group in pairs(groups) do
        self.strokeBatches[group.tool .. "_" .. tostring(group.color)] = group
    end
end

function Drawing:draw()
    -- Draw all permanent strokes using batches
    for _, batch in pairs(self.strokeBatches) do
        self:drawStrokeBatch(batch)
    end
end

function Drawing:drawCurrentStroke()
    -- Draw the stroke currently being drawn
    if self.currentStroke and #self.currentStroke.points > 1 then
        self:drawSingleStroke(self.currentStroke, true)
    end
end

function Drawing:drawStrokeBatch(batch)
    love.graphics.setColor(batch.color[1] or 1, batch.color[2] or 1, batch.color[3] or 1, batch.color[4] or 1)
    
    for _, stroke in ipairs(batch.strokes) do
        self:drawSingleStroke(stroke, false)
    end
end

function Drawing:drawSingleStroke(stroke, isCurrent)
    local points = stroke.smoothedPoints and #stroke.smoothedPoints > 0 
                   and stroke.smoothedPoints or stroke.points
    
    if #points < 2 then return end
    
    local tool = self.tools[stroke.tool] or self.tools.pen
    
    if stroke.tool == "eraser" then
        love.graphics.setBlendMode("replace", "premultiplied")
        love.graphics.setColor(0, 0, 0, 0) -- Transparent for eraser
    else
        love.graphics.setBlendMode("alpha")
    end
    
    -- Draw stroke with variable width based on pressure
    for i = 1, #points - 1 do
        local p1 = points[i]
        local p2 = points[i + 1]
        
        local width1 = stroke.size * (p1.pressure or 1.0)
        local width2 = stroke.size * (p2.pressure or 1.0)
        
        if stroke.tool == "brush" then
            -- Brush: Multiple overlapping lines for texture
            love.graphics.setLineWidth(width1)
            love.graphics.line(p1.x, p1.y, p2.x, p2.y)
            
            -- Add texture with slightly offset lines
            love.graphics.setColor(stroke.color[1] or 1, stroke.color[2] or 1, 
                                 stroke.color[3] or 1, (stroke.color[4] or 1) * 0.3)
            love.graphics.setLineWidth(width1 * 0.7)
            love.graphics.line(p1.x + 1, p1.y, p2.x + 1, p2.y)
            love.graphics.line(p1.x, p1.y + 1, p2.x, p2.y + 1)
            
        else
            -- Pen/Marker: Clean lines
            love.graphics.setLineWidth((width1 + width2) / 2)
            love.graphics.setLineCap("round")
            love.graphics.setLineJoin("round")
            love.graphics.line(p1.x, p1.y, p2.x, p2.y)
        end
    end
    
    love.graphics.setBlendMode("alpha")
end

function Drawing:getCurrentColor()
    -- This would be set by the UI system
    return self.currentColor or {1, 1, 1, 1} -- Default white
end

function Drawing:getCurrentSize(tool)
    tool = tool or "pen"
    local toolData = self.tools[tool] or self.tools.pen
    
    -- This would be controlled by UI
    return self.currentSize or toolData.minSize
end

function Drawing:setPhysicsCallback(callback)
    self.physicsCallback = callback
end

function Drawing:setCurrentColor(r, g, b, a)
    self.currentColor = {r, g, b, a or 1}
end

function Drawing:setCurrentSize(size)
    self.currentSize = size
end

function Drawing:generateStrokeId()
    return "stroke_" .. love.timer.getTime() .. "_" .. love.math.random(1000, 9999)
end

function Drawing:getStrokeCount()
    return #self.strokes
end

function Drawing:isDrawing()
    return self.isDrawing
end

function Drawing:getStrokeAt(x, y)
    -- Find stroke at given coordinates for selection/editing
    for _, stroke in ipairs(self.strokes) do
        if self:pointInStrokeBounds(x, y, stroke) then
            if self:pointOnStroke(x, y, stroke) then
                return stroke
            end
        end
    end
    return nil
end

function Drawing:pointInStrokeBounds(x, y, stroke)
    return x >= stroke.bounds.minX and x <= stroke.bounds.maxX and
           y >= stroke.bounds.minY and y <= stroke.bounds.maxY
end

function Drawing:pointOnStroke(x, y, stroke)
    local threshold = stroke.size + 5
    
    for i = 1, #stroke.points - 1 do
        local p1 = stroke.points[i]
        local p2 = stroke.points[i + 1]
        
        local distance = self:distanceToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y)
        if distance <= threshold then
            return true
        end
    end
    
    return false
end

function Drawing:distanceToLineSegment(px, py, x1, y1, x2, y2)
    local dx = x2 - x1
    local dy = y2 - y1
    local length2 = dx*dx + dy*dy
    
    if length2 == 0 then
        return math.sqrt((px - x1)^2 + (py - y1)^2)
    end
    
    local t = math.max(0, math.min(1, ((px - x1) * dx + (py - y1) * dy) / length2))
    local closestX = x1 + t * dx
    local closestY = y1 + t * dy
    
    return math.sqrt((px - closestX)^2 + (py - closestY)^2)
end

return Drawing
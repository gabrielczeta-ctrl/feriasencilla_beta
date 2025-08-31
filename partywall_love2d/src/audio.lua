--[[
  ADVANCED AUDIO SYSTEM
  
  Features:
  - Dynamic sound effects for physics interactions
  - Spatial audio with distance and velocity calculations
  - Audio pools for performance optimization
  - Real-time audio mixing and processing
  - Ambient soundscapes and musical elements
]]--

local Audio = {}
Audio.__index = Audio

function Audio.new()
    local self = setmetatable({}, Audio)
    
    -- Audio settings
    self.masterVolume = 0.7
    self.sfxVolume = 0.8
    self.musicVolume = 0.5
    self.spatialAudio = true
    self.maxDistance = 1000
    
    -- Audio sources and pools
    self.sounds = {}
    self.musicTracks = {}
    self.activeSources = {}
    self.sourcePool = {}
    self.poolSize = 32
    
    -- Spatial audio settings
    self.listenerX = 0
    self.listenerY = 0
    self.listenerVelX = 0
    self.listenerVelY = 0
    
    -- Audio effects
    self.reverbEnabled = true
    self.lowPassFilter = true
    self.dynamicRange = true
    
    -- Initialize audio system
    self:initializeAudio()
    
    return self
end

function Audio:initializeAudio()
    -- Initialize source pool
    for i = 1, self.poolSize do
        table.insert(self.sourcePool, {
            source = nil,
            active = false,
            volume = 1,
            pitch = 1,
            x = 0, y = 0,
            velX = 0, velY = 0,
            type = "sfx"
        })
    end
    
    -- Define sound effects with variations
    self.soundEffects = {
        -- Drawing sounds
        drawPen = {
            files = {"sfx/draw_pen1.ogg", "sfx/draw_pen2.ogg"},
            volume = 0.3,
            pitchVariation = 0.1,
            spatial = true
        },
        drawBrush = {
            files = {"sfx/draw_brush1.ogg", "sfx/draw_brush2.ogg"},
            volume = 0.4,
            pitchVariation = 0.15,
            spatial = true
        },
        erase = {
            files = {"sfx/erase1.ogg", "sfx/erase2.ogg"},
            volume = 0.35,
            pitchVariation = 0.2,
            spatial = true
        },
        
        -- Physics sounds
        bounce = {
            files = {"sfx/bounce1.ogg", "sfx/bounce2.ogg", "sfx/bounce3.ogg"},
            volume = 0.6,
            pitchVariation = 0.3,
            velocityScale = true,
            spatial = true
        },
        collision = {
            files = {"sfx/collision1.ogg", "sfx/collision2.ogg"},
            volume = 0.7,
            pitchVariation = 0.25,
            velocityScale = true,
            spatial = true
        },
        throw = {
            files = {"sfx/throw1.ogg", "sfx/throw2.ogg"},
            volume = 0.5,
            pitchVariation = 0.2,
            spatial = true
        },
        
        -- Message sounds
        messageCreate = {
            files = {"sfx/message_create.ogg"},
            volume = 0.45,
            pitchVariation = 0.1,
            spatial = true
        },
        messagePhysics = {
            files = {"sfx/message_physics.ogg"},
            volume = 0.4,
            pitchVariation = 0.05,
            spatial = true
        },
        
        -- UI sounds
        toolSwitch = {
            files = {"sfx/tool_switch.ogg"},
            volume = 0.3,
            pitchVariation = 0.05,
            spatial = false
        },
        contextMenu = {
            files = {"sfx/context_menu.ogg"},
            volume = 0.25,
            pitchVariation = 0,
            spatial = false
        },
        
        -- Ambient effects
        canvas_hum = {
            files = {"sfx/canvas_hum.ogg"},
            volume = 0.15,
            loop = true,
            spatial = false
        }
    }
    
    -- Music tracks
    self.musicTracks = {
        ambient = {
            files = {"music/ambient1.ogg", "music/ambient2.ogg"},
            volume = 0.3,
            loop = true,
            fadeIn = 2.0,
            fadeOut = 1.5
        },
        creative = {
            files = {"music/creative1.ogg", "music/creative2.ogg"},
            volume = 0.25,
            loop = true,
            fadeIn = 3.0,
            fadeOut = 2.0
        }
    }
    
    -- Load audio files (in production, check if files exist)
    self:loadAudioFiles()
end

function Audio:loadAudioFiles()
    -- Load sound effects
    for name, config in pairs(self.soundEffects) do
        self.sounds[name] = {}
        for _, filename in ipairs(config.files) do
            -- In production, check if file exists before loading
            local soundData = self:createPlaceholderSound(filename)
            table.insert(self.sounds[name], soundData)
        end
    end
    
    -- Load music tracks
    for name, config in pairs(self.musicTracks) do
        self.sounds[name] = {}
        for _, filename in ipairs(config.files) do
            local musicData = self:createPlaceholderMusic(filename)
            table.insert(self.sounds[name], musicData)
        end
    end
    
    print("🎵 Audio system initialized with", self:getTotalSounds(), "sound effects")
end

function Audio:createPlaceholderSound(filename)
    -- Create placeholder sine wave for development
    local sampleRate = 44100
    local duration = 0.2
    local samples = duration * sampleRate
    local soundData = love.sound.newSoundData(samples, sampleRate, 16, 1)
    
    -- Generate simple sine wave based on filename
    local frequency = 440 + (string.len(filename) % 20) * 50
    for i = 0, samples - 1 do
        local t = i / sampleRate
        local sample = math.sin(2 * math.pi * frequency * t) * 0.3
        soundData:setSample(i, sample)
    end
    
    return love.audio.newSource(soundData, "static")
end

function Audio:createPlaceholderMusic(filename)
    -- Create longer placeholder for music
    local sampleRate = 44100
    local duration = 10.0 -- 10 second loop
    local samples = duration * sampleRate
    local soundData = love.sound.newSoundData(samples, sampleRate, 16, 1)
    
    -- Generate ambient-style wave
    local baseFreq = 220 + (string.len(filename) % 10) * 30
    for i = 0, samples - 1 do
        local t = i / sampleRate
        local sample = (math.sin(2 * math.pi * baseFreq * t) * 0.2 +
                       math.sin(2 * math.pi * baseFreq * 1.5 * t) * 0.1 +
                       math.sin(2 * math.pi * baseFreq * 0.5 * t) * 0.15) * 0.3
        soundData:setSample(i, sample)
    end
    
    return love.audio.newSource(soundData, "static")
end

function Audio:getAudioSource()
    -- Find available source from pool
    for _, pooledSource in ipairs(self.sourcePool) do
        if not pooledSource.active then
            return pooledSource
        end
    end
    
    -- Pool exhausted, create new source
    local newSource = {
        source = nil,
        active = false,
        volume = 1,
        pitch = 1,
        x = 0, y = 0,
        velX = 0, velY = 0,
        type = "sfx"
    }
    table.insert(self.sourcePool, newSource)
    return newSource
end

function Audio:playSound(soundName, x, y, velocity, volume)
    local config = self.soundEffects[soundName]
    if not config or not self.sounds[soundName] then
        return nil
    end
    
    -- Get source from pool
    local audioSource = self:getAudioSource()
    if not audioSource then return nil end
    
    -- Select random variation
    local soundVariation = self.sounds[soundName][love.math.random(1, #self.sounds[soundName])]
    audioSource.source = soundVariation:clone()
    
    -- Calculate volume
    local finalVolume = (volume or 1) * config.volume * self.sfxVolume * self.masterVolume
    
    -- Apply spatial audio if enabled
    if config.spatial and self.spatialAudio and x and y then
        finalVolume = finalVolume * self:calculateSpatialVolume(x, y)
        audioSource.x = x
        audioSource.y = y
    end
    
    -- Apply velocity scaling if configured
    if config.velocityScale and velocity then
        local velocityMagnitude = math.sqrt(velocity.x^2 + velocity.y^2)
        local velocityScale = math.min(2.0, math.max(0.3, velocityMagnitude / 200))
        finalVolume = finalVolume * velocityScale
        
        -- Pitch variation based on velocity
        local pitchShift = 1.0 + (velocityMagnitude / 1000) * 0.5
        audioSource.source:setPitch(pitchShift)
    end
    
    -- Apply pitch variation
    if config.pitchVariation and config.pitchVariation > 0 then
        local pitchVar = 1.0 + (love.math.random() - 0.5) * config.pitchVariation
        audioSource.source:setPitch(audioSource.source:getPitch() * pitchVar)
    end
    
    -- Set final properties
    audioSource.source:setVolume(finalVolume)
    audioSource.active = true
    audioSource.type = "sfx"
    
    -- Play sound
    audioSource.source:play()
    table.insert(self.activeSources, audioSource)
    
    return audioSource
end

function Audio:playMusic(trackName, fadeIn)
    local config = self.musicTracks[trackName]
    if not config or not self.sounds[trackName] then
        return nil
    end
    
    -- Stop current music with fade out
    self:stopMusic(config.fadeOut or 1.0)
    
    -- Select random track
    local track = self.sounds[trackName][love.math.random(1, #self.sounds[trackName])]
    local source = track:clone()
    
    -- Configure source
    source:setLooping(config.loop or false)
    source:setVolume(0) -- Start silent for fade in
    
    -- Play and add to active sources
    source:play()
    
    local audioSource = self:getAudioSource()
    audioSource.source = source
    audioSource.active = true
    audioSource.type = "music"
    audioSource.targetVolume = config.volume * self.musicVolume * self.masterVolume
    audioSource.fadeSpeed = (fadeIn or config.fadeIn or 2.0)
    
    table.insert(self.activeSources, audioSource)
    
    print("🎵 Playing music:", trackName)
    return audioSource
end

function Audio:calculateSpatialVolume(x, y)
    -- Calculate distance from listener
    local dx = x - self.listenerX
    local dy = y - self.listenerY
    local distance = math.sqrt(dx^2 + dy^2)
    
    if distance >= self.maxDistance then
        return 0
    end
    
    -- Inverse square law with minimum volume
    local volume = math.max(0.1, 1 - (distance / self.maxDistance)^2)
    
    -- Apply doppler effect if object has velocity
    -- (simplified implementation)
    
    return volume
end

function Audio:setListenerPosition(x, y, velX, velY)
    self.listenerX = x
    self.listenerY = y
    self.listenerVelX = velX or 0
    self.listenerVelY = velY or 0
end

function Audio:update(dt)
    -- Update active sources
    for i = #self.activeSources, 1, -1 do
        local audioSource = self.activeSources[i]
        
        if audioSource.source then
            -- Handle music fade in
            if audioSource.type == "music" and audioSource.targetVolume then
                local currentVolume = audioSource.source:getVolume()
                if currentVolume < audioSource.targetVolume then
                    local newVolume = currentVolume + (audioSource.fadeSpeed * dt)
                    audioSource.source:setVolume(math.min(audioSource.targetVolume, newVolume))
                end
            end
            
            -- Update spatial audio
            if self.spatialAudio and audioSource.x and audioSource.y then
                local spatialVolume = self:calculateSpatialVolume(audioSource.x, audioSource.y)
                local config = self:getSoundConfig(audioSource)
                if config then
                    local baseVolume = config.volume * self.sfxVolume * self.masterVolume
                    audioSource.source:setVolume(baseVolume * spatialVolume)
                end
            end
            
            -- Remove finished sources
            if not audioSource.source:isPlaying() then
                audioSource.active = false
                table.remove(self.activeSources, i)
            end
        else
            table.remove(self.activeSources, i)
        end
    end
end

function Audio:getSoundConfig(audioSource)
    -- Helper to get config for an audio source (simplified)
    for name, config in pairs(self.soundEffects) do
        if self.sounds[name] then
            for _, sound in ipairs(self.sounds[name]) do
                -- This is a simplified check - in production you'd track this better
                return config
            end
        end
    end
    return nil
end

function Audio:stopMusic(fadeOut)
    fadeOut = fadeOut or 0
    
    for i = #self.activeSources, 1, -1 do
        local audioSource = self.activeSources[i]
        if audioSource.type == "music" then
            if fadeOut > 0 then
                -- Implement fade out logic
                audioSource.fadeOut = fadeOut
                audioSource.fadeTimer = fadeOut
            else
                audioSource.source:stop()
                audioSource.active = false
                table.remove(self.activeSources, i)
            end
        end
    end
end

function Audio:stopAllSounds()
    for _, audioSource in ipairs(self.activeSources) do
        if audioSource.source then
            audioSource.source:stop()
        end
        audioSource.active = false
    end
    self.activeSources = {}
end

function Audio:setMasterVolume(volume)
    self.masterVolume = math.max(0, math.min(1, volume))
    self:updateAllVolumes()
end

function Audio:setSFXVolume(volume)
    self.sfxVolume = math.max(0, math.min(1, volume))
    self:updateAllVolumes()
end

function Audio:setMusicVolume(volume)
    self.musicVolume = math.max(0, math.min(1, volume))
    self:updateAllVolumes()
end

function Audio:updateAllVolumes()
    for _, audioSource in ipairs(self.activeSources) do
        if audioSource.source then
            local config = self:getSoundConfig(audioSource)
            if config then
                local volume = config.volume
                if audioSource.type == "music" then
                    volume = volume * self.musicVolume
                else
                    volume = volume * self.sfxVolume
                end
                volume = volume * self.masterVolume
                audioSource.source:setVolume(volume)
            end
        end
    end
end

function Audio:enableSpatialAudio(enabled)
    self.spatialAudio = enabled
end

function Audio:setMaxDistance(distance)
    self.maxDistance = math.max(100, distance)
end

-- Convenience methods for common game events

function Audio:onDrawingStart(tool, x, y)
    local soundName = "draw" .. tool:sub(1,1):upper() .. tool:sub(2)
    if soundName == "drawMessage" then soundName = "messageCreate" end
    self:playSound(soundName, x, y)
end

function Audio:onPhysicsCollision(x, y, velocity, intensity)
    intensity = intensity or 1
    
    if intensity > 0.5 then
        self:playSound("collision", x, y, velocity, intensity)
    else
        self:playSound("bounce", x, y, velocity, intensity * 0.8)
    end
end

function Audio:onObjectThrow(x, y, velocity)
    self:playSound("throw", x, y, velocity)
end

function Audio:onMessageCreate(x, y)
    self:playSound("messageCreate", x, y)
end

function Audio:onPhysicsToggle(x, y)
    self:playSound("messagePhysics", x, y)
end

function Audio:onToolSwitch()
    self:playSound("toolSwitch")
end

function Audio:onContextMenu()
    self:playSound("contextMenu")
end

function Audio:startAmbientMusic()
    self:playMusic("ambient", 3.0)
end

function Audio:getTotalSounds()
    local count = 0
    for _, sounds in pairs(self.sounds) do
        count = count + #sounds
    end
    return count
end

function Audio:getActiveSourceCount()
    return #self.activeSources
end

function Audio:getStats()
    return {
        totalSounds = self:getTotalSounds(),
        activeSources = self:getActiveSourceCount(),
        masterVolume = self.masterVolume,
        sfxVolume = self.sfxVolume,
        musicVolume = self.musicVolume,
        spatialAudio = self.spatialAudio
    }
end

return Audio
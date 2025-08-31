function love.conf(t)
    t.title = "Partywall - Multiplayer Physics Canvas"
    t.author = "Partywall Team"
    t.version = "11.4"
    t.console = false
    
    -- Window settings
    t.window.title = "Partywall - Multiplayer Physics Canvas"
    t.window.icon = nil
    t.window.width = 1200
    t.window.height = 800
    t.window.borderless = false
    t.window.resizable = true
    t.window.minwidth = 800
    t.window.minheight = 600
    t.window.fullscreen = false
    t.window.fullscreentype = "desktop"
    t.window.vsync = 1
    t.window.msaa = 4
    t.window.display = 1
    t.window.highdpi = true
    t.window.usedpiscale = true
    t.window.x = nil
    t.window.y = nil
    
    -- Audio settings
    t.audio.mic = false
    t.audio.mixwithsystem = true
    
    -- Modules
    t.modules.audio = true
    t.modules.data = true
    t.modules.event = true
    t.modules.font = true
    t.modules.graphics = true
    t.modules.image = true
    t.modules.joystick = true
    t.modules.keyboard = true
    t.modules.math = true
    t.modules.mouse = true
    t.modules.physics = true
    t.modules.sound = true
    t.modules.system = true
    t.modules.thread = true
    t.modules.timer = true
    t.modules.touch = true
    t.modules.video = false
    t.modules.window = true
    
    -- Performance settings
    t.window.depth = nil
    t.window.stencil = nil
    
    -- Development settings
    t.console = false
    t.accelerometerjoystick = true
    t.gammacorrect = false
    
    -- Identity for save data
    t.identity = "partywall_multiplayer_canvas"
    t.appendidentity = false
    t.externalstorage = false
    
    -- Release settings
    t.releases = false
end
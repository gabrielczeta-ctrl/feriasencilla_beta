// LLM Instruction Queue System for D&D Game Commands
import { Character } from '../types/dnd';

export interface GameCommand {
  id: string;
  type: 'dm_action' | 'player_action' | 'system_action' | 'meta_command';
  command: string;
  description: string;
  parameters?: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  playerId?: string;
  characterId?: string;
  timestamp: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface QueuedInstruction {
  id: string;
  instruction: string;
  context: {
    currentScene: string;
    characters: Character[];
    recentActions: string[];
    gameState: any;
  };
  priority: number; // 0-10, higher is more important
  timestamp: number;
  executedAt?: number;
  result?: string;
}

export class CommandQueue {
  private commands: GameCommand[] = [];
  private instructions: QueuedInstruction[] = [];
  private processing: boolean = false;
  private maxQueueSize: number = 100;
  private listeners: ((commands: GameCommand[]) => void)[] = [];

  // Add a command to the queue
  addCommand(command: Omit<GameCommand, 'id' | 'timestamp' | 'status'>): string {
    const id = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newCommand: GameCommand = {
      ...command,
      id,
      timestamp: Date.now(),
      status: 'queued'
    };

    // Insert based on priority
    const priorityMap = { urgent: 4, high: 3, normal: 2, low: 1 };
    const priority = priorityMap[command.priority];
    
    let insertIndex = this.commands.length;
    for (let i = 0; i < this.commands.length; i++) {
      if (priorityMap[this.commands[i].priority] < priority) {
        insertIndex = i;
        break;
      }
    }

    this.commands.splice(insertIndex, 0, newCommand);
    this.trimQueue();
    this.notifyListeners();
    
    console.log(`📋 Queued command: ${command.command} (${command.priority} priority)`);
    return id;
  }

  // Add an LLM instruction to the queue
  addInstruction(instruction: string, context: QueuedInstruction['context'], priority: number = 5): string {
    const id = `inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newInstruction: QueuedInstruction = {
      id,
      instruction,
      context,
      priority: Math.max(0, Math.min(10, priority)),
      timestamp: Date.now()
    };

    // Insert based on priority
    let insertIndex = this.instructions.length;
    for (let i = 0; i < this.instructions.length; i++) {
      if (this.instructions[i].priority < priority) {
        insertIndex = i;
        break;
      }
    }

    this.instructions.splice(insertIndex, 0, newInstruction);
    this.trimInstructionQueue();
    
    console.log(`🧠 Queued LLM instruction: "${instruction}" (priority ${priority})`);
    return id;
  }

  // Get next command to process
  getNextCommand(): GameCommand | null {
    return this.commands.find(cmd => cmd.status === 'queued') || null;
  }

  // Get next instruction to process
  getNextInstruction(): QueuedInstruction | null {
    return this.instructions.find(inst => !inst.executedAt) || null;
  }

  // Update command status
  updateCommand(id: string, status: GameCommand['status'], result?: any, error?: string): void {
    const command = this.commands.find(cmd => cmd.id === id);
    if (command) {
      command.status = status;
      if (result !== undefined) command.result = result;
      if (error) command.error = error;
      this.notifyListeners();
      console.log(`📋 Command ${id} status: ${status}`);
    }
  }

  // Mark instruction as executed
  executeInstruction(id: string, result: string): void {
    const instruction = this.instructions.find(inst => inst.id === id);
    if (instruction) {
      instruction.executedAt = Date.now();
      instruction.result = result;
      console.log(`🧠 Executed instruction ${id}: ${result.substring(0, 100)}...`);
    }
  }

  // Get all commands
  getAllCommands(): GameCommand[] {
    return [...this.commands];
  }

  // Get all instructions
  getAllInstructions(): QueuedInstruction[] {
    return [...this.instructions];
  }

  // Get pending commands count
  getPendingCount(): number {
    return this.commands.filter(cmd => cmd.status === 'queued').length;
  }

  // Get pending instructions count
  getPendingInstructionsCount(): number {
    return this.instructions.filter(inst => !inst.executedAt).length;
  }

  // Clear completed commands
  clearCompleted(): void {
    this.commands = this.commands.filter(cmd => cmd.status !== 'completed');
    this.instructions = this.instructions.filter(inst => !inst.executedAt || Date.now() - inst.executedAt! < 300000); // Keep for 5 minutes
    this.notifyListeners();
  }

  // Subscribe to queue changes
  subscribe(listener: (commands: GameCommand[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private trimQueue(): void {
    if (this.commands.length > this.maxQueueSize) {
      // Remove oldest completed commands first
      const completed = this.commands.filter(cmd => cmd.status === 'completed');
      const others = this.commands.filter(cmd => cmd.status !== 'completed');
      
      completed.sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = Math.max(0, this.commands.length - this.maxQueueSize);
      
      this.commands = [...others, ...completed.slice(toRemove)];
    }
  }

  private trimInstructionQueue(): void {
    if (this.instructions.length > this.maxQueueSize) {
      // Remove oldest executed instructions
      const executed = this.instructions.filter(inst => inst.executedAt);
      const pending = this.instructions.filter(inst => !inst.executedAt);
      
      executed.sort((a, b) => (a.executedAt || 0) - (b.executedAt || 0));
      const toRemove = Math.max(0, this.instructions.length - this.maxQueueSize);
      
      this.instructions = [...pending, ...executed.slice(toRemove)];
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener([...this.commands]));
  }

  // Quick command builders
  static buildDMAction(action: string, description: string, parameters?: any): Omit<GameCommand, 'id' | 'timestamp' | 'status'> {
    return {
      type: 'dm_action',
      command: action,
      description,
      parameters,
      priority: 'normal'
    };
  }

  static buildPlayerAction(playerId: string, action: string, description: string): Omit<GameCommand, 'id' | 'timestamp' | 'status'> {
    return {
      type: 'player_action',
      command: action,
      description,
      playerId,
      priority: 'normal'
    };
  }

  static buildSystemAction(action: string, description: string, priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'): Omit<GameCommand, 'id' | 'timestamp' | 'status'> {
    return {
      type: 'system_action',
      command: action,
      description,
      priority
    };
  }

  static buildMetaCommand(command: string, description: string, priority: 'low' | 'normal' | 'high' | 'urgent' = 'high'): Omit<GameCommand, 'id' | 'timestamp' | 'status'> {
    return {
      type: 'meta_command',
      command,
      description,
      priority
    };
  }
}

// Singleton instance
export const globalCommandQueue = new CommandQueue();

// Pre-built common commands
export const CommonCommands = {
  // DM Actions
  UPDATE_SCENE: (newScene: string) => CommandQueue.buildDMAction(
    'update_scene', 
    `Update current scene to: ${newScene}`,
    { scene: newScene }
  ),
  
  ADD_NPC: (npcName: string, description: string) => CommandQueue.buildDMAction(
    'add_npc',
    `Add NPC: ${npcName}`,
    { name: npcName, description }
  ),

  ROLL_INITIATIVE: () => CommandQueue.buildDMAction(
    'roll_initiative',
    'Roll initiative for all participants',
    {}
  ),

  // System Actions
  HEAL_PARTY: (amount: number) => CommandQueue.buildSystemAction(
    'heal_party',
    `Heal all party members for ${amount} HP`,
    'normal'
  ),

  UPDATE_WEATHER: (weather: string) => CommandQueue.buildSystemAction(
    'update_weather',
    `Change weather to: ${weather}`,
    'low'
  ),

  // Meta Commands
  SAVE_GAME: () => CommandQueue.buildMetaCommand(
    'save_game',
    'Save current game state',
    'high'
  ),

  GENERATE_LOOT: (context: string) => CommandQueue.buildDMAction(
    'generate_loot',
    `Generate contextual loot: ${context}`,
    { context }
  )
};

// Command execution helper
export class CommandExecutor {
  constructor(private queue: CommandQueue) {}

  async processNext(): Promise<boolean> {
    const command = this.queue.getNextCommand();
    if (!command) return false;

    this.queue.updateCommand(command.id, 'processing');

    try {
      const result = await this.executeCommand(command);
      this.queue.updateCommand(command.id, 'completed', result);
      return true;
    } catch (error) {
      this.queue.updateCommand(command.id, 'failed', null, error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  private async executeCommand(command: GameCommand): Promise<any> {
    console.log(`⚡ Executing command: ${command.command}`);
    
    // This would integrate with your game engine
    switch (command.type) {
      case 'dm_action':
        return this.executeDMAction(command);
      case 'player_action':
        return this.executePlayerAction(command);
      case 'system_action':
        return this.executeSystemAction(command);
      case 'meta_command':
        return this.executeMetaCommand(command);
      default:
        throw new Error(`Unknown command type: ${command.type}`);
    }
  }

  private async executeDMAction(command: GameCommand): Promise<any> {
    // Integrate with your DM system
    console.log(`🎭 DM Action: ${command.command}`, command.parameters);
    return { success: true, message: `DM executed: ${command.command}` };
  }

  private async executePlayerAction(command: GameCommand): Promise<any> {
    // Integrate with your player action system
    console.log(`🎮 Player Action: ${command.command} by ${command.playerId}`);
    return { success: true, message: `Player executed: ${command.command}` };
  }

  private async executeSystemAction(command: GameCommand): Promise<any> {
    // Integrate with your game system
    console.log(`⚙️ System Action: ${command.command}`);
    return { success: true, message: `System executed: ${command.command}` };
  }

  private async executeMetaCommand(command: GameCommand): Promise<any> {
    // Integrate with your meta game system
    console.log(`🔧 Meta Command: ${command.command}`);
    return { success: true, message: `Meta executed: ${command.command}` };
  }
}
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export class ClaudeDM {
  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('⚠️  ANTHROPIC_API_KEY not set - DM will use fallback responses');
    }
  }

  // Generate initial campaign story when room is created
  async generateCampaignStory(campaignDescription, roomName) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return this.getFallbackCampaignStory(campaignDescription, roomName);
    }

    try {
      const prompt = `You are a skilled Dungeon Master creating an engaging D&D campaign. 

Campaign: "${roomName}"
Description: "${campaignDescription}"

Create an immersive starting scenario with:
1. A vivid scene description (2-3 sentences)
2. The current location name  
3. 3-4 available actions players can take
4. 1-2 interesting NPCs present
5. A hint of adventure to come

Response format (JSON):
{
  "sceneDescription": "...",
  "location": "...",
  "availableActions": ["...", "...", "..."],
  "npcs": [{"name": "...", "description": "...", "personality": "friendly/gruff/mysterious"}],
  "questHook": "..."
}

Keep it concise but engaging!`;

      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const storyData = JSON.parse(jsonMatch[0]);
        console.log('🎭 Claude generated campaign story for:', roomName);
        return storyData;
      } else {
        throw new Error('Invalid JSON response from Claude');
      }

    } catch (error) {
      console.error('❌ Claude DM error:', error.message);
      return this.getFallbackCampaignStory(campaignDescription, roomName);
    }
  }

  // Process player actions with Claude
  async processPlayerAction(context) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return null; // Don't send fallback responses
    }

    try {
      const { playerInput, currentScene, players, gameState, roomId, actingPlayer } = context;
      
      // Validate action against character equipment and abilities
      const validationResult = this.validatePlayerAction(playerInput, actingPlayer);
      if (!validationResult.valid) {
        return {
          narration: validationResult.reason,
          sceneUpdate: {
            availableActions: this.getSuggestedActions(actingPlayer)
          }
        };
      }
      
      // Build comprehensive context
      const sceneContext = this.buildSceneContext(gameState);
      const playerContext = this.buildPlayerContext(actingPlayer, players);
      const actionType = this.analyzeActionType(playerInput);
      const diceRoll = this.shouldRollDice(actionType, playerInput, actingPlayer.character);

      const prompt = `You are a skilled D&D 5e Dungeon Master. Respond to player actions with rich narrative and consistent world-building.

CRITICAL: Never repeat previous responses. Always advance the story. Track NPCs and locations consistently.

=== CURRENT GAME STATE ===
Location: ${gameState.story?.location || 'Unknown'}
Scene: ${gameState.story?.sceneDescription || 'A mysterious place'}
Available Actions: ${gameState.story?.availableActions?.join(', ') || 'Explore'}

Active NPCs:
${gameState.story?.npcs?.map(npc => `- ${npc.name}: ${npc.description} (${npc.personality})`).join('\n') || 'None'}

=== ACTING PLAYER ===
${playerContext}

=== RECENT STORY CONTEXT ===
${sceneContext}

=== PLAYER ACTION ===
"${playerInput}"
${diceRoll.required ? `DICE REQUIRED: ${diceRoll.type} (DC ${diceRoll.difficulty})` : ''}

=== INSTRUCTIONS ===
1. Provide immediate consequences of the action
2. Advance the narrative meaningfully - NO REPETITION
3. If combat/conflict: be decisive with outcomes  
4. Track NPCs consistently (names, personalities, relationships)
5. Create new developments, don't loop conversations
6. If the player is being disruptive: use creative consequences

Response format (valid JSON only):
{
  "narration": "Immediate vivid description of what happens (2-3 sentences max)",
  "sceneUpdate": {
    "location": "${gameState.story?.location}",
    "description": "Updated scene if changed",
    "availableActions": ["specific action 1", "specific action 2", "specific action 3"],
    "newDevelopment": "Major story progression if any"
  },
  "npcResponse": {
    "npcName": "Specific NPC name",
    "dialogue": "Direct speech response",
    "action": "What the NPC does physically"
  },
  "consequences": {
    "immediate": "What happens right now",
    "ongoing": "Lasting effects on world/relationships"
  },
  "diceRoll": ${JSON.stringify(diceRoll)},
  "storyProgression": "How this moves the adventure forward"
}`;

      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        temperature: 0.8,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const actionResult = JSON.parse(jsonMatch[0]);
        console.log(`🎲 Claude processed: ${playerInput.slice(0, 50)}... -> ${actionResult.narration?.slice(0, 50)}...`);
        return actionResult;
      } else {
        console.warn('⚠️ Claude returned non-JSON response:', content);
        throw new Error('Invalid JSON response from Claude');
      }

    } catch (error) {
      console.error('❌ Claude action processing error:', error.message);
      return this.getFallbackActionResponse(context);
    }
  }

  // Analyze what type of action the player is attempting
  analyzeActionType(input) {
    const action = input.toLowerCase();
    if (action.includes('attack') || action.includes('hit') || action.includes('fight') || action.includes('kill')) return 'combat';
    if (action.includes('talk') || action.includes('say') || action.includes('ask') || action.includes('tell')) return 'social';
    if (action.includes('search') || action.includes('look') || action.includes('examine') || action.includes('investigate')) return 'investigation';
    if (action.includes('sneak') || action.includes('hide') || action.includes('stealth')) return 'stealth';
    if (action.includes('climb') || action.includes('jump') || action.includes('run') || action.includes('swim')) return 'athletics';
    if (action.includes('cast') || action.includes('spell') || action.includes('magic')) return 'magic';
    return 'general';
  }

  // Enhanced dice roll determination - ALL actions should have dice rolls with proper stat modifiers
  shouldRollDice(actionType, input, character) {
    const action = input.toLowerCase();
    let diceRoll = { required: true, difficulty: 12, dice: '1d20' }; // Default for all actions
    
    // Combat actions
    if (actionType === 'combat' || action.includes('attack') || action.includes('fight') || action.includes('hit')) {
      diceRoll.type = 'attack_roll';
      diceRoll.difficulty = 15;
      diceRoll.modifier = this.getStatModifier(character?.stats?.strength || 10);
      diceRoll.dice = `1d20+${diceRoll.modifier}`;
    }
    // Athletics (Strength)
    else if (actionType === 'athletics' || action.includes('climb') || action.includes('jump') || action.includes('lift') || action.includes('break')) {
      diceRoll.type = 'strength_check';
      diceRoll.difficulty = 13;
      diceRoll.modifier = this.getStatModifier(character?.stats?.strength || 10);
      diceRoll.dice = `1d20+${diceRoll.modifier}`;
    }
    // Stealth/Acrobatics (Dexterity)
    else if (actionType === 'stealth' || action.includes('sneak') || action.includes('hide') || action.includes('dodge') || action.includes('balance')) {
      diceRoll.type = 'dexterity_check';
      diceRoll.difficulty = 13;
      diceRoll.modifier = this.getStatModifier(character?.stats?.dexterity || 10);
      diceRoll.dice = `1d20+${diceRoll.modifier}`;
    }
    // Investigation/Knowledge (Intelligence)
    else if (actionType === 'investigation' || action.includes('search') || action.includes('examine') || action.includes('study') || action.includes('analyze')) {
      diceRoll.type = 'intelligence_check';
      diceRoll.difficulty = 12;
      diceRoll.modifier = this.getStatModifier(character?.stats?.intelligence || 10);
      diceRoll.dice = `1d20+${diceRoll.modifier}`;
    }
    // Perception/Insight (Wisdom)
    else if (action.includes('listen') || action.includes('look') || action.includes('notice') || action.includes('sense') || action.includes('intuition')) {
      diceRoll.type = 'wisdom_check';
      diceRoll.difficulty = 12;
      diceRoll.modifier = this.getStatModifier(character?.stats?.wisdom || 10);
      diceRoll.dice = `1d20+${diceRoll.modifier}`;
    }
    // Social interactions (Charisma)
    else if (actionType === 'social' || action.includes('talk') || action.includes('persuade') || action.includes('intimidate') || action.includes('deceive')) {
      diceRoll.type = 'charisma_check';
      diceRoll.difficulty = 12;
      diceRoll.modifier = this.getStatModifier(character?.stats?.charisma || 10);
      diceRoll.dice = `1d20+${diceRoll.modifier}`;
    }
    // Magic actions
    else if (actionType === 'magic' || action.includes('cast') || action.includes('spell') || action.includes('magic')) {
      // Use Intelligence for Wizards, Charisma for Sorcerers/Warlocks, Wisdom for Clerics/Druids
      const spellcastingStat = this.getSpellcastingStat(character?.class || 'Fighter');
      diceRoll.type = 'spell_attack';
      diceRoll.difficulty = 14;
      diceRoll.modifier = this.getStatModifier(character?.stats?.[spellcastingStat] || 10);
      diceRoll.dice = `1d20+${diceRoll.modifier}`;
    }
    // General actions
    else {
      diceRoll.type = 'general_check';
      diceRoll.difficulty = 11;
      // Use most relevant stat for the action, default to strongest stat
      const relevantStat = this.getBestStatForAction(action, character?.stats);
      diceRoll.modifier = this.getStatModifier(relevantStat);
      diceRoll.dice = `1d20+${diceRoll.modifier}`;
    }
    
    return diceRoll;
  }

  // Calculate D&D 5e stat modifier
  getStatModifier(statValue) {
    return Math.floor((statValue - 10) / 2);
  }

  // Get spellcasting stat for different classes
  getSpellcastingStat(characterClass) {
    const spellcastingStats = {
      'Wizard': 'intelligence',
      'Sorcerer': 'charisma', 
      'Warlock': 'charisma',
      'Bard': 'charisma',
      'Cleric': 'wisdom',
      'Druid': 'wisdom',
      'Ranger': 'wisdom',
      'Paladin': 'charisma'
    };
    return spellcastingStats[characterClass] || 'intelligence';
  }

  // Get the best stat for a general action
  getBestStatForAction(action, stats) {
    if (!stats) return 10;
    
    const statValues = Object.values(stats);
    const highestStat = Math.max(...statValues);
    
    // Find which stat has the highest value
    for (const [statName, value] of Object.entries(stats)) {
      if (value === highestStat) {
        return value;
      }
    }
    
    return 10; // fallback
  }

  // Build scene context from recent actions
  buildSceneContext(gameState) {
    const recentMessages = gameState.chatLog?.slice(-8) || [];
    return recentMessages.map(msg => `${msg.playerName}: ${msg.content}`).join('\n');
  }

  // Build player context including character info
  buildPlayerContext(actingPlayer, allPlayers) {
    if (!actingPlayer) return 'Unknown adventurer';
    
    const character = actingPlayer.character;
    if (!character) return `${actingPlayer.name} (no character sheet)`;
    
    return `${character.name} (${character.race} ${character.class}, Level ${character.level})
Stats: STR ${character.stats?.strength || 10}, DEX ${character.stats?.dexterity || 10}, CON ${character.stats?.constitution || 10}
HP: ${character.hitPoints?.current || 10}/${character.hitPoints?.maximum || 10}
Background: ${character.backstory || 'Unknown'}`;
  }

  // Incorporate dice results into the narrative
  async incorporateDiceResult(context) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return context.originalNarration + ` (Rolled ${context.diceResult.roll} - ${context.diceResult.success ? 'Success!' : 'Failed!'})`;
    }

    try {
      const { diceResult, originalAction, originalNarration, playerInput } = context;
      
      const prompt = `You are a D&D Dungeon Master. A player attempted an action that required a dice roll.

ORIGINAL ACTION: "${originalAction}"
DICE ROLL RESULT: ${diceResult.roll} vs DC ${diceResult.difficulty} (${diceResult.type}) - ${diceResult.success ? 'SUCCESS' : 'FAILURE'}
ORIGINAL NARRATION: "${originalNarration}"

Rewrite the narration to seamlessly incorporate the dice result. The success/failure should determine the outcome naturally.

Rules:
- If SUCCESS: The action succeeds, perhaps even better than expected
- If FAILURE: The action fails, with interesting consequences or complications
- Make the dice roll feel natural, not mechanical
- Keep the same tone and style as the original narration
- Don't mention dice numbers explicitly - focus on the outcome

Response format (JSON):
{
  "narration": "Rewritten narrative that incorporates the success/failure naturally",
  "consequences": {
    "immediate": "What happens right now due to success/failure",
    "ongoing": "Lasting effects if any"
  }
}`;

      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 300,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          ...context,
          narration: result.narration,
          consequences: result.consequences
        };
      } else {
        throw new Error('Invalid JSON response from Claude');
      }

    } catch (error) {
      console.error('❌ Claude dice incorporation error:', error.message);
      // Fallback: append dice result to original narration
      const resultText = context.diceResult.success ? 
        'The attempt succeeds admirably!' : 
        'Unfortunately, the attempt doesn\'t go as planned.';
      
      return {
        ...context,
        narration: `${context.originalNarration} ${resultText}`
      };
    }
  }

  // Fallback responses when Claude API is unavailable
  getFallbackCampaignStory(description, roomName) {
    const scenarios = [
      {
        sceneDescription: "You find yourselves at the entrance of a weathered tavern called 'The Prancing Pony'. Warm light spills from its windows, and you can hear the murmur of conversation and clinking of mugs within.",
        location: "The Prancing Pony Tavern",
        availableActions: ["Enter the tavern", "Examine the surroundings", "Talk to locals outside", "Check the notice board"],
        npcs: [{"name": "Gareth", "description": "A friendly bartender with graying hair", "personality": "friendly"}],
        questHook: "Strange rumors have been circulating about mysterious disappearances in the nearby forest..."
      },
      {
        sceneDescription: "The morning mist clings to the cobblestone streets of Millhaven as you emerge from your rest. Market vendors are setting up their stalls, and guards patrol with worried expressions.",
        location: "Millhaven Town Square",
        availableActions: ["Visit the market", "Speak with the guards", "Explore the town hall", "Head to the outskirts"],
        npcs: [{"name": "Captain Morris", "description": "A stern-faced town guard", "personality": "gruff"}],
        questHook: "The town seems to be preparing for something... or defending against it."
      }
    ];
    
    return scenarios[Math.floor(Math.random() * scenarios.length)];
  }

  // Validate player actions against their equipment and abilities
  validatePlayerAction(playerInput, actingPlayer) {
    if (!actingPlayer?.character) {
      return { valid: false, reason: "You need to create a character first!" };
    }

    const character = actingPlayer.character;
    const action = playerInput.toLowerCase();
    
    // Check for weapon-specific actions
    if (action.includes('shoot') || action.includes('fire') || action.includes('revolver') || action.includes('gun')) {
      const hasRangedWeapon = character.equipment?.some(item => 
        item.type === 'weapon' && (
          item.name.toLowerCase().includes('bow') ||
          item.name.toLowerCase().includes('crossbow') ||
          item.name.toLowerCase().includes('gun') ||
          item.name.toLowerCase().includes('pistol') ||
          item.name.toLowerCase().includes('revolver')
        )
      );
      
      if (!hasRangedWeapon) {
        return { 
          valid: false, 
          reason: `${character.name} doesn't have any ranged weapons! You have: ${this.getEquipmentList(character.equipment)}` 
        };
      }
    }
    
    // Check for spell actions
    if (action.includes('cast') || action.includes('spell') || action.includes('magic')) {
      const canCastSpells = ['Wizard', 'Sorcerer', 'Warlock', 'Cleric', 'Druid', 'Bard', 'Paladin', 'Ranger'].includes(character.class);
      if (!canCastSpells) {
        return { 
          valid: false, 
          reason: `${character.name} (${character.class}) cannot cast spells! Try using your class abilities instead.` 
        };
      }
    }
    
    return { valid: true };
  }

  // Get equipment list for error messages
  getEquipmentList(equipment) {
    if (!equipment || equipment.length === 0) {
      return "no equipment";
    }
    return equipment.map(item => item.name).join(', ');
  }

  // Suggest actions based on character abilities
  getSuggestedActions(actingPlayer) {
    if (!actingPlayer?.character) {
      return ["Create a character", "Look around", "Talk to others"];
    }

    const character = actingPlayer.character;
    const suggestions = ["Look around", "Talk to NPCs"];
    
    // Add class-specific suggestions
    const classActions = {
      'Fighter': ['Attack with weapon', 'Defend', 'Use combat maneuver'],
      'Wizard': ['Cast a spell', 'Study surroundings', 'Identify magical items'],
      'Rogue': ['Sneak', 'Search for traps', 'Pick locks', 'Steal'],
      'Cleric': ['Cast healing spell', 'Turn undead', 'Pray for guidance'],
      'Barbarian': ['Rage', 'Intimidate', 'Break things'],
      'Ranger': ['Track', 'Shoot bow', 'Commune with nature'],
      'Paladin': ['Smite evil', 'Lay on hands', 'Detect evil'],
      'Bard': ['Play music', 'Inspire allies', 'Tell stories'],
      'Sorcerer': ['Cast spell', 'Use metamagic', 'Wild magic surge'],
      'Warlock': ['Cast eldritch blast', 'Use patron power', 'Make pact'],
      'Druid': ['Wild shape', 'Cast nature spell', 'Talk to animals'],
      'Monk': ['Use martial arts', 'Meditate', 'Use ki power']
    };
    
    if (classActions[character.class]) {
      suggestions.push(...classActions[character.class].slice(0, 2));
    }
    
    // Add equipment-based suggestions
    if (character.equipment) {
      const weapons = character.equipment.filter(item => item.type === 'weapon');
      const tools = character.equipment.filter(item => item.type === 'tool');
      
      if (weapons.length > 0) {
        suggestions.push(`Use ${weapons[0].name}`);
      }
      if (tools.length > 0) {
        suggestions.push(`Use ${tools[0].name}`);
      }
    }
    
    return suggestions.slice(0, 4); // Return max 4 suggestions
  }

  getFallbackActionResponse(context) {
    // This should not be used anymore - return null to prevent generic responses
    return null;
  }
}
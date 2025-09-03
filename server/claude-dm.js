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
      return this.getFallbackActionResponse(context);
    }

    try {
      const { playerInput, currentScene, players, gameState, roomId, actingPlayer } = context;
      
      // Build comprehensive context
      const sceneContext = this.buildSceneContext(gameState);
      const playerContext = this.buildPlayerContext(actingPlayer, players);
      const actionType = this.analyzeActionType(playerInput);
      const diceRoll = this.shouldRollDice(actionType, playerInput);

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

  // Determine if a dice roll is needed
  shouldRollDice(actionType, input) {
    const action = input.toLowerCase();
    
    // Combat actions
    if (actionType === 'combat' || action.includes('attack')) {
      return { required: true, type: 'attack_roll', difficulty: 15, dice: '1d20' };
    }
    
    // Skill checks
    if (actionType === 'athletics') return { required: true, type: 'strength_check', difficulty: 12, dice: '1d20' };
    if (actionType === 'stealth') return { required: true, type: 'dexterity_check', difficulty: 13, dice: '1d20' };
    if (actionType === 'investigation') return { required: true, type: 'intelligence_check', difficulty: 12, dice: '1d20' };
    if (actionType === 'social') return { required: true, type: 'charisma_check', difficulty: 12, dice: '1d20' };
    
    // Dangerous or difficult actions
    if (action.includes('dangerous') || action.includes('difficult') || action.includes('risky')) {
      return { required: true, type: 'general_check', difficulty: 13, dice: '1d20' };
    }
    
    return { required: false };
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

  getFallbackActionResponse(context) {
    const responses = [
      {
        narration: `You ${context.playerInput.toLowerCase()}. The world around you shifts slightly in response to your actions.`,
        sceneUpdate: {
          availableActions: ["Continue exploring", "Look around carefully", "Talk to someone", "Rest and observe"]
        }
      },
      {
        narration: `Your action draws the attention of nearby NPCs. Something interesting might happen next...`,
        sceneUpdate: {
          availableActions: ["Wait and see", "Take initiative", "Ask questions", "Prepare for anything"]
        }
      }
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }
}
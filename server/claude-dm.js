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
      const { playerInput, currentScene, players, gameState, roomId } = context;
      
      const prompt = `You are an expert D&D Dungeon Master running a live game.

CURRENT SCENE: ${currentScene}
LOCATION: ${gameState.story?.location || 'Unknown'}
SCENE DESCRIPTION: ${gameState.story?.sceneDescription || 'A mysterious place'}

PLAYERS: ${players.map(p => p.name).join(', ')}
PLAYER ACTION: "${playerInput}"

RECENT CONTEXT: ${context.recentActions?.slice(-3).join('. ') || 'Game just started'}

Respond as the DM would, with:
1. A narrative response to the player's action
2. Any consequences or new developments
3. Updated scene if location changes
4. NPC dialogue if relevant

Response format (JSON):
{
  "narration": "What happens as a result of the action...",
  "sceneUpdate": {
    "location": "current location name",
    "description": "updated scene description if changed",
    "availableActions": ["new action 1", "new action 2", "..."]
  },
  "npcDialogue": {
    "npcName": "NPC Name",
    "dialogue": "What the NPC says"
  },
  "diceRoll": {
    "required": false,
    "type": "ability_check",
    "difficulty": 15
  }
}

Keep responses concise but vivid!`;

      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const actionResult = JSON.parse(jsonMatch[0]);
        console.log('🎲 Claude processed action for room:', roomId);
        return actionResult;
      } else {
        throw new Error('Invalid JSON response from Claude');
      }

    } catch (error) {
      console.error('❌ Claude action processing error:', error.message);
      return this.getFallbackActionResponse(context);
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
// Guest mode animal critter characters
import { Character } from '../types/dnd';

export interface AnimalCritter {
  name: string;
  species: string;
  emoji: string;
  personality: string;
  abilities: string[];
  speechPattern: {
    sounds: string[];
    frequency: number; // 0-1, how often to convert speech to animal sounds
  };
  stats: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
}

export const CRITTER_SPECIES = [
  {
    species: 'Forest Mouse',
    emoji: '🐭',
    sounds: ['squeak', 'chirp', 'eek', 'pip'],
    baseStats: { str: 6, dex: 16, con: 12, int: 8, wis: 14, cha: 10 },
    abilities: ['Nimble Escape', 'Keen Hearing', 'Small Size Advantage']
  },
  {
    species: 'Tavern Cat',
    emoji: '🐱',
    sounds: ['meow', 'purr', 'mrow', 'hiss'],
    baseStats: { str: 8, dex: 15, con: 13, int: 10, wis: 12, cha: 14 },
    abilities: ['Cat-like Reflexes', 'Night Vision', 'Stealth Master']
  },
  {
    species: 'Chirpy Sparrow',
    emoji: '🐦',
    sounds: ['chirp', 'tweet', 'pip', 'trill'],
    baseStats: { str: 4, dex: 18, con: 10, int: 12, wis: 16, cha: 12 },
    abilities: ['Flight', 'Keen Eyesight', 'Weather Sense']
  },
  {
    species: 'Garden Rabbit',
    emoji: '🐰',
    sounds: ['thump', 'sniff', 'wheek', 'chitter'],
    baseStats: { str: 10, dex: 14, con: 14, int: 8, wis: 15, cha: 11 },
    abilities: ['Powerful Legs', 'Burrow', 'Danger Sense']
  },
  {
    species: 'Wise Owl',
    emoji: '🦉',
    sounds: ['hoot', 'screech', 'who', 'whoo'],
    baseStats: { str: 12, dex: 13, con: 12, int: 16, wis: 18, cha: 10 },
    abilities: ['Silent Flight', 'Supernatural Wisdom', 'Night Hunter']
  },
  {
    species: 'Busy Squirrel',
    emoji: '🐿️',
    sounds: ['chatter', 'chittering', 'squeak', 'bark'],
    baseStats: { str: 8, dex: 16, con: 12, int: 11, wis: 13, cha: 12 },
    abilities: ['Tree Climbing', 'Acrobatic', 'Nut Storage']
  },
  {
    species: 'Pond Frog',
    emoji: '🐸',
    sounds: ['ribbit', 'croak', 'brek', 'glek'],
    baseStats: { str: 6, dex: 12, con: 16, int: 9, wis: 12, cha: 13 },
    abilities: ['Water Breathing', 'Jumping', 'Poison Resistance']
  },
  {
    species: 'Hedgehog',
    emoji: '🦔',
    sounds: ['snuffle', 'grunt', 'wheeze', 'click'],
    baseStats: { str: 9, dex: 11, con: 15, int: 10, wis: 14, cha: 8 },
    abilities: ['Spiky Defense', 'Curl Up', 'Insect Hunter']
  }
];

export const CRITTER_PERSONALITIES = [
  'Curious and always getting into trouble',
  'Wise beyond their tiny years',
  'Perpetually hungry and food-motivated',
  'Overly dramatic about everything',
  'Incredibly brave despite being tiny',
  'Loves shiny objects and treasures',
  'Always trying to help but often makes things worse',
  'Speaks in riddles and cryptic messages',
  'Obsessed with cleanliness and organization',
  'Sleepy and always looking for nap spots'
];

export function generateRandomCritter(playerName: string): Character {
  const species = CRITTER_SPECIES[Math.floor(Math.random() * CRITTER_SPECIES.length)];
  const personality = CRITTER_PERSONALITIES[Math.floor(Math.random() * CRITTER_PERSONALITIES.length)];
  
  // Add some randomization to base stats (±2)
  const stats = {
    strength: Math.max(3, Math.min(18, species.baseStats.str + Math.floor(Math.random() * 5) - 2)),
    dexterity: Math.max(3, Math.min(18, species.baseStats.dex + Math.floor(Math.random() * 5) - 2)),
    constitution: Math.max(3, Math.min(18, species.baseStats.con + Math.floor(Math.random() * 5) - 2)),
    intelligence: Math.max(3, Math.min(18, species.baseStats.int + Math.floor(Math.random() * 5) - 2)),
    wisdom: Math.max(3, Math.min(18, species.baseStats.wis + Math.floor(Math.random() * 5) - 2)),
    charisma: Math.max(3, Math.min(18, species.baseStats.cha + Math.floor(Math.random() * 5) - 2))
  };

  const maxHP = Math.max(4, Math.floor(stats.constitution / 2) + Math.floor(Math.random() * 6) + 1);

  return {
    id: `critter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: `${playerName} the ${species.species}`,
    race: species.species,
    class: 'Animal Critter',
    level: 1,
    playerId: '',
    stats,
    hitPoints: {
      current: maxHP,
      maximum: maxHP,
      temporary: 0
    },
    armorClass: 10 + Math.floor((stats.dexterity - 10) / 2),
    proficiencyBonus: 2,
    skills: {},
    equipment: [
      {
        id: 'tiny_courage',
        name: 'Tiny Courage',
        type: 'treasure',
        slot: 'inventory',
        description: 'The brave heart of a small creature',
        equipped: false,
        quantity: 1
      }
    ],
    backstory: `A ${species.species.toLowerCase()} who wandered into the tavern seeking adventure. ${personality}. Despite their small size, they possess the heart of a true hero. They communicate mostly through ${species.sounds.join(', ')}, but somehow other adventurers can understand their intent.`,
    notes: `🐾 GUEST CRITTER: Limited abilities, speech converted to animal sounds. Special abilities: ${species.abilities.join(', ')}.`,
    createdAt: Date.now()
  };
}

export function convertToAnimalSpeak(text: string, species: string): string {
  const speciesData = CRITTER_SPECIES.find(s => s.species === species);
  if (!speciesData || Math.random() > speciesData.sounds.length * 0.15) {
    return text; // Sometimes let normal speech through
  }

  // Convert words to animal sounds
  const words = text.split(' ');
  const animalWords = words.map(word => {
    if (Math.random() < 0.6) { // 60% chance to convert each word
      return speciesData.sounds[Math.floor(Math.random() * speciesData.sounds.length)];
    }
    return word;
  });

  return animalWords.join(' ');
}

export function isGuestCritter(character: Character | null): boolean {
  if (!character) return false;
  
  // Check if it's an Animal Critter class
  const isAnimalCritter = character.class === 'Animal Critter';
  
  // Check if race contains animal species names
  const isAnimalRace = character.race && typeof character.race === 'string' && (
    character.race.includes('Mouse') || character.race.includes('Cat') || 
    character.race.includes('Sparrow') || character.race.includes('Rabbit') || character.race.includes('Owl') ||
    character.race.includes('Squirrel') || character.race.includes('Frog') || character.race.includes('Hedgehog')
  );
  
  return isAnimalCritter || Boolean(isAnimalRace);
}
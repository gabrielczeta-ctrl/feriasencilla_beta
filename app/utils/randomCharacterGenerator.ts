// Random character generation for D&D 5e
import { Character, RACES, CLASSES, SKILLS, Race, Class, Skill } from '../types/dnd';

export interface CharacterTemplate {
  name: string;
  race: Race;
  class: Class;
  stats: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  backstory: string;
  skills: Record<string, boolean>;
}

const FANTASY_NAMES = [
  'Aerdrie', 'Ahvak', 'Aramil', 'Aranea', 'Berris', 'Cithreth', 'Dayereth', 'Enna', 'Galinndan', 'Hadarai',
  'Halimath', 'Heian', 'Himo', 'Immeral', 'Ivellios', 'Korfel', 'Lamlis', 'Laucian', 'Mindartis', 'Naal',
  'Nutae', 'Paelynn', 'Peren', 'Quarion', 'Riardon', 'Rolen', 'Silvyr', 'Suhnab', 'Thamior', 'Theriatis',
  'Therivaul', 'Thervan', 'Uthemar', 'Vanuath', 'Varis', 'Zara', 'Zephyr', 'Lyra', 'Kael', 'Ember',
  'Thorin', 'Gimli', 'Dain', 'Balin', 'Dwalin', 'Ori', 'Nori', 'Dori', 'Bifur', 'Bofur', 'Bombur',
  'Robin', 'Peregrin', 'Meriadoc', 'Frodo', 'Bilbo', 'Hamfast', 'Tolman', 'Bandobras', 'Isengrim', 'Fortinbras'
];

const BACKSTORIES = [
  "A wandering hero seeking adventure and glory in distant lands.",
  "An outcast from noble birth, trying to prove their worth through deeds.",
  "A former soldier who turned to adventure after the war ended.",
  "A scholar who left their books to experience the world firsthand.",
  "A merchant's child who chose the sword over the ledger.",
  "An orphan raised by a secretive organization with mysterious goals.",
  "A religious devotee on a sacred quest to fulfill an ancient prophecy.",
  "A survivalist from the wilderness seeking civilization's mysteries.",
  "A reformed criminal trying to make amends for past misdeeds.",
  "A curious soul driven by an insatiable thirst for knowledge and discovery.",
  "A protector of the innocent, sworn to defend those who cannot defend themselves.",
  "A seeker of lost treasures and forgotten secrets of the ancient world.",
  "A wanderer cursed to never stay in one place for too long.",
  "An exile who must complete a great quest to return home with honor.",
  "A chosen one marked by destiny, though they may not know it yet."
];

// Class-based stat priorities for better character builds
const CLASS_STAT_PRIORITIES: Record<Class, { primary: string[]; secondary: string[] }> = {
  'Barbarian': { primary: ['strength', 'constitution'], secondary: ['dexterity', 'wisdom'] },
  'Bard': { primary: ['charisma'], secondary: ['dexterity', 'constitution', 'wisdom'] },
  'Cleric': { primary: ['wisdom'], secondary: ['strength', 'constitution', 'charisma'] },
  'Druid': { primary: ['wisdom'], secondary: ['constitution', 'dexterity'] },
  'Fighter': { primary: ['strength'], secondary: ['constitution', 'dexterity'] },
  'Monk': { primary: ['dexterity', 'wisdom'], secondary: ['constitution', 'strength'] },
  'Paladin': { primary: ['strength', 'charisma'], secondary: ['constitution', 'wisdom'] },
  'Ranger': { primary: ['dexterity', 'wisdom'], secondary: ['constitution', 'strength'] },
  'Rogue': { primary: ['dexterity'], secondary: ['constitution', 'wisdom', 'charisma'] },
  'Sorcerer': { primary: ['charisma'], secondary: ['constitution', 'dexterity'] },
  'Warlock': { primary: ['charisma'], secondary: ['constitution', 'dexterity'] },
  'Wizard': { primary: ['intelligence'], secondary: ['constitution', 'dexterity'] }
};

// Race stat bonuses
const RACIAL_BONUSES: Record<Race, { [key: string]: number }> = {
  'Human': { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 },
  'Elf': { dexterity: 2, intelligence: 1 },
  'Dwarf': { constitution: 2, strength: 2 },
  'Halfling': { dexterity: 2, charisma: 1 },
  'Dragonborn': { strength: 2, charisma: 1 },
  'Gnome': { intelligence: 2, constitution: 1 },
  'Half-Elf': { charisma: 2, dexterity: 1, constitution: 1 },
  'Half-Orc': { strength: 2, constitution: 1 },
  'Tiefling': { charisma: 2, intelligence: 1 }
};

function rollAbilityScore(): number {
  // 4d6, drop lowest
  const rolls = Array.from({length: 4}, () => Math.floor(Math.random() * 6) + 1);
  rolls.sort((a, b) => b - a);
  return rolls.slice(0, 3).reduce((sum, roll) => sum + roll, 0);
}

function generateRandomStats(characterClass: Class): { [key: string]: number } {
  const baseStats = {
    strength: rollAbilityScore(),
    dexterity: rollAbilityScore(),
    constitution: rollAbilityScore(),
    intelligence: rollAbilityScore(),
    wisdom: rollAbilityScore(),
    charisma: rollAbilityScore()
  };

  // Get the priorities for this class
  const priorities = CLASS_STAT_PRIORITIES[characterClass];
  const statArray = Object.entries(baseStats).sort(([,a], [,b]) => b - a);
  
  // Assign highest stats to primary abilities
  const optimizedStats: { [key: string]: number } = {};
  
  // Assign the best stats to primary abilities
  let statIndex = 0;
  for (const primaryStat of priorities.primary) {
    if (statIndex < statArray.length) {
      optimizedStats[primaryStat] = statArray[statIndex][1];
      statIndex++;
    }
  }
  
  // Assign next best to secondary abilities
  for (const secondaryStat of priorities.secondary) {
    if (!optimizedStats[secondaryStat] && statIndex < statArray.length) {
      optimizedStats[secondaryStat] = statArray[statIndex][1];
      statIndex++;
    }
  }
  
  // Fill in remaining stats
  for (const [stat, value] of statArray) {
    if (!optimizedStats[stat]) {
      optimizedStats[stat] = value;
    }
  }

  return optimizedStats;
}

function generateRandomSkills(characterClass: Class, stats: { [key: string]: number }): Record<string, boolean> {
  const classSkillOptions: Record<Class, Skill[]> = {
    'Barbarian': ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'],
    'Bard': ['Deception', 'History', 'Investigation', 'Persuasion', 'Performance', 'Sleight of Hand'],
    'Cleric': ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'],
    'Druid': ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'],
    'Fighter': ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'],
    'Monk': ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'],
    'Paladin': ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'],
    'Ranger': ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'],
    'Rogue': ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'],
    'Sorcerer': ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'],
    'Warlock': ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'],
    'Wizard': ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion']
  };

  const availableSkills = classSkillOptions[characterClass] || [];
  const selectedSkills: Record<string, boolean> = {};
  
  // Select 2-4 random skills from class options
  const numSkills = Math.floor(Math.random() * 3) + 2; // 2-4 skills
  const shuffled = [...availableSkills].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < Math.min(numSkills, shuffled.length); i++) {
    selectedSkills[shuffled[i]] = true;
  }

  return selectedSkills;
}

export function generateRandomCharacter(): CharacterTemplate {
  const name = FANTASY_NAMES[Math.floor(Math.random() * FANTASY_NAMES.length)];
  const race = RACES[Math.floor(Math.random() * RACES.length)] as Race;
  const characterClass = CLASSES[Math.floor(Math.random() * CLASSES.length)] as Class;
  const backstory = BACKSTORIES[Math.floor(Math.random() * BACKSTORIES.length)];
  
  // Generate base stats
  let baseStats = generateRandomStats(characterClass);
  
  // Apply racial bonuses
  const racialBonuses = RACIAL_BONUSES[race] || {};
  Object.entries(racialBonuses).forEach(([stat, bonus]) => {
    if (baseStats[stat]) {
      baseStats[stat] = Math.min(20, baseStats[stat] + bonus); // Cap at 20
    }
  });

  const skills = generateRandomSkills(characterClass, baseStats);

  return {
    name,
    race,
    class: characterClass,
    stats: {
      strength: baseStats.strength || 10,
      dexterity: baseStats.dexterity || 10,
      constitution: baseStats.constitution || 10,
      intelligence: baseStats.intelligence || 10,
      wisdom: baseStats.wisdom || 10,
      charisma: baseStats.charisma || 10
    },
    backstory: `${backstory} Born as a ${race.toLowerCase()}, ${name} discovered a calling as a ${characterClass.toLowerCase()} and now seeks their destiny in the wider world.`,
    skills
  };
}

export function convertTemplateToCharacter(template: CharacterTemplate, playerId: string): Character {
  const constitution = template.stats.constitution;
  const maxHP = Math.max(1, Math.floor((constitution - 10) / 2) + 8 + Math.floor(Math.random() * 6)); // Class hit die varies, using average

  return {
    id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: template.name,
    race: template.race,
    class: template.class,
    level: 1,
    playerId,
    stats: template.stats,
    hitPoints: {
      current: maxHP,
      maximum: maxHP,
      temporary: 0
    },
    armorClass: 10 + Math.floor((template.stats.dexterity - 10) / 2),
    proficiencyBonus: 2,
    skills: template.skills,
    equipment: [
      {
        id: 'starting_weapon',
        name: 'Starting Weapon',
        type: 'weapon',
        slot: 'mainhand',
        description: 'A basic weapon suited to your class',
        equipped: true,
        quantity: 1
      },
      {
        id: 'starting_armor',
        name: 'Starting Armor',
        type: 'armor',
        slot: 'inventory',
        description: 'Basic protective gear',
        equipped: false,
        quantity: 1
      }
    ],
    backstory: template.backstory,
    notes: '🎲 Randomly generated character',
    createdAt: Date.now()
  };
}
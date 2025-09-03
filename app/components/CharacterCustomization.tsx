"use client";

import React, { useState, useEffect } from 'react';
import { Character, Equipment } from '../types/dnd';

interface CharacterCustomizationProps {
  character: Character;
  onComplete: (customizedCharacter: Character) => void;
  onCancel?: () => void;
}

interface StartingEquipment {
  weapons: string[];
  armor: string[];
  tools: string[];
  miscItems: string[];
}

interface CharacterTraits {
  positive: string[];
  negative: string[];
  quirks: string[];
}

export default function CharacterCustomization({ character, onComplete, onCancel }: CharacterCustomizationProps) {
  const [equipment, setEquipment] = useState<StartingEquipment>({
    weapons: [],
    armor: [],
    tools: [],
    miscItems: []
  });
  const [traits, setTraits] = useState<CharacterTraits>({
    positive: [],
    negative: [],
    quirks: []
  });
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [selectedTraits, setSelectedTraits] = useState({
    positive: [] as string[],
    negative: [] as string[],
    quirks: [] as string[]
  });

  // Generate equipment based on character
  useEffect(() => {
    const generatedEquipment = generateStartingEquipment(character);
    setEquipment(generatedEquipment);
    
    const generatedTraits = generateCharacterTraits(character);
    setTraits(generatedTraits);
  }, [character]);

  const generateStartingEquipment = (char: Character): StartingEquipment => {
    const raceEquipment = getRaceEquipment(char.race);
    const classEquipment = getClassEquipment(char.class);
    const backstoryEquipment = getBackstoryEquipment(char.backstory || '');

    return {
      weapons: [...raceEquipment.weapons, ...classEquipment.weapons, ...backstoryEquipment.weapons],
      armor: [...raceEquipment.armor, ...classEquipment.armor],
      tools: [...raceEquipment.tools, ...classEquipment.tools, ...backstoryEquipment.tools],
      miscItems: [...raceEquipment.miscItems, ...backstoryEquipment.miscItems]
    };
  };

  const getRaceEquipment = (race: string): StartingEquipment => {
    const raceEquipment: Record<string, StartingEquipment> = {
      'Human': {
        weapons: ['Iron Sword', 'Wooden Shield'],
        armor: ['Leather Armor'],
        tools: ['Rope (50 ft)', 'Torch x3'],
        miscItems: ['Backpack', 'Rations x3', 'Waterskin']
      },
      'Elf': {
        weapons: ['Elven Longbow', 'Quiver with 30 Arrows', 'Elven Shortsword'],
        armor: ['Studded Leather'],
        tools: ['Thieves\' Tools'],
        miscItems: ['Elven Cloak', 'Lembas Bread x5']
      },
      'Dwarf': {
        weapons: ['Dwarven Warhammer', 'Handaxe'],
        armor: ['Chain Mail', 'Shield'],
        tools: ['Smith\'s Tools', 'Mason\'s Tools'],
        miscItems: ['Ale Mug', 'Belt Pouch', 'Dwarven Bread x3']
      },
      'Halfling': {
        weapons: ['Halfling Sling', 'Sling Bullets x20', 'Dagger'],
        armor: ['Padded Armor'],
        tools: ['Cook\'s Utensils', 'Herbalism Kit'],
        miscItems: ['Lucky Coin', 'Pipe', 'Tobacco Pouch']
      },
      'Dragonborn': {
        weapons: ['Dragonborn Greatsword', 'Javelin x3'],
        armor: ['Scale Mail'],
        tools: ['Dragon Chess Set'],
        miscItems: ['Dragon Scale', 'Family Crest', 'Ceremonial Robes']
      },
      'Gnome': {
        weapons: ['Gnomish Crossbow', 'Bolts x20', 'Dagger'],
        armor: ['Leather Armor'],
        tools: ['Tinker\'s Tools', 'Alchemist\'s Supplies'],
        miscItems: ['Magnifying Glass', 'Clockwork Toy', 'Gnomish Contraption']
      },
      'Half-Elf': {
        weapons: ['Rapier', 'Shortbow'],
        armor: ['Studded Leather'],
        tools: ['Musical Instrument', 'Diplomat\'s Pack'],
        miscItems: ['Signet Ring', 'Letter of Introduction']
      },
      'Half-Orc': {
        weapons: ['Orcish Battleaxe', 'Javelin x2'],
        armor: ['Hide Armor'],
        tools: ['Intimidation Gear'],
        miscItems: ['Tribal Token', 'Hunting Trap', 'Trophy from Victory']
      },
      'Tiefling': {
        weapons: ['Infernal Dagger', 'Light Crossbow'],
        armor: ['Leather Armor'],
        tools: ['Thieves\' Tools', 'Forgery Kit'],
        miscItems: ['Infernal Contract (blank)', 'Silver Medallion', 'Vial of Mysterious Liquid']
      }
    };

    return raceEquipment[race] || raceEquipment['Human'];
  };

  const getClassEquipment = (charClass: string): StartingEquipment => {
    const classEquipment: Record<string, StartingEquipment> = {
      'Fighter': {
        weapons: ['Longsword', 'Shield', 'Light Crossbow with 20 bolts'],
        armor: ['Chain Mail'],
        tools: ['Smith\'s Tools'],
        miscItems: ['Whetstone', 'Military Rank Insignia']
      },
      'Wizard': {
        weapons: ['Quarterstaff', 'Dagger'],
        armor: [],
        tools: ['Arcane Focus', 'Spellbook'],
        miscItems: ['Ink and Quill', 'Scroll Case', 'Component Pouch']
      },
      'Cleric': {
        weapons: ['Mace', 'Shield', 'Light Crossbow'],
        armor: ['Scale Mail'],
        tools: ['Holy Symbol', 'Prayer Book'],
        miscItems: ['Holy Water', 'Ceremonial Incense', 'Vestments']
      },
      'Rogue': {
        weapons: ['Rapier', 'Shortbow with 20 arrows', 'Two Daggers'],
        armor: ['Leather Armor'],
        tools: ['Thieves\' Tools', 'Burglar\'s Pack'],
        miscItems: ['Crowbar', 'Dark Cloak', 'Lockpicks']
      },
      'Ranger': {
        weapons: ['Longbow with 20 arrows', 'Two Shortswords'],
        armor: ['Studded Leather'],
        tools: ['Herbalism Kit'],
        miscItems: ['Hunter\'s Trap', 'Animal Companion Whistle', 'Camouflaged Cloak']
      }
    };

    return classEquipment[charClass] || classEquipment['Fighter'];
  };

  const getBackstoryEquipment = (backstory: string): StartingEquipment => {
    const backstoryLower = backstory.toLowerCase();
    const equipment: StartingEquipment = { weapons: [], armor: [], tools: [], miscItems: [] };

    // Parse backstory for equipment hints
    if (backstoryLower.includes('merchant') || backstoryLower.includes('trader')) {
      equipment.tools.push('Merchant\'s Scales', 'Abacus');
      equipment.miscItems.push('Trade Goods', 'Letter of Credit');
    }
    if (backstoryLower.includes('noble') || backstoryLower.includes('aristocrat')) {
      equipment.weapons.push('Ceremonial Sword');
      equipment.miscItems.push('Signet Ring', 'Fine Clothes', 'Purse of Gold');
    }
    if (backstoryLower.includes('soldier') || backstoryLower.includes('guard')) {
      equipment.weapons.push('Military Pike', 'Crossbow');
      equipment.miscItems.push('Military Insignia', 'Dice Set');
    }
    if (backstoryLower.includes('thief') || backstoryLower.includes('criminal')) {
      equipment.tools.push('Thieves\' Tools', 'Crowbar');
      equipment.miscItems.push('Dark Cloak', 'False Identity Papers');
    }
    if (backstoryLower.includes('scholar') || backstoryLower.includes('sage')) {
      equipment.tools.push('Calligrapher\'s Supplies');
      equipment.miscItems.push('Books x3', 'Ink and Quill', 'Research Notes');
    }

    return equipment;
  };

  const generateCharacterTraits = (char: Character): CharacterTraits => {
    const raceTraits = getRaceTraits(char.race);
    const classTraits = getClassTraits(char.class);
    const statTraits = getStatBasedTraits(char.stats);
    const backstoryTraits = getBackstoryTraits(char.backstory || '');

    return {
      positive: [...raceTraits.positive, ...classTraits.positive, ...statTraits.positive, ...backstoryTraits.positive],
      negative: [...raceTraits.negative, ...classTraits.negative, ...statTraits.negative, ...backstoryTraits.negative],
      quirks: [...raceTraits.quirks, ...classTraits.quirks, ...backstoryTraits.quirks]
    };
  };

  const getRaceTraits = (race: string): CharacterTraits => {
    const raceTraits: Record<string, CharacterTraits> = {
      'Human': {
        positive: ['Adaptable', 'Ambitious', 'Determined'],
        negative: ['Impatient', 'Sometimes prejudiced'],
        quirks: ['Collects stories from other cultures', 'Has a lucky charm']
      },
      'Elf': {
        positive: ['Graceful', 'Patient', 'Keen senses'],
        negative: ['Aloof', 'Overly proud'],
        quirks: ['Speaks in an archaic manner', 'Meditates instead of sleeping']
      },
      'Dwarf': {
        positive: ['Loyal', 'Hardy', 'Excellent craftsman'],
        negative: ['Stubborn', 'Holds grudges'],
        quirks: ['Judges people by their craftsmanship', 'Always carries ale']
      },
      'Tiefling': {
        positive: ['Charismatic', 'Resilient', 'Independent'],
        negative: ['Distrusted by others', 'Quick to anger'],
        quirks: ['Horns change color with mood', 'Speaks infernal when frustrated']
      }
    };

    return raceTraits[race] || raceTraits['Human'];
  };

  const getClassTraits = (charClass: string): CharacterTraits => {
    const classTraits: Record<string, CharacterTraits> = {
      'Fighter': {
        positive: ['Brave', 'Disciplined', 'Protective'],
        negative: ['Sometimes reckless', 'Trusts strength over diplomacy'],
        quirks: ['Maintains weapons religiously', 'Respects worthy opponents']
      },
      'Wizard': {
        positive: ['Intelligent', 'Scholarly', 'Methodical'],
        negative: ['Physically weak', 'Overthinks problems'],
        quirks: ['Always reading', 'Collects rare spell components']
      },
      'Rogue': {
        positive: ['Quick-thinking', 'Agile', 'Streetwise'],
        negative: ['Untrustworthy reputation', 'Selfish tendencies'],
        quirks: ['Never sits with back to door', 'Fidgets with lockpicks']
      }
    };

    return classTraits[charClass] || classTraits['Fighter'];
  };

  const getStatBasedTraits = (stats: Character['stats']): CharacterTraits => {
    const traits: CharacterTraits = { positive: [], negative: [], quirks: [] };

    if (stats.strength >= 14) traits.positive.push('Physically imposing');
    if (stats.strength <= 8) traits.negative.push('Physically weak');
    
    if (stats.dexterity >= 14) traits.positive.push('Quick reflexes');
    if (stats.dexterity <= 8) traits.negative.push('Clumsy');
    
    if (stats.intelligence >= 14) traits.positive.push('Highly intelligent');
    if (stats.intelligence <= 8) traits.negative.push('Slow to understand');
    
    if (stats.wisdom >= 14) traits.positive.push('Wise beyond years');
    if (stats.wisdom <= 8) traits.negative.push('Poor judgment');
    
    if (stats.charisma >= 14) traits.positive.push('Naturally charming');
    if (stats.charisma <= 8) traits.negative.push('Socially awkward');

    return traits;
  };

  const getBackstoryTraits = (backstory: string): CharacterTraits => {
    const traits: CharacterTraits = { positive: [], negative: [], quirks: [] };
    const backstoryLower = backstory.toLowerCase();

    if (backstoryLower.includes('orphan')) {
      traits.positive.push('Self-reliant');
      traits.negative.push('Trust issues');
      traits.quirks.push('Hoards food');
    }
    if (backstoryLower.includes('noble')) {
      traits.positive.push('Well-educated');
      traits.negative.push('Out of touch with common folk');
      traits.quirks.push('Expects to be served');
    }

    return traits;
  };

  const handleEquipmentToggle = (item: string) => {
    setSelectedEquipment(prev => 
      prev.includes(item) 
        ? prev.filter(i => i !== item)
        : [...prev, item]
    );
  };

  const handleTraitToggle = (category: keyof CharacterTraits, trait: string) => {
    setSelectedTraits(prev => ({
      ...prev,
      [category]: prev[category].includes(trait)
        ? prev[category].filter(t => t !== trait)
        : [...prev[category], trait]
    }));
  };

  const handleComplete = () => {
    // Convert selected equipment strings to Equipment objects
    const equipmentObjects: Equipment[] = selectedEquipment.map((equipmentName, index) => ({
      id: `equipment_${Date.now()}_${index}`,
      name: equipmentName,
      type: getEquipmentType(equipmentName),
      description: getEquipmentDescription(equipmentName),
      damage: getEquipmentDamage(equipmentName),
      properties: [],
      equipped: false,
      quantity: 1
    }));

    const customizedCharacter: Character = {
      ...character,
      equipment: equipmentObjects,
      // Add traits to character object (we might need to extend the Character interface)
    };
    onComplete(customizedCharacter);
  };

  const getEquipmentType = (name: string): 'weapon' | 'armor' | 'tool' | 'consumable' | 'treasure' => {
    const weaponKeywords = ['sword', 'dagger', 'bow', 'crossbow', 'axe', 'hammer', 'staff', 'wand', 'blade', 'knife'];
    const armorKeywords = ['armor', 'shield', 'helmet', 'cloak', 'robe', 'chainmail', 'leather'];
    const toolKeywords = ['kit', 'tools', 'rope', 'torch', 'lantern', 'bedroll', 'pack', 'pouch', 'book', 'scroll'];
    
    const lowerName = name.toLowerCase();
    
    if (weaponKeywords.some(keyword => lowerName.includes(keyword))) return 'weapon';
    if (armorKeywords.some(keyword => lowerName.includes(keyword))) return 'armor';
    if (toolKeywords.some(keyword => lowerName.includes(keyword))) return 'tool';
    
    return 'treasure'; // Default for miscellaneous items
  };

  const getEquipmentDescription = (name: string): string => {
    const descriptions: Record<string, string> = {
      'Infernal Dagger': 'A wickedly sharp blade that seems to whisper dark secrets.',
      'Light Crossbow': 'A compact ranged weapon favored by rogues and hunters.',
      'Leather Armor': 'Flexible protection made from hardened leather.',
      'Thieves\' Tools': 'A set of fine tools for picking locks and disarming traps.',
      'Forgery Kit': 'Supplies needed to create convincing fake documents.',
      'Dragonborn Scale Polish': 'A special compound for maintaining dragonborn scales.',
      'Flame Breath Mint': 'Helps freshen breath after using flame breath.',
      'Ancestral Medallion': 'A family heirloom passed down through generations.'
    };
    
    return descriptions[name] || `A useful piece of equipment: ${name}`;
  };

  const getEquipmentDamage = (name: string): string | undefined => {
    const damages: Record<string, string> = {
      'Infernal Dagger': '1d4 + DEX',
      'Light Crossbow': '1d8',
      'Shortsword': '1d6 + STR/DEX',
      'Rapier': '1d8 + DEX',
      'Longbow': '1d8 + DEX'
    };
    
    return damages[name];
  };

  return (
    <div className="min-h-screen text-white p-4 relative">
      <div className="max-w-6xl mx-auto bg-gray-900 p-6 rounded-lg max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">✨ Character Customization</h2>
          <div className="flex gap-4">
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={handleComplete}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            >
              Complete Character
            </button>
          </div>
        </div>

        <div className="mb-6 text-center">
          <h3 className="text-xl font-semibold text-blue-400">{character.name}</h3>
          <p className="text-gray-400">Level {character.level} {character.race} {character.class}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Starting Equipment */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">🎒 Starting Equipment</h3>
            
            {['weapons', 'armor', 'tools', 'miscItems'].map(category => (
              <div key={category} className="space-y-2">
                <h4 className="font-medium text-gray-300 capitalize">
                  {category === 'miscItems' ? 'Miscellaneous Items' : category}
                </h4>
                <div className="grid grid-cols-1 gap-2">
                  {equipment[category as keyof StartingEquipment].map(item => (
                    <label key={item} className="flex items-center space-x-2 cursor-pointer bg-gray-800 p-2 rounded hover:bg-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedEquipment.includes(item)}
                        onChange={() => handleEquipmentToggle(item)}
                        className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">{item}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Character Traits */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">🎭 Character Traits</h3>
            
            {/* Positive Traits */}
            <div className="space-y-2">
              <h4 className="font-medium text-green-400">✨ Positive Traits</h4>
              <div className="grid grid-cols-1 gap-2">
                {traits.positive.map(trait => (
                  <label key={trait} className="flex items-center space-x-2 cursor-pointer bg-green-900/20 p-2 rounded hover:bg-green-900/30">
                    <input
                      type="checkbox"
                      checked={selectedTraits.positive.includes(trait)}
                      onChange={() => handleTraitToggle('positive', trait)}
                      className="rounded border-gray-600 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm">{trait}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Negative Traits */}
            <div className="space-y-2">
              <h4 className="font-medium text-red-400">⚠️ Negative Traits</h4>
              <div className="grid grid-cols-1 gap-2">
                {traits.negative.map(trait => (
                  <label key={trait} className="flex items-center space-x-2 cursor-pointer bg-red-900/20 p-2 rounded hover:bg-red-900/30">
                    <input
                      type="checkbox"
                      checked={selectedTraits.negative.includes(trait)}
                      onChange={() => handleTraitToggle('negative', trait)}
                      className="rounded border-gray-600 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm">{trait}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Quirks */}
            <div className="space-y-2">
              <h4 className="font-medium text-purple-400">🎪 Quirks & Habits</h4>
              <div className="grid grid-cols-1 gap-2">
                {traits.quirks.map(quirk => (
                  <label key={quirk} className="flex items-center space-x-2 cursor-pointer bg-purple-900/20 p-2 rounded hover:bg-purple-900/30">
                    <input
                      type="checkbox"
                      checked={selectedTraits.quirks.includes(quirk)}
                      onChange={() => handleTraitToggle('quirks', quirk)}
                      className="rounded border-gray-600 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm">{quirk}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-8 p-4 bg-gray-800 rounded-lg">
          <h4 className="font-semibold mb-2">📋 Selection Summary</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Equipment selected:</span>
              <span className="ml-2 text-white">{selectedEquipment.length}</span>
            </div>
            <div>
              <span className="text-gray-400">Traits selected:</span>
              <span className="ml-2 text-white">
                {selectedTraits.positive.length + selectedTraits.negative.length + selectedTraits.quirks.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
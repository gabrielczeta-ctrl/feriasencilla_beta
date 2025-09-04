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
  const [selectedEquipment, setSelectedEquipment] = useState<{
    mainhand: string | null;
    offhand: string | null;
    inventory: string[];
  }>({ mainhand: null, offhand: null, inventory: [] });
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
        positive: ['Adaptable', 'Ambitious', 'Determined', 'Resourceful', 'Versatile', 'Diplomatic', 'Enterprising', 'Innovative', 'Courageous', 'Persevering', 'Social', 'Optimistic', 'Pragmatic', 'Quick learner', 'Leadership potential', 'Curious', 'Hardworking', 'Compassionate', 'Resilient', 'Creative'],
        negative: ['Impatient', 'Sometimes prejudiced', 'Short-sighted', 'Overconfident', 'Restless', 'Greedy', 'Reckless', 'Stubborn pride', 'Jealous', 'Quick to judge', 'Emotionally volatile', 'Materialistic', 'Prone to conflict', 'Inconsistent', 'Competitive to a fault'],
        quirks: ['Collects stories from other cultures', 'Has a lucky charm', 'Makes friends easily', 'Superstitious about numbers', 'Changes hairstyle frequently', 'Talks to animals', 'Always carries snacks', 'Hums while working', 'Makes lists for everything', 'Sleepwalks during stress', 'Lucky coin flipper', 'Remembers faces but not names', 'Draws on everything', 'Counts steps when walking', 'Names inanimate objects']
      },
      'Elf': {
        positive: ['Graceful', 'Patient', 'Keen senses', 'Long-lived wisdom', 'Nature-attuned', 'Perceptive', 'Elegant', 'Artistic', 'Mystical insight', 'Naturally magical', 'Poised', 'Culturally refined', 'Intuitive', 'Disciplined', 'Harmonious', 'Ancient knowledge', 'Serene', 'Noble bearing', 'Environmentally conscious', 'Spiritually connected'],
        negative: ['Aloof', 'Overly proud', 'Slow to trust mortals', 'Arrogant', 'Melancholic', 'Detached', 'Condescending', 'Inflexible traditions', 'Overly cautious', 'Dismissive of brevity', 'Perfectionist', 'Emotionally distant', 'Elitist', 'Pessimistic about change', 'Withdrawn'],
        quirks: ['Speaks in an archaic manner', 'Meditates instead of sleeping', 'Speaks to trees', 'Never forgets a face', 'Moves without sound', 'Ages gracefully', 'Collects pressed flowers', 'Speaks in metaphors', 'Listens to wind patterns', 'Touches everything with fingertips first', 'Counts stars', 'Hears music in nature', 'Changes eye color with seasons', 'Writes poetry constantly', 'Dances when alone']
      },
      'Dwarf': {
        positive: ['Loyal', 'Hardy', 'Excellent craftsman', 'Brave', 'Honest', 'Dependable', 'Strong-willed', 'Traditional', 'Protective', 'Generous to friends', 'Master of trades', 'Steadfast', 'Principled', 'Resilient', 'Family-oriented', 'Honorable', 'Practical', 'Determined', 'Hardworking', 'Trustworthy'],
        negative: ['Stubborn', 'Holds grudges', 'Suspicious of magic', 'Slow to change', 'Hot-tempered', 'Xenophobic', 'Materialistic', 'Inflexible', 'Vengeful', 'Crude manners', 'Overly competitive', 'Distrusts outsiders', 'Set in their ways', 'Conservative', 'Gruff'],
        quirks: ['Judges people by their craftsmanship', 'Always carries ale', 'Braids beard when thinking', 'Knows stone by touch', 'Snores like an earthquake', 'Never removes armor completely', 'Tests everything with hammer', 'Counts coins obsessively', 'Sharpens weapons daily', 'Names all tools', 'Sleeps sitting up', 'Spits when angry', 'Measures everything twice', 'Keeps detailed genealogy', 'Burns offerings to ancestors']
      },
      'Tiefling': {
        positive: ['Charismatic', 'Resilient', 'Independent', 'Determined', 'Passionate', 'Self-reliant', 'Strong-willed', 'Adaptable', 'Survivor instinct', 'Magnetic personality', 'Fearless', 'Ambitious', 'Intuitive about people', 'Protective of underdogs', 'Resourceful', 'Confident', 'Emotionally intense', 'Loyal once trust is earned', 'Creative', 'Bold'],
        negative: ['Distrusted by others', 'Quick to anger', 'Paranoid', 'Bitter', 'Vengeful', 'Isolated', 'Suspicious', 'Temperamental', 'Holds grudges', 'Self-destructive', 'Cynical', 'Defensive', 'Rebellious', 'Impulsive', 'Outcast mentality'],
        quirks: ['Horns change color with mood', 'Speaks infernal when frustrated', 'Tail betrays emotions', 'Dreams of fire', 'Skin changes temperature with mood', 'Horns itch before storms', 'Enjoys spicy food excessively', 'Shadows move strangely around them', 'Eyes glow when angry', 'Speaks in riddles when upset', 'Collects devil contracts', 'Never feels truly cold', 'Drawn to flames', 'Sleeps with one eye open', 'Makes deals for everything']
      }
    };

    return raceTraits[race] || raceTraits['Human'];
  };

  const getClassTraits = (charClass: string): CharacterTraits => {
    const classTraits: Record<string, CharacterTraits> = {
      'Fighter': {
        positive: ['Brave', 'Disciplined', 'Protective', 'Strategic', 'Loyal', 'Determined', 'Strong', 'Combat expert', 'Reliable', 'Leadership', 'Courageous', 'Tactical', 'Steadfast', 'Honor-bound', 'Team player', 'Resilient'],
        negative: ['Sometimes reckless', 'Trusts strength over diplomacy', 'Violent solutions first', 'Impatient with talk', 'Stubborn in combat', 'Overly direct', 'Poor at subtlety', 'Trigger-happy', 'Black and white thinking'],
        quirks: ['Maintains weapons religiously', 'Respects worthy opponents', 'Sleeps in armor', 'Challenges others to contests', 'Practices combat moves constantly', 'Tests new weapons immediately', 'Counts scars as trophies', 'Salutes authority figures', 'Marches instead of walking']
      },
      'Wizard': {
        positive: ['Intelligent', 'Scholarly', 'Methodical', 'Wise', 'Analytical', 'Patient researcher', 'Knowledgeable', 'Strategic thinker', 'Curious', 'Logical', 'Well-educated', 'Thorough', 'Inventive', 'Precise', 'Studious', 'Insightful'],
        negative: ['Physically weak', 'Overthinks problems', 'Arrogant about knowledge', 'Socially awkward', 'Impatient with ignorance', 'Obsessive', 'Absent-minded', 'Poor practical skills', 'Condescending', 'Fragile ego about intelligence'],
        quirks: ['Always reading', 'Collects rare spell components', 'Talks to familiar constantly', 'Organizes spells alphabetically', 'Writes everything down', 'Mutters incantations', 'Tower full of books', 'Experiments with everything', 'Names all magical items', 'Sleeps with spellbook']
      },
      'Rogue': {
        positive: ['Quick-thinking', 'Agile', 'Streetwise', 'Resourceful', 'Stealthy', 'Opportunistic', 'Independent', 'Adaptable', 'Observant', 'Cunning', 'Survivor', 'Charismatic', 'Lucky', 'Street smart', 'Flexible morals', 'Self-reliant'],
        negative: ['Untrustworthy reputation', 'Selfish tendencies', 'Paranoid', 'Kleptomaniac', 'Dishonest', 'Cowardly', 'Backstabbing', 'Criminal past', 'Greedy', 'Unreliable', 'Suspicious of everyone'],
        quirks: ['Never sits with back to door', 'Fidgets with lockpicks', 'Counts exits in every room', 'Pickpockets unconsciously', 'Sleeps with knife under pillow', 'Tests locks habitually', 'Hoards shiny objects', 'Speaks in thieves cant', 'Always has escape plan', 'Distrusts authority']
      },
      'Cleric': {
        positive: ['Faithful', 'Healing', 'Wise', 'Compassionate', 'Devoted', 'Moral guidance', 'Protective', 'Spiritual', 'Inspiring', 'Selfless', 'Pure of heart', 'Peaceful', 'Charitable', 'Patient', 'Forgiving', 'Holy'],
        negative: ['Preachy', 'Judgmental', 'Naive', 'Overly trusting', 'Rigid morality', 'Sanctimonious', 'Inflexible beliefs', 'Guilt-ridden', 'Zealous', 'Close-minded'],
        quirks: ['Prays before meals', 'Blesses everyone', 'Carries holy symbol everywhere', 'Quotes scripture constantly', 'Turns undead reflexively', 'Lights candles obsessively', 'Confesses minor sins daily', 'Meditates at dawn', 'Never swears']
      },
      'Barbarian': {
        positive: ['Fierce', 'Strong', 'Brave', 'Protective', 'Passionate', 'Natural warrior', 'Intuitive', 'Loyal to tribe', 'Honest', 'Direct', 'Resilient', 'Wild wisdom', 'Fearless', 'Primal instincts', 'Tough', 'Free spirit'],
        negative: ['Hot-tempered', 'Uncivilized', 'Violent', 'Impulsive', 'Crude', 'Anti-social', 'Destructive', 'Unpredictable', 'Savage', 'Intimidating'],
        quirks: ['Rages at minor annoyances', 'Eats with hands', 'Challenges alphas', 'Sleeps under stars', 'Distrusts magic', 'Howls at moon', 'Marks territory', 'Collects teeth/claws', 'Never backs down']
      }
    };

    return classTraits[charClass] || classTraits['Fighter'];
  };

  const getStatBasedTraits = (stats: Character['stats']): CharacterTraits => {
    const traits: CharacterTraits = { positive: [], negative: [], quirks: [] };

    // Strength-based traits
    if (stats.strength >= 16) {
      traits.positive.push('Incredibly strong', 'Intimidating presence', 'Natural athlete');
      traits.quirks.push('Breaks things accidentally', 'Opens jars for everyone');
    } else if (stats.strength >= 14) {
      traits.positive.push('Physically imposing', 'Strong grip', 'Good at lifting');
    } else if (stats.strength <= 8) {
      traits.negative.push('Physically weak', 'Struggles with heavy objects', 'Gets tired easily');
      traits.quirks.push('Asks for help opening jars', 'Avoids physical confrontation');
    }
    
    // Dexterity-based traits  
    if (stats.dexterity >= 16) {
      traits.positive.push('Lightning reflexes', 'Natural acrobat', 'Perfect balance');
      traits.quirks.push('Catches things without looking', 'Walks on narrow ledges casually');
    } else if (stats.dexterity >= 14) {
      traits.positive.push('Quick reflexes', 'Light on feet', 'Good hand-eye coordination');
    } else if (stats.dexterity <= 8) {
      traits.negative.push('Clumsy', 'Trips frequently', 'Poor coordination');
      traits.quirks.push('Knocks things over', 'Can\'t catch thrown objects', 'Stumbles on flat ground');
    }
    
    // Constitution-based traits
    if (stats.constitution >= 16) {
      traits.positive.push('Iron constitution', 'Never gets sick', 'Incredible endurance');
      traits.quirks.push('Eats anything without getting sick', 'Stays up all night easily');
    } else if (stats.constitution >= 14) {
      traits.positive.push('Hardy', 'Rarely ill', 'Good stamina');
    } else if (stats.constitution <= 8) {
      traits.negative.push('Sickly', 'Gets winded easily', 'Weak immune system');
      traits.quirks.push('Always catching colds', 'Needs lots of rest');
    }
    
    // Intelligence-based traits
    if (stats.intelligence >= 16) {
      traits.positive.push('Genius-level intellect', 'Photographic memory', 'Strategic mastermind');
      traits.quirks.push('Corrects others constantly', 'Remembers every detail', 'Thinks ten steps ahead');
    } else if (stats.intelligence >= 14) {
      traits.positive.push('Highly intelligent', 'Quick learner', 'Analytical mind');
    } else if (stats.intelligence <= 8) {
      traits.negative.push('Slow to understand', 'Poor memory', 'Easily confused');
      traits.quirks.push('Asks for explanations repeatedly', 'Forgets names', 'Takes things literally');
    }
    
    // Wisdom-based traits
    if (stats.wisdom >= 16) {
      traits.positive.push('Sage-like wisdom', 'Perfect intuition', 'Sees through deception');
      traits.quirks.push('Gives cryptic advice', 'Knows things without explanation', 'Stares into distance thoughtfully');
    } else if (stats.wisdom >= 14) {
      traits.positive.push('Wise beyond years', 'Good instincts', 'Perceptive');
    } else if (stats.wisdom <= 8) {
      traits.negative.push('Poor judgment', 'Easily deceived', 'Oblivious to danger');
      traits.quirks.push('Falls for obvious tricks', 'Misses social cues', 'Walks into obvious traps');
    }
    
    // Charisma-based traits
    if (stats.charisma >= 16) {
      traits.positive.push('Magnetic personality', 'Natural born leader', 'Incredibly persuasive');
      traits.quirks.push('Strangers tell them their life story', 'Animals love them', 'Gets discounts everywhere');
    } else if (stats.charisma >= 14) {
      traits.positive.push('Naturally charming', 'Good with people', 'Likeable');
    } else if (stats.charisma <= 8) {
      traits.negative.push('Socially awkward', 'Off-putting', 'Poor social skills');
      traits.quirks.push('Says wrong thing at wrong time', 'Makes people uncomfortable', 'Laughs at inappropriate moments');
    }

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
    const itemType = getEquipmentHandedness(item);
    
    setSelectedEquipment(prev => {
      // For weapons/tools that can be equipped in hands
      if (itemType === 'one-handed') {
        // If already equipped, remove it
        if (prev.mainhand === item) {
          return { ...prev, mainhand: null };
        } else if (prev.offhand === item) {
          return { ...prev, offhand: null };
        }
        // Try to equip in mainhand first, then offhand
        else if (!prev.mainhand) {
          return { ...prev, mainhand: item };
        } else if (!prev.offhand) {
          return { ...prev, offhand: item };
        } else {
          // Both hands full, replace mainhand
          return { ...prev, mainhand: item };
        }
      } else if (itemType === 'two-handed') {
        // If already equipped, remove it
        if (prev.mainhand === item) {
          return { ...prev, mainhand: null };
        }
        // Clear both hands and equip two-handed item
        else {
          return { ...prev, mainhand: item, offhand: null };
        }
      } else {
        // Regular inventory item (max 20 slots)
        if (prev.inventory.includes(item)) {
          return { ...prev, inventory: prev.inventory.filter(i => i !== item) };
        } else if (prev.inventory.length < 20) {
          return { ...prev, inventory: [...prev.inventory, item] };
        } else {
          alert('🎒 Inventory full! You can only carry 20 items.');
          return prev;
        }
      }
    });
  };
  
  const getEquipmentHandedness = (item: string): 'one-handed' | 'two-handed' | 'none' => {
    const twoHandedWeapons = ['Greatsword', 'Battleaxe (Two-handed)', 'Longbow', 'Crossbow', 'Staff', 'Quarterstaff (Two-handed)', 'Warhammer (Two-handed)'];
    const oneHandedWeapons = ['Sword', 'Dagger', 'Short Sword', 'Rapier', 'Scimitar', 'Handaxe', 'Light Hammer', 'Javelin', 'Spear', 'Trident', 'Warhammer', 'Quarterstaff'];
    
    if (twoHandedWeapons.some(weapon => item.includes(weapon.split(' ')[0]))) {
      return 'two-handed';
    } else if (oneHandedWeapons.some(weapon => item.includes(weapon.split(' ')[0]))) {
      return 'one-handed';
    } else {
      return 'none';
    }
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
    const equipmentObjects: Equipment[] = [
      // Mainhand item
      ...(selectedEquipment.mainhand ? [{
        id: `equipment_mainhand_${Date.now()}`,
        name: selectedEquipment.mainhand,
        type: getEquipmentType(selectedEquipment.mainhand),
        slot: 'mainhand' as const,
        handedness: getEquipmentHandedness(selectedEquipment.mainhand),
        description: getEquipmentDescription(selectedEquipment.mainhand),
        damage: getEquipmentDamage(selectedEquipment.mainhand),
        properties: [],
        equipped: true,
        quantity: 1
      }] : []),
      // Offhand item
      ...(selectedEquipment.offhand ? [{
        id: `equipment_offhand_${Date.now()}`,
        name: selectedEquipment.offhand,
        type: getEquipmentType(selectedEquipment.offhand),
        slot: 'offhand' as const,
        handedness: getEquipmentHandedness(selectedEquipment.offhand),
        description: getEquipmentDescription(selectedEquipment.offhand),
        damage: getEquipmentDamage(selectedEquipment.offhand),
        properties: [],
        equipped: true,
        quantity: 1
      }] : []),
      // Inventory items
      ...selectedEquipment.inventory.map((equipmentName, index) => ({
        id: `equipment_inventory_${Date.now()}_${index}`,
        name: equipmentName,
        type: getEquipmentType(equipmentName),
        slot: 'inventory' as const,
        handedness: 'none' as const,
        description: getEquipmentDescription(equipmentName),
        damage: getEquipmentDamage(equipmentName),
        properties: [],
        equipped: false,
        quantity: 1
      }))
    ];

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
      <div className="w-full max-w-7xl mx-auto bg-gray-900 p-4 sm:p-6 rounded-lg"
           style={{ maxHeight: 'none' }}>
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

        {/* Equipment Slots Display */}
        <div className="mb-8 bg-gray-800 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-yellow-400">⚔️ Equipment Slots</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Main Hand */}
            <div className="bg-gray-700 p-3 rounded border border-gray-600">
              <h4 className="text-sm font-medium text-blue-400 mb-2">🗡️ Main Hand</h4>
              {selectedEquipment.mainhand ? (
                <div className="text-white text-sm bg-blue-900/30 p-2 rounded">
                  {selectedEquipment.mainhand}
                  {getEquipmentHandedness(selectedEquipment.mainhand) === 'two-handed' && (
                    <span className="text-yellow-400 text-xs block">(Two-Handed)</span>
                  )}
                </div>
              ) : (
                <div className="text-gray-400 text-sm italic p-2">Empty</div>
              )}
            </div>
            
            {/* Off Hand */}
            <div className="bg-gray-700 p-3 rounded border border-gray-600">
              <h4 className="text-sm font-medium text-green-400 mb-2">🛡️ Off Hand</h4>
              {selectedEquipment.offhand ? (
                <div className="text-white text-sm bg-green-900/30 p-2 rounded">
                  {selectedEquipment.offhand}
                </div>
              ) : selectedEquipment.mainhand && getEquipmentHandedness(selectedEquipment.mainhand) === 'two-handed' ? (
                <div className="text-yellow-400 text-sm italic p-2">Occupied by two-handed weapon</div>
              ) : (
                <div className="text-gray-400 text-sm italic p-2">Empty</div>
              )}
            </div>
            
            {/* Inventory */}
            <div className="bg-gray-700 p-3 rounded border border-gray-600">
              <h4 className="text-sm font-medium text-purple-400 mb-2">🎒 Inventory ({selectedEquipment.inventory.length}/20)</h4>
              <div className="max-h-20 overflow-y-auto">
                {selectedEquipment.inventory.length > 0 ? (
                  <div className="space-y-1">
                    {selectedEquipment.inventory.map((item, index) => (
                      <div key={index} className="text-white text-xs bg-purple-900/30 p-1 rounded">
                        {item}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm italic p-2">Empty</div>
                )}
              </div>
            </div>
          </div>
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
                        checked={selectedEquipment.mainhand === item || selectedEquipment.offhand === item || selectedEquipment.inventory.includes(item)}
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
              <span className="ml-2 text-white">{(selectedEquipment.mainhand ? 1 : 0) + (selectedEquipment.offhand ? 1 : 0) + selectedEquipment.inventory.length}</span>
            </div>
            <div>
              <span className="text-gray-400">Traits selected:</span>
              <span className="ml-2 text-white">
                {(selectedTraits.positive?.length || 0) + (selectedTraits.negative?.length || 0) + (selectedTraits.quirks?.length || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
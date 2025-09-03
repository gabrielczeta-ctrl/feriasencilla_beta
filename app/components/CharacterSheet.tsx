"use client";

import React, { useState } from 'react';
import { Character, RACES, CLASSES, SKILLS, Race, Class, Skill } from '../types/dnd';

interface CharacterSheetProps {
  character?: Partial<Character>;
  onSave: (character: Character) => void;
  onCancel?: () => void;
  isEditing?: boolean;
}

export default function CharacterSheet({ character, onSave, onCancel, isEditing = false }: CharacterSheetProps) {
  const [formData, setFormData] = useState<Partial<Character>>({
    name: character?.name || '',
    race: character?.race || 'Human',
    class: character?.class || 'Fighter',
    level: character?.level || 1,
    stats: {
      strength: character?.stats?.strength || 10,
      dexterity: character?.stats?.dexterity || 10,
      constitution: character?.stats?.constitution || 10,
      intelligence: character?.stats?.intelligence || 10,
      wisdom: character?.stats?.wisdom || 10,
      charisma: character?.stats?.charisma || 10
    },
    hitPoints: {
      current: character?.hitPoints?.current || 10,
      maximum: character?.hitPoints?.maximum || 10,
      temporary: character?.hitPoints?.temporary || 0
    },
    armorClass: character?.armorClass || 10,
    backstory: character?.backstory || '',
    skills: character?.skills || {},
    equipment: character?.equipment || []
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [remainingPoints, setRemainingPoints] = useState(27); // Point buy system

  // D&D 5e Point Buy System
  const getPointCost = (score: number): number => {
    // Standard D&D 5e point buy costs
    const costs = {
      8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5,
      14: 7, 15: 9  // 14 and 15 cost extra
    };
    return costs[score as keyof typeof costs] || 0;
  };

  // Calculate remaining points based on current stats
  React.useEffect(() => {
    const totalSpent = Object.values(formData.stats!).reduce((sum, score) => sum + getPointCost(score), 0);
    setRemainingPoints(27 - totalSpent);
  }, [formData.stats]);

  // Calculate ability modifier
  const getModifier = (score: number): number => {
    return Math.floor((score - 10) / 2);
  };

  // Calculate proficiency bonus based on level
  const getProficiencyBonus = (level: number): number => {
    return Math.ceil(level / 4) + 1;
  };

  // Update ability scores with point buy validation
  const updateAbilityScore = (ability: keyof Character['stats'], value: number) => {
    const currentScore = formData.stats![ability];
    const currentCost = getPointCost(currentScore);
    const newCost = getPointCost(value);
    const costDifference = newCost - currentCost;
    
    if (remainingPoints - costDifference >= 0 && value >= 8 && value <= 15) {
      setFormData(prev => ({
        ...prev,
        stats: {
          ...prev.stats!,
          [ability]: value
        }
      }));
      setRemainingPoints(prev => prev - costDifference);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      newErrors.name = 'Character name is required';
    }

    if (remainingPoints !== 0) {
      newErrors.stats = `You must spend all ability score points (${remainingPoints} remaining)`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) return;

    const character: Character = {
      ...formData as Character,
      id: '',
      playerId: '',
      createdAt: Date.now(),
      proficiencyBonus: getProficiencyBonus(formData.level!)
    };

    onSave(character);
  };

  const getClassHitDie = (className: string): number => {
    const hitDice: Record<string, number> = {
      'Barbarian': 12,
      'Fighter': 10,
      'Paladin': 10,
      'Ranger': 10,
      'Bard': 8,
      'Cleric': 8,
      'Druid': 8,
      'Monk': 8,
      'Rogue': 8,
      'Warlock': 8,
      'Sorcerer': 6,
      'Wizard': 6
    };
    return hitDice[className] || 8;
  };

  const calculateMaxHP = (): number => {
    const hitDie = getClassHitDie(formData.class!);
    const conModifier = getModifier(formData.stats?.constitution || 10);
    return hitDie + conModifier + ((formData.level! - 1) * (Math.floor(hitDie / 2) + 1 + conModifier));
  };

  return (
    <div className="w-full max-w-6xl mx-auto bg-gray-900 text-white p-4 sm:p-6 rounded-lg min-h-screen"
         style={{ maxHeight: 'none' }}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">
          {isEditing ? 'Edit Character' : 'Create Character'}
        </h2>
        <div className="flex gap-4">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
          >
            {isEditing ? 'Update' : 'Create'} Character
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b border-gray-700 pb-2">Basic Information</h3>
          
          <div>
            <label className="block text-sm font-medium mb-1">Character Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full p-3 bg-gray-800 border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
              placeholder="Enter character name"
              maxLength={50}
            />
            {errors.name && <p className="text-red-400 text-sm mt-1">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Race</label>
              <select
                value={formData.race}
                onChange={(e) => setFormData(prev => ({ ...prev, race: e.target.value as Race }))}
                className="w-full p-3 bg-gray-800 border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
              >
                {RACES.map(race => (
                  <option key={race} value={race}>{race}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Class</label>
              <select
                value={formData.class}
                onChange={(e) => setFormData(prev => ({ ...prev, class: e.target.value as Class }))}
                className="w-full p-3 bg-gray-800 border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
              >
                {CLASSES.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Level</label>
            <input
              type="number"
              min="1"
              max="20"
              value={formData.level}
              onChange={(e) => setFormData(prev => ({ ...prev, level: parseInt(e.target.value) }))}
              className="w-full p-3 bg-gray-800 border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Backstory</label>
            <textarea
              value={formData.backstory}
              onChange={(e) => setFormData(prev => ({ ...prev, backstory: e.target.value }))}
              className="w-full p-3 bg-gray-800 border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
              rows={4}
              placeholder="Tell us about your character's background..."
              maxLength={1000}
            />
          </div>
        </div>

        {/* Ability Scores */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold border-b border-gray-700 pb-2">Ability Scores</h3>
            <div className="text-sm">
              <span className="text-gray-400">Points Remaining: </span>
              <span className={remainingPoints === 0 ? 'text-green-400' : 'text-yellow-400'}>
                {remainingPoints}
              </span>
            </div>
          </div>
          {errors.stats && <p className="text-red-400 text-sm">{errors.stats}</p>}

          <div className="grid grid-cols-2 gap-4">
            {Object.entries(formData.stats!).map(([ability, score]) => (
              <div key={ability} className="bg-gray-800 p-4 rounded">
                <div className="text-center">
                  <label className="block text-sm font-medium capitalize">{ability}</label>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <button
                      onClick={() => updateAbilityScore(ability as keyof Character['stats'], score - 1)}
                      disabled={score <= 8}
                      className="w-8 h-8 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded text-sm"
                    >
                      −
                    </button>
                    <span className="text-2xl font-bold w-8">{score}</span>
                    <button
                      onClick={() => updateAbilityScore(ability as keyof Character['stats'], score + 1)}
                      disabled={score >= 15}
                      className="w-8 h-8 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 rounded text-sm"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    Modifier: {getModifier(score) >= 0 ? '+' : ''}{getModifier(score)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Derived Stats */}
          <div className="space-y-4 mt-6">
            <h3 className="text-lg font-semibold border-b border-gray-700 pb-2">Derived Stats</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-800 p-4 rounded text-center">
                <label className="block text-sm font-medium">Hit Points</label>
                <div className="text-2xl font-bold text-red-400">
                  {calculateMaxHP()}
                </div>
                <div className="text-xs text-gray-400">
                  Base + CON({getModifier(formData.stats?.constitution || 10)})
                </div>
              </div>

              <div className="bg-gray-800 p-4 rounded text-center">
                <label className="block text-sm font-medium">Armor Class</label>
                <div className="text-2xl font-bold text-blue-400">
                  {10 + getModifier(formData.stats?.dexterity || 10)}
                </div>
                <div className="text-xs text-gray-400">
                  10 + DEX({getModifier(formData.stats?.dexterity || 10)})
                </div>
              </div>

              <div className="bg-gray-800 p-4 rounded text-center">
                <label className="block text-sm font-medium">Proficiency Bonus</label>
                <div className="text-2xl font-bold text-green-400">
                  +{getProficiencyBonus(formData.level!)}
                </div>
              </div>

              <div className="bg-gray-800 p-4 rounded text-center">
                <label className="block text-sm font-medium">Hit Die</label>
                <div className="text-2xl font-bold text-purple-400">
                  d{getClassHitDie(formData.class!)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Skills */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold border-b border-gray-700 pb-2">Skills</h3>
          <span className="text-sm text-gray-400">
            {Object.values(formData.skills || {}).filter(Boolean).length}/4 selected
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-3">Choose up to 4 skills your character is proficient in</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {SKILLS.map(skill => {
            const selectedSkills = Object.values(formData.skills || {}).filter(Boolean).length;
            const isSkillSelected = formData.skills?.[skill] || false;
            const canSelect = isSkillSelected || selectedSkills < 4;
            
            return (
              <label 
                key={skill} 
                className={`flex items-center space-x-2 cursor-pointer ${!canSelect ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isSkillSelected}
                  disabled={!canSelect}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    skills: {
                      ...prev.skills,
                      [skill]: e.target.checked
                    }
                  }))}
                  className="rounded border-gray-600 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <span className={`text-sm ${canSelect ? 'text-gray-300' : 'text-gray-500'}`}>{skill}</span>
              </label>
            );
          })}
        </div>
        {errors.skills && <p className="text-red-400 text-sm mt-2">{errors.skills}</p>}
      </div>

      {/* Character Preview */}
      {formData.name && (
        <div className="mt-6 p-4 bg-gray-800 rounded">
          <h3 className="text-lg font-semibold mb-2">Character Preview</h3>
          <p className="text-gray-300">
            <strong>{formData.name}</strong>, Level {formData.level} {formData.race} {formData.class}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            HP: {calculateMaxHP()} | AC: {10 + getModifier(formData.stats?.dexterity || 10)} | 
            Prof: +{getProficiencyBonus(formData.level!)}
          </p>
        </div>
      )}
    </div>
  );
}
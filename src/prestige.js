// ============================================================================
// PRESTIGE PATHS — tiers 3 and 4 of every class tree.
//
// At level 20, with the school's upgrade built (Knight Academy, Wizardry
// Academy, Cathedral), a character chooses one of two paths. Each path adds two
// tiers of four actives. Their specialisations follow the plan's four
// archetypes (Potency, Rider, Reach, Tempo) and are generated from each path's
// signature, so seven hundred nodes stay consistent with each other.
// ============================================================================
import { ABILITIES } from './data.js';

// [id, name, kind, shape, range, dmg, cd, power, apply, extra, desc]
// kind: attack | aoe | heal | buff | debuff | summon. range 'm' melee, 'r' ranged.
const A = (id, name, kind, shape, range, dmg, cd, power, apply, extra, desc) =>
  ({ id, name, kind, shape, range: range === 'm' ? 'melee' : range === 'r' ? 'ranged' : undefined, dmg, cd, power, apply: apply || [], extra: extra || {}, desc });

/** stat: the skill that powers the path; sig: its signature rider; spell: if its abilities are spells. */
export const PRESTIGE_PATHS = {
  fighter: {
    knight: { stat: 'melee', sig: ['stun', 0.4, 1], actives: [
      A('kn_shield_wall', 'Shield Wall', 'buff', 'party', null, null, 6, 0.5, [['fortify', 1, 3]], { barrier: 0.15 }, 'The party locks shields.'),
      A('kn_charge', 'Lance Charge', 'attack', 'single', 'm', 'weapon', 4, 1.9, [['stun', 0.5, 1]], { dive: true, prefer: 'back' }, 'Rides through the line.'),
      A('kn_oath', 'Oath of Protection', 'buff', 'self', null, null, 6, 0.4, [['guarding', 1, 3], ['taunting', 1, 2]], { taunt: true }, 'Takes the blows meant for others.'),
      A('kn_rebuke', 'Rebuke', 'attack', 'single', 'm', 'crush', 3, 1.3, [['weaken', 0.8, 2]], { interrupt: true }, 'A shield to the face; stops what it was doing.'),
      A('kn_bastion', 'Bastion', 'buff', 'party', null, null, 7, 0.5, [['resolute', 1, 2], ['fortify', 1, 3]], {}, 'Nothing moves the line.'),
      A('kn_valor', 'Valor', 'heal', 'party', null, null, 5, 0.55, [['brave', 1, 3]], {}, 'Heals and hardens the party.'),
      A('kn_trample', 'Trample', 'aoe', 'front', 'm', 'crush', 4, 1.1, [['slow', 0.6, 2]], {}, 'Rides the front line down.'),
      A('kn_last_bastion', 'Unbreakable', 'buff', 'self', null, null, 99, 0.5, [['deathward', 1, 10], ['physres', 1, 4]], {}, 'Once a fight: cannot fall.'),
    ] },
    warlord: { stat: 'melee', sig: ['vulnerable', 0.6, 2], actives: [
      A('wl_command', 'Command: Strike', 'buff', 'party', null, null, 5, 0.5, [['empower', 1, 2], ['inspired', 1, 2]], {}, 'Every ally hits harder.'),
      A('wl_whirlwind', 'Whirlwind', 'aoe', 'all', 'm', 'weapon', 4, 1.0, [], { dive: true }, 'Spins through everything.'),
      A('wl_execute', 'Execute', 'attack', 'single', 'm', 'weapon', 3, 1.6, [], { execute: 0.3 }, 'Finishes the wounded.'),
      A('wl_battle_cry', 'Battle Cry', 'debuff', 'all', 'r', null, 5, 0.5, [['fear', 0.5, 2], ['weaken', 0.6, 2]], {}, 'The enemy loses heart.'),
      A('wl_focus_fire', 'Focus Fire', 'debuff', 'single', 'r', null, 4, 0.6, [['vulnerable', 1, 3], ['sunder', 1, 3]], {}, 'Everyone, that one.'),
      A('wl_second_line', 'Second Line', 'heal', 'party', null, null, 6, 0.5, [['regen', 1, 3]], {}, 'Rotate the wounded back.'),
      A('wl_blade_storm', 'Blade Storm', 'attack', 'single', 'm', 'weapon', 3, 1.6, [['bleed', 0.6, 2]], { hits: 4 }, 'Four killing strokes.'),
      A('wl_warlord', 'Warlord\'s Presence', 'buff', 'party', null, null, 8, 0.6, [['haste', 1, 2], ['brave', 1, 3]], {}, 'The whole party moves at the warlord\'s pace.'),
    ] },
  },
  barbarian: {
    berserker: { stat: 'melee', sig: ['bleed', 0.6, 2], actives: [
      A('bs_frenzy', 'Frenzy', 'buff', 'self', null, null, 5, 0.5, [['haste', 1, 3], ['empower', 1, 3]], {}, 'Faster, harder, less careful.'),
      A('bs_rampage', 'Rampage', 'attack', 'single', 'm', 'weapon', 2, 1.5, [], { killReset: true }, 'Every kill feeds the next.'),
      A('bs_blood_rage', 'Blood Rage', 'buff', 'self', null, null, 6, 0.5, [['regen', 1, 3], ['physres', 1, 3]], { selfDamage: 0.08 }, 'Bleeds to heal.'),
      A('bs_decapitate', 'Decapitate', 'attack', 'single', 'm', 'weapon', 4, 1.8, [], { execute: 0.3 }, 'One swing, no more problem.'),
      A('bs_war_stomp', 'War Stomp', 'aoe', 'front', 'm', 'crush', 4, 1.0, [['stun', 0.45, 1]], {}, 'The ground jumps.'),
      A('bs_undying_rage', 'Undying Rage', 'buff', 'self', null, null, 99, 0.5, [['deathward', 1, 10], ['resolute', 1, 3]], {}, 'Too angry to die.'),
      A('bs_savage_leap', 'Savage Leap', 'attack', 'single', 'm', 'weapon', 3, 1.4, [['stun', 0.3, 1]], { dive: true, reachFlyers: true, prefer: 'back' }, 'Leaps onto anyone.'),
      A('bs_carnage', 'Carnage', 'aoe', 'all', 'm', 'weapon', 5, 1.2, [['bleed', 0.6, 2]], { dive: true }, 'Everything bleeds.'),
    ] },
    totem: { stat: 'survival', sig: ['root', 0.5, 1], actives: [
      A('tt_bear', 'Bear Totem', 'buff', 'party', null, null, 6, 0.5, [['fortify', 1, 3], ['physres', 1, 2]], {}, 'The bear shields the party.'),
      A('tt_wolf', 'Wolf Totem', 'buff', 'party', null, null, 6, 0.5, [['inspired', 1, 3]], {}, 'The pack hunts together.'),
      A('tt_eagle', 'Eagle Totem', 'buff', 'party', null, null, 6, 0.4, [['keen', 1, 3], ['evasive', 1, 2]], {}, 'Eyes that see fliers, wings that dodge.'),
      A('tt_spirit_claws', 'Spirit Claws', 'attack', 'single', 'm', 'nature', 2, 1.3, [['poison', 0.5, 2]], {}, 'Claws of the spirit world.'),
      A('tt_earth_bind', 'Earth Bind', 'debuff', 'all', 'r', null, 5, 0.5, [['root', 0.7, 2], ['slow', 0.6, 2]], {}, 'The earth holds them.'),
      A('tt_ancestors', 'Call of Ancestors', 'heal', 'party', null, null, 6, 0.6, [['regen', 1, 3]], {}, 'The ancestors mend.'),
      A('tt_stampede', 'Spirit Stampede', 'aoe', 'all', 'r', 'crush', 5, 1.1, [['stun', 0.3, 1]], {}, 'A herd of ghosts.'),
      A('tt_avatar', 'Avatar of the Wild', 'buff', 'self', null, null, 8, 0.6, [['empower', 1, 4], ['regen', 1, 4]], { barrier: 0.3 }, 'Becomes the totem.'),
    ] },
  },
  paladin: {
    templar: { stat: 'faith', sig: ['blind', 0.5, 2], spell: 'divine', actives: [
      A('tp_hallowed', 'Hallowed Ground', 'aoe', 'all', 'r', 'holy', 5, 1.0, [['blind', 0.4, 1]], { bonusVs: { undead: 1.5, fiend: 1.5 } }, 'The whole room turns holy.'),
      A('tp_resurrect', 'Resurrection', 'heal', 'ally', null, null, 99, 0.5, [], { revive: 0.6 }, 'Once a fight: the fallen rise at full strength.'),
      A('tp_aegis', 'Aegis', 'buff', 'party', null, null, 6, 0.5, [], { barrier: 0.2 }, 'Light hardens around everyone.'),
      A('tp_crusader', 'Crusader Strike', 'attack', 'single', 'm', 'holy', 2, 1.5, [], { bonusVs: { undead: 1.5, fiend: 1.5 } }, 'Righteous and relentless.'),
      A('tp_purge', 'Purge', 'buff', 'party', null, null, 4, 0.4, [], { cleanse: 3 }, 'Every curse burns away.'),
      A('tp_banish', 'Banish', 'debuff', 'single', 'r', null, 5, 0.6, [['stun', 0.8, 2], ['fear', 0.8, 2]], { onlyTags: ['undead', 'fiend'], ignoreMindless: true }, 'Sends the damned away for a while.'),
      A('tp_radiance', 'Radiance', 'heal', 'party', null, null, 5, 0.6, [['brave', 1, 2]], {}, 'Heals everyone it touches.'),
      A('tp_judgement_day', 'Judgement Day', 'aoe', 'all', 'r', 'holy', 7, 1.6, [['stun', 0.3, 1]], { windup: 1 }, 'Gathers light for a round, then lets it fall.'),
    ] },
    vengeance: { stat: 'faith', sig: ['doom', 0.5, 3], spell: 'divine', actives: [
      A('vg_dread_smite', 'Dread Smite', 'attack', 'single', 'm', 'shadow', 3, 1.7, [['fear', 0.5, 2]], {}, 'A smite that curses.'),
      A('vg_aura_hate', 'Aura of Hate', 'buff', 'party', null, null, 6, 0.5, [['empower', 1, 3]], {}, 'Allies hit with spite.'),
      A('vg_vow', 'Vow of Enmity', 'debuff', 'single', 'r', null, 4, 0.6, [['vulnerable', 1, 4], ['doom', 0.7, 3]], {}, 'This one dies.'),
      A('vg_soul_rend', 'Soul Rend', 'attack', 'single', 'm', 'shadow', 3, 1.3, [['drained', 0.6, 1]], { leech: 0.4 }, 'Takes what it cuts.'),
      A('vg_dark_aura', 'Dark Aura', 'debuff', 'all', 'r', null, 5, 0.5, [['weaken', 0.7, 2], ['blind', 0.4, 1]], {}, 'Enemies falter in the gloom.'),
      A('vg_relentless', 'Relentless Avenger', 'buff', 'self', null, null, 6, 0.5, [['haste', 1, 2], ['resolute', 1, 2]], {}, 'Nothing slows the hunt.'),
      A('vg_blight', 'Blight', 'aoe', 'front', 'r', 'shadow', 4, 1.1, [['doom', 0.5, 3]], {}, 'Rot across the front line.'),
      A('vg_annihilate', 'Annihilate', 'attack', 'single', 'm', 'shadow', 5, 2.2, [], { execute: 0.3 }, 'Ends it.'),
    ] },
  },
  rogue: {
    assassin: { stat: 'stealth', sig: ['poison', 0.7, 2], actives: [
      A('as_death_mark', 'Death Mark', 'debuff', 'single', 'r', null, 4, 0.6, [['vulnerable', 1, 4], ['sunder', 1, 3]], { preferCasters: true }, 'Marks the one who matters.'),
      A('as_assassinate', 'Assassinate', 'attack', 'single', 'm', 'weapon', 4, 2.2, [], { dive: true, helpless: true, execute: 0.3, prefer: 'back' }, 'From the shadows, the end.'),
      A('as_toxic_cloud', 'Toxic Cloud', 'debuff', 'all', 'r', null, 5, 0.5, [['poison', 0.8, 3]], {}, 'Everyone breathes it.'),
      A('as_shadow_dance', 'Shadow Dance', 'buff', 'self', null, null, 6, 0.4, [['stealth', 1, 2], ['haste', 1, 2]], {}, 'In and out of the dark.'),
      A('as_garrote', 'Garrote', 'attack', 'single', 'm', 'weapon', 3, 1.0, [['silence', 0.9, 2], ['bleed', 0.8, 2]], { dive: true, prefer: 'back' }, 'Silences a caster.'),
      A('as_blade_flurry', 'Blade Flurry', 'aoe', 'front', 'm', 'weapon', 3, 1.0, [['bleed', 0.5, 1]], {}, 'Knives everywhere at once.'),
      A('as_venom_master', 'Venom Mastery', 'buff', 'self', null, null, 6, 0.5, [['infused', 1, 4]], { infuse: 'nature' }, 'Every cut poisons.'),
      A('as_vanishing_act', 'Vanishing Act', 'buff', 'party', null, null, 8, 0.4, [['stealth', 0.8, 1], ['evasive', 1, 2]], {}, 'The whole party disappears.'),
    ] },
    trickster: { stat: 'arcana', sig: ['confuse', 0.4, 1], spell: 'arcane', actives: [
      A('tr_mirror_image', 'Mirror Images', 'buff', 'self', null, null, 5, 0.5, [['evasive', 1, 3]], { barrier: 0.15 }, 'Which one is real?'),
      A('tr_mind_spike', 'Mind Spike', 'attack', 'single', 'r', 'arcane', 2, 1.3, [['confuse', 0.4, 1]], {}, 'A needle in the mind.'),
      A('tr_steal_spell', 'Spell Thief', 'debuff', 'single', 'r', null, 3, 0.6, [['silence', 0.9, 2]], { interrupt: true, preferCasters: true }, 'Takes the spell mid-cast.'),
      A('tr_phantasm', 'Phantasmal Killer', 'attack', 'single', 'r', 'arcane', 4, 1.6, [['fear', 0.8, 2]], {}, 'Its worst fear, made real.'),
      A('tr_disguise', 'Disguise', 'buff', 'self', null, null, 6, 0.4, [['stealth', 1, 2]], {}, 'Nobody looks twice.'),
      A('tr_arcane_blades', 'Arcane Blades', 'buff', 'self', null, null, 5, 0.5, [['infused', 1, 4], ['empower', 1, 2]], { infuse: 'arcane' }, 'Blades that cut magic.'),
      A('tr_mass_confusion', 'Mass Confusion', 'debuff', 'all', 'r', null, 6, 0.5, [['confuse', 0.5, 2]], {}, 'They fight each other.'),
      A('tr_grand_heist', 'Grand Heist', 'attack', 'single', 'm', 'weapon', 5, 2.0, [['weaken', 1, 3]], { dive: true, helpless: true }, 'Takes everything.'),
    ] },
  },
  ranger: {
    beastmaster: { stat: 'animals', sig: ['bleed', 0.5, 1], actives: [
      A('bm_companion', 'Call Companion', 'summon', 'self', null, null, 99, 1, [], { summon: ['dire_wolf', 1] }, 'A dire wolf answers.'),
      A('bm_pack_hunt', 'Pack Hunt', 'buff', 'party', null, null, 5, 0.5, [['inspired', 1, 3], ['haste', 0.5, 2]], {}, 'Everyone hunts as one.'),
      A('bm_maul', 'Coordinated Maul', 'attack', 'single', 'r', 'slash', 2, 1.4, [['bleed', 0.6, 2]], {}, 'Arrow and fang together.'),
      A('bm_mend_beast', 'Mend Beast', 'heal', 'party', null, null, 4, 0.5, [], { onlyTags: ['beast'] }, 'Tends the animals.'),
      A('bm_stampede', 'Stampede', 'aoe', 'all', 'r', 'crush', 5, 1.1, [['stun', 0.3, 1]], {}, 'Calls the wild through the room.'),
      A('bm_hawk', 'Hawk Eye', 'buff', 'party', null, null, 5, 0.4, [['keen', 1, 3]], {}, 'A hawk spots the fliers.'),
      A('bm_second_beast', 'Second Companion', 'summon', 'self', null, null, 99, 1, [], { summon: ['griffon', 1] }, 'A griffon joins.'),
      A('bm_alpha', 'Alpha Roar', 'debuff', 'all', 'r', null, 6, 0.5, [['fear', 0.6, 2]], {}, 'The pack leader speaks.'),
    ] },
    sharpshooter: { stat: 'ranged', sig: ['vulnerable', 0.6, 2], actives: [
      A('ss_snipe', 'Snipe', 'attack', 'single', 'r', 'pierce', 3, 2.0, [], { preferCasters: true }, 'The shot nobody sees coming.'),
      A('ss_multishot', 'Multishot', 'attack', 'single', 'r', 'pierce', 2, 1.4, [], { hits: 3, chain: 1 }, 'Three arrows, three targets.'),
      A('ss_trueshot', 'Trueshot', 'buff', 'self', null, null, 6, 0.5, [['empower', 1, 3], ['inspired', 1, 3]], {}, 'Every shot lands where it should.'),
      A('ss_disabling', 'Disabling Shot', 'attack', 'single', 'r', 'pierce', 3, 1.0, [['slow', 0.9, 2], ['weaken', 0.6, 2]], { interrupt: true }, 'A knee, a hand, a throat.'),
      A('ss_barrage', 'Barrage', 'aoe', 'all', 'r', 'pierce', 4, 1.0, [], { grounds: true }, 'The sky is arrows.'),
      A('ss_explosive', 'Explosive Arrow', 'aoe', 'front', 'r', 'fire', 4, 1.2, [['burn', 0.6, 3]], {}, 'Arrow and bomb.'),
      A('ss_camouflage', 'Camouflage', 'buff', 'self', null, null, 5, 0.4, [['stealth', 1, 2], ['evasive', 1, 2]], {}, 'Gone into the stone.'),
      A('ss_killshot', 'Killshot', 'attack', 'single', 'r', 'pierce', 5, 2.4, [], { execute: 0.3 }, 'The last arrow.'),
    ] },
  },
  monk: {
    grandmaster: { stat: 'melee', sig: ['stun', 0.4, 1], actives: [
      A('gm_hundred_fists', 'Hundred Fists', 'attack', 'single', 'm', 'crush', 3, 1.8, [], { hits: 5 }, 'Too many to count.'),
      A('gm_perfect_self', 'Perfect Self', 'buff', 'self', null, null, 6, 0.5, [['evasive', 1, 3], ['regen', 1, 3], ['resolute', 1, 2]], {}, 'Untouchable.'),
      A('gm_dim_mak', 'Dim Mak', 'debuff', 'single', 'm', null, 5, 1.5, [['doom', 1, 4]], {}, 'The death touch.'),
      A('gm_diamond_soul', 'Diamond Soul', 'buff', 'self', null, null, 5, 0.4, [], { cleanse: 4, barrier: 0.2 }, 'Nothing takes hold.'),
      A('gm_flying_kick', 'Flying Kick', 'attack', 'single', 'm', 'crush', 3, 1.5, [['stun', 0.4, 1]], { dive: true, reachFlyers: true }, 'Reaches anything.'),
      A('gm_serenity', 'Serenity', 'heal', 'party', null, null, 6, 0.5, [], { cleanse: 1 }, 'Calm spreads.'),
      A('gm_sweep', 'Leg Sweep', 'aoe', 'front', 'm', 'crush', 4, 0.9, [['stun', 0.5, 1]], {}, 'The whole line falls.'),
      A('gm_empty_body', 'Empty Body', 'buff', 'self', null, null, 7, 0.4, [['stealth', 1, 2], ['physres', 1, 3]], {}, 'Nobody there.'),
    ] },
    elements: { stat: 'faith', sig: ['burn', 0.5, 3], actives: [
      A('el_fist_flame', 'Fist of Flame', 'attack', 'single', 'm', 'fire', 2, 1.4, [['burn', 0.5, 3]], {}, 'Burning palm.'),
      A('el_water_whip', 'Water Whip', 'attack', 'single', 'r', 'frost', 2, 1.1, [['wet', 1, 3], ['chill', 0.6, 1]], { pull: true }, 'Drags and soaks.'),
      A('el_thunder_step', 'Thunder Step', 'aoe', 'front', 'm', 'storm', 3, 1.1, [['shock', 0.6, 2]], {}, 'Lightning in every step.'),
      A('el_stone_skin', 'Stone Skin', 'buff', 'self', null, null, 6, 0.5, [['fortify', 1, 4], ['physres', 1, 3]], {}, 'Skin like granite.'),
      A('el_gale', 'Gale Palm', 'aoe', 'all', 'r', 'crush', 4, 0.9, [], { grounds: true }, 'Blows fliers out of the sky.'),
      A('el_frost_fist', 'Frozen Fist', 'attack', 'single', 'm', 'frost', 3, 1.3, [['chill', 1, 2]], {}, 'Freezes as it strikes.'),
      A('el_harmony', 'Elemental Harmony', 'buff', 'party', null, null, 6, 0.4, [['ward', 1, 3]], {}, 'Wards the party.'),
      A('el_avatar', 'Avatar of Elements', 'buff', 'self', null, null, 8, 0.6, [['infused', 1, 4], ['empower', 1, 4], ['haste', 1, 2]], { infuse: 'storm' }, 'Every element at once.'),
    ] },
  },
  wizard: {
    archmage: { stat: 'arcana', sig: ['burn', 0.5, 3], spell: 'arcane', actives: [
      A('am_meteor', 'Meteor Swarm', 'aoe', 'all', 'r', 'fire', 6, 1.8, [['burn', 0.7, 3]], { windup: 1 }, 'A round of warning, then fire from the sky.'),
      A('am_disintegrate', 'Disintegrate', 'attack', 'single', 'r', 'arcane', 4, 2.2, [], { execute: 0.2 }, 'Nothing left.'),
      A('am_cone_cold', 'Cone of Cold', 'aoe', 'front', 'r', 'frost', 4, 1.2, [['chill', 1, 2]], {}, 'The front line freezes.'),
      A('am_chain_lightning', 'Chain Lightning', 'attack', 'single', 'r', 'storm', 3, 1.4, [['shock', 0.6, 2]], { chain: 3 }, 'Arcs through four.'),
      A('am_arcane_mastery', 'Arcane Mastery', 'buff', 'self', null, null, 7, 0.5, [['empower', 1, 4]], {}, 'Every spell stronger.'),
      A('am_prismatic', 'Prismatic Wall', 'buff', 'party', null, null, 7, 0.5, [], { barrier: 0.2 }, 'A wall of every colour.'),
      A('am_power_word', 'Power Word Kill', 'attack', 'single', 'r', 'arcane', 6, 1.5, [], { execute: 0.35 }, 'One word, and it dies.'),
      A('am_wish', 'Wish', 'heal', 'party', null, null, 99, 1.0, [], { cleanse: 5 }, 'Once a fight: anything.'),
    ] },
    chronomancer: { stat: 'arcana', sig: ['slow', 0.6, 2], spell: 'arcane', actives: [
      A('cm_haste', 'Mass Haste', 'buff', 'party', null, null, 6, 0.5, [['haste', 1, 3]], {}, 'The party moves twice as fast.'),
      A('cm_slow', 'Mass Slow', 'debuff', 'all', 'r', null, 5, 0.5, [['slow', 0.8, 2]], {}, 'The enemy wades through time.'),
      A('cm_time_stop', 'Time Stop', 'debuff', 'all', 'r', null, 8, 0.5, [['stun', 0.7, 1]], {}, 'Everything stops but you.'),
      A('cm_rewind', 'Rewind', 'heal', 'ally', null, null, 5, 0.9, [], { cleanse: 2 }, 'Undo the wound.'),
      A('cm_age', 'Accelerate Age', 'attack', 'single', 'r', 'arcane', 3, 1.3, [['weaken', 0.8, 3], ['drained', 0.5, 1]], {}, 'Years in a moment.'),
      A('cm_temporal_shield', 'Temporal Shield', 'buff', 'party', null, null, 6, 0.5, [['evasive', 1, 2]], { barrier: 0.12 }, 'Blows arrive a moment too late.'),
      A('cm_paradox', 'Paradox Bolt', 'attack', 'single', 'r', 'arcane', 2, 1.5, [['confuse', 0.4, 1]], { interrupt: true }, 'Hits before it is cast.'),
      A('cm_eternity', 'Moment of Eternity', 'buff', 'self', null, null, 99, 0.6, [['haste', 1, 5], ['empower', 1, 5]], { resetCds: true }, 'Once a fight: all the time in the world.'),
    ] },
  },
  warlock: {
    pactlord: { stat: 'arcana', sig: ['doom', 0.5, 3], spell: 'arcane', actives: [
      A('pl_patron', 'Summon Patron\'s Aspect', 'summon', 'self', null, null, 99, 1, [], { summon: ['vrock', 1] }, 'Something vast answers.'),
      A('pl_soul_harvest', 'Soul Harvest', 'aoe', 'all', 'r', 'shadow', 5, 1.1, [['drained', 0.5, 1]], { leech: 0.3 }, 'Takes a little from everyone.'),
      A('pl_eldritch_storm', 'Eldritch Storm', 'attack', 'single', 'r', 'arcane', 2, 1.6, [], { hits: 4 }, 'Four beams.'),
      A('pl_dark_bargain', 'Dark Bargain', 'buff', 'self', null, null, 6, 0.5, [['empower', 1, 4]], { selfDamage: 0.1 }, 'Power for blood.'),
      A('pl_hellfire', 'Hellfire', 'aoe', 'front', 'r', 'fire', 4, 1.3, [['burn', 0.6, 3]], {}, 'Fire that does not go out.'),
      A('pl_banishment', 'Banishment', 'debuff', 'single', 'r', null, 6, 0.6, [['stun', 0.9, 2]], { interrupt: true }, 'Sent somewhere else for a while.'),
      A('pl_pact_shield', 'Pact Shield', 'buff', 'party', null, null, 6, 0.5, [], { barrier: 0.15 }, 'The patron protects its investments.'),
      A('pl_doom_gate', 'Doom Gate', 'debuff', 'all', 'r', null, 7, 1.0, [['doom', 0.8, 4]], {}, 'Everyone is doomed.'),
    ] },
    hexblade: { stat: 'melee', sig: ['weaken', 0.6, 2], actives: [
      A('hb_cursed_blade', 'Cursed Blade', 'buff', 'self', null, null, 5, 0.5, [['infused', 1, 4], ['empower', 1, 3]], { infuse: 'shadow', toFront: true }, 'Steps into the front with a hungry blade.'),
      A('hb_hex_strike', 'Hex Strike', 'attack', 'single', 'm', 'shadow', 2, 1.4, [['weaken', 0.6, 2]], {}, 'Curses as it cuts.'),
      A('hb_shadow_armor', 'Armor of Shadows', 'buff', 'self', null, null, 5, 0.5, [['fortify', 1, 3], ['frostarmor', 1, 3]], {}, 'Darkness that bites back.'),
      A('hb_accursed', 'Accursed Specter', 'summon', 'self', null, null, 99, 1, [], { summon: ['wraith', 1] }, 'A slain foe\'s ghost serves.'),
      A('hb_life_eater', 'Life Eater', 'attack', 'single', 'm', 'shadow', 3, 1.5, [['drained', 0.6, 1]], { leech: 0.5 }, 'Eats life.'),
      A('hb_eldritch_smite', 'Eldritch Smite', 'attack', 'single', 'm', 'arcane', 3, 1.7, [['stun', 0.4, 1]], {}, 'A blade full of force.'),
      A('hb_curse_ward', 'Curse Ward', 'buff', 'party', null, null, 6, 0.4, [], { cleanse: 2, barrier: 0.08 }, 'Curses slide off.'),
      A('hb_master_hex', 'Master of Hexes', 'debuff', 'all', 'r', null, 6, 0.6, [['weaken', 0.8, 3], ['vulnerable', 0.8, 3]], {}, 'Hexes everyone.'),
    ] },
  },
  cleric: {
    highpriest: { stat: 'faith', sig: ['regen', 1, 3], spell: 'divine', actives: [
      A('hp_mass_resurrect', 'Mass Resurrection', 'heal', 'ally', null, null, 99, 0.5, [], { revive: 0.5 }, 'Once a fight: the fallen rise.'),
      A('hp_holy_nova', 'Holy Nova', 'aoe', 'all', 'r', 'holy', 4, 1.0, [], { bonusVs: { undead: 1.5, fiend: 1.5 } }, 'Light bursts from the priest.'),
      A('hp_divine_hymn', 'Divine Hymn', 'heal', 'party', null, null, 5, 0.9, [['regen', 1, 3]], {}, 'A song that heals everything.'),
      A('hp_sanctuary', 'Sanctuary', 'buff', 'party', null, null, 7, 0.5, [['evasive', 1, 2]], { barrier: 0.18 }, 'Nobody is hit.'),
      A('hp_greater_restore', 'Greater Restoration', 'buff', 'party', null, null, 4, 0.4, [], { cleanse: 4 }, 'Every curse lifted.'),
      A('hp_guardian', 'Guardian of Faith', 'summon', 'self', null, null, 99, 1, [], { summon: ['shield_guardian', 1] }, 'A spectral guardian.'),
      A('hp_word_recall', 'Word of Radiance', 'aoe', 'front', 'r', 'holy', 3, 1.1, [['blind', 0.5, 1]], {}, 'A word that burns.'),
      A('hp_miracle', 'Miracle', 'heal', 'party', null, null, 99, 2.0, [['deathward', 1, 10]], {}, 'Once a fight: a miracle.'),
    ] },
    warpriest: { stat: 'faith', sig: ['stun', 0.35, 1], spell: 'divine', actives: [
      A('wp_holy_strike', 'Divine Strike', 'attack', 'single', 'm', 'holy', 2, 1.5, [['blind', 0.4, 1]], {}, 'Mace and prayer.'),
      A('wp_war_god', 'Blessing of the War God', 'buff', 'party', null, null, 5, 0.5, [['empower', 1, 3], ['inspired', 1, 3]], {}, 'The god of war approves.'),
      A('wp_hammer', 'Spiritual Hammer', 'summon', 'self', null, null, 99, 1, [], { summon: ['flying_sword', 2] }, 'Weapons of light fight alone.'),
      A('wp_crusade', 'Crusade', 'buff', 'self', null, null, 5, 0.5, [['haste', 1, 2], ['fortify', 1, 3]], { toFront: true }, 'Into the front line.'),
      A('wp_smite_evil', 'Smite Evil', 'attack', 'single', 'm', 'holy', 3, 1.8, [], { bonusVs: { undead: 1.6, fiend: 1.6 } }, 'Evil ends here.'),
      A('wp_battle_prayer', 'Battle Prayer', 'heal', 'party', null, null, 5, 0.6, [['brave', 1, 3]], {}, 'Heals mid-fight.'),
      A('wp_earthquake', 'Earthquake', 'aoe', 'all', 'r', 'crush', 6, 1.2, [['stun', 0.35, 1]], { windup: 1 }, 'The god stamps.'),
      A('wp_avatar', 'Avatar of War', 'buff', 'self', null, null, 99, 0.7, [['empower', 1, 5], ['resolute', 1, 5], ['physres', 1, 5]], {}, 'Once a fight: the god walks.'),
    ] },
  },
  druid: {
    archdruid: { stat: 'faith', sig: ['root', 0.5, 2], spell: 'divine', actives: [
      A('ad_earthquake', 'Earthquake', 'aoe', 'all', 'r', 'crush', 6, 1.3, [['stun', 0.4, 1]], { windup: 1 }, 'The ground opens.'),
      A('ad_elemental_form', 'Elemental Form', 'buff', 'self', null, null, 7, 0.6, [['empower', 1, 4], ['fortify', 1, 4]], { barrier: 0.35, toFront: true, infuse: 'fire' }, 'Becomes living fire and stone.'),
      A('ad_tranquility', 'Tranquility', 'heal', 'party', null, null, 6, 1.0, [['regen', 1, 4]], {}, 'Everyone mends.'),
      A('ad_treant', 'Awaken Treant', 'summon', 'self', null, null, 99, 1, [], { summon: ['earth_elemental', 1] }, 'The trees fight.'),
      A('ad_wrath', 'Wrath', 'attack', 'single', 'r', 'nature', 2, 1.4, [['poison', 0.6, 2]], {}, 'Nature\'s anger.'),
      A('ad_hurricane', 'Hurricane', 'aoe', 'all', 'r', 'storm', 5, 1.1, [['wet', 1, 3]], { grounds: true }, 'Wind and rain, then lightning.'),
      A('ad_grove', 'Grove of Life', 'buff', 'party', null, null, 6, 0.5, [['regen', 1, 4], ['fortify', 1, 3]], {}, 'A grove grows around the party.'),
      A('ad_shapechange', 'Shapechange', 'buff', 'self', null, null, 99, 0.7, [['haste', 1, 5], ['empower', 1, 5]], { barrier: 0.5 }, 'Once a fight: becomes anything.'),
    ] },
    stormcaller: { stat: 'faith', sig: ['shock', 0.6, 2], spell: 'divine', actives: [
      A('sc_storm', 'Storm Call', 'aoe', 'all', 'r', 'storm', 4, 1.1, [['shock', 0.5, 2]], {}, 'The storm answers.'),
      A('sc_rain', 'Drenching Rain', 'debuff', 'all', 'r', null, 4, 0.5, [['wet', 1, 4]], {}, 'Everyone is soaked — and conductive.'),
      A('sc_bolt', 'Thunderbolt', 'attack', 'single', 'r', 'storm', 2, 1.6, [['stun', 0.3, 1]], {}, 'One enormous bolt.'),
      A('sc_winds', 'Tailwind', 'buff', 'party', null, null, 6, 0.4, [['haste', 1, 2], ['evasive', 1, 2]], {}, 'The wind pushes the party.'),
      A('sc_eye', 'Eye of the Storm', 'buff', 'self', null, null, 6, 0.5, [], { barrier: 0.25, cleanse: 2 }, 'Calm at the centre.'),
      A('sc_ball', 'Ball Lightning', 'attack', 'single', 'r', 'storm', 3, 1.3, [], { chain: 3 }, 'It bounces.'),
      A('sc_tempest', 'Tempest', 'aoe', 'all', 'r', 'storm', 6, 1.5, [['stun', 0.3, 1]], { windup: 1, grounds: true }, 'A round of gathering clouds.'),
      A('sc_storm_lord', 'Storm Lord', 'buff', 'self', null, null, 99, 0.7, [['empower', 1, 5], ['haste', 1, 3]], { resetCds: true }, 'Once a fight: the storm itself.'),
    ] },
  },
  bard: {
    maestro: { stat: 'social', sig: ['inspired', 1, 2], spell: 'arcane', actives: [
      A('ma_crescendo', 'Crescendo', 'buff', 'party', null, null, 6, 0.6, [['haste', 1, 3], ['empower', 1, 2]], {}, 'Everything speeds up.'),
      A('ma_encore', 'Encore', 'buff', 'party', null, null, 7, 0.4, [], { resetCds: true, cleanse: 1 }, 'Again!'),
      A('ma_symphony', 'Symphony', 'heal', 'party', null, null, 5, 0.8, [['regen', 1, 3]], {}, 'A song that heals.'),
      A('ma_mass_charm', 'Mass Charm', 'debuff', 'all', 'r', null, 6, 0.5, [['charm', 0.4, 1]], {}, 'They turn on each other.'),
      A('ma_power_chord', 'Power Chord', 'aoe', 'all', 'r', 'storm', 4, 1.1, [['stun', 0.3, 1]], {}, 'Sound as a weapon.'),
      A('ma_lullaby', 'Deep Lullaby', 'debuff', 'all', 'r', null, 5, 0.5, [['sleep', 0.5, 2]], {}, 'Sleep for everyone.'),
      A('ma_ballad', 'Ballad of Heroes', 'buff', 'party', null, null, 6, 0.5, [['brave', 1, 3], ['resolute', 1, 2]], { barrier: 0.1 }, 'Heroes do not fall.'),
      A('ma_magnum_opus', 'Magnum Opus', 'buff', 'party', null, null, 99, 0.8, [['haste', 1, 4], ['empower', 1, 4], ['inspired', 1, 4]], {}, 'Once a fight: the greatest song.'),
    ] },
    skald: { stat: 'melee', sig: ['fear', 0.4, 2], actives: [
      A('sk_war_song', 'War Song', 'buff', 'party', null, null, 5, 0.5, [['empower', 1, 3]], {}, 'Blades sing.'),
      A('sk_blade_song', 'Blade Song', 'buff', 'self', null, null, 5, 0.5, [['evasive', 1, 3], ['haste', 1, 2]], { toFront: true }, 'Dances into the front line.'),
      A('sk_saga_strike', 'Saga Strike', 'attack', 'single', 'm', 'weapon', 2, 1.4, [['fear', 0.4, 2]], {}, 'A strike worth singing about.'),
      A('sk_horn', 'War Horn', 'debuff', 'all', 'r', null, 5, 0.5, [['fear', 0.6, 2]], {}, 'Enemies flinch.'),
      A('sk_shout', 'Thunder Shout', 'aoe', 'front', 'r', 'storm', 3, 1.0, [['stun', 0.35, 1]], {}, 'A shout that deafens.'),
      A('sk_rally', 'Rally the Fallen', 'heal', 'ally', null, null, 99, 0.5, [], { revive: 0.4 }, 'Once a fight: a fallen friend rises.'),
      A('sk_berserk_verse', 'Berserker Verse', 'buff', 'party', null, null, 7, 0.5, [['haste', 1, 2], ['physres', 1, 2]], {}, 'A verse that drives the party mad.'),
      A('sk_legend', 'Living Legend', 'buff', 'self', null, null, 99, 0.7, [['deathward', 1, 10], ['empower', 1, 5]], {}, 'Once a fight: a legend cannot die.'),
    ] },
  },
  artificer: {
    battlesmith: { stat: 'smithing', sig: ['stun', 0.35, 1], actives: [
      A('bsm_defender', 'Steel Defender', 'summon', 'self', null, null, 99, 1, [], { summon: ['iron_golem', 1] }, 'An iron golem walks out of the workshop.'),
      A('bsm_cannon', 'Siege Cannon', 'attack', 'single', 'r', 'crush', 4, 2.2, [['stun', 0.5, 1]], { windup: 1 }, 'Loads for a round, then fires.'),
      A('bsm_arcane_jolt', 'Arcane Jolt', 'attack', 'single', 'm', 'storm', 2, 1.4, [['shock', 0.6, 2]], {}, 'A hammer full of lightning.'),
      A('bsm_repair_all', 'Field Repairs', 'heal', 'party', null, null, 5, 0.7, [], { barrier: 0.08 }, 'Patches everyone and everything.'),
      A('bsm_overdrive', 'Overdrive', 'buff', 'party', null, null, 6, 0.5, [['haste', 1, 2]], { onlyTags: ['construct', 'beast', 'humanoid'] }, 'Everything runs hot.'),
      A('bsm_mines', 'Minefield', 'aoe', 'front', 'r', 'fire', 4, 1.1, [['burn', 0.5, 3], ['slow', 0.4, 1]], {}, 'The floor explodes.'),
      A('bsm_plating', 'Adamantine Plating', 'buff', 'party', null, null, 7, 0.5, [['fortify', 1, 4]], {}, 'Armour on everyone.'),
      A('bsm_doomsday', 'Doomsday Device', 'aoe', 'all', 'r', 'fire', 99, 2.2, [['burn', 0.8, 3]], { windup: 2 }, 'Once a fight. Two rounds. Then everything.'),
    ] },
    alchemist: { stat: 'alchemy', sig: ['poison', 0.5, 2], actives: [
      A('al_elixir', 'Elixir of Health', 'heal', 'party', null, null, 5, 0.8, [], { cleanse: 1 }, 'A drink for everyone.'),
      A('al_acid_flask', 'Acid Flask', 'aoe', 'front', 'r', 'nature', 3, 1.1, [['sunder', 0.8, 3]], {}, 'Eats armour.'),
      A('al_bomb', 'Alchemist\'s Bomb', 'aoe', 'all', 'r', 'fire', 4, 1.1, [['burn', 0.5, 3]], {}, 'Everything burns.'),
      A('al_mutagen', 'Mutagen', 'buff', 'self', null, null, 6, 0.5, [['empower', 1, 3], ['regen', 1, 3]], {}, 'Grows stronger for a while.'),
      A('al_smoke', 'Smoke Vial', 'debuff', 'all', 'r', null, 5, 0.5, [['blind', 0.7, 2]], {}, 'Nobody can see.'),
      A('al_frost_vial', 'Frost Vial', 'attack', 'single', 'r', 'frost', 2, 1.3, [['chill', 1, 2]], {}, 'Freezes on impact.'),
      A('al_panacea', 'Panacea', 'buff', 'party', null, null, 5, 0.4, [], { cleanse: 4 }, 'Cures everything.'),
      A('al_philosophers', 'Philosopher\'s Stone', 'heal', 'party', null, null, 99, 1.5, [['regen', 1, 5]], { barrier: 0.2 }, 'Once a fight: gold from lead, life from death.'),
    ] },
  },
};

/**
 * Register every prestige active into the ability table and build its
 * generated specialisations. Returns { [klass]: { [path]: tiers[2] } } in the
 * same shape as the base trees.
 */
function buildPrestigeTiers() {
  const out = {};
  for (const [klass, paths] of Object.entries(PRESTIGE_PATHS)) {
    out[klass] = {};
    for (const [pathId, P] of Object.entries(paths)) {
      const tiers = [[], []];
      P.actives.forEach((a, i) => {
        const ab = {
          name: a.name, kind: a.kind, shape: a.shape, cd: a.cd, power: a.power, stat: P.stat, desc: a.desc,
          apply: a.apply.map(r => [...r]), prestige: pathId, ...a.extra,
        };
        if (a.range) ab.range = a.range;
        if (a.dmg) ab.dmg = a.dmg;
        if (P.spell && a.kind !== 'summon') ab.spell = P.spell;
        ABILITIES[a.id] = ab;
        tiers[i < 4 ? 0 : 1].push({ id: a.id, specs: genSpecs(ab, P) });
      });
      out[klass][pathId] = tiers;
    }
  }
  return out;
}

/** The four archetypes: Potency, Rider, Reach, Tempo. */
function genSpecs(ab, P) {
  const [sig, sch, sn] = P.sig;
  const offensive = ab.kind === 'attack' || ab.kind === 'aoe' || ab.kind === 'debuff';
  const rider = offensive
    ? { name: 'Signature', desc: `Adds ${sig}.`, fx: { add: [[sig, sch, sn]] } }
    : ab.kind === 'summon'
      ? { name: 'Bonded', desc: 'You regenerate while it fights.', fx: { self: [['regen', 1, 3]] } }
      : { name: 'Lasting', desc: '+2 rounds.', fx: { dur: 2 } };
  let reach;
  if (ab.kind === 'attack') reach = { name: 'Chain', desc: 'Also strikes a second foe.', fx: { chain: 1 } };
  else if (ab.kind === 'aoe' && ab.shape === 'front') reach = { name: 'Wide', desc: 'Hits every enemy.', fx: { shape: 'all', p: -0.15 } };
  else if (ab.kind === 'aoe') reach = { name: 'Reaching', desc: 'Drags fliers down.', fx: { grounds: true } };
  else if (ab.kind === 'debuff' && ab.shape !== 'all') reach = { name: 'Spreading', desc: 'Hits every enemy.', fx: { shape: 'all', p: -0.2 } };
  else if (ab.kind === 'buff' && ab.shape === 'self') reach = { name: 'Shared', desc: 'Also steadies the party.', fx: { party: [['brave', 1, 2]] } };
  else if (ab.kind === 'summon') reach = { name: 'Legion', desc: 'Summons one more.', fx: { summonN: 1 } };
  else reach = { name: 'Warding', desc: 'Adds a barrier.', fx: { barrier: 0.08 } };
  const tempo = ab.cd >= 99
    ? { name: 'Twice', desc: 'Can be used twice a fight.', fx: { cd: -94 } }
    : { name: 'Quickened', desc: ab.cd >= 6 ? '−2 cooldown.' : '−1 cooldown.', fx: { cd: ab.cd >= 6 ? -2 : -1 } };
  const potency = ab.kind === 'heal' ? { name: 'Greater', desc: '+40% healing.', fx: { heal: 0.4 } }
    : ab.kind === 'summon' ? { name: 'Mighty', desc: 'Its summoner is empowered.', fx: { self: [['empower', 1, 3]] } }
      : { name: 'Empowered', desc: '+35% power.', fx: { p: 0.35 } };
  return [potency, rider, reach, tempo];
}

export const PRESTIGE_TIERS = buildPrestigeTiers();

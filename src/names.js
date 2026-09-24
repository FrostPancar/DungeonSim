// Procedural names. Syllable pools per ancestry group + earned epithets.
const POOLS = {
  human:    { a: ['Ald','Bren','Cor','Dav','El','Fen','Gar','Hal','Ives','Jor','Kest','Lan','Mar','Ner','Os','Per','Quen','Rold','Sam','Tor','Ul','Ver','Wen'],
              b: ['an','eth','ic','on','win','ard','is','or','ek','ia','ram','wyn','ton','ic','elle'],
              s: ['Ash','Bram','Cole','Dunn','Ferrow','Grange','Hollis','Kerr','Marsh','Pell','Quarry','Reed','Stone','Vane','Wyck'] },
  dwarf:    { a: ['Bar','Dur','Gim','Thra','Grun','Kaz','Mor','Nal','Ori','Thor','Bru','Dain','Hel','Vond'],
              b: ['in','ur','li','rim','din','ak','grim','na','gar','dis','run'],
              s: ['Ironfoot','Stonebeard','Deepdelve','Emberhand','Coalvein','Anvilsson','Gravelborn','Hammerfall'] },
  elf:      { a: ['Ae','Cael','El','Fael','Ith','Lae','Myr','Nae','Ryl','Syl','Thae','Vael','Yl'],
              b: ['riel','ndil','wen','thas','lorn','ara','miel','ien','sil','thar'],
              s: ['Moonwhisper','Duskleaf','Silverbough','Nightbloom','Thornlight','Windrelle'] },
  halfling: { a: ['Bilbo','Dilly','Fenn','Gam','Hob','Lil','Merr','Nib','Pip','Rosie','Tuck','Wil'],
              b: ['kin','bee','ly','o','ket','dy','row','na'],
              s: ['Applebrook','Goodbarrel','Thistledown','Hearthly','Pennywhistle','Underhill'] },
  gnome:    { a: ['Fizz','Gim','Nix','Pib','Quib','Snee','Tink','Wob','Zan','Bim'],
              b: ['wick','le','bit','ora','ix','pin','dle','zo'],
              s: ['Cogwhistle','Sparkbolt','Gearmantle','Fiddlewrench','Brasspocket'] },
  orc:      { a: ['Gor','Thrak','Ug','Mog','Ka','Rhen','Burz','Dro','Shag','Varg'],
              b: ['nak','gash','ul','mor','zug','rak','uk','dan'],
              s: ['Skullsplit','Bonecarver','Redmaw','Ironjaw','Stormgut','Ashfang'] },
  goblin:   { a: ['Snik','Griz','Zik','Nib','Wug','Kreg','Yip','Blat','Skug'],
              b: ['nit','ka','zle','og','rik','tch','gub'],
              s: ['the Quick','Ratbiter','Pocketfull','Nine-fingers','Toothless'] },
  kobold:   { a: ['Kip','Sral','Tek','Mek','Yip','Zik','Vess','Nurl'],
              b: ['tek','zik','ra','kin','sss','ku'],
              s: ['Trapmaker','Tunnelborn','the Small','Sharpstick'] },
  tiefling: { a: ['Az','Kael','Mor','Ny','Sera','Val','Zar','Ish','Leth'],
              b: ['riel','dus','ith','ara','on','vex','ame'],
              s: ['Emberkin','Duskborn','Ninefold','Ashen','Hollowvein'] },
  dragonkin:{ a: ['Bahal','Krix','Sorn','Vrak','Zeth','Dhar','Mirex'],
              b: ['arax','oth','issa','ur','ax','en'],
              s: ['Goldscale','Cinderwing','Stormhorn','Deepcoil'] },
  undead:   { a: ['The','Grey','Hollow','Pale','Cold','Old','Gaunt'],
              b: [''], s: ['Warden','Rememberer','Choirman','Sentinel','Thing','Widow','Sleeper'] },
  aberrant: { a: ['Yth','Uu','Vor','Xel','Ngg','Qoth'],
              b: ['-aaa','-eth','th','rr','\'ul'], s: ['That Counts','Below','Unfolding','With Many Doors'] },
  beast:    { a: ['Gnaw','Snarl','Blood','Ash','Grey','Fang','Broke'],
              b: [''], s: ['-tooth','-hide','-back','-claw','-runner','-stalker'] },
  construct:{ a: ['Unit','Sentinel','Keeper','Warden','Engine'],
              b: [''], s: ['VII','XII','of the Third Gate','Mark Four','Unnumbered'] },
};
const TITLES = ['the Steady','the Loud','Twice-lost','the Patient','Longshanks','the Kind','Hollow-eyed','the Quiet','Ninefingers','the Bold','Rainhated','the Dull','Smallhands','the Unwashed','Late-come','the Grim'];

export function generateName(rng, raceId) {
  const p = POOLS[raceId] || POOLS.human;
  const first = rng.pick(p.a) + rng.pick(p.b);
  let last = rng.pick(p.s);
  if (raceId === 'beast') last = rng.pick(p.a) + rng.pick(p.s);
  const nick = rng.chance(0.14) ? rng.pick(TITLES) : null;
  const full = last.startsWith('-') ? first + last : first + ' ' + last;
  return { first, last, nick, full: nick ? `${full} "${nick}"` : full, short: first };
}

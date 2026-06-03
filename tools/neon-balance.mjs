/* Neon-defense balance simulator (static model).
 * Placement-strategy TD: deliberate towers along a serpentine path, 3-level
 * upgrades, hard counters (strongVs ×1.5 / weakVs ×0.6), income+interest econ.
 * Mirrors the structure of td-balance.mjs so CI can run both the same way.
 *   node tools/neon-balance.mjs
 *
 * Numbers mirror public/td/games/neon-defense/index.html — keep in sync.
 *
 * FINDINGS (2026-06):
 *  - pulse was DPS/gold 효율 1위(0.750) despite being the cheap 만능형 + 대공 +
 *    2 counters → optimal play was pulse-spam. Lv2/3 dmg trimmed (18→16, 42→34)
 *    so burst (AoE 일꾼) reclaims the efficiency lead and roles separate cleanly.
 *  - GOLD OUTPACES PLACEMENT: ~180 buildable cells but coverage saturates at
 *    ~20-30 well-placed towers; by ~W8-10 income (kills+bonus+interest) exceeds
 *    useful spend, so the econ/interest layer goes slack mid-game.
 *    RESOLUTION (2026-06): this is mostly a MODEL ARTIFACT — the "가능 DPS"
 *    line assumes all gold converts to DPS, but it can't see coverage
 *    saturation, after which spare gold is a legit rebuild buffer (not a flaw).
 *    Early game is intentionally tight (개막 빡빡). So no blanket income nerf;
 *    only the compounding infinite-mode gold growth was tapered (0.04→0.02/
 *    cycle) so the endless tail's economy doesn't go fully slack.
 *  - Campaign W1-15 reads "쉬움" by the gold model; that's the onboarding ramp.
 *    Real challenge is the exponential infinite wall (×1.13^cycle), same shape
 *    as roll-defense. See tools/td-sim.mjs FINDING on the binary wall.
 */

// ---- towers: cost + 3 levels (damage/range/interval, upCost to reach level) ----
const TOWERS = {
  pulse: { cost:30, fire:'beam',   antiAir:true,  strongVs:['runner','swarm'], weakVs:['tank'],
    lv:[null,{d:8,cd:.50},{d:16,cd:.45,up:35},{d:34,cd:.40,up:75}] },
  burst: { cost:55, fire:'aoe',    antiAir:false, strongVs:['swarm','grunt'],  weakVs:['shield'],
    lv:[null,{d:12,cd:1.20},{d:26,cd:1.05,up:60},{d:58,cd:.92,up:120}] },
  frost: { cost:50, fire:'slow',   antiAir:false, strongVs:['shield'],          weakVs:[],
    lv:[null,{d:3,cd:.60},{d:8,cd:.55,up:45},{d:18,cd:.50,up:95}] },
  rail:  { cost:80, fire:'pierce', antiAir:true,  strongVs:['flyer','tank','medic'], weakVs:['swarm'],
    lv:[null,{d:14,cd:1.50},{d:32,cd:1.35,up:85},{d:74,cd:1.20,up:170}] }
};
const TOWER_ORDER = ['pulse','burst','frost','rail'];
const MAX_LEVEL = 3;
const COUNTER_STRONG = 1.5, COUNTER_WEAK = 0.6;

const ENEMIES = {
  grunt: {hp:30, sp:56,  g:8 },
  runner:{hp:18, sp:104, g:12},
  swarm: {hp:12, sp:80,  g:4 },
  tank:  {hp:130,sp:36,  g:25, armored:true},
  shield:{hp:70, sp:48,  g:20, shield:60},
  flyer: {hp:72, sp:70,  g:22, flying:true},
  medic: {hp:72, sp:46,  g:20, heal:6},
  boss:  {hp:900,sp:30,  g:120,boss:true}
};
const WAVES = [
  [['grunt',8,.7]],
  [['grunt',10,.6],['swarm',8,.28,1.5]],
  [['grunt',10,.5],['runner',7,.45,1.0]],
  [['shield',5,1.1],['grunt',12,.4,1.0]],
  [['boss',1,0],['swarm',14,.3,1.0]],
  [['flyer',8,.7],['runner',10,.4,1.0]],
  [['tank',5,1.3],['swarm',16,.26,1.5]],
  [['shield',8,.9],['flyer',8,.6,2.0]],
  [['runner',22,.28],['tank',4,1.2,2.0]],
  [['boss',2,6.0],['flyer',10,.5,1.0],['tank',4,1.1,3.0]],
  [['swarm',30,.18],['shield',8,.9,2.0]],
  [['tank',9,.9],['flyer',10,.5,2.0]],
  [['shield',10,.7],['runner',18,.3,2.0],['swarm',18,.26,4.0]],
  [['flyer',16,.45],['tank',7,1.0,2.0],['runner',16,.3,4.0]],
  [['boss',3,5.0],['tank',8,.9,1.0],['flyer',14,.45,4.0],['swarm',26,.22,8.0]]
];
const ECON = { startGold:90, startLives:15, bossLeak:10, waveBonus:16, interest:0.06, interestCap:25 };
const HP_EXP = 1.13;          // 무한 HP 지수 (게임 line ~361 과 일치)
const GOLD_PER_CYCLE = 0.02;  // 무한 골드 보너스 (0.04→0.02, 엔드리스 잉여 완화)

// multi-target assumptions (beam/slow = 단일, aoe/pierce = 멀티)
const MT = { beam:1, slow:1, aoe:2.5, pierce:2.2 };

function towerDPS(kind, lv, single){
  const def = TOWERS[kind], t = def.lv[lv];
  const hits = single ? 1 : MT[def.fire];
  return (t.d * hits) / t.cd;
}
function cumCost(kind, lv){            // 누적 비용: 건설 + lv까지 업그레이드
  const def = TOWERS[kind]; let c = def.cost;
  for (let i = 2; i <= lv; i++) c += def.lv[i].up;
  return c;
}

console.log('=== 타워 DPS (멀티타깃 가정) · 3레벨 ===');
console.log('kind    Lv1    Lv2    Lv3   |  단일Lv3   비용(누적)        DPS/gold(Lv3)');
for (const k of TOWER_ORDER){
  const def = TOWERS[k];
  const mt = [1,2,3].map(l => towerDPS(k,l,false).toFixed(1).padStart(6));
  const st3 = towerDPS(k,3,true).toFixed(1).padStart(6);
  const costs = [1,2,3].map(l => cumCost(k,l)).join('/');
  const eff = (towerDPS(k,3,false) / cumCost(k,3)).toFixed(3);
  console.log(`${k.padEnd(6)} ${mt.join(' ')}  | ${st3}    ${costs.padStart(11)}        ${eff}`);
}

console.log('\n=== Lv1 DPS·효율 랭킹 (멀티) — 종류 밸런스 ===');
const r1 = TOWER_ORDER.map(k => [k, towerDPS(k,1,false), towerDPS(k,1,false)/TOWERS[k].cost]).sort((a,b)=>b[1]-a[1]);
const maxD = r1[0][1], minD = r1[r1.length-1][1];
r1.forEach(([k,d,e]) => console.log(`  ${k.padEnd(6)} DPS ${d.toFixed(1).padStart(6)}  효율 ${e.toFixed(3)}  ${'█'.repeat(Math.round(d/maxD*26))}`));
console.log(`  → Lv1 최고/최저 DPS 비율: ${(maxD/minD).toFixed(2)}x ${maxD/minD > 3 ? '⚠ 격차 큼' : 'OK'}`);

console.log('\n=== 상성 커버리지 (전략 TD의 핵심) ===');
console.log('적별 — 강한 타워(×1.5) / 약한 타워(×0.6) / 명중 가능 타워');
for (const e in ENEMIES){
  if (e === 'boss') continue;
  const def = ENEMIES[e];
  const strong = TOWER_ORDER.filter(k => TOWERS[k].strongVs.includes(e));
  const weak   = TOWER_ORDER.filter(k => TOWERS[k].weakVs.includes(e));
  const canHit = TOWER_ORDER.filter(k => !def.flying || TOWERS[k].antiAir);
  const flag = strong.length === 0 ? ' ⚠ 카운터 없음' : (canHit.length <= 1 ? ' ⚠ 명중 1종뿐' : '');
  console.log(`  ${e.padEnd(7)} 강: [${strong.join(',')||'-'}]  약: [${weak.join(',')||'-'}]  명중: [${canHit.join(',')}]${flag}`);
}
// 각 타워의 역할(누가 무엇을 강하게 치는가)이 비어있지 않은지
console.log('  -- 타워별 역할 --');
for (const k of TOWER_ORDER){
  const role = Object.keys(ENEMIES).filter(e => TOWERS[k].strongVs.includes(e));
  console.log(`  ${k.padEnd(6)} 강점 대상: [${role.join(',')||'⚠ 없음'}]  대공:${TOWERS[k].antiAir?'O':'X'}`);
}

function waveHP(wave){
  let hp = 0, n = 0;
  for (const [type, cnt] of wave){ const e = ENEMIES[type]; hp += (e.hp + (e.shield||0)) * cnt; n += cnt; }
  return { hp, n };
}
function waveDuration(wave){
  let maxEnd = 0;
  for (const [type, cnt, intv, delay] of wave){ const end = (delay||0) + cnt * (intv||0.5); if (end > maxEnd) maxEnd = end; }
  return Math.max(maxEnd, 3);
}

console.log('\n=== 웨이브별 적 HP / 유입률 (1~15) ===');
console.log('W   적수   총HP    지속    HP/초   구성');
for (let i = 0; i < WAVES.length; i++){
  const w = WAVES[i]; const { hp, n } = waveHP(w); const dur = waveDuration(w);
  const types = w.map(e => `${e[0]}×${e[1]}`).join(' ');
  console.log(`${(i+1).toString().padStart(2)}  ${n.toString().padStart(4)}  ${hp.toString().padStart(6)}  ${dur.toFixed(1).padStart(5)}s  ${(hp/dur).toFixed(0).padStart(5)}   ${types}`);
}

console.log(`\n=== 무한 스케일링 (cycle = wave-15, HP ×${HP_EXP}^cycle) ===`);
for (const w of [16,20,25,30,40,50]){
  const cycle = w - 15; const mult = Math.pow(HP_EXP, cycle);
  console.log(`  W${w.toString().padStart(3)}  cycle ${cycle.toString().padStart(3)}  HP×${mult.toFixed(1).padStart(8)}  (grunt ${Math.round(30*mult)} / tank ${Math.round(130*mult)} / boss ${Math.round(900*mult)})`);
}

console.log('\n=== 경제: 웨이브별 수입 vs 타워 비용 (1~15) ===');
console.log('(수입 = 처치골드 + 웨이브보너스16 + 이자 min(보유×6%,25))');
let gold = ECON.startGold;
const rail3 = cumCost('rail',3), pulse1 = TOWERS.pulse.cost;
for (let i = 0; i < WAVES.length; i++){
  const w = WAVES[i];
  let kill = 0; for (const [type, cnt] of w){ kill += ENEMIES[type].g * cnt; }
  const interest = Math.min(ECON.interestCap, Math.floor(gold * ECON.interest));
  gold += kill + ECON.waveBonus + interest;
  console.log(`  W${(i+1).toString().padStart(2)}  처치+${kill.toString().padStart(3)}g 이자+${interest.toString().padStart(2)}g  누적 ${gold.toString().padStart(5)}g  (≈ pulse ${Math.floor(gold/pulse1)}기 또는 rail3 ${(gold/rail3).toFixed(1)}기)`);
}

console.log('\n=== 난이도 곡선: 필요 DPS vs 가능 DPS ===');
console.log('(가능 = 누적골드를 최고효율 타워로 전부 환산. 필요 = 웨이브 HP/지속)');
// 최고 DPS/gold 효율 (단일 타워 기준 — 가능 DPS 상한)
let bestEff = 0, bestEffKind = '';
for (const k of TOWER_ORDER){ const e = towerDPS(k,3,false)/cumCost(k,3); if (e > bestEff){ bestEff = e; bestEffKind = k; } }
console.log(`(최고 효율 타워: ${bestEffKind} = ${bestEff.toFixed(3)} DPS/gold @ Lv3)`);
let g2 = ECON.startGold;
for (let i = 0; i < WAVES.length; i++){
  const w = WAVES[i]; const { hp } = waveHP(w); const dur = waveDuration(w); const needDPS = hp / dur;
  let kill = 0; for (const [type, cnt] of w){ kill += ENEMIES[type].g * cnt; }
  const interest = Math.min(ECON.interestCap, Math.floor(g2 * ECON.interest));
  g2 += kill + ECON.waveBonus + interest;
  // 가능 DPS: 누적 골드의 70%를 타워에 투자(나머지는 이자/예비) × 최고효율
  const investable = (g2 - ECON.startGold) * 0.7 + ECON.startGold;
  const haveDPS = investable * bestEff;
  const ratio = haveDPS / needDPS;
  const bar = ratio > 2.5 ? '쉬움 ◀◀' : ratio > 1.4 ? '여유' : ratio > 0.9 ? '적정 ★' : '빡빡 ▶▶';
  console.log(`  W${(i+1).toString().padStart(2)}  필요 ${needDPS.toFixed(0).padStart(5)}  가능 ${haveDPS.toFixed(0).padStart(5)}  (${ratio.toFixed(2)}x) ${bar}`);
}

// balance-check.mjs imports these to assert invariants (running this file prints
// the report; importers suppress stdout). Single source of truth for the model.
export { TOWERS, ENEMIES, TOWER_ORDER, COUNTER_STRONG, towerDPS, cumCost };

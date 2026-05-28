/* Roll-defense balance simulator (static model).
 * Pulls the same numbers as the game and computes DPS / HP / economy
 * curves to spot balance problems. Not a full battle sim — a model.
 *   node tools/td-balance.mjs
 */

const TOWERS = {
  pulse:  { fire:'single', tiers:[null,{d:11,cd:.50},{d:28,cd:.46},{d:68,cd:.40},{d:160,cd:.34}] },
  burst:  { fire:'aoe',    tiers:[null,{d:14,cd:1.20},{d:36,cd:1.05},{d:88,cd:.95},{d:205,cd:.85}] },
  frost:  { fire:'slow',   tiers:[null,{d:7,cd:.58},{d:16,cd:.53},{d:38,cd:.48},{d:88,cd:.44}] },
  rail:   { fire:'pierce', tiers:[null,{d:14,cd:1.30},{d:36,cd:1.18},{d:84,cd:1.05},{d:190,cd:.92}] },
  guard:  { fire:'sweep',  tiers:[null,{d:5,cd:.32},{d:12,cd:.28},{d:28,cd:.23},{d:68,cd:.18}] },
  rocket: { fire:'missile',tiers:[null,{d:26,cd:1.6},{d:64,cd:1.45},{d:148,cd:1.30},{d:335,cd:1.15}] },
  chain:  { fire:'chain',  tiers:[null,
    {d:12,cd:.9,ch:2,f:.62},{d:28,cd:.85,ch:3,f:.66},{d:64,cd:.78,ch:5,f:.70},{d:150,cd:.70,ch:7,f:.74}] }
};
const KIND_ORDER = ['pulse','burst','frost','rail','guard','rocket','chain'];
const KIND_WEIGHT = { pulse:20, burst:16, frost:16, rail:12, guard:14, rocket:11, chain:11 };

const ENEMIES = {
  grunt:{hp:42,sp:46,g:5}, runner:{hp:28,sp:92,g:8}, tank:{hp:220,sp:30,g:24},
  swift:{hp:110,sp:72,g:15}, splitter:{hp:120,sp:42,g:17,split:2}, shielded:{hp:80,sp:36,g:20,shield:80},
  flying:{hp:90,sp:78,g:22,flying:true}, regen:{hp:140,sp:38,g:22,regen:6}, boss:{hp:1100,sp:28,g:120}
};
const WAVES = [
  [['grunt',10,.6]], [['grunt',14,.55]], [['runner',12,.5]],
  [['grunt',14,.45],['runner',5,.5,2]], [['tank',5,1.4]],
  [['splitter',6,.9],['runner',10,.4,3]], [['flying',8,.8]],
  [['shielded',5,1.2],['grunt',12,.4,2]], [['boss',1,0]],
  [['regen',6,1.1],['runner',14,.4,2]], [['tank',7,1.0],['flying',8,.65,2]],
  [['swift',16,.45],['regen',5,1.4,4]], [['boss',2,6.0],['splitter',6,.7,4]],
  [['shielded',8,.9],['flying',10,.55,2],['regen',4,1.6,6]],
  [['grunt',28,.3],['flying',14,.5,4],['regen',6,1.4,8],['tank',6,.9,10],['boss',2,5,16]]
];
const ECON = { startGold:70, rollBase:16, rollInc:0.5, rollMax:45, waveBonus:16, mergeBonus:4 };

// multi-target assumptions
const MT = { single:1, slow:1, aoe:2.5, pierce:2.2, sweep:3.5, missile:2.5, chain:'chain' };

function chainMult(ch, f){ let s=1, p=1; for(let i=0;i<ch;i++){ p*=f; s+=p; } return s; }

function towerDPS(kind, tier, single){
  const def = TOWERS[kind], t = def.tiers[tier];
  let hits;
  if (def.fire === 'chain'){
    hits = single ? 1 : chainMult(t.ch, t.f);
  } else {
    hits = single ? 1 : MT[def.fire];
  }
  return (t.d * hits) / t.cd;
}

console.log('=== 타워 DPS (멀티타깃 가정 / 단일타깃) ===');
console.log('kind    T1       T2       T3       T4      |  단일T1  단일T4');
for (const k of KIND_ORDER){
  const mt = [1,2,3,4].map(t => towerDPS(k,t,false).toFixed(0).padStart(5));
  const st1 = towerDPS(k,1,true).toFixed(0).padStart(5);
  const st4 = towerDPS(k,4,true).toFixed(0).padStart(5);
  console.log(`${k.padEnd(7)} ${mt.join('   ')}  | ${st1}   ${st4}`);
}

console.log('\n=== 1성 DPS 랭킹 (멀티) — 종류 밸런스 ===');
const r1 = KIND_ORDER.map(k => [k, towerDPS(k,1,false)]).sort((a,b)=>b[1]-a[1]);
const maxD = r1[0][1], minD = r1[r1.length-1][1];
r1.forEach(([k,d]) => console.log(`  ${k.padEnd(7)} ${d.toFixed(1).padStart(6)}  ${'█'.repeat(Math.round(d/maxD*30))}`));
console.log(`  → 최고/최저 비율: ${(maxD/minD).toFixed(2)}x ${maxD/minD > 3 ? '⚠ 격차 큼' : 'OK'}`);

// 적 HP 곡선
function waveHP(wave){
  let hp = 0, n = 0;
  for (const [type, cnt] of wave){
    const e = ENEMIES[type];
    let unit = e.hp + (e.shield||0);
    if (e.split) unit += e.split * ENEMIES.grunt.hp; // 분열 후 추가 HP
    hp += unit * cnt; n += cnt + (e.split ? e.split*cnt : 0);
  }
  return { hp, n };
}
function waveDuration(wave){
  // 마지막 적 spawn 시점 추정 (preDelay + count*interval)
  let maxEnd = 0;
  for (const [type, cnt, intv, delay] of wave){
    const end = (delay||0) + cnt * (intv||0.5);
    if (end > maxEnd) maxEnd = end;
  }
  return Math.max(maxEnd, 3);
}

console.log('\n=== 웨이브별 적 HP / 유입률 (1~15) ===');
console.log('W   적수   총HP    지속    HP/초   구성');
for (let i = 0; i < WAVES.length; i++){
  const w = WAVES[i];
  const { hp, n } = waveHP(w);
  const dur = waveDuration(w);
  const types = w.map(e => `${e[0]}×${e[1]}`).join(' ');
  console.log(`${(i+1).toString().padStart(2)}  ${n.toString().padStart(4)}  ${hp.toString().padStart(6)}  ${dur.toFixed(1).padStart(5)}s  ${(hp/dur).toFixed(0).padStart(5)}   ${types}`);
}

console.log('\n=== 무한 스케일링 (cycle = wave-15, HP ×1.09^cycle 지수) ===');
for (const w of [16,20,25,30,40,50,70,100]){
  const cycle = w - 15;
  const mult = Math.pow(1.09, cycle);
  console.log(`  W${w.toString().padStart(3)}  cycle ${cycle.toString().padStart(3)}  HP×${mult.toFixed(1).padStart(7)}  (grunt ${Math.round(42*mult)} / tank ${Math.round(220*mult)} / boss ${Math.round(1100*mult)})`);
}

// 플레이어 capacity 모델: 누적 뽑기 → 등급 분포 → 총 DPS
console.log('\n=== 경제: 뽑기 비용 누적 ===');
let cumCost = 0;
for (let n = 1; n <= 60; n++){
  const cost = Math.min(ECON.rollMax, Math.floor(ECON.rollBase + (n-1)*ECON.rollInc));
  cumCost += cost;
  if (n % 10 === 0) console.log(`  ${n}회 뽑기 누적: ${cumCost}g (평균 ${(cumCost/n).toFixed(1)}g/회)`);
}

console.log('\n=== 웨이브별 골드 수입 (처치+보너스, 1~15) ===');
let cumGold = ECON.startGold;
for (let i = 0; i < WAVES.length; i++){
  const w = WAVES[i];
  let kill = 0;
  for (const [type, cnt] of w){
    const e = ENEMIES[type];
    kill += e.g * cnt + (e.split ? e.split*cnt*ENEMIES.grunt.g : 0);
  }
  cumGold += kill + ECON.waveBonus;
  console.log(`  W${(i+1).toString().padStart(2)}  처치 +${kill}g  누적 ${cumGold}g  (≈ ${Math.floor(cumGold/25)}회 뽑기 가능)`);
}

// capacity: "안정 플레이" 모델 — N개 뽑기, 3:1 합성, 종류 가중 분포
console.log('\n=== 플레이어 DPS capacity 모델 (격자 채움) ===');
function buildDPS(rolls){
  // rolls개 1성 → 합성으로 등급 분포 (3개=1단위). 단순 3진수 모델.
  // 1성 r1, 2성 r2=floor(r1/3), 3성 r3=floor(r2/3), 4성=floor(r3/3)
  // 잔여 1성 = r1 % 3 ...
  let t1 = rolls;
  const t2 = Math.floor(t1/3); t1 -= t2*3;
  let t2r = t2;
  const t3 = Math.floor(t2r/3); t2r -= t3*3;
  let t3r = t3;
  const t4 = Math.floor(t3r/3); t3r -= t4*3;
  // 종류 평균 DPS (가중)
  const totalW = Object.values(KIND_WEIGHT).reduce((a,b)=>a+b,0);
  function avgDPS(tier){
    let s = 0;
    for (const k of KIND_ORDER) s += towerDPS(k,tier,false) * KIND_WEIGHT[k];
    return s / totalW;
  }
  return t1*avgDPS(1) + t2r*avgDPS(2) + t3r*avgDPS(3) + t4*avgDPS(4);
}
for (const rolls of [10, 20, 30, 45, 60]){
  console.log(`  ${rolls}회 뽑기 → 총 DPS ≈ ${buildDPS(rolls).toFixed(0)}`);
}

console.log('\n=== 난이도 곡선: 필요 DPS vs 가능 DPS ===');
console.log('(가능 DPS = 그 웨이브까지 누적 골드로 뽑은 타워. 필요 = 웨이브 HP/지속)');
let g = ECON.startGold, rollsDone = 0;
for (let i = 0; i < WAVES.length; i++){
  const w = WAVES[i];
  const { hp } = waveHP(w);
  const dur = waveDuration(w);
  const needDPS = hp / dur;
  // 골드로 가능한 뽑기 수 (누적, 평균 25g/회 가정)
  let kill = 0;
  for (const [type, cnt] of w){ const e = ENEMIES[type]; kill += e.g*cnt + (e.split?e.split*cnt*ENEMIES.grunt.g:0); }
  g += kill + ECON.waveBonus;
  rollsDone = Math.min(60, Math.floor((g - 30) / 22)); // 여유분으로 뽑기 추정
  const haveDPS = buildDPS(rollsDone);
  const ratio = haveDPS / needDPS;
  const bar = ratio > 2 ? '쉬움 ◀◀' : ratio > 1.2 ? '여유' : ratio > 0.8 ? '적정 ★' : '빡빡 ▶▶';
  console.log(`  W${(i+1).toString().padStart(2)}  필요 ${needDPS.toFixed(0).padStart(5)}  가능 ${haveDPS.toFixed(0).padStart(5)}  (${ratio.toFixed(2)}x) ${bar}`);
}

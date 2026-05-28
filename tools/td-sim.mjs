/* Roll-defense battle simulator — real combat loop + auto-play policy.
 * Measures average reached wave over many games to gauge true difficulty.
 *   node tools/td-sim.mjs [games]
 *
 * Faithful to the game: rectangular loop track, range-gated firing from
 * grid cells, multi-target AoE/sweep/pierce/chain on real enemy positions,
 * 3→1 auto-merge, gold economy, infinite wave scaling, maxAlive game-over,
 * counters (strongVs/weakVs). Synergy approximated as a flat factor.
 * Auto-play places towers on cells whose range reaches the track.
 */

// ---- layout (matches game) ----
const W=480, GRID_X=64, GRID_Y=80, CELL=44, COLS=8, ROWS=8, GRID_W=352, GRID_H=352, PAD=24;
const TX1=GRID_X-PAD, TY1=GRID_Y-PAD, TX2=GRID_X+GRID_W+PAD, TY2=GRID_Y+GRID_H+PAD;
const SEGS=[
  {x1:TX1,y1:TY1,x2:TX2,y2:TY1}, {x1:TX2,y1:TY1,x2:TX2,y2:TY2},
  {x1:TX2,y1:TY2,x2:TX1,y2:TY2}, {x1:TX1,y1:TY2,x2:TX1,y2:TY1}
];
const SEGLEN = SEGS.map(s=>Math.hypot(s.x2-s.x1,s.y2-s.y1));
const TRACK_TOTAL = SEGLEN.reduce((a,b)=>a+b,0);

// ---- data (matches game after the last patch) ----
const TOWERS = {
  pulse:  { fire:'single', anti:false, strong:['runner'], weak:['tank'],     t:[null,{d:11,cd:.50,r:88},{d:28,cd:.46,r:102},{d:68,cd:.40,r:118},{d:160,cd:.34,r:140}] },
  burst:  { fire:'aoe',    anti:false, strong:['splitter'], weak:['shielded'],t:[null,{d:14,cd:1.20,r:80,aoe:42},{d:36,cd:1.05,r:94,aoe:50},{d:88,cd:.95,r:110,aoe:60},{d:205,cd:.85,r:130,aoe:72}] },
  frost:  { fire:'slow',   anti:false, strong:['shielded'], weak:[],          t:[null,{d:7,cd:.58,r:96,sf:.55},{d:16,cd:.53,r:108,sf:.45},{d:38,cd:.48,r:124,sf:.35},{d:88,cd:.44,r:144,sf:.25}] },
  rail:   { fire:'pierce', anti:true,  strong:['flying'], weak:[],            t:[null,{d:14,cd:1.30,r:152},{d:36,cd:1.18,r:174},{d:84,cd:1.05,r:196},{d:190,cd:.92,r:222}] },
  guard:  { fire:'sweep',  anti:false, strong:['splitter','grunt'], weak:['tank'], t:[null,{d:5,cd:.32,r:56},{d:12,cd:.28,r:70},{d:28,cd:.23,r:86},{d:68,cd:.18,r:104}] },
  rocket: { fire:'missile',anti:true,  strong:['boss','tank'], weak:['runner'],t:[null,{d:26,cd:1.6,r:150,aoe:38},{d:64,cd:1.45,r:170,aoe:46},{d:148,cd:1.30,r:192,aoe:56},{d:335,cd:1.15,r:220,aoe:70}] },
  chain:  { fire:'chain',  anti:false, strong:['grunt','runner'], weak:['shielded'], t:[null,{d:12,cd:.9,r:110,ch:2,cr:70,f:.62},{d:28,cd:.85,r:124,ch:3,cr:80,f:.66},{d:64,cd:.78,r:142,ch:5,cr:90,f:.70},{d:150,cd:.70,r:166,ch:7,cr:100,f:.74}] }
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
// TUNABLES (mirror ECONOMY)
const CFG = {
  startGold:70, maxAlive:34, rollBase:16, rollInc:0.5, rollMax:45,
  waveBonus:16, betweenSec:4, mergeBonus:4,
  hpExp:1.09,                 // 무한 HP 지수 스케일 (게임과 일치)
  goldPerCycle:0.08, regenPerCycle:0.10,
  counterStrong:1.45, counterWeak:0.65, synergyFactor:1.08
};

function pointSegDist(px,py,ax,ay,bx,by){
  const dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy||1e-6;
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/L2));
  return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
}
function cellCenter(i){ const c=i%COLS,r=(i/COLS)|0; return {x:GRID_X+c*CELL+CELL/2,y:GRID_Y+r*CELL+CELL/2}; }
const CELL_TRACK_DIST = [];
for (let i=0;i<COLS*ROWS;i++){ const c=cellCenter(i); let m=1e9; for(const s of SEGS){ const d=pointSegDist(c.x,c.y,s.x1,s.y1,s.x2,s.y2); if(d<m)m=d; } CELL_TRACK_DIST[i]=m; }

function chainMult(ch,f){ let s=1,p=1; for(let i=0;i<ch;i++){p*=f;s+=p;} return s; }
function trackPos(seg, prog){ const s=SEGS[seg]; const t=prog/SEGLEN[seg]; return {x:s.x1+(s.x2-s.x1)*t, y:s.y1+(s.y2-s.y1)*t}; }
function weightedKind(){ const tot=Object.values(KIND_WEIGHT).reduce((a,b)=>a+b,0); let r=Math.random()*tot; for(const k in KIND_WEIGHT){ if(r<KIND_WEIGHT[k])return k; r-=KIND_WEIGHT[k]; } return 'pulse'; }

function getWave(idx){
  if (idx < WAVES.length) return WAVES[idx];
  const cycle=idx-WAVES.length, tier=Math.floor(cycle/5), sub=cycle%5;
  if (sub===4){ const bc=1+Math.floor(tier/2); return [['boss',bc,4.5,1],['flying',8+tier*3,.5,2],['regen',4+tier,1.4,5]]; }
  const wts={grunt:30,runner:25+tier*2,swift:18+tier*3,tank:12+tier*3,splitter:8+tier*3,shielded:6+tier*3,flying:4+tier*4,regen:3+tier*3};
  const num=2+Math.floor(Math.random()*3), picked=new Set();
  let g=0; while(picked.size<num && g++<20){ const tot=Object.values(wts).reduce((a,b)=>a+b,0); let r=Math.random()*tot,ch='grunt'; for(const k in wts){ if(r<wts[k]){ch=k;break;} r-=wts[k]; } picked.add(ch); }
  const ent=[]; let delay=0;
  for (const tp of picked){ const tough=ENEMIES[tp].hp>=110; const cnt=tough?(4+tier*2):(10+tier*3); const intv=Math.max(.18,.55-tier*.025+Math.random()*.15); ent.push([tp,cnt,intv,delay]); delay+=.8+Math.random()*2.2; }
  return ent;
}

function simulate(opts){
  const cfg = Object.assign({}, CFG, opts||{});
  let gold=cfg.startGold, waveIdx=0, time=0;
  const slots=new Array(COLS*ROWS).fill(null);
  let enemies=[];
  let spawnQ=[], waveState='between', betweenT=2;
  const mods={dmg:1,gold:1,hp:1};

  function emptyCells(){ const a=[]; for(let i=0;i<slots.length;i++) if(!slots[i])a.push(i); return a; }
  function placeRoll(){
    const empties=emptyCells(); if(!empties.length) return false;
    const cost=Math.min(cfg.rollMax, Math.floor(cfg.rollBase+rollCount*cfg.rollInc));
    if(gold<cost) return false;
    gold-=cost; rollCount++;
    const kind=weightedKind();
    // 배치: 그 타워 사거리로 트랙 닿는 빈 셀 우선
    const range=TOWERS[kind].t[1].r;
    let best=-1, bestDist=1e9;
    for(const i of empties){ const d=CELL_TRACK_DIST[i]; const reaches=d<=range; if(reaches){ if(d<bestDist){bestDist=d;best=i;} } }
    if(best<0) best=empties[0]; // 안 닿아도 일단
    slots[best]={kind,tier:1,cd:0,...cellCenter(best)};
    autoMerge();
    return true;
  }
  function autoMerge(){
    let merged=true,guard=0;
    while(merged&&guard++<40){ merged=false;
      const buck={};
      for(let i=0;i<slots.length;i++){ const t=slots[i]; if(!t)continue; const k=t.kind+':'+t.tier; (buck[k]=buck[k]||[]).push(i); }
      for(const k in buck){ const ix=buck[k]; if(ix.length<3)continue; const s=slots[ix[0]]; if(s.tier>=4)continue;
        slots[ix[1]]=null; slots[ix[2]]=null; slots[ix[0]]={kind:s.kind,tier:s.tier+1,cd:0,...cellCenter(ix[0])}; gold+=cfg.mergeBonus; merged=true; break; }
    }
  }
  let rollCount=0;

  function startWave(idx){
    const w=getWave(idx); spawnQ=w.map(e=>({type:e[0],rem:e[1],intv:e[2],timer:e[3]||0})); spawnQi=0; waveState='wave';
  }
  let spawnQi=0;
  function hpMultFor(cycle){
    return (cfg.hpExp ? Math.pow(cfg.hpExp, cycle) : (1+cfg.hpPerCycle*cycle)) * mods.hp;
  }
  function spawnEnemy(type){
    const def=ENEMIES[type]; const cycle=Math.max(0,waveIdx-WAVES.length);
    const hpM=hpMultFor(cycle);
    enemies.push({type, hp:def.hp*hpM, maxHp:def.hp*hpM, shield:(def.shield||0)*hpM, sp:def.sp,
      g:Math.floor(def.g*(1+cfg.goldPerCycle*cycle)*mods.gold), seg:0, prog:0, slowUntil:0, slowF:1,
      flying:!!def.flying, regen:(def.regen||0)*(1+cfg.regenPerCycle*cycle), split:def.split||0, ...trackPos(0,0)});
  }
  function counterMult(kind,e){ const def=TOWERS[kind]; if(def.strong.includes(e.type))return cfg.counterStrong; if(def.weak.includes(e.type))return cfg.counterWeak; return 1; }
  function applyDmg(e,dmg){ if(e.shield>0){ const a=Math.min(e.shield,dmg); e.shield-=a; dmg-=a; } if(dmg>0)e.hp-=dmg; }

  function fire(t){
    const def=TOWERS[t.kind], st=def.t[t.tier];
    const base=st.d*cfg.synergyFactor*mods.dmg;
    // 사거리 내 타깃 (진행도 최고)
    let best=null,bp=-1;
    for(const e of enemies){ if(e.dead)continue; if(e.flying&&!def.anti)continue;
      const dx=e.x-t.x,dy=e.y-t.y; if(dx*dx+dy*dy>st.r*st.r)continue;
      const prog=e.seg*1e6+e.prog; if(prog>bp){bp=prog;best=e;} }
    if(!best)return false;
    if(def.fire==='single'||def.fire==='slow'){ applyDmg(best,base*counterMult(t.kind,best)); if(def.fire==='slow'){best.slowUntil=time+st.sf?0:0;} }
    else if(def.fire==='aoe'||def.fire==='missile'){ for(const e of enemies){ if(e.dead)continue; if(e.flying&&!def.anti)continue; const dx=e.x-best.x,dy=e.y-best.y; if(dx*dx+dy*dy<=st.aoe*st.aoe) applyDmg(e,base*counterMult(t.kind,e)); } }
    else if(def.fire==='pierce'){ for(const e of enemies){ if(e.dead)continue; const dx=e.x-t.x,dy=e.y-t.y; if(dx*dx+dy*dy<=st.r*st.r) applyDmg(e,base*counterMult(t.kind,e)); } }
    else if(def.fire==='sweep'){ for(const e of enemies){ if(e.dead)continue; if(e.flying&&!def.anti)continue; const dx=e.x-t.x,dy=e.y-t.y; if(dx*dx+dy*dy<st.r*st.r) applyDmg(e,base*counterMult(t.kind,e)); } }
    else if(def.fire==='chain'){ let cur=best,cd=base,hit=new Set();
      for(let i=0;i<=st.ch;i++){ if(!cur)break; applyDmg(cur,cd*counterMult(t.kind,cur)); hit.add(cur);
        let nx=null,bd=st.cr*st.cr; for(const e of enemies){ if(e.dead||hit.has(e))continue; if(e.flying&&!def.anti)continue; const dx=e.x-cur.x,dy=e.y-cur.y,d2=dx*dx+dy*dy; if(d2<=bd){bd=d2;nx=e;} } cur=nx; cd*=st.f; } }
    return true;
  }

  const dt=0.1; let autoTimer=0;
  for(let step=0; step<200000; step++){
    time+=dt;
    // 플레이어 자동 행동 (0.5s마다 뽑기 시도)
    autoTimer+=dt; if(autoTimer>=0.5){ autoTimer=0; let g2=0; while(placeRoll()&&g2++<5){} }
    // 웨이브 진행
    if(waveState==='between'){ betweenT-=dt; if(betweenT<=0) startWave(waveIdx); }
    else if(waveState==='wave'){ if(spawnQi<spawnQ.length){ const en=spawnQ[spawnQi]; en.timer-=dt; if(en.timer<=0){ spawnEnemy(en.type); en.rem--; if(en.rem<=0)spawnQi++; else en.timer=en.intv; } } }
    // 적 이동
    for(const e of enemies){ if(e.dead)continue; let rem=e.sp*dt; let g3=0;
      while(rem>0&&g3++<8){ const left=SEGLEN[e.seg]-e.prog; if(rem<left){e.prog+=rem;rem=0;} else {rem-=left;e.seg=(e.seg+1)%4;e.prog=0;} }
      const p=trackPos(e.seg,e.prog); e.x=p.x;e.y=p.y;
      if(e.regen>0&&e.hp<e.maxHp)e.hp=Math.min(e.maxHp,e.hp+e.regen*dt);
    }
    // 타워 사격
    for(const t of slots){ if(!t)continue; t.cd-=dt; if(t.cd<=0){ if(fire(t)) t.cd=TOWERS[t.kind].t[t.tier].cd; } }
    // 사망 처리 + 분열
    const born=[];
    for(const e of enemies){ if(!e.dead&&e.hp<=0){ e.dead=true; gold+=e.g; if(e.split){ for(let k=0;k<e.split;k++) born.push(e); } } }
    enemies=enemies.filter(e=>!e.dead);
    for(const e of born){ const def=ENEMIES.grunt; const cycle=Math.max(0,waveIdx-WAVES.length); const hpM=hpMultFor(cycle);
      enemies.push({type:'grunt',hp:def.hp*hpM,maxHp:def.hp*hpM,shield:0,sp:def.sp,g:Math.floor(def.g*(1+cfg.goldPerCycle*cycle)),seg:e.seg,prog:Math.max(0,e.prog-6),slowUntil:0,slowF:1,flying:false,regen:0,split:0,...trackPos(e.seg,Math.max(0,e.prog-6))}); }
    // game over
    if(enemies.length>cfg.maxAlive) return waveIdx;
    // 웨이브 종료
    if(waveState==='wave' && spawnQi>=spawnQ.length){
      waveIdx++; gold+=cfg.waveBonus;
      // 모디파이어 (5웨이브마다, good 자동: dmg+20% 또는 gold+30% 번갈아)
      if(waveIdx%5===0){ if((waveIdx/5)%2===1) mods.dmg*=(cfg.modDmg||1.2); else mods.gold*=1.3; }
      waveState='between'; betweenT=cfg.betweenSec;
      if(waveIdx>=150) return waveIdx; // 사실상 무적 간주

    }
  }
  return waveIdx;
}

// ---- run ----
const N = parseInt(process.argv[2]||'40',10);
function runBatch(label, opts){
  const res=[]; for(let i=0;i<N;i++) res.push(simulate(opts));
  res.sort((a,b)=>a-b);
  const avg=res.reduce((a,b)=>a+b,0)/res.length;
  const med=res[Math.floor(res.length/2)];
  const p10=res[Math.floor(res.length*0.1)], p90=res[Math.floor(res.length*0.9)];
  console.log(`${label.padEnd(28)} avg ${avg.toFixed(1).padStart(6)}  median ${med.toString().padStart(3)}  p10 ${p10}  p90 ${p90}  min ${res[0]} max ${res[res.length-1]}`);
  return avg;
}

console.log(`=== Roll-defense battle sim (${N} games each, cap 150 = "endless / unbeatable") ===`);
console.log('(reached wave when field > maxAlive; auto-play: roll+auto-merge, range-aware placement)\n');
runBatch('current (exp 1.09)', {});
console.log('\n-- alternative HP exponents --');
runBatch('linear 0.18 (old/broken)', {hpExp:null, hpPerCycle:0.18});
runBatch('hpExp 1.06', {hpExp:1.06});
runBatch('hpExp 1.08', {hpExp:1.08});
runBatch('hpExp 1.10', {hpExp:1.10});
runBatch('hpExp 1.12', {hpExp:1.12});
console.log('\n-- hpExp 1.09 + modifier dmg tweaks --');
runBatch('hpExp 1.09, modDmg 1.20', {hpExp:1.09, modDmg:1.20});
runBatch('hpExp 1.09, modDmg 1.15', {hpExp:1.09, modDmg:1.15});
runBatch('hpExp 1.09 + maxAlive 30', {hpExp:1.09, maxAlive:30});

/* Balance gate — turns the (informational) balance models into hard CI checks.
 * Imports the model data (suppressing their report output) and asserts the
 * invariants that matter, so a balance edit that re-breaks them fails CI.
 *   node tools/balance-check.mjs
 * Exit 1 on any violated invariant.
 */

// Importing the models runs their console report; silence it during import.
const origLog = console.log;
console.log = () => {};
const neon = await import('./neon-balance.mjs');
const roll = await import('./td-balance.mjs');
console.log = origLog;

const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); };

/* ---- neon: tower role / counter structure ---- */
{
  const { TOWERS, ENEMIES, TOWER_ORDER, towerDPS, cumCost } = neon;
  const eff = (k) => towerDPS(k, 3, false) / cumCost(k, 3);

  // pulse-dominance regression guard: the cheap 만능형 must NOT be the most
  // gold-efficient tower (it was 0.750 > burst 0.671 before the Lv2/3 nerf).
  check(eff('pulse') <= eff('burst') + 1e-9,
    `neon: pulse DPS/gold(${eff('pulse').toFixed(3)}) must not exceed burst(${eff('burst').toFixed(3)}) — pulse-spam dominance regressed`);

  // every non-boss enemy must have ≥1 hard counter and be hittable by ≥1 tower
  for (const e of Object.keys(ENEMIES)){
    if (e === 'boss') continue;
    const strong = TOWER_ORDER.filter(k => TOWERS[k].strongVs.includes(e));
    const hittable = TOWER_ORDER.filter(k => !ENEMIES[e].flying || TOWERS[k].antiAir);
    check(strong.length >= 1, `neon: enemy '${e}' has no strongVs counter tower`);
    check(hittable.length >= 1, `neon: enemy '${e}' is unhittable (no tower can target it)`);
  }
  // every tower must have a role (≥1 strongVs target that actually exists)
  for (const k of TOWER_ORDER){
    const targets = TOWERS[k].strongVs.filter(t => ENEMIES[t]);
    check(targets.length >= 1, `neon: tower '${k}' has no valid strongVs target`);
    // strongVs/weakVs must reference real enemy keys (catches the flyer/flying bug class)
    for (const t of [...TOWERS[k].strongVs, ...TOWERS[k].weakVs]){
      check(!!ENEMIES[t], `neon: tower '${k}' references unknown enemy '${t}'`);
    }
  }
}

/* ---- roll: combat-tower DPS spread (frost excluded — intentional slow utility) ---- */
{
  const { KIND_ORDER, towerDPS } = roll;
  const combat = KIND_ORDER.filter(k => k !== 'frost');
  const dps = combat.map(k => towerDPS(k, 1, false));
  const spread = Math.max(...dps) / Math.min(...dps);
  check(spread <= 3.0,
    `roll: 1성 combat-tower DPS spread ${spread.toFixed(2)}x exceeds 3.0x (frost excluded) — a kind is over/under-tuned`);
}

if (fails.length){
  console.error('balance-check FAILED:');
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('balance-check passed: neon counters/efficiency + roll spread within bounds');

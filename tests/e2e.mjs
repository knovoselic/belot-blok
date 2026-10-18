// End-to-end test: pravi Chromium klika po pravom sučelju (bez mockova) i provjerava localStorage.
// Pokretanje: npm install && npx playwright install chromium && npm test
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const HTML = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const URL_ = 'http://belot.test/';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'belot-blok-'));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
await ctx.route('**/*', r => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
try {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());

  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem('belotblok_db_v1')));
  const settle = () => page.waitForTimeout(350);
  let step = 0; const ok = m => console.log(`✓ ${++step}. ${m}`);

  async function setup4(names, target = '351') {
    const slots = page.locator('#setNames input[list=dlPlayers]');
    await page.click('#setMode .opt[data-m="4"]');
    if (names) for (let i = 0; i < 4; i++) await slots.nth(i).fill(names[i]);
    await page.click(`#setTarget .opt[data-t="${target}"]`);
    await page.click('#btnStart'); await settle();
  }
  async function hand(caller, pts) {
    await page.getByRole('button', { name: '＋ Nova ruka' }).click(); await settle();
    await page.locator('#callerSeg .opt').nth(caller).click();
    const inputs = page.locator('#ptsArea input');
    for (let i = 0; i < pts.length; i++) await inputs.nth(i).fill(String(pts[i]));
    await page.click('#handSave'); await settle();
  }

  await page.goto(URL_); await settle();
  assert.ok(await page.isVisible('#viewSetup'), 'setup on first load');

  // 1) 4 igrača: novi igrači i tim se spremaju
  await setup4(['Ana', 'Marko', 'Ivo', 'Pero']);   // DOM redoslijed: tim1 (sj.1, sj.3), tim2 (sj.2, sj.4)
  let d = await db();
  assert.deepEqual(d.players.map(p => p.name).sort(), ['Ana', 'Ivo', 'Marko', 'Pero']);
  assert.equal(d.teams.length, 2);
  const id = n => d.players.find(p => p.name === n).id;
  const g1 = d.games[0];
  assert.equal(d.current, g1.id);
  assert.deepEqual(g1.parties[0].playerIds, [id('Ana'), id('Marko')]);   // sjedala 1 i 3
  assert.equal(g1.parties[0].name, 'Ana & Marko');
  ok('4-player setup creates players, teams, game linked by ids');

  // 2) Igra: tim 1 zove i prolazi 3x, tim 2 zove i pada (tim 1 dobije 162) → 362 ≥ 351
  // 2 na 2: opcije zvača su igrači grupirani po timu: [Ana, Marko | Ivo, Pero]
  assert.deepEqual(await (async()=>{ await page.getByRole('button', { name: '＋ Nova ruka' }).click(); await settle(); const t=await page.locator('#callerSeg .opt').allTextContents(); await page.click('#handClose'); await settle(); return t; })(), ['Ana','Marko','Ivo','Pero']);
  await hand(0, [100]); await hand(1, [100]); await hand(2, [62]); await hand(0, [100]);
  assert.match(await page.locator('#hist .hrow').nth(1).textContent(), /📢 Ivo/);
  assert.match(await page.locator('#hist .hrow').nth(3).textContent(), /📢 Ana/);
  d = await db();
  assert.equal(d.games[0].hands.length, 4);
  assert.deepEqual(d.games[0].hands.map(h => [h.caller, h.callerSeat]), [[0, 0], [0, 2], [1, 1], [0, 0]]);
  assert.ok(d.games[0].hands.every(h => typeof h.t === 'number'), 'hands timestamped');
  assert.equal(d.games[0].winner, 0);
  assert.ok(d.games[0].finished > 0);
  assert.ok(await page.isVisible('.banner'));
  ok('hands persist with timestamps; finished game records winner');

  // 3) Revanš prepuni iste igrače
  await page.getByRole('button', { name: '🔁 Revanš' }).first().click(); await settle();
  const vals = await page.locator('#setNames input[list=dlPlayers]').evaluateAll(es => es.map(e => e.value));
  assert.deepEqual(vals, ['Ana', 'Marko', 'Ivo', 'Pero']);
  assert.equal(await page.locator('#setQuick .chip.on').count(), 4 + 2, 'all 4 player chips + both team chips active');
  ok('rematch prefills the same players; quick chips reflect them');

  // 4) Druga igra — tim 2 pobjeđuje, s preokretom (tim 1 vodi prvu ruku)
  await page.click('#btnStart'); await settle();
  await hand(0, [100]); await hand(2, [62]); await hand(3, [62]); await hand(2, [62]);
  d = await db();
  assert.equal(d.games.length, 2); assert.equal(d.games[1].winner, 1);
  assert.equal(d.players.length, 4, 'no duplicate players on rematch');
  ok('second game saved, no duplicate players');

  // 5) Brzi odabir: tim chip popuni sjedala
  await page.click('#btnMenu'); await settle(); await page.click('#mNew'); await settle();
  await page.click('#setMode .opt[data-m="4"]');
  for (let i = 0; i < 4; i++) await page.locator('#setNames input[list=dlPlayers]').nth(i).fill('');
  await page.locator('#setQuick .chip', { hasText: 'Ivo & Pero' }).click();
  let v = await page.locator('#setNames input[list=dlPlayers]').evaluateAll(es => es.map(e => e.value));
  assert.deepEqual([v[0], v[1]].sort(), ['Ivo', 'Pero']);
  await page.locator('#setQuick .chip', { hasText: /^Ana$/ }).click();
  v = await page.locator('#setNames input[list=dlPlayers]').evaluateAll(es => es.map(e => e.value));
  assert.equal(v[2], 'Ana');   // sjedalo 2 = prvo slobodno
  ok('team chip fills a team, player chip fills next free seat');

  // 6) Duplikat igrača se odbija
  await page.locator('#setNames input[list=dlPlayers]').nth(3).fill('ana');
  await page.click('#btnStart'); await settle();
  assert.ok(await page.isVisible('#viewSetup')); assert.match(await page.textContent('#toastMsg'), /dvaput/);
  ok('same player twice is rejected');

  // 7) 2 igrača — Ana se prepoznaje (case-insensitive), Luka je novi
  await page.click('#setMode .opt[data-m="2"]');
  const s2 = page.locator('#setNames input[list=dlPlayers]');
  await s2.nth(0).fill('ana'); await s2.nth(1).fill('Luka');
  await page.click('#setTarget .opt[data-t="351"]');
  await page.click('#btnStart'); await settle();
  await hand(0, [120, 40]); await hand(1, [30, 90]);
  d = await db();
  assert.equal(d.players.length, 5);
  assert.deepEqual(d.games[2].parties.map(p => p.playerIds[0]), [id('Ana'), d.players.find(p => p.name === 'Luka').id]);
  ok('2-player game reuses existing player by name, adds new one');

  // 8) Statistika — pregled
  await page.click('#btnStats'); await settle();
  assert.ok(await page.isVisible('#viewStats')); assert.ok(!(await page.isVisible('#fab')));
  const tilesTxt = await page.locator('#statsBody .tiles').first().innerText();
  assert.match(tilesTxt, /^3\s*\n\s*igre/m);       // 3 igre
  assert.match(tilesTxt, /10\s*\n\s*ruku ukupno/);   // 4 + 4 + 2
  const recTxt = await page.locator('#statsBody .rec').allInnerTexts();
  assert.ok(recTxt.some(t => /Najveći preokret/.test(t)), 'comeback record');
  ok('overview tiles + records render: ' + recTxt.length + ' records');

  // Brojke: Ana — igra1 pobjeda (tim1), igra2 poraz; 2p igra nedovršena
  const stats = await page.evaluate(() => { const st = buildStats(0); const a = st.players[DB.players.find(p => p.name === 'Ana').id]; return { ...a, partners: a.partners, opps: a.opps, rec: st.rec, ov: st.ov }; });
  assert.equal(stats.games, 3); assert.equal(stats.finished, 2); assert.equal(stats.wins, 1);
  assert.equal(stats.hands, 10);
  // igra1 tim1 zvao 3x prošao; igra2 tim1 zvao 1x prošao; 2p: Ana zvala 1x prošla (120>80)
  assert.equal(stats.calls, 4); assert.equal(stats.passed, 4);   // g1: 2, g2: 1, 2p: 1 — samo njezina zvanja
  const indiv = await page.evaluate(() => { const st = buildStats(4); return Object.fromEntries(DB.players.map(p => [p.name, st.players[p.id] && st.players[p.id].calls])); });
  assert.deepEqual(indiv, { Ana: 3, Marko: 1, Ivo: 3, Pero: 1, Luka: undefined });
  const tcalls = await page.evaluate(() => Object.values(buildStats(4).teams).map(t => t.calls).sort());
  assert.deepEqual(tcalls, [4, 4]);
  assert.deepEqual(stats.form, ['W', 'L']);
  assert.equal(Object.keys(stats.partners).length, 1);
  assert.equal(stats.ov.calls, 10); assert.equal(stats.ov.passed, 10);
  ok('player aggregates correct; 2v2 calls credited to the individual caller, team gets all');

  // 9) Igrači tab + detalj
  await page.click('#statsTabs .tab[data-tab="players"]'); await settle();
  assert.equal(await page.locator('#statsBody .lrow').count(), 5);
  await page.locator('#statsBody .lrow', { hasText: 'Ana' }).click(); await settle();
  assert.ok(await page.isVisible('#infoSheet.on'));
  const pTxt = await page.textContent('#infoBody');
  assert.match(pTxt, /Suigrači/); assert.match(pTxt, /Marko/); assert.match(pTxt, /Luka/);
  ok('players tab lists all; player sheet shows partners + opponents');

  // preimenovanje
  await page.locator('#infoBody input').last().fill('Ana K.');
  await page.getByRole('button', { name: 'Preimenuj' }).click(); await settle();
  d = await db(); assert.ok(d.players.some(p => p.name === 'Ana K.'));
  ok('rename player');

  // 10) Timovi tab
  await page.click('#statsTabs .tab[data-tab="teams"]'); await settle();
  assert.ok(!(await page.isVisible('#statsMode')));
  assert.equal(await page.locator('#statsBody .lrow').count(), 2);
  const sels = page.locator('#statsBody select');
  await sels.nth(0).selectOption({ label: 'Luka' }); await sels.nth(1).selectOption({ label: 'Ivo' });
  await page.locator('#statsBody input').fill('Kraljevi');
  await page.getByRole('button', { name: '＋ Tim' }).click(); await settle();
  assert.equal(await page.locator('#statsBody .lrow').count(), 3);
  assert.ok(await page.locator('#statsBody .lrow', { hasText: 'Kraljevi' }).count());
  await page.locator('#statsBody .lrow', { hasText: 'Ana K. & Marko' }).click(); await settle();
  assert.match(await page.textContent('#infoBody'), /Protiv timova/);
  await page.click('#infoClose'); await settle();
  ok('teams tab: lists teams, manual team creation, team sheet with H2H');

  // 11) Povijest + detalj igre + nastavi nedovršenu
  await page.click('#statsTabs .tab[data-tab="history"]'); await settle();
  assert.equal(await page.locator('#statsBody .lrow').count(), 3);
  await page.locator('#statsBody .lrow').nth(2).click(); await settle(); // najstarija
  assert.equal(await page.locator('#infoBody table.blok tbody tr').count(), 4);
  assert.match(await page.innerText('#infoBody table.blok tfoot'), /🏆 362/);
  await page.click('#infoClose'); await settle();
  await page.click('#statsMode .opt[data-m="2"]'); await settle();
  assert.equal(await page.locator('#statsBody .lrow').count(), 1, 'mode filter');
  await page.click('#statsMode .opt[data-m="0"]'); await settle();
  ok('history list, game blok table with totals, mode filter');

  // otvori staru igru, pa nova igra se vraća
  await page.locator('#statsBody .lrow').nth(2).click(); await settle();
  await page.getByRole('button', { name: '✎ Otvori igru' }).click(); await settle();
  assert.ok(await page.isVisible('#viewGame'));
  d = await db(); assert.equal(d.current, d.games[0].id);
  ok('open archived game from history');

  // 12) Reload — sve ostaje
  await page.reload(); await settle();
  d = await db(); assert.equal(d.games.length, 3); assert.ok(await page.isVisible('#viewGame'));
  assert.equal(await page.locator('#hist .hrow').count(), 4);
  ok('reload restores current game and history');

  // 13) Prazna igra ne ide u povijest
  await page.click('#btnMenu'); await settle(); await page.click('#mNew'); await settle();
  await page.click('#btnStart'); await settle();             // nova igra bez ruku
  await page.click('#btnMenu'); await settle(); await page.click('#mNew'); await settle();
  await page.click('#btnStart'); await settle();             // opet — prethodna prazna se briše
  d = await db(); assert.equal(d.games.length, 4); assert.equal(d.games.filter(g => !g.hands.length).length, 1);
  ok('empty games are dropped when another starts');

  // 14) Izvoz / uvoz
  await page.click('#btnMenu'); await settle();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#mExport')]);
  const exp = path.join(TMP, 'export.json'); await dl.saveAs(exp);
  const expData = JSON.parse(fs.readFileSync(exp, 'utf8'));
  assert.equal(expData.games.length, 4);
  await page.evaluate(() => { localStorage.clear(); }); await page.reload(); await settle();
  assert.equal((await db()), null);
  await page.click('#btnMenu'); await settle();
  await page.setInputFiles('#importFile', exp); await settle();
  d = await db(); assert.equal(d.games.length, 4); assert.equal(d.players.length, 5);
  ok('export → clear → import roundtrip');

  // 15) Brisanje igrača
  await page.click('#btnStats'); await settle();
  await page.click('#statsTabs .tab[data-tab="players"]'); await settle();
  await page.locator('#statsBody .lrow', { hasText: 'Luka' }).click(); await settle();
  await page.getByRole('button', { name: '🗑 Obriši igrača' }).click(); await settle();
  d = await db(); assert.equal(d.players.length, 4); assert.ok(!d.teams.some(t => t.name === 'Kraljevi'));
  assert.equal(d.games.length, 4, 'games kept');
  await page.click('#statsTabs .tab[data-tab="overview"]'); await settle();
  ok('delete player removes them + their teams, keeps games');


  // 16) Migracija starog formata
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push(e.message));
  await p2.goto(URL_); await p2.evaluate(() => { localStorage.clear(); localStorage.setItem('belotblok_v1', JSON.stringify({ mode: 2, target: 501, rules: { belaAlways: true, stiglja: 90 }, parties: [{ name: 'Igrač 1' }, { name: 'Igrač 2' }], seats: ['Igrač 1', 'Igrač 2'], firstDealer: 0, hands: [{ caller: 0, cards: [90, 50], decl: [{}, {}], bela: null, stiglja: null }], created: 1 })); });
  await p2.reload(); await p2.waitForTimeout(300);
  const m = await p2.evaluate(() => ({ db: JSON.parse(localStorage.getItem('belotblok_db_v1')), old: localStorage.getItem('belotblok_v1'), hist: document.querySelectorAll('#hist .hrow').length }));
  assert.equal(m.db.games.length, 1); assert.equal(m.db.current, m.db.games[0].id); assert.equal(m.old, null); assert.equal(m.hist, 1);
  await p2.evaluate(() => { document.getElementById('btnStats').click(); });
  await p2.waitForTimeout(300);
  assert.match(await p2.innerText('#statsBody'), /1\s*\n\s*igra/);
  ok('old single-game storage migrates into history');

  // 17) 2 na 2 ruke bez zabilježenog igrača (starije) — zvanje se pripisuje oboma iz tima
  const legacy = await p2.evaluate(() => {
    const a = ensurePlayer('A'), b = ensurePlayer('B'), c = ensurePlayer('C'), e = ensurePlayer('E');
    DB.games.push({ id: 'x', mode: 4, target: 1001, rules: { belaAlways: true, stiglja: 90 }, parties: [{ name: 'T1', playerIds: [a, c] }, { name: 'T2', playerIds: [b, e] }],
      seats: ['A', 'B', 'C', 'E'], seatPlayers: [a, b, c, e], firstDealer: 0, created: 2,
      hands: [{ caller: 0, cards: [100, 62], decl: [{}, {}], bela: null, stiglja: null }, { caller: 0, callerSeat: 2, cards: [100, 62], decl: [{}, {}], bela: null, stiglja: null }] });
    const st = buildStats(4); return [a, c, b].map(id => st.players[id].calls);
  });
  assert.deepEqual(legacy, [1, 2, 0]);
  ok('legacy 2v2 hands without callerSeat credit both teammates');

  assert.deepEqual(errors, [], 'no page errors');
  ok('no console/page errors');
} finally {
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}

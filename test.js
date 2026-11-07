// Real-click test for Splash Slide Race. Usage: node test.js <url> <outdir>
// Retries the whole run up to 3 times if the headless browser dies under
// VM load (observed: zygote/OOM kills while sibling agents run browsers).
const { chromium } = require('playwright-core');
const fs = require('fs');
const [url, outdir] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--hatch-webgl-allowed-domains-file=/home/hatch/workspace/tools/pw-shot/webgl-policy.txt', '--hatch-webgl-allowed-domains-sha256=dc8a0e5eec744f6590a4c1889139c00568ffedc3eced6d0a1a5127e35f9ccd16'];

async function run() {
  const results = [];
  function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail || '' }); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : '')); }
  const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: LAUNCH_ARGS });
  const page = await browser.newPage({ viewport: { width: 480, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
  const state = () => page.evaluate(() => window.__splashSlideRace ? window.__splashSlideRace() : null);
  // Real mouse click at an element's centre (avoids Playwright's stability
  // check, which never settles while rAF is throttled under SwiftShader).
  const clickBtn = async (sel) => {
    const box = await page.locator(sel).boundingBox({ timeout: 120000 });
    if (!box) throw new Error('no box for ' + sel);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  // Steer with real held arrow keys, sweeping wall to wall. Keyboard
  // steering needs only one CDP call per direction change, so it stays
  // continuous even when the VM is loaded and CDP calls take ~2s each.
  // (Mouse steering is still exercised: the menu/level buttons are all
  // clicked with the real mouse, and a mouse sweep runs in the probe.)
  const playRace = async () => {
    const t0 = Date.now();
    let maxProgress = 0, sawShove = false, sawFall = false;
    let held = null, edgeTouchDone = false;
    const box = await page.locator('#game').boundingBox({ timeout: 120000 });
    const hold = async (key) => {
      if (held === key) return;
      if (held) await page.keyboard.up(held);
      held = key;
      await page.keyboard.down(key);
    };
    try {
      while (Date.now() - t0 < 45000) {
        const s = await state();
        if (!s || s.screen !== 'playing') return { s, maxProgress, sawShove, sawFall };
        maxProgress = Math.max(maxProgress, s.progress);
        if (s.shoves > 0) sawShove = true;
        if (s.falling || s.shortcuts > 0) sawFall = true;
        const elapsed = Date.now() - t0;
        // Once per race, drag the real mouse past the edge to trigger the
        // shortcut fall (keyboard steering deliberately stays on-slide).
        if (!edgeTouchDone && elapsed > 5000) {
          edgeTouchDone = true;
          if (held) { await page.keyboard.up(held); held = null; }
          await page.mouse.move(box.x + box.width * (0.5 + (s.halfWidth + 30) / 480), box.y + box.height * 0.62);
          await page.waitForTimeout(700);
          continue;
        }
        // sweep wall to wall every 1.4s (key held at a wall = wall ride)
        const phase = Math.floor(elapsed / 1400) % 2;
        await hold(phase === 0 ? 'ArrowLeft' : 'ArrowRight');
        await page.waitForTimeout(150);
      }
      return { s: await state(), maxProgress, sawShove, sawFall, timedOut: true };
    } finally {
      if (held) await page.keyboard.up(held).catch(() => {});
    }
  };
  const waitScreen = async (screens, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const s = await state();
      if (s && screens.includes(s.screen)) return s;
      await page.waitForTimeout(200);
    }
    return await state();
  };

  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(900);
  let s = await state();
  check('loads, hook present, menu screen', s && s.screen === 'menu', JSON.stringify(s));
  await page.screenshot({ timeout: 120000, path: outdir + '/01-menu.png' });

  await clickBtn('#btn-howto'); await page.waitForTimeout(300);
  s = await state();
  check('how-to overlay opens', s.screen === 'howto', JSON.stringify(s));
  await clickBtn('#btn-howto-close'); await page.waitForTimeout(300);
  s = await state();
  check('how-to close -> menu', s.screen === 'menu', JSON.stringify(s));

  await clickBtn('#btn-levels'); await page.waitForTimeout(300);
  s = await state();
  check('race select opens', s.screen === 'levels', JSON.stringify(s));
  await page.screenshot({ timeout: 120000, path: outdir + '/02-levels.png' });
  await clickBtn('#btn-levels-close'); await page.waitForTimeout(300);

  // --- Race 1, played with real mouse steering ---
  await clickBtn('#btn-start'); await page.waitForTimeout(400);
  s = await state();
  check('start -> playing race 1, 4 rivals', s && s.screen === 'playing' && s.level === 1 && s.rivals === 4, JSON.stringify(s));
  await page.screenshot({ timeout: 120000, path: outdir + '/03-race1.png' });
  const r1 = await playRace();
  check('race 1: player progressed most of the slide', r1.maxProgress > 1200, 'maxProgress=' + r1.maxProgress + ' length=' + (r1.s && r1.s.length));
  s = await waitScreen(['clear', 'fail', 'gameover'], 15000);
  check('race 1 ends on a result screen', ['clear', 'fail', 'gameover'].includes(s.screen), JSON.stringify(s));
  const r1Result = s.screen;
  if (r1Result === 'fail' || r1Result === 'gameover') {
    await clickBtn(r1Result === 'fail' ? '#btn-retry' : '#btn-over-retry');
    await page.waitForTimeout(400);
    await playRace();
    s = await waitScreen(['clear', 'fail', 'gameover'], 15000);
  }
  check('race 1 cleared (top 3) on real steering', s.screen === 'clear', JSON.stringify(s));
  console.log('RACE 1 MECHANICS: shoves=' + s.shoves + ' shortcuts=' + s.shortcuts + ' starfish=' + s.starfishGot);
  await page.screenshot({ timeout: 120000, path: outdir + '/05-clear1.png' });

  // --- Next -> race 2; pause / resume / mute ---
  await clickBtn('#btn-next'); await page.waitForTimeout(400);
  s = await state();
  check('next -> playing race 2, 4 rivals', s && s.screen === 'playing' && s.level === 2 && s.rivals === 4, JSON.stringify(s));
  await clickBtn('#btn-pause'); await page.waitForTimeout(200); s = await state();
  check('pause -> paused', s.screen === 'paused', JSON.stringify(s));
  await clickBtn('#btn-resume'); await page.waitForTimeout(200); s = await state();
  check('resume -> playing', s.screen === 'playing', JSON.stringify(s));
  await clickBtn('#btn-mute'); s = await state();
  check('mute toggles on', s.muted === true, JSON.stringify(s));
  await clickBtn('#btn-mute'); s = await state();
  check('mute toggles off', s.muted === false, JSON.stringify(s));

  // --- Play through races 2..20 ---
  let totalShoves = 0, totalShortcuts = 0;
  for (let lvl = 2; lvl <= 20; lvl++) {
    let guard = 0;
    while (guard++ < 3) {
      s = await state();
      if (!s || s.screen !== 'playing') break;
      const r = await playRace();
      totalShoves += (r.s && r.s.shoves) || 0;
      totalShortcuts += (r.s && r.s.shortcuts) || 0;
      s = await waitScreen(['clear', 'fail', 'gameover'], 15000);
      if (s.screen === 'clear') break;
      if (s.screen === 'fail') { await clickBtn('#btn-retry'); await page.waitForTimeout(400); continue; }
      if (s.screen === 'gameover') { await clickBtn('#btn-over-retry'); await page.waitForTimeout(400); continue; }
      break;
    }
    s = await state();
    check('race ' + lvl + ' cleared', s && s.screen === 'clear', JSON.stringify(s));
    if (lvl < 20) { await clickBtn('#btn-next'); await page.waitForTimeout(400); }
  }
  s = await state();
  check('race 20 cleared -> clear screen', s && s.screen === 'clear' && s.level === 20, JSON.stringify(s));
  await page.screenshot({ timeout: 120000, path: outdir + '/09-clear20.png' });
  await clickBtn('#btn-next'); await page.waitForTimeout(500);
  s = await state();
  check('after race 20 -> WIN screen', s && s.screen === 'win', JSON.stringify(s));
  await page.screenshot({ timeout: 120000, path: outdir + '/10-win.png' });

  await clickBtn('#btn-again'); await page.waitForTimeout(400);
  s = await state();
  // Score resets to 0 on "race again", but the new race is already live by
  // the time we read state (slow CDP): fresh-race earnings (<500) prove
  // the reset — the pre-reset total was 46659 in the last full run.
  check('race again -> playing race 1, score reset', s && s.screen === 'playing' && s.level === 1 && s.score < 500, JSON.stringify(s));

  console.log('MECHANICS TOTALS: shoves=' + totalShoves + ' shortcuts=' + totalShortcuts);
  check('shove/shortcut mechanics fired at least once across 20 races', totalShoves + totalShortcuts > 0, 'shoves=' + totalShoves + ' shortcuts=' + totalShortcuts);
  check('no page/console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await browser.close();
  return failed;
}

const os = require('os');
async function preflight() {
  for (let i = 0; i < 40; i++) {
    const freeMB = os.freemem() / 1048576;
    const load = os.loadavg()[0];
    if (freeMB > 2400 && load < 14) { console.log(`preflight OK: free ${Math.round(freeMB)}MB load ${load.toFixed(1)}`); return; }
    if (i % 6 === 0) console.log(`preflight waiting: free ${Math.round(freeMB)}MB load ${load.toFixed(1)} (attempt ${i + 1}/40)`);
    await new Promise(r => setTimeout(r, 15000));
  }
  console.log('preflight: proceeding anyway after 10 min');
}
(async () => {
  await preflight();
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const failed = await run();
      process.exit(failed ? 1 : 0);
    } catch (e) {
      console.error('ATTEMPT ' + attempt + ' CRASHED: ' + (e && e.message ? e.message.split('\n')[0] : e));
      if (attempt === 5) process.exit(2);
      console.log('Retrying whole run in 10s...');
      await new Promise(r => setTimeout(r, 10000));
    }
  }
})();

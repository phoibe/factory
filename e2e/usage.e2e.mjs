// Journeys of issue #628: the « Consommation » page, opened from « Réglages généraux ».
import test from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './fixture.mjs';

const HOUR = 3600e3;
const hourKey = (ms) => new Date(ms).toISOString().slice(0, 13);
const decode = (w) => JSON.parse(Buffer.from(w.body.content, 'base64').toString('utf8'));
const settingsPuts = (writes) => writes.filter((w) => w.method === 'PUT' && w.path === '/repos/phoibe/factory/contents/settings.json');

// A run `hoursAgo` hours back: each task with its output tokens, all in one hour bucket.
function run(hoursAgo, size, tasks) {
  const at = Date.now() - hoursAgo * HOUR;
  return {
    at: new Date(at).toISOString(), issue: 1, stage: 'build', size,
    tasks: tasks.map(([type, kind, model, effort]) => ({ type, kind, model, effort })),
    use: tasks.map(([, , model, , tokens = {}], i) => [hourKey(at), i, model, 0, 0, 0, tokens.cacheRead || 0, tokens.output || 0]),
  };
}
// The month files of the runs ({ 'YYYY-MM': { v, runs } }), as agent/scripts/usage.mjs writes them.
function months(runs) {
  const out = {};
  runs.forEach((r, i) => { const m = r.at.slice(0, 7); (out[m] ??= { v: 1, runs: {} }).runs[`s${i}`] = r; });
  return out;
}
const OPUS = 'claude-opus-5-5', FABLE = 'claude-fable-5-2';
const k100 = { output: 100_000 };
// Two hours ago, a medium request: the pilot (1 M tokens read from the cache: 0,20 $), three Fable reviews
// (4 $ each) and five Opus builds (2 $ each).
const recent = run(2, 'medium', [
  ['pilot', 'build', OPUS, 'medium', { cacheRead: 1_000_000 }],
  ['review', 'final-review', FABLE, 'high', k100], ['review', 'review-round', FABLE, 'high', k100], ['review', 'scope-check', FABLE, 'high', k100],
  ...Array.from({ length: 5 }, () => ['code', 'build', OPUS, 'medium', k100]),
]);
// Ten days ago, a large request: one more Opus build (50 000 tokens: 1 $).
const older = run(240, 'large', [['pilot', 'build', OPUS, 'medium', {}], ['code', 'build', OPUS, 'medium', { output: 50_000 }]]);
const USAGE = { 'o/r': months([recent, older]) };

const openGeneral = async (page, url) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Réglages généraux' }).click();
  await page.locator('#general:not([aria-busy])').waitFor();
};
const openUsage = async (page, url) => {
  await openGeneral(page, url);
  await page.getByRole('button', { name: 'Voir la consommation' }).click();
  await page.getByRole('heading', { name: 'Consommation', level: 1 }).waitFor();
  await page.locator('#usage:not([aria-busy])').waitFor();
  await noCodeWords(page);
};
// Never a raw « null » or « undefined » on the page (a missing value printed as text).
async function noCodeWords(page) {
  assert.doesNotMatch(await page.locator('#usage-view').innerText(), /\b(null|undefined|NaN)\b/);
}
// The cells of the first table row holding `text`, as shown (the tokens under the dollars on their own line).
const cells = (page, text) => page.locator('#usage tbody tr', { hasText: text }).first().locator('th, td').evaluateAll((c) => c.map((x) => x.innerText.trim()));
const headers = (page) => page.locator('#usage thead th').allTextContents();
// A reset two days ago at midnight: the plan week started before every reading of the journeys.
const twoDaysAgo = new Date(Date.now() - 48 * HOUR);
const RESET = { day: twoDaysAgo.getDay() || 7, hour: 0 };
// A calibration whose window holds no run: its stored dollars per point stay, and the 7 columns show.
const CALIBRATED = { from: new Date(Date.now() - 30 * HOUR).toISOString(), to: new Date(Date.now() - 26 * HOUR).toISOString(), all: 2, fable: 1, points: { all: 10, fable: 10 } };
const quotaWith = (readings, calibration = null) => ({ machine: 'dev-server', quota: { reset: { all: RESET, fable: null }, readings, calibration } });

test('le lien Voir la consommation ouvre la page et Retour aux réglages généraux y ramène', async () => {
  await withPanel({ usage: USAGE }, async ({ page, url }) => {
    await openGeneral(page, url);
    await page.getByRole('combobox', { name: 'Revue' }).selectOption('haiku');
    await page.getByRole('button', { name: 'Voir la consommation' }).click();
    await page.getByRole('heading', { name: 'Consommation', level: 1 }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).isVisible(), false);
    await page.getByRole('button', { name: '← Retour aux réglages généraux' }).click();
    await page.getByRole('heading', { name: 'Réglages généraux', level: 1 }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Consommation' }).isVisible(), false);
    assert.equal(await page.getByRole('combobox', { name: 'Revue' }).inputValue(), 'haiku', 'the unsaved choice is still there');
    await page.getByText('Modifications non enregistrées').waitFor();
  });
});

test('la page montre type de tâche, moteur et effort, tâches, total en dollars avec les tokens et la ligne Total', async () => {
  await withPanel({ usage: USAGE, slowReads: [[/contents\/usage\//, 600]] }, async ({ page, url }) => {
    await openGeneral(page, url);
    await page.getByRole('button', { name: 'Voir la consommation' }).click();
    await page.locator('#usage[aria-busy="true"]').getByText('Chargement…', { exact: true }).waitFor();
    await page.locator('#usage:not([aria-busy])').waitFor();
    assert.deepEqual(await headers(page), ['Type de tâche', 'Moteur · effort', 'Tâches', 'Total', 'En moyenne']);
    assert.deepEqual(await cells(page, 'Écriture du code'), ['Écriture du code', 'Opus · moyen', '5', '10 $\n500 000 tokens', '2 $']);
    assert.deepEqual(await cells(page, 'Agent qui pilote'), ['Agent qui pilote', 'Opus · moyen', '1', '0,20 $\n1 M de tokens', 'trop peu de mesures']);
    const types = await page.locator('#usage tbody tr:not([hidden]) th').evaluateAll((n) => n.map((x) => x.innerText.trim()));
    assert.deepEqual(types, ['Écriture du code', 'Revue', 'Agent qui pilote', 'Total'], 'the order of the settings, the pilot last');
    assert.deepEqual(await cells(page, 'Total'), ['Total', '', '9', '22 $\n1,8 M de tokens', '']);
    await page.getByText('Équivalent au tarif public de Claude du 3 nov. 2026. Ce n\'est pas une facture.', { exact: true }).waitFor();
  });
});

test('une ligne de moins de 5 tâches affiche trop peu de mesures', async () => {
  await withPanel({ usage: USAGE }, async ({ page, url }) => {
    await openUsage(page, url);
    assert.deepEqual(await cells(page, 'Revue'), ['Revue', 'Fable · élevé', '3', '12 $\n300 000 tokens', 'trop peu de mesures']);
  });
});

test('un toucher sur une ligne Revue la déplie : relecture finale, relectures 2 et 3, vérification de portée', async () => {
  await withPanel({ usage: USAGE }, async ({ page, url }) => {
    await openUsage(page, url);
    const button = page.locator('#usage tbody').getByRole('button', { name: 'Revue' });
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#usage').getByText('relecture finale', { exact: true }).isVisible(), false);
    await button.click();
    assert.equal(await button.getAttribute('aria-expanded'), 'true');
    for (const kind of ['relecture finale', 'relectures 2 et 3', 'vérification de portée']) {
      // The row already says « trop peu de mesures »: its parts show a dash instead of repeating it.
      assert.deepEqual(await cells(page, kind), [kind, '', '1', '4 $\n100 000 tokens', '—']);
    }
    await button.click();
    assert.equal(await page.locator('#usage').getByText('relecture finale', { exact: true }).isVisible(), false);
  });
});

test('les listes Période et Taille changent les chiffres et sans remise à zéro la période propose 7 derniers jours et 30 derniers jours', async () => {
  await withPanel({ usage: USAGE }, async ({ page, url }) => {
    await openUsage(page, url);
    const period = page.getByRole('combobox', { name: 'Période' });
    assert.deepEqual(await period.locator('option').allTextContents(), ['7 derniers jours', '30 derniers jours']);
    const size = page.getByRole('combobox', { name: 'Taille' });
    assert.deepEqual(await size.locator('option').allTextContents(), ['Toutes les demandes', 'Petites', 'Moyennes', 'Grandes']);
    await period.selectOption({ label: '30 derniers jours' });
    assert.deepEqual((await cells(page, 'Écriture du code')).slice(2, 4), ['6', '11 $\n550 000 tokens']);
    await size.selectOption({ label: 'Grandes' });
    assert.deepEqual((await cells(page, 'Écriture du code')).slice(2, 4), ['1', '1 $\n50 000 tokens']);
    assert.equal(await page.locator('#usage tbody tr', { hasText: 'Revue' }).count(), 0);
  });
});

test('la remise à zéro enregistrée propose Semaine de forfait en cours et Semaine de forfait précédente', async () => {
  await withPanel({ usage: USAGE, writeDelay: 500, factoryFiles: { 'settings.json': { machine: 'github', models: { code: 'sonnet' } } } }, async ({ page, url, writes }) => {
    await openUsage(page, url);
    const plan = page.getByRole('group', { name: 'Mon forfait' });
    await page.getByRole('heading', { name: 'Mon forfait', level: 2 }).waitFor();
    // Nothing to save yet: the button looks disabled. A reading before the reset says what to do first.
    assert.ok(Number(await plan.getByRole('button', { name: 'Enregistrer' }).evaluate((b) => b.disabled && getComputedStyle(b).opacity)) < 1);
    await plan.getByRole('textbox', { name: 'Tous moteurs (%)' }).fill('12');
    await plan.getByRole('button', { name: 'Noter le relevé' }).click();
    await plan.getByText('Choisissez d\'abord la remise à zéro.', { exact: true }).waitFor();
    assert.equal(settingsPuts(writes).length, 0);
    const all = plan.getByRole('group', { name: 'Tous moteurs' });
    await all.getByRole('combobox', { name: 'Jour' }).selectOption({ label: 'mardi' });
    await all.getByRole('combobox', { name: 'Heure' }).selectOption({ label: '9 h' });
    await plan.getByRole('button', { name: 'Enregistrer' }).click();
    await plan.getByRole('button', { name: 'Enregistrement…' }).waitFor();
    await page.getByRole('combobox', { name: 'Période' }).locator('option', { hasText: 'Semaine de forfait en cours' }).waitFor({ state: 'attached' });
    assert.deepEqual(await page.getByRole('combobox', { name: 'Période' }).locator('option').allTextContents(),
      ['Semaine de forfait en cours', 'Semaine de forfait précédente', '30 derniers jours']);
    const puts = settingsPuts(writes);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].body.branch, 'factory-runners');
    assert.deepEqual(decode(puts[0]), { machine: 'github', models: { code: 'sonnet' }, quota: { reset: { all: { day: 2, hour: 9 }, fable: null }, readings: [], calibration: null } });
    assert.equal(await plan.getByRole('button', { name: 'Noter le relevé' }).isDisabled(), false);
    // Set once: the reset folds into one line, with « Modifier » to open it again.
    await plan.getByText('Remise à zéro : mardi 9 h', { exact: true }).waitFor();
    assert.equal(await plan.getByRole('combobox', { name: 'Jour' }).count(), 0);
    await plan.getByRole('button', { name: 'Modifier' }).click();
    assert.equal(await all.getByRole('combobox', { name: 'Jour' }).inputValue(), '2');
  });
});

test('un second relevé demande l\'usage hors factory et avec Non et moins de 5 points dit qu\'il en faut au moins 5', async () => {
  const first = { at: new Date(Date.now() - HOUR).toISOString(), all: 10, fable: null, outside: null };
  await withPanel({ usage: USAGE, factoryFiles: { 'settings.json': quotaWith([first]) } }, async ({ page, url, writes }) => {
    await openUsage(page, url);
    const plan = page.getByRole('group', { name: 'Mon forfait' });
    await plan.getByRole('textbox', { name: 'Tous moteurs (%)' }).fill('13');
    await plan.getByRole('button', { name: 'Noter le relevé' }).click();
    await page.getByText('Avez-vous utilisé Claude en dehors de la factory depuis le relevé précédent ?').waitFor();
    await page.getByText('En dehors de la factory : vos discussions sur claude.ai, vos propres sessions, vos tâches planifiées et l\'onglet « Agent ».').waitFor();
    assert.equal(settingsPuts(writes).length, 0, 'nothing written before the answer');
    await plan.getByRole('button', { name: 'Non', exact: true }).click();
    await page.getByText('La jauge tous moteurs a monté de 3 points depuis le relevé précédent : il en faut au moins 5 pour étalonner. Laissez la factory travailler, puis notez un nouveau relevé.').waitFor();
    const saved = decode(settingsPuts(writes)[0]).quota;
    assert.equal(saved.readings.length, 2);
    assert.deepEqual({ all: saved.readings[1].all, outside: saved.readings[1].outside }, { all: 13, outside: false });
    await page.getByText('Pas encore d’étalonnage').waitFor();
  });
});

test('un relevé de 150 est refusé et Supprimer ce relevé le fait disparaître', async () => {
  const first = { at: new Date(Date.now() - HOUR).toISOString(), all: 10, fable: 4, outside: null };
  await withPanel({ usage: USAGE, factoryFiles: { 'settings.json': quotaWith([first]) } }, async ({ page, url, writes }) => {
    await openUsage(page, url);
    const plan = page.getByRole('group', { name: 'Mon forfait' });
    await plan.getByRole('textbox', { name: 'Tous moteurs (%)' }).fill('150');
    await plan.getByRole('button', { name: 'Noter le relevé' }).click();
    await page.getByText('Entrez un nombre entre 0 et 100.').waitFor();
    assert.equal(await page.getByText('Avez-vous utilisé Claude en dehors de la factory').count(), 0);
    assert.equal(settingsPuts(writes).length, 0);
    await plan.getByText(/^Dernier relevé du /).waitFor();
    // Two steps: the first touch only asks for a confirmation.
    await plan.getByRole('button', { name: 'Supprimer ce relevé' }).click();
    await plan.getByRole('button', { name: 'Confirmer la suppression' }).click();
    await plan.getByText(/^Dernier relevé du /).waitFor({ state: 'detached' });
    assert.deepEqual(decode(settingsPuts(writes)[0]).quota.readings, []);
  });
});

test('sans étalonnage seuls les dollars s\'affichent et après étalonnage 1 % de chaque jauge et les colonnes de forfait apparaissent', async () => {
  const first = { at: new Date(Date.now() - 4 * HOUR).toISOString(), all: 10, fable: 5, outside: null };
  await withPanel({ usage: USAGE, factoryFiles: { 'settings.json': quotaWith([first]) } }, async ({ page, url, writes }) => {
    await openUsage(page, url);
    await page.getByText('Pas encore d’étalonnage').waitFor();
    assert.deepEqual(await headers(page), ['Type de tâche', 'Moteur · effort', 'Tâches', 'Total', 'En moyenne']);
    const plan = page.getByRole('group', { name: 'Mon forfait' });
    await plan.getByRole('textbox', { name: 'Tous moteurs (%)' }).fill('20');
    await plan.getByRole('textbox', { name: 'Fable (%)' }).fill('15');
    await plan.getByRole('button', { name: 'Noter le relevé' }).click();
    await plan.getByRole('button', { name: 'Non', exact: true }).click();
    // 22,20 $ for 10 points of the « tous moteurs » gauge, 12 $ of Fable for 10 points of the Fable one.
    await page.getByText(/^Étalonnage du .+ · 1\s%\sde la semaine tous moteurs ≈\s2,22\s\$ · 1\s%\sde la semaine Fable ≈\s1,20\s\$ \(provisoire\)$/).waitFor();
    assert.deepEqual(await headers(page), ['Type de tâche', 'Moteur · effort', 'Tâches', 'Total', 'En moyenne', 'Semaine Fable', 'Semaine tous moteurs']);
    assert.deepEqual((await cells(page, 'Revue')).slice(5), ['≈ 10 %', '≈ 5,4 %']);
    assert.deepEqual((await cells(page, 'Écriture du code')).slice(5), ['0 %', '≈ 4,5 %']);
    assert.deepEqual((await cells(page, 'Total')).slice(5), ['≈ 10 %', '≈ 10 %']);
    await page.locator('#usage tbody').getByRole('button', { name: 'Revue' }).click();
    const fit = await page.locator('.usage-table-wrap').evaluate((w) => [w.scrollWidth, w.clientWidth]);
    assert.ok(fit[0] <= fit[1], `the 7 columns fit on a computer: ${fit}`);
    const c = decode(settingsPuts(writes)[0]).quota.calibration;
    assert.deepEqual(c.points, { all: 10, fable: 10 });
    await page.getByText('Jauge tous moteurs à 20 % : factory ≈ 10 %, hors factory ≈ 10 %').waitFor();
  });
});

test('sur téléphone la page tient sur une colonne et le tableau défile sans faire déborder la page', async () => {
  await withPanel({ usage: USAGE, viewport: { width: 390, height: 844 }, factoryFiles: { 'settings.json': quotaWith([], CALIBRATED) } }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Suivi' }).waitFor();
    await page.getByText('Plus', { exact: true }).click();
    await page.getByRole('button', { name: 'Réglages généraux' }).click();
    await page.getByRole('button', { name: 'Voir la consommation' }).click();
    await page.locator('#usage table').waitFor();
    const m = await page.evaluate(() => {
      const wrap = document.querySelector('.usage-table-wrap');
      return { scroll: document.documentElement.scrollWidth, width: innerWidth, overflow: getComputedStyle(wrap).overflowX,
        inner: wrap.scrollWidth, outer: wrap.clientWidth, right: Math.round(wrap.getBoundingClientRect().right),
        fields: [...document.querySelectorAll('#usage-view select, #usage-view input')].map((s) => Math.round(s.getBoundingClientRect().right)) };
    });
    assert.ok(m.scroll <= m.width, `horizontal scroll: ${m.scroll} > ${m.width}`);
    assert.equal(m.overflow, 'auto');
    assert.ok(m.inner > m.outer && m.right <= m.width, JSON.stringify(m));
    assert.ok(m.fields.length > 0 && m.fields.every((r) => r <= m.width), JSON.stringify(m));
  });
});

test('un projet illisible n\'empêche pas les autres et la page dit lequel manque', async () => {
  const month = recent.at.slice(0, 7);
  await withPanel({ repos: ['o/r', 'o/s', 'o/t'], usage: { ...USAGE, 'o/s': { [month]: 500 }, 'o/t': { [month]: 'invalid' } } }, async ({ page, url }) => {
    await openUsage(page, url);
    await page.getByText('Les chiffres de s n\'ont pas pu être lus.', { exact: true }).waitFor();
    await page.getByText('Les chiffres de t n\'ont pas pu être lus.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Les chiffres de r n\'ont pas pu être lus.').count(), 0);
    assert.deepEqual((await cells(page, 'Écriture du code')).slice(2, 3), ['5']);
  });
});

test('une page sans mesure dit Aucune mesure pour l\'instant', async () => {
  await withPanel({}, async ({ page, url, reads }) => {
    await openUsage(page, url);
    await page.getByText('Aucune mesure pour l\'instant. Les chiffres arrivent à la fin du prochain lancement de la factory.', { exact: true }).waitFor();
    assert.equal(await page.locator('#usage table').count(), 0);
    // Nothing to filter or to price: no lists, no price line.
    assert.equal(await page.getByRole('combobox', { name: 'Période' }).count(), 0);
    assert.equal(await page.getByText('Ce n\'est pas une facture.', { exact: false }).count(), 0);
    assert.doesNotMatch(await page.locator('#usage').textContent(), /null|undefined/);
    assert.ok(reads.some((p) => p.startsWith('/repos/phoibe/factory/contents/usage/')), 'the factory itself is read');
    assert.ok(reads.some((p) => p.startsWith('/repos/o/r/contents/usage/')));
  });
});

test('un moteur sans tarif affiche tarif inconnu', async () => {
  const unpriced = run(1, 'small', [['plan', 'plan', 'claude-opus-5-6', 'high', { output: 2_000_000 }]]);
  await withPanel({ usage: { 'o/r': months([recent, unpriced]) } }, async ({ page, url }) => {
    await openUsage(page, url);
    assert.deepEqual((await cells(page, 'Plans et organisation')).slice(1, 4), ['Opus 5.6 · élevé', '1', 'tarif inconnu\n2 M de tokens']);
    assert.equal((await cells(page, 'Total'))[3].split('\n')[0], 'tarif inconnu');
    // In the Total column too, the phrase is small and grey like « trop peu de mesures » (DESIGN.md).
    const look = await page.evaluate(() => {
      const st = (n) => (n ? { size: getComputedStyle(n).fontSize, color: getComputedStyle(n).color, font: getComputedStyle(n).fontFamily } : null);
      const rows = [...document.querySelectorAll('#usage tbody tr')];
      const plan = rows.find((r) => r.textContent.includes('Plans et organisation'));
      const total = rows.find((r) => r.classList.contains('usage-total'));
      const phrase = (row) => [...row.querySelectorAll('td.fig .usage-word')].find((w) => w.textContent === 'tarif inconnu');
      const average = [...document.querySelectorAll('#usage td.fig .usage-word')].find((w) => w.textContent === 'trop peu de mesures');
      return { row: st(phrase(plan)), total: st(phrase(total)), average: st(average) };
    });
    assert.ok(look.row && look.total && look.average, `the phrases are wrapped: ${JSON.stringify(look)}`);
    assert.deepEqual(look.row, look.average);
    assert.deepEqual(look.total, look.average);
  });
});

// Final review 1 of #628: the readings live with the general settings so that the page is the same on every device.
test('un relevé noté sur un autre appareil pendant que la page est ouverte reste après le relevé suivant', async () => {
  const r1 = { at: new Date(Date.now() - 5 * HOUR).toISOString(), all: 10, fable: null, outside: null };
  const r2 = { at: new Date(Date.now() - HOUR).toISOString(), all: 14, fable: null, outside: false }; // the phone
  const factoryFiles = { 'settings.json': quotaWith([r1]) };
  await withPanel({ usage: USAGE, factoryFiles }, async ({ page, url, writes }) => {
    await openUsage(page, url);
    factoryFiles['settings.json'] = quotaWith([r1, r2]); // meanwhile, the phone notes a reading
    const plan = page.getByRole('group', { name: 'Mon forfait' });
    await plan.getByRole('textbox', { name: 'Tous moteurs (%)' }).fill('20');
    await plan.getByRole('button', { name: 'Noter le relevé' }).click();
    await plan.getByRole('button', { name: 'Non', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#usage-reading-save')?.disabled);
    assert.deepEqual(decode(settingsPuts(writes).at(-1)).quota.readings.map((r) => r.all), [10, 14, 20], 'the phone reading (14) is kept');
    await plan.getByText(/^Dernier relevé du .+ tous moteurs 20 %$/).waitFor();
    // Deleting works on the fresh readings too: the phone's 14 becomes the last one.
    factoryFiles['settings.json'] = decode(settingsPuts(writes).at(-1));
    await plan.getByRole('button', { name: 'Supprimer ce relevé' }).click();
    await plan.getByRole('button', { name: 'Confirmer la suppression' }).click();
    await plan.getByText(/^Dernier relevé du .+ tous moteurs 14 %$/).waitFor();
    assert.deepEqual(decode(settingsPuts(writes).at(-1)).quota.readings.map((r) => r.all), [10, 14]);
  });
});

test('les chiffres du tableau sont en police à chasse fixe, les mots dans la police du texte', async () => {
  await withPanel({ usage: USAGE }, async ({ page, url }) => {
    await openUsage(page, url);
    const fonts = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#usage tbody tr')].find((r) => r.textContent.includes('Revue'));
      const font = (n) => getComputedStyle(n).fontFamily;
      const total = row.querySelectorAll('td.fig')[1];
      return { digits: font(total.querySelector('.num')), unit: font(total), tokens: font(total.querySelector('small')),
        words: (() => { const w = [...row.querySelectorAll('td.fig .usage-word')].find((c) => c.textContent === 'trop peu de mesures'); return w ? font(w) : null; })() };
    });
    assert.ok(fonts.words, 'the Revue row has a « trop peu de mesures » cell');
    assert.match(fonts.digits, /^"?Geist Mono/);
    for (const f of [fonts.unit, fonts.tokens, fonts.words]) assert.match(f, /^"?Geist"?,/);
  });
});

test('au clavier, la question puis le message de Mon forfait reçoivent le focus', async () => {
  const first = { at: new Date(Date.now() - HOUR).toISOString(), all: 10, fable: null, outside: null };
  await withPanel({ usage: USAGE, factoryFiles: { 'settings.json': quotaWith([first]) } }, async ({ page, url }) => {
    await openUsage(page, url);
    await page.locator('#usage-reading-all').fill('12');
    await page.locator('#usage-reading-save').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'usage-question');
    await page.locator('#usage-outside-no').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'usage-message');
    assert.match(await page.evaluate(() => document.activeElement.textContent), /il en faut au moins 5/);
    await page.locator('#usage-reading-delete').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.textContent === 'Confirmer la suppression');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.closest('.usage-plan') && document.activeElement.id === 'usage-reading-all');
  });
});

test('une remise à zéro avec seulement un jour ou seulement une heure est refusée', async () => {
  await withPanel({ usage: USAGE }, async ({ page, url, writes }) => {
    await openUsage(page, url);
    const plan = page.getByRole('group', { name: 'Mon forfait' });
    await plan.getByRole('group', { name: 'Tous moteurs' }).getByRole('combobox', { name: 'Jour' }).selectOption({ label: 'mardi' });
    await plan.getByRole('button', { name: 'Enregistrer' }).click();
    await plan.getByText('Choisissez un jour et une heure.', { exact: true }).waitFor();
    await plan.getByRole('group', { name: 'Tous moteurs' }).getByRole('combobox', { name: 'Heure' }).selectOption({ label: '9 h' });
    assert.equal(await plan.getByText('Choisissez un jour et une heure.').count(), 0, 'corrected: the message goes');
    await plan.getByRole('group', { name: 'Fable' }).getByRole('combobox', { name: 'Heure' }).selectOption({ label: '8 h' });
    await plan.getByRole('button', { name: 'Enregistrer' }).click();
    await plan.getByText('Choisissez un jour et une heure.', { exact: true }).waitFor();
    assert.equal(settingsPuts(writes).length, 0);
    await plan.getByRole('group', { name: 'Fable' }).getByRole('combobox', { name: 'Jour' }).selectOption({ label: 'lundi' });
    await plan.getByRole('button', { name: 'Enregistrer' }).click();
    await plan.getByText('Choisissez un jour et une heure.').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelectorAll('#usage-period option').length === 3);
  });
});

// Design pass of #628 (.impeccable/critique/consommation-628.md).
test('un choix de remise à zéro pas encore enregistré reste après un relevé', async () => {
  const r1 = { at: new Date(Date.now() - 5 * HOUR).toISOString(), all: 10, fable: null, outside: null };
  await withPanel({ usage: USAGE, factoryFiles: { 'settings.json': quotaWith([r1]) } }, async ({ page, url }) => {
    await openUsage(page, url);
    const plan = page.getByRole('group', { name: 'Mon forfait' });
    await plan.getByRole('button', { name: 'Modifier' }).click();
    await plan.getByRole('group', { name: 'Fable' }).getByRole('combobox', { name: 'Jour' }).selectOption({ label: 'lundi' });
    await plan.getByRole('group', { name: 'Fable' }).getByRole('combobox', { name: 'Heure' }).selectOption({ label: '8 h' });
    await plan.getByRole('textbox', { name: 'Tous moteurs (%)' }).fill('20');
    await plan.getByRole('button', { name: 'Noter le relevé' }).click();
    await plan.getByRole('button', { name: 'Non', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#usage-reading-save')?.disabled);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#usage-reset-fable-day').value, document.querySelector('#usage-reset-fable-hour').value]), ['1', '8']);
  });
});

test('Annuler referme la question et laisse corriger le relevé', async () => {
  const first = { at: new Date(Date.now() - HOUR).toISOString(), all: 10, fable: null, outside: null };
  await withPanel({ usage: USAGE, factoryFiles: { 'settings.json': quotaWith([first]) } }, async ({ page, url, writes }) => {
    await openUsage(page, url);
    const plan = page.getByRole('group', { name: 'Mon forfait' });
    await plan.getByRole('textbox', { name: 'Tous moteurs (%)' }).fill('2');
    await plan.getByRole('button', { name: 'Noter le relevé' }).click();
    await plan.getByRole('button', { name: 'Annuler' }).click();
    assert.equal(await page.getByText('Avez-vous utilisé Claude en dehors de la factory').count(), 0);
    const field = plan.getByRole('textbox', { name: 'Tous moteurs (%)' });
    assert.equal(await field.isEditable(), true);
    assert.equal(await field.inputValue(), '2');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'usage-reading-all');
    assert.equal(settingsPuts(writes).length, 0);
  });
});

test('sur téléphone les premiers chiffres se voient, la première colonne reste et le cadre montre qu il défile', async () => {
  await withPanel({ usage: USAGE, viewport: { width: 390, height: 844 }, factoryFiles: { 'settings.json': quotaWith([], CALIBRATED) } }, async ({ page, url }) => {
    await page.goto(url);
    await page.getByRole('tab', { name: 'Suivi' }).waitFor();
    await page.getByText('Plus', { exact: true }).click();
    await page.getByRole('button', { name: 'Réglages généraux' }).click();
    await page.getByRole('button', { name: 'Voir la consommation' }).click();
    await page.locator('#usage table').waitFor();
    const before = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#usage tbody tr')].find((r) => r.textContent.includes('Écriture du code'));
      const total = row.querySelectorAll('td.fig')[1].getBoundingClientRect();
      return { total: Math.round(total.right), width: innerWidth, engine: row.querySelector('th').innerText, more: document.querySelector('.usage-table-wrap').classList.contains('more') };
    });
    assert.ok(before.total <= before.width, `the total is on the first screen: ${JSON.stringify(before)}`);
    assert.match(before.engine, /Opus · moyen/, 'the engine sits under the type');
    assert.equal(before.more, true, 'the frame shows there is more to the right');
    const shape = await page.evaluate(() => {
      const wrap = document.querySelector('.usage-table-wrap');
      const frame = wrap.parentElement;
      const rows = [...document.querySelectorAll('#usage tbody tr:not([hidden]) th')].map((th) => {
        const b = th.querySelector('.usage-toggle');
        return b ? Math.round(b.getBoundingClientRect().top - th.getBoundingClientRect().top) : 0;
      });
      const word = document.querySelector('#usage .usage-word');
      return { rows, word: Math.round(word.getBoundingClientRect().height), lineHeight: parseFloat(getComputedStyle(word).lineHeight) || 20,
        head: Math.round(document.querySelector('#usage thead tr').getBoundingClientRect().height),
        frameBorder: getComputedStyle(frame).borderRightWidth, frameMask: getComputedStyle(frame).maskImage, wrapMask: getComputedStyle(wrap).maskImage };
    });
    assert.ok(shape.rows.every((d) => d >= 0), `a type name never rides over the line above: ${shape.rows}`);
    assert.ok(shape.word <= shape.lineHeight * 1.5, `« trop peu de mesures » on one line: ${JSON.stringify(shape)}`);
    assert.ok(shape.head <= 56, `no empty band in the header row: ${shape.head}`);
    assert.equal(shape.frameBorder, '1px', 'the frame keeps its border');
    assert.equal(shape.frameMask, 'none', 'only the scrolling content fades, not the frame');
    assert.notEqual(shape.wrapMask, 'none');
    const after = await page.locator('.usage-table-wrap').evaluate(async (w) => {
      w.scrollLeft = w.scrollWidth;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { first: Math.round(w.querySelector('tbody th').getBoundingClientRect().left), wrap: Math.round(w.getBoundingClientRect().left), more: w.classList.contains('more') };
    });
    assert.ok(Math.abs(after.first - after.wrap) <= 1, `the first column stays: ${JSON.stringify(after)}`);
    assert.equal(after.more, false);
  });
});

test('Confirmer la suppression redevient Supprimer ce relevé dès qu une autre action a lieu', async () => {
  const first = { at: new Date(Date.now() - HOUR).toISOString(), all: 10, fable: null, outside: null };
  await withPanel({ usage: USAGE, factoryFiles: { 'settings.json': quotaWith([first]) } }, async ({ page, url, writes }) => {
    await openUsage(page, url);
    const plan = page.getByRole('group', { name: 'Mon forfait' });
    const arm = async () => { await plan.getByRole('button', { name: 'Supprimer ce relevé' }).click(); await plan.getByRole('button', { name: 'Confirmer la suppression' }).waitFor(); };
    const disarmed = async (why) => assert.equal(await plan.getByRole('button', { name: 'Confirmer la suppression' }).count(), 0, why);
    await arm();
    await plan.getByRole('button', { name: 'Modifier' }).click();
    await disarmed('editing the reset');
    await plan.getByRole('button', { name: 'Annuler' }).click();
    await arm();
    await plan.getByRole('textbox', { name: 'Tous moteurs (%)' }).fill('13');
    await plan.getByRole('button', { name: 'Noter le relevé' }).click();
    await disarmed('noting a reading');
    await arm();
    await plan.getByRole('button', { name: 'Annuler' }).click();
    await disarmed('cancelling the question');
    await plan.getByRole('button', { name: 'Noter le relevé' }).click();
    await arm();
    await plan.getByRole('button', { name: 'Non', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#usage-reading-save')?.disabled);
    await disarmed('answering the question');
    assert.ok(settingsPuts(writes).every((w) => decode(w).quota.readings.length === 2), 'nothing deleted');
  });
});

// Final review 3 of #628.
test('taper un relevé pendant que la suppression attend sa confirmation garde les chiffres dans l ordre', async () => {
  const first = { at: new Date(Date.now() - HOUR).toISOString(), all: 10, fable: null, outside: null };
  await withPanel({ usage: USAGE, factoryFiles: { 'settings.json': quotaWith([first]) } }, async ({ page, url, writes }) => {
    await openUsage(page, url);
    const plan = page.getByRole('group', { name: 'Mon forfait' });
    await plan.getByRole('button', { name: 'Supprimer ce relevé' }).click();
    await plan.getByRole('button', { name: 'Confirmer la suppression' }).waitFor();
    await plan.getByRole('textbox', { name: 'Tous moteurs (%)' }).click();
    await page.keyboard.type('13');
    assert.equal(await page.locator('#usage-reading-all').inputValue(), '13');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'usage-reading-all');
    await plan.getByRole('button', { name: 'Supprimer ce relevé' }).waitFor(); // disarmed by the typing
    await plan.getByRole('button', { name: 'Noter le relevé' }).click();
    await plan.getByRole('button', { name: 'Non', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#usage-reading-save')?.disabled);
    assert.deepEqual(decode(settingsPuts(writes).at(-1)).quota.readings.map((r) => r.all), [10, 13]);
  });
});

test('les deux boutons Annuler disent ce qu ils annulent', async () => {
  const first = { at: new Date(Date.now() - HOUR).toISOString(), all: 10, fable: null, outside: null };
  await withPanel({ usage: USAGE, factoryFiles: { 'settings.json': quotaWith([first]) } }, async ({ page, url }) => {
    await openUsage(page, url);
    const plan = page.getByRole('group', { name: 'Mon forfait' });
    await plan.getByRole('button', { name: 'Modifier' }).click();
    await plan.getByRole('textbox', { name: 'Tous moteurs (%)' }).fill('12');
    await plan.getByRole('button', { name: 'Noter le relevé' }).click();
    await plan.getByRole('button', { name: 'Annuler la modification de la remise à zéro', exact: true }).waitFor();
    await plan.getByRole('button', { name: 'Annuler le relevé', exact: true }).waitFor();
  });
});

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
};
// The cells of the first table row holding `text`, as shown (the tokens under the dollars on their own line).
const cells = (page, text) => page.locator('#usage tbody tr', { hasText: text }).first().locator('th, td').evaluateAll((c) => c.map((x) => x.innerText.trim()));
const headers = (page) => page.locator('#usage thead th').allTextContents();
// A reset two days ago at midnight: the plan week started before every reading of the journeys.
const twoDaysAgo = new Date(Date.now() - 48 * HOUR);
const RESET = { day: twoDaysAgo.getDay() || 7, hour: 0 };
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
    const types = await page.locator('#usage tbody tr:not([hidden]) th').allTextContents();
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
      assert.deepEqual(await cells(page, kind), [kind, '', '1', '4 $\n100 000 tokens', 'trop peu de mesures']);
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
  await withPanel({ usage: USAGE, factoryFiles: { 'settings.json': { machine: 'github', models: { code: 'sonnet' } } } }, async ({ page, url, writes }) => {
    await openUsage(page, url);
    const plan = page.getByRole('group', { name: 'Mon forfait' });
    assert.equal(await plan.getByRole('button', { name: 'Noter le relevé' }).isDisabled(), true, 'no reading before the reset is saved');
    const all = plan.getByRole('group', { name: 'Tous moteurs' });
    await all.getByRole('combobox', { name: 'Jour' }).selectOption({ label: 'mardi' });
    await all.getByRole('combobox', { name: 'Heure' }).selectOption({ label: '9 h' });
    await plan.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByRole('combobox', { name: 'Période' }).locator('option', { hasText: 'Semaine de forfait en cours' }).waitFor({ state: 'attached' });
    assert.deepEqual(await page.getByRole('combobox', { name: 'Période' }).locator('option').allTextContents(),
      ['Semaine de forfait en cours', 'Semaine de forfait précédente', '30 derniers jours']);
    const puts = settingsPuts(writes);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].body.branch, 'factory-runners');
    assert.deepEqual(decode(puts[0]), { machine: 'github', models: { code: 'sonnet' }, quota: { reset: { all: { day: 2, hour: 9 }, fable: null }, readings: [], calibration: null } });
    assert.equal(await plan.getByRole('button', { name: 'Noter le relevé' }).isDisabled(), false);
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
    await plan.getByRole('button', { name: 'Supprimer ce relevé' }).click();
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
    await page.getByText(/^Étalonnage du .+ · 1 % de la semaine tous moteurs ≈ 2,22 \$ · 1 % de la semaine Fable ≈ 1,20 \$ \(provisoire\)$/).waitFor();
    assert.deepEqual(await headers(page), ['Type de tâche', 'Moteur · effort', 'Tâches', 'Total', 'En moyenne', 'Semaine Fable', 'Semaine tous moteurs']);
    assert.deepEqual((await cells(page, 'Revue')).slice(5), ['≈ 10 %', '≈ 5,4 %']);
    assert.deepEqual((await cells(page, 'Écriture du code')).slice(5), ['0 %', '≈ 4,5 %']);
    assert.deepEqual((await cells(page, 'Total')).slice(5), ['≈ 10 %', '≈ 10 %']);
    const c = decode(settingsPuts(writes)[0]).quota.calibration;
    assert.deepEqual(c.points, { all: 10, fable: 10 });
    await page.getByText('Jauge tous moteurs à 20 % : factory ≈ 10 %, hors factory ≈ 10 %').waitFor();
  });
});

test('sur téléphone la page tient sur une colonne et le tableau défile sans faire déborder la page', async () => {
  await withPanel({ usage: USAGE, viewport: { width: 390, height: 844 } }, async ({ page, url }) => {
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
    await plan.getByText(/^Dernier relevé du .+ tous moteurs 14 %$/).waitFor();
    assert.deepEqual(decode(settingsPuts(writes).at(-1)).quota.readings.map((r) => r.all), [10, 14]);
  });
});

test('les chiffres du tableau sont en police à chasse fixe', async () => {
  await withPanel({ usage: USAGE }, async ({ page, url }) => {
    await openUsage(page, url);
    const font = await page.evaluate(() => getComputedStyle(document.querySelector('#usage td.fig')).fontFamily);
    assert.match(font, /Geist Mono/);
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

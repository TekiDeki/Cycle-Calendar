#!/usr/bin/env node
/* Cycle Calendar - logic and build tests.
 * Run: node tests/logic_test.cjs
 * Uses the same src/cycle.js the page ships, plus the built index.html for
 * locale and packaging checks.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const TD = require(path.join(ROOT, 'src', 'cycle.js'));

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push(name + ': ' + error.message);
  }
}

function eq(actual, expected, label) {
  assert.deepStrictEqual(actual, expected, (label || '') + ' expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
}

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const src = read('src/cycle.js');

/* ------------------------------------------------------------- date engine */

check('isValidIso accepts a normal date', () => eq(TD.isValidIso('2026-10-17'), true));
check('isValidIso rejects month 13', () => eq(TD.isValidIso('2026-13-01'), false));
check('isValidIso rejects day 0', () => eq(TD.isValidIso('2026-01-00'), false));
check('isValidIso rejects 31 April', () => eq(TD.isValidIso('2026-04-31'), false));
check('isValidIso accepts 29 February 2024', () => eq(TD.isValidIso('2024-02-29'), true));
check('isValidIso rejects 29 February 2025', () => eq(TD.isValidIso('2025-02-29'), false));
check('isValidIso rejects slashes', () => eq(TD.isValidIso('2026/10/17'), false));
check('isValidIso rejects a Date object', () => eq(TD.isValidIso(new Date()), false));
check('isLeapYear 2000', () => eq(TD.isLeapYear(2000), true));
check('isLeapYear 1900', () => eq(TD.isLeapYear(1900), false));
check('daysInMonth February 2024', () => eq(TD.daysInMonth(2024, 1), 29));
check('daysInMonth February 2025', () => eq(TD.daysInMonth(2025, 1), 28));
check('addDays crosses a year', () => eq(TD.addDays('2026-12-31', 1), '2027-01-01'));
check('addDays goes backwards', () => eq(TD.addDays('2026-01-01', -1), '2025-12-31'));
check('addDays handles leap day', () => eq(TD.addDays('2024-02-28', 1), '2024-02-29'));
check('addDays zero', () => eq(TD.addDays('2026-06-15', 0), '2026-06-15'));
check('diffDays forward', () => eq(TD.diffDays('2026-10-01', '2026-10-31'), 30));
check('diffDays backward is negative', () => eq(TD.diffDays('2026-10-31', '2026-10-01'), -30));
check('diffDays across DST month stays whole', () => eq(TD.diffDays('2026-03-01', '2026-04-01'), 31));
check('weekdayOf 2026-10-17 is Saturday', () => eq(TD.weekdayOf('2026-10-17'), 6));
check('round trip add then diff', () => eq(TD.diffDays('2025-01-31', TD.addDays('2025-01-31', 400)), 400));

/* ------------------------------------------------------------ month matrix */

const matrix = TD.monthMatrix(2026, 9, 1);
check('monthMatrix has 42 cells', () => eq(matrix.length, 42));
check('monthMatrix starts on Monday when weekStart is 1', () => eq(TD.weekdayOf(matrix[0].iso), 1));
check('monthMatrix starts on Sunday when weekStart is 0', () => eq(TD.weekdayOf(TD.monthMatrix(2026, 9, 0)[0].iso), 0));
check('monthMatrix contains 1 October 2026', () => assert.ok(matrix.some((cell) => cell.iso === '2026-10-01' && cell.inMonth)));
check('monthMatrix marks September cells as outside', () => {
  const first = matrix.find((cell) => cell.iso === '2026-09-28');
  assert.strictEqual(first.inMonth, false);
});
check('monthMatrix is chronological', () => {
  for (let i = 1; i < matrix.length; i += 1) {
    assert.strictEqual(TD.diffDays(matrix[i - 1].iso, matrix[i].iso), 1);
  }
});
check('monthMatrix February 2028 has 42 cells', () => eq(TD.monthMatrix(2028, 1, 1).length, 42));

/* ---------------------------------------------------------------- periods */

const days = {
  '2026-09-01': { flow: 'medium' },
  '2026-09-02': { flow: 'heavy' },
  '2026-09-03': { flow: 'light' },
  '2026-10-01': { flow: 'heavy' },
  '2026-10-02': { flow: 'medium' },
  '2026-10-03': { flow: 'medium' },
  '2026-10-04': { flow: 'light' },
  '2026-10-05': { flow: 'spotting' },
  '2026-11-02': { flow: 'medium' },
  '2026-11-03': { flow: 'light' }
};
const periods = TD.groupPeriods(days);
check('three periods grouped', () => eq(periods.length, 3));
check('first period start', () => eq(periods[0].start, '2026-09-01'));
check('first period end', () => eq(periods[0].end, '2026-09-03'));
check('first period length', () => eq(periods[0].length, 3));
check('second period length', () => eq(periods[1].length, 5));
check('periods are ordered', () => assert.ok(periods[0].start < periods[1].start));
check('flow none is not a period', () => eq(TD.groupPeriods({ '2026-05-01': { flow: 'none' } }).length, 0));
check('a gap splits the period', () => eq(TD.groupPeriods({
  '2026-05-01': { flow: 'light' }, '2026-05-03': { flow: 'light' }
}).length, 2));
check('invalid dates are ignored', () => eq(TD.groupPeriods({ '2026-02-30': { flow: 'heavy' } }).length, 0));
check('missing day objects are ignored', () => eq(TD.groupPeriods({ '2026-05-01': null }).length, 0));

/* ------------------------------------------------------------------ stats */

const st = TD.stats(periods, {});
check('cycles counted', () => eq(st.cyclesCount, 2));
check('periods counted', () => eq(st.periodsCount, 3));
check('average cycle 31', () => eq(st.avgCycle, 31));
check('min cycle 30', () => eq(st.minCycle, 30));
check('max cycle 32', () => eq(st.maxCycle, 32));
check('average period 3.3', () => eq(st.avgPeriod, 3.3));
check('last start', () => eq(st.lastStart, '2026-11-02'));
check('last end', () => eq(st.lastEnd, '2026-11-03'));
check('two close cycles read as regular', () => eq(TD.stats(TD.groupPeriods({
  '2026-01-01': { flow: 'light' }, '2026-01-29': { flow: 'light' }, '2026-02-26': { flow: 'light' }
}), {}).variability, 'regular'));
check('a wild cycle reads as irregular', () => eq(TD.stats(TD.groupPeriods({
  '2026-01-01': { flow: 'light' }, '2026-01-25': { flow: 'light' }, '2026-03-20': { flow: 'light' }
}), {}).variability, 'irregular'));
check('no periods gives zero cycles', () => eq(TD.stats([], {}).cyclesCount, 0));
check('no periods gives zero average', () => eq(TD.stats([], {}).avgCycle, 0));

/* --------------------------------------------------------------- settings */

check('normalizeSettings fills defaults', () => eq(TD.normalizeSettings({}).cycleLength, 28));
check('cycleLength is clamped low', () => eq(TD.normalizeSettings({ cycleLength: 3 }).cycleLength, 21));
check('cycleLength is clamped high', () => eq(TD.normalizeSettings({ cycleLength: 900 }).cycleLength, 45));
check('periodLength is clamped', () => eq(TD.normalizeSettings({ periodLength: 40 }).periodLength, 12));
check('lutealPhase is clamped', () => eq(TD.normalizeSettings({ lutealPhase: 1 }).lutealPhase, 9));
check('weekStart 0 is kept', () => eq(TD.normalizeSettings({ weekStart: 0 }).weekStart, 0));
check('weekStart garbage becomes 1', () => eq(TD.normalizeSettings({ weekStart: 'x' }).weekStart, 1));
check('historyLimit is clamped', () => eq(TD.normalizeSettings({ historyLimit: 99 }).historyLimit, 12));

/* ----------------------------------------------------------- predictions */

const predicted = TD.predictPeriods(periods, {}, new Date('2026-10-17T12:00:00Z'), 3);
check('three predictions', () => eq(predicted.length, 3));
check('first prediction follows the average', () => eq(predicted[0].start, TD.addDays('2026-11-02', 31)));
check('second prediction is one cycle later', () => eq(predicted[1].start, TD.addDays(predicted[0].start, 31)));
check('prediction length follows the average period', () => eq(predicted[0].length, 3));
check('prediction end matches length', () => eq(predicted[0].end, TD.addDays(predicted[0].start, 2)));
check('no periods means no predictions', () => eq(TD.predictPeriods([], {}, new Date(), 3), []));
check('prediction count is honoured', () => eq(TD.predictPeriods(periods, {}, new Date('2026-10-17'), 5).length, 5));
check('predictions never start in the past', () => {
  TD.predictPeriods(periods, {}, new Date('2026-10-17T00:00:00Z'), 3).forEach((item) => {
    assert.ok(item.end >= '2026-10-17', item.end);
  });
});
check('effective cycle falls back to the default', () => eq(TD.effectiveCycleLength([], {}), 28));
check('effective cycle follows the history', () => eq(TD.effectiveCycleLength(periods, {}), 31));
check('effective period falls back to the default', () => eq(TD.effectivePeriodLength([], {}), 5));
check('a single period still predicts (default length)', () => {
  const one = TD.groupPeriods({ '2026-10-01': { flow: 'medium' } });
  const list = TD.predictPeriods(one, {}, new Date('2026-10-10T00:00:00Z'), 1);
  eq(list.length, 1);
  eq(list[0].start, TD.addDays('2026-10-01', 28));
});
check('a stale last period is skipped, not repeated', () => {
  const stale = TD.groupPeriods({ '2025-01-05': { flow: 'medium' }, '2025-02-02': { flow: 'medium' } });
  const list = TD.predictPeriods(stale, {}, new Date('2026-10-17T00:00:00Z'), 3);
  assert.ok(list.length >= 1);
  assert.ok(list[0].start >= '2026-10-17');
});

/* -------------------------------------------------------------- ovulation */

const window = TD.fertileWindow('2026-12-03', {});
check('ovulation is 14 days before the next period', () => eq(window.ovulation, '2026-11-19'));
check('fertile window starts five days before ovulation', () => eq(window.start, '2026-11-14'));
check('fertile window ends one day after ovulation', () => eq(window.end, '2026-11-20'));
check('custom luteal phase moves ovulation', () => eq(TD.fertileWindow('2026-12-03', { lutealPhase: 12 }).ovulation, '2026-11-21'));

/* ------------------------------------------------------------ day status */

const statusModel = {
  periods: TD.groupPeriods({ '2026-12-03': { flow: 'medium' }, '2026-12-04': { flow: 'light' } }),
  predictions: [{ start: '2026-12-31', end: '2027-01-02', length: 3 }]
};
check('logged day wins', () => eq(TD.dayStatus('2026-12-03', statusModel.periods, statusModel.predictions, {}).type, 'period'));
check('cycle day inside a period', () => eq(TD.dayStatus('2026-12-04', statusModel.periods, statusModel.predictions, {}).cycleDay, 2));
check('predicted day', () => eq(TD.dayStatus('2026-12-31', statusModel.periods, statusModel.predictions, {}).type, 'predicted'));
check('ovulation day', () => eq(TD.dayStatus('2026-12-17', statusModel.periods, statusModel.predictions, {}).type, 'ovulation'));
check('fertile day', () => eq(TD.dayStatus('2026-12-13', statusModel.periods, statusModel.predictions, {}).type, 'fertile'));
check('pms day', () => eq(TD.dayStatus('2026-12-28', statusModel.periods, statusModel.predictions, {}).type, 'pms'));
check('plain day has no type', () => eq(TD.dayStatus('2026-11-20', statusModel.periods, statusModel.predictions, {}).type, null));
check('plain day still knows its cycle day', () => eq(TD.dayStatus('2026-11-20', statusModel.periods, statusModel.predictions, {}).cycleDay, null));
check('a logged period overrides a prediction on the same day', () => {
  const logged = TD.groupPeriods({ '2026-12-31': { flow: 'heavy' } });
  eq(TD.dayStatus('2026-12-31', logged, statusModel.predictions, {}).type, 'period');
});
check('a day before any period has no cycle day', () => eq(TD.dayStatus('2020-01-01', statusModel.periods, statusModel.predictions, {}).cycleDay, null));

/* ---------------------------------------------------------------- summary */

const summary = TD.summary(days, {}, new Date('2026-10-17T09:00:00Z'), { predictions: 3 });
check('summary today', () => eq(summary.today, '2026-10-17'));
check('summary cycle day', () => {
  const past = { '2026-09-01': { flow: 'light' }, '2026-10-01': { flow: 'light' } };
  eq(TD.summary(past, {}, new Date('2026-10-17T09:00:00Z')).cycleDay, 17);
});
check('a future logged period leaves the cycle day unknown', () => eq(summary.cycleDay, null));
check('summary next period', () => eq(summary.nextPeriod.start, '2026-12-03'));
check('summary days to next period', () => eq(summary.daysToNextPeriod, 47));
check('summary fertile start', () => eq(summary.fertile.start, '2026-11-14'));
check('summary effective cycle', () => eq(summary.effectiveCycle, 31));
check('summary works with no data', () => {
  const empty = TD.summary({}, {}, new Date('2026-10-17T09:00:00Z'));
  eq(empty.cycleDay, null);
  eq(empty.nextPeriod, null);
  eq(empty.periods.length, 0);
});
check('summary respects weekStart 0', () => eq(TD.summary({}, { weekStart: 0 }, new Date()).settings.weekStart, 0));

/* ------------------------------------------------------------- validation */

check('normalizeDay fills a shape', () => {
  const day = TD.normalizeDay({ flow: 'heavy' });
  eq(day.flow, 'heavy');
  eq(day.symptoms, []);
  eq(day.bbt, null);
});
check('normalizeDay rejects a bad flow', () => eq(TD.normalizeDay({ flow: 'flood' }).flow, 'none'));
check('normalizeDay keeps a numeric bbt', () => eq(TD.normalizeDay({ bbt: 36.55 }).bbt, 36.55));
check('normalizeDay drops an infinite bbt', () => eq(TD.normalizeDay({ bbt: Infinity }).bbt, null));
check('normalizeDay trims a long note', () => eq(TD.normalizeDay({ notes: 'x'.repeat(900) }).notes.length, 500));
check('normalizeDay rejects null', () => eq(TD.normalizeDay(null), null));
check('sanitizeDays drops empty entries', () => eq(Object.keys(TD.sanitizeDays({ '2026-01-01': { flow: 'none' } })).length, 0));
check('sanitizeDays keeps a real entry', () => eq(Object.keys(TD.sanitizeDays({ '2026-01-01': { flow: 'light' } })).length, 1));
check('sanitizeDays drops invalid keys', () => eq(Object.keys(TD.sanitizeDays({ 'hello': { flow: 'light' } })).length, 0));
check('sanitizeDays survives junk', () => eq(Object.keys(TD.sanitizeDays({ '2026-01-01': 'x' })).length, 0));

const backup = TD.parseBackup(JSON.stringify({ app: 'Cycle Calendar', days, settings: { cycleLength: 30 } }));
check('parseBackup accepts our file', () => eq(backup.ok, true));
check('parseBackup counts days', () => eq(backup.count, 10));
check('parseBackup reads settings', () => eq(backup.settings.cycleLength, 30));
check('parseBackup accepts a file without app', () => eq(TD.parseBackup(JSON.stringify({ days: {} })).ok, true));
check('parseBackup rejects broken JSON', () => eq(TD.parseBackup('{oops').ok, false));
check('parseBackup rejects another app', () => eq(TD.parseBackup(JSON.stringify({ app: 'Other App', days: {} })).ok, false));
check('parseBackup rejects a missing days object', () => eq(TD.parseBackup(JSON.stringify({ app: 'Cycle Calendar' })).ok, false));
check('parseBackup rejects an array', () => eq(TD.parseBackup('[1,2,3]').ok, false));

/* ------------------------------------------------------------------ house */

check('cycle.js has no browser globals at load', () => assert.ok(!/document\.|localStorage|fetch\(/.test(src)));
check('cycle.js is strict', () => assert.ok(src.includes("'use strict'")));
check('VERSION is a number', () => assert.ok(/^\d+$/.test(read('VERSION').trim())));
check('index.html is one file', () => {
  assert.ok(!/<link[^>]+stylesheet/.test(html));
  assert.ok(!/<script[^>]+src=/.test(html));
  assert.ok(!/url\(['"]?http/.test(html));
});
check('index.html has no analytics or remote calls', () => {
  assert.ok(!/google-analytics|googletagmanager|plausible|umami/i.test(html));
  assert.ok(!/<script[^>]+src=["']https?:/i.test(html));
  assert.ok(!/<link[^>]+href=["']https?:[^"']+\.css/i.test(html));
  assert.ok(!/fetch\(['"]http/.test(html));
});
check('index.html declares English as the default', () => assert.ok(html.includes('<html lang="en"')));
check('index.html has the manifest and icons', () => {
  assert.ok(html.includes('rel="manifest" href="manifest.json"'));
  assert.ok(html.includes('apple-touch-icon'));
  assert.ok(html.includes('favicon.ico'));
});
check('index.html has no em dash or en dash', () => {
  assert.ok(!html.includes('\u2014'));
  assert.ok(!html.includes('\u2013'));
});
check('index.html has no byte order mark', () => {
  const bytes = fs.readFileSync(path.join(ROOT, 'index.html'));
  assert.notDeepStrictEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
});
check('sw.js declares a cache version', () => assert.ok(/var VERSION = '\d+';/.test(read('sw.js'))));
check('manifest is valid JSON', () => {
  const manifest = JSON.parse(read('manifest.json'));
  eq(manifest.start_url, './');
  assert.ok(manifest.icons.length >= 4);
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
});
check('funding file is the paypal line only', () => {
  const funding = read('.github/FUNDING.yml').trim().split('\n').map((line) => line.trim());
  eq(funding, ["custom: ['https://paypal.me/TekiDeki']"]);
});
check('license is Apache 2.0', () => assert.ok(read('LICENSE').includes('Apache License')));
check('NOTICE names this app', () => assert.ok(read('NOTICE').includes('Cycle Calendar')));
check('tests are excluded from the page', () => assert.ok(!html.includes('logic_test')));

/* --------------------------------------------------------- embedded i18n */

function embeddedLocales() {
  const marker = 'window.TD_LOCALES = ';
  const start = html.indexOf(marker);
  assert.ok(start > 0, 'locales payload not found');
  const from = html.indexOf('{', start);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(from, i + 1));
    }
  }
  throw new Error('unterminated locales payload');
}

const locales = embeddedLocales();
const LANGS = ['en', 'ro', 'sr-latn', 'sr-cyrl'];

check('four locales are embedded', () => eq(Object.keys(locales).sort(), LANGS.slice().sort()));
check('locale key sets are identical', () => {
  const reference = Object.keys(locales.en).sort();
  LANGS.forEach((lang) => eq(Object.keys(locales[lang]).sort(), reference, lang));
});
check('every locale value is a non empty string', () => {
  LANGS.forEach((lang) => {
    Object.keys(locales[lang]).forEach((key) => {
      assert.strictEqual(typeof locales[lang][key], 'string', lang + '.' + key);
      assert.ok(locales[lang][key].trim().length > 0, lang + '.' + key + ' is empty');
    });
  });
});
check('placeholders match across locales', () => {
  const holders = (value) => (value.match(/\{[a-zA-Z]+\}/g) || []).sort().join(',');
  Object.keys(locales.en).forEach((key) => {
    LANGS.forEach((lang) => eq(holders(locales[lang][key]), holders(locales.en[key]), lang + '.' + key));
  });
});
check('Serbian Cyrillic is really Cyrillic', () => {
  const text = Object.values(locales['sr-cyrl']).join(' ');
  const letters = text.match(/[A-Za-z\u0400-\u04FF]/g) || [];
  const cyrillic = text.match(/[\u0400-\u04FF]/g) || [];
  assert.ok(cyrillic.length / letters.length > 0.75, 'ratio ' + (cyrillic.length / letters.length));
});
check('Serbian Cyrillic knows the letters that break naive transliteration', () => {
  const text = Object.values(locales['sr-cyrl']).join(' ');
  ['љ', 'њ', 'ђ', 'ћ', 'ч', 'ш', 'ж'].forEach((letter) => {
    assert.ok(text.includes(letter), 'missing ' + letter);
  });
});
check('Serbian Latin uses proper diacritics', () => {
  const text = Object.values(locales['sr-latn']).join(' ');
  ['č', 'ć', 'ž', 'š', 'đ'].forEach((letter) => assert.ok(text.includes(letter), 'missing ' + letter));
});
check('Romanian uses its own letters', () => {
  const text = Object.values(locales.ro).join(' ');
  ['ă', 'â', 'î', 'ș', 'ț'].forEach((letter) => assert.ok(text.includes(letter), 'missing ' + letter));
});
check('English strings are free of Romanian words', () => {
  const text = Object.values(locales.en).join(' ');
  ['și', 'pentru', 'din', 'este'].forEach((word) => {
    assert.ok(!new RegExp('\\b' + word + '\\b').test(text), 'found ' + word);
  });
});
check('no locale string uses an em or en dash', () => {
  LANGS.forEach((lang) => Object.values(locales[lang]).forEach((value) => {
    assert.ok(!value.includes('\u2014'), lang);
    assert.ok(!value.includes('\u2013'), lang);
  }));
});
check('every locale covers the core vocabulary', () => {
  const keys = ['flowHeavy', 'legendPeriod', 'predictionTitle', 'settingsHeading', 'printSummary'];
  LANGS.forEach((lang) => keys.forEach((key) => assert.ok(locales[lang][key], lang + '.' + key)));
});
check('the selector offers exactly four languages', () => {
  const options = html.match(/<option value="(en|ro|sr-latn|sr-cyrl)"/g) || [];
  eq(options.length, 4);
});

/* --------------------------------------------------------------- report */

const total = passed + failures.length;
console.log('logic_test.cjs · ' + passed + '/' + total + ' checks passed');
if (failures.length) {
  failures.forEach((item) => console.log('  FAIL ' + item));
  process.exit(1);
}

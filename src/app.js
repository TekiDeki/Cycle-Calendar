/* Cycle Calendar · TekiDeki - interface
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Kristian Mario Miskovic (TekiDeki)
 *
 * No framework, no network, no cookies. Everything lives in localStorage and
 * the page is drawn from the pure functions in cycle.js.
 */
(function () {
  'use strict';

  var TD = window.TD;
  var LOCALES = window.TD_LOCALES || {};
  var LANGS = ['en', 'ro', 'sr-latn', 'sr-cyrl'];
  var HTML_LANG = { en: 'en', ro: 'ro', 'sr-latn': 'sr-Latn', 'sr-cyrl': 'sr-Cyrl' };
  var INTL = { en: 'en-GB', ro: 'ro-RO', 'sr-latn': 'sr-Latn-RS', 'sr-cyrl': 'sr-Cyrl-RS' };
  var STORAGE_KEY = 'cycle-calendar.v1';
  var APP_NAME = 'Cycle Calendar';
  var FLOWS = ['none', 'spotting', 'light', 'medium', 'heavy'];
  var FLOW_KEYS = { none: 'flowNone', spotting: 'flowSpotting', light: 'flowLight', medium: 'flowMedium', heavy: 'flowHeavy' };
  var MOODS = ['calm', 'happy', 'energetic', 'anxious', 'irritable', 'low'];
  var MOOD_KEYS = { calm: 'moodCalm', happy: 'moodHappy', energetic: 'moodEnergetic', anxious: 'moodAnxious', irritable: 'moodIrritable', low: 'moodLow' };
  var SYMPTOMS = ['cramps', 'headache', 'backache', 'bloating', 'breast', 'acne', 'fatigue', 'nausea', 'cravings', 'insomnia'];
  var SYMPTOM_KEYS = {
    cramps: 'symCramps', headache: 'symHeadache', backache: 'symBackache', bloating: 'symBloating',
    breast: 'symBreast', acne: 'symAcne', fatigue: 'symFatigue', nausea: 'symNausea',
    cravings: 'symCravings', insomnia: 'symInsomnia'
  };
  var STATUS_KEYS = { period: 'legendPeriod', predicted: 'legendPredicted', fertile: 'legendFertile', ovulation: 'legendOvulation', pms: 'legendPms' };

  var state = {
    days: {},
    settings: TD.normalizeSettings({}),
    language: 'en',
    theme: 'light',
    view: 'calendar',
    selected: TD.todayIso(new Date()),
    cursor: null,
    undo: [],
    storageOk: true,
    summary: null,
    savedTimer: null,
    toastTimer: null
  };

  var el = {};
  var ids = [
    'tabs', 'brandLink', 'undoBtn', 'themeBtn', 'langSelect', 'summary',
    'statCycleDay', 'statCycleDaySub', 'statNext', 'statNextSub', 'statAvg', 'statAvgSub',
    'statFertile', 'statFertileSub', 'calTitle', 'todayBtn', 'prevBtn', 'nextBtn',
    'weekdays', 'calendarGrid', 'legend', 'editor', 'editorDate', 'editorSub', 'closeEditor',
    'flowGroup', 'moodGroup', 'symptomGroup', 'tempInput', 'clearTemp', 'noteInput', 'savedDot',
    'clearDay', 'onboard', 'onboardSample', 'mCycles', 'mAvg', 'mAvgSub', 'mPeriod', 'mPeriodSub', 'mShortest', 'mLongest',
    'mVariation', 'chartWrap', 'predictionList', 'historyWrap', 'symptomChartWrap', 'printBtn',
    'defCycle', 'defPeriod', 'lutealInput', 'weekStart', 'daysCount', 'exportBtn', 'importBtn',
    'importFile', 'resetBtn', 'sampleBtn', 'printReport', 'confirmDialog', 'confirmTitle',
    'confirmText', 'confirmCancel', 'confirmOk', 'toast', 'versionText', 'yearText'
  ];

  /* -------------------------------------------------------------- utilities */

  function $(id) { return document.getElementById(id); }

  function t(key, vars) {
    var pack = LOCALES[state.language] || LOCALES.en || {};
    var text = pack[key];
    if (text === undefined) text = (LOCALES.en || {})[key];
    if (text === undefined) return key;
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        text = text.split('{' + name + '}').join(String(vars[name]));
      });
    }
    return text;
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function pad2(value) { return value < 10 ? '0' + value : String(value); }

  function intl(locale) {
    try { return new Intl.DateTimeFormat(INTL[locale] || 'en-GB', { timeZone: 'UTC' }); }
    catch (error) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC' }); }
  }

  function fmtDate(iso, options) {
    var date = TD.isoToDate(iso);
    var opts = { timeZone: 'UTC' };
    Object.keys(options || {}).forEach(function (key) { opts[key] = options[key]; });
    try {
      return new Intl.DateTimeFormat(INTL[state.language] || 'en-GB', opts).format(date);
    } catch (error) {
      return iso;
    }
  }

  function fmtMonth(year, monthIndex) {
    var date = new Date(Date.UTC(year, monthIndex, 1));
    try {
      return new Intl.DateTimeFormat(INTL[state.language] || 'en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(date);
    } catch (error) {
      return year + '-' + pad2(monthIndex + 1);
    }
  }

  function fmtRange(from, to) {
    return t('dateRange', { from: fmtDate(from, { day: 'numeric', month: 'short' }), to: fmtDate(to, { day: 'numeric', month: 'short' }) });
  }

  function durationDays(n) {
    if (n === 1) return t('oneDay');
    return n + ' ' + t('daysUnit');
  }

  function showToast(message, kind) {
    var node = el.toast;
    node.textContent = message;
    node.className = 'toast' + (kind ? ' ' + kind : '');
    node.hidden = false;
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () { node.hidden = true; }, 2600);
  }

  function flashSaved() {
    if (!el.savedDot) return;
    el.savedDot.classList.add('is-on');
    window.clearTimeout(state.savedTimer);
    state.savedTimer = window.setTimeout(function () { el.savedDot.classList.remove('is-on'); }, 1500);
  }

  /* ---------------------------------------------------------------- storage */

  function load() {
    var raw = null;
    try { raw = window.localStorage.getItem(STORAGE_KEY); }
    catch (error) { state.storageOk = false; return; }
    if (!raw) return;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      state.days = TD.sanitizeDays(parsed.days || {});
      state.settings = TD.normalizeSettings(parsed.settings || {});
      if (LANGS.indexOf(parsed.language) >= 0) state.language = parsed.language;
      if (parsed.theme === 'dark' || parsed.theme === 'light') state.theme = parsed.theme;
    } catch (error) {
      state.storageOk = false;
    }
  }

  function save() {
    var payload = {
      app: APP_NAME,
      version: 1,
      savedAt: new Date().toISOString(),
      days: state.days,
      settings: state.settings,
      language: state.language,
      theme: state.theme
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      state.storageOk = true;
    } catch (error) {
      if (state.storageOk) showToast(t('toastStorage'), 'error');
      state.storageOk = false;
    }
  }

  /* ------------------------------------------------------------------- i18n */

  function applyStatic() {
    var nodes = document.querySelectorAll('[data-i18n]');
    Array.prototype.forEach.call(nodes, function (node) {
      var key = node.getAttribute('data-i18n');
      node.textContent = t(key);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-title]'), function (node) {
      node.setAttribute('title', t(node.getAttribute('data-i18n-title')));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-placeholder]'), function (node) {
      node.setAttribute('placeholder', t(node.getAttribute('data-i18n-placeholder')));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-aria-label]'), function (node) {
      node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria-label')));
    });
    document.documentElement.lang = HTML_LANG[state.language] || 'en';
    document.title = t('appName') + ' · ' + t('tagline');
  }

  function setLanguage(lang) {
    if (LANGS.indexOf(lang) < 0) lang = 'en';
    state.language = lang;
    el.langSelect.value = lang;
    el.toast.hidden = true;
    window.clearTimeout(state.toastTimer);
    applyStatic();
    save();
    renderAll();
  }

  /* ---------------------------------------------------------------- compute */

  function compute() {
    var today = TD.todayIso(new Date());
    state.summary = TD.summary(state.days, state.settings, new Date(), { predictions: 6 });
    if (!state.cursor) {
      state.cursor = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
    }
  }

  function statusFor(iso) {
    return TD.dayStatus(iso, state.summary.periods, state.summary.predictions, state.settings);
  }

  function hasEntry(day) {
    if (!day) return false;
    return (day.flow && day.flow !== 'none') || (day.symptoms && day.symptoms.length) ||
      (day.moods && day.moods.length) || (day.note || day.notes) || (day.bbt !== null && day.bbt !== undefined);
  }

  function phaseKey(status) {
    if (!status || !status.type) return null;
    if (status.type === 'period' || status.type === 'predicted') return 'phaseMenstrual';
    if (status.type === 'ovulation') return 'phaseOvulation';
    if (status.type === 'fertile') return 'phaseFollicular';
    if (status.type === 'pms') return 'phaseLuteal';
    return null;
  }

  /* ----------------------------------------------------------------- render */

  function renderAll() {
    compute();
    renderCalendar();
    renderStats();
    renderEditor();
    renderInsights();
    renderSettings();
    renderPrint();
    el.undoBtn.disabled = state.undo.length === 0;
    el.onboard.hidden = state.summary.periods.length > 0;
  }

  function renderCalendar() {
    var today = TD.todayIso(new Date());
    var weekStart = state.settings.weekStart;
    el.calTitle.textContent = fmtMonth(state.cursor.year, state.cursor.month);

    var header = '';
    for (var w = 0; w < 7; w++) {
      var offset = (w + weekStart - 1 + 7) % 7;
      var ref = new Date(Date.UTC(2024, 0, 1 + offset));
      var label;
      try {
        label = new Intl.DateTimeFormat(INTL[state.language] || 'en-GB', { timeZone: 'UTC', weekday: 'short' }).format(ref);
      } catch (error) { label = ''; }
      header += '<span>' + label + '</span>';
    }
    el.weekdays.innerHTML = header;

    var cells = TD.monthMatrix(state.cursor.year, state.cursor.month, weekStart);
    var html = '';
    cells.forEach(function (cell) {
      var status = statusFor(cell.iso);
      var entry = state.days[cell.iso];
      var classes = ['day'];
      if (!cell.inMonth) classes.push('is-outside');
      if (cell.iso === today) classes.push('is-today');
      if (cell.iso === state.selected) classes.push('is-selected');
      if (status.type) classes.push('is-' + status.type);
      var statusText = status.type ? t(STATUS_KEYS[status.type]) : t('statusEmpty');
      if (cell.iso === today) statusText += ', ' + t('statusToday');
      var dateText = fmtDate(cell.iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      html += '<button type="button" class="' + classes.join(' ') + '" data-iso="' + cell.iso + '"' +
        ' aria-label="' + escapeAttr(t('dayAria', { date: dateText, status: statusText })) + '"' +
        ' aria-pressed="' + (cell.iso === state.selected ? 'true' : 'false') + '"' +
        ' tabindex="' + (cell.iso === state.selected ? '0' : '-1') + '">' +
        '<span class="num">' + cell.day + '</span>' +
        (hasEntry(entry) ? '<span class="marker' + ((entry && (entry.note || entry.notes)) ? ' is-notes' : '') + '"></span>' : '') +
        '</button>';
    });
    el.calendarGrid.innerHTML = html;
  }

  function escapeAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderStats() {
    var s = state.summary;
    var today = s.today;

    if (s.cycleDay) {
      el.statCycleDay.textContent = String(s.cycleDay);
      var phase = phaseKey(statusFor(today));
      el.statCycleDaySub.textContent = t('cycleDayOf', { n: s.cycleDay }) + (phase ? ' · ' + t(phase) : '');
    } else {
      el.statCycleDay.textContent = '-';
      el.statCycleDaySub.textContent = t('noPredictionYet');
    }

    if (s.nextPeriod) {
      var delta = s.daysToNextPeriod;
      el.statNext.textContent = fmtDate(s.nextPeriod.start, { day: 'numeric', month: 'short' });
      if (delta > 1) el.statNextSub.textContent = t('inDays', { n: delta });
      else if (delta === 1 || delta === 0) el.statNextSub.textContent = t('todayWord');
      else el.statNextSub.textContent = t('overdueBy', { n: Math.abs(delta) });
      el.statNextSub.textContent += ' · ' + t('estimatedLabel');
    } else {
      el.statNext.textContent = '-';
      el.statNextSub.textContent = t('noPredictionYet');
    }

    if (s.stats.cyclesCount > 0) {
      el.statAvg.innerHTML = s.effectiveCycle + ' <small>' + t('daysUnit') + '</small>';
      el.statAvgSub.textContent = t('avgSample', { n: Math.min(s.stats.cyclesCount, s.settings.historyLimit) });
    } else {
      el.statAvg.innerHTML = s.settings.cycleLength + ' <small>' + t('daysUnit') + '</small>';
      el.statAvgSub.textContent = t('settingsHint');
    }

    if (s.fertile) {
      el.statFertile.textContent = fmtRange(s.fertile.start, s.fertile.end);
      el.statFertileSub.textContent = t('ovulationLabel') + ': ' + fmtDate(s.fertile.ovulation, { day: 'numeric', month: 'short' });
    } else {
      el.statFertile.textContent = '-';
      el.statFertileSub.textContent = t('noPredictionYet');
    }
  }

  function renderEditor() {
    var iso = state.selected;
    var entry = state.days[iso] || { flow: 'none', symptoms: [], moods: [], notes: '', bbt: null };
    var status = statusFor(iso);

    el.editorDate.textContent = fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
    var bits = [];
    if (status.type) bits.push(t(STATUS_KEYS[status.type]));
    var phase = phaseKey(status);
    if (phase) bits.push(t(phase));
    el.editorSub.textContent = bits.length ? bits.join(' · ') : t('editorHint');

    Array.prototype.forEach.call(el.flowGroup.querySelectorAll('.chip'), function (chip) {
      chip.setAttribute('aria-pressed', chip.getAttribute('data-flow') === (entry.flow || 'none') ? 'true' : 'false');
    });
    Array.prototype.forEach.call(el.moodGroup.querySelectorAll('.chip'), function (chip) {
      var value = chip.getAttribute('data-mood');
      chip.setAttribute('aria-pressed', (value === '' && !entry.moods.length) || entry.moods.indexOf(value) >= 0 ? 'true' : 'false');
    });
    Array.prototype.forEach.call(el.symptomGroup.querySelectorAll('.chip'), function (chip) {
      chip.setAttribute('aria-pressed', entry.symptoms.indexOf(chip.getAttribute('data-symptom')) >= 0 ? 'true' : 'false');
    });

    el.tempInput.value = entry.bbt === null || entry.bbt === undefined ? '' : String(entry.bbt);
    el.noteInput.value = entry.notes || '';
  }

  function renderInsights() {
    var s = state.summary;
    var st = s.stats;

    el.mCycles.textContent = String(st.cyclesCount);
    if (st.cyclesCount > 0) {
      el.mAvg.innerHTML = st.avgCycle + ' <small>' + t('daysUnit') + '</small>';
      el.mAvgSub.textContent = t('avgSample', { n: Math.min(st.cyclesCount, s.settings.historyLimit) });
    } else {
      el.mAvg.textContent = '-';
      el.mAvgSub.textContent = t('statsEmpty');
    }
    if (st.avgPeriod > 0) {
      el.mPeriod.innerHTML = st.avgPeriod + ' <small>' + t('daysUnit') + '</small>';
      el.mPeriodSub.textContent = t('avgPeriodSub', { n: Math.min(st.periodsCount, s.settings.historyLimit) });
    } else {
      el.mPeriod.textContent = '-';
      el.mPeriodSub.textContent = t('statsEmpty');
    }
    el.mShortest.textContent = st.cyclesCount ? st.minCycle + ' ' + t('daysUnit') : '-';
    el.mLongest.textContent = st.cyclesCount ? st.maxCycle + ' ' + t('daysUnit') : '-';
    el.mVariation.textContent = st.cyclesCount > 1 ? (st.maxCycle - st.minCycle) + ' ' + t('daysUnit') : '-';

    renderChart(st);
    renderPredictions(s);
    renderHistory(s);
    renderSymptoms();
  }

  function renderChart(st) {
    if (st.cyclesCount < 1) {
      el.chartWrap.innerHTML = '<div class="empty"><b>' + escapeAttr(t('statsEmpty')) + '</b></div>';
      return;
    }
    var lengths = TD.cycleLengths(state.summary.periods);
    var values = lengths.map(function (item) { return item.length; });
    var width = 560;
    var height = 210;
    var padLeft = 34;
    var padBottom = 24;
    var padTop = 18;
    var plotW = width - padLeft - 12;
    var plotH = height - padBottom - padTop;
    var max = Math.max.apply(null, values.concat([30])) + 4;
    var min = Math.max(0, Math.min.apply(null, values) - 6);
    var span = Math.max(1, max - min);
    var slot = Math.min(104, plotW / Math.max(values.length, 1));
    var barW = Math.min(46, slot - 14);
    var originX = padLeft + Math.max(0, (plotW - slot * values.length) / 2);

    var avgY = height - padBottom - ((st.avgCycle - min) / span * plotH);
    var out = '<svg class="chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeAttr(t('chartTitle')) + '">';
    out += '<line class="axis" x1="' + padLeft + '" y1="' + (height - padBottom) + '" x2="' + (width - 8) + '" y2="' + (height - padBottom) + '"/>';
    out += '<text class="bar-label" x="4" y="' + (padTop + 4) + '">' + max + '</text>';
    out += '<text class="bar-label" x="4" y="' + (height - padBottom) + '">' + min + '</text>';
    out += '<line class="avg-line" x1="' + padLeft + '" y1="' + avgY.toFixed(1) + '" x2="' + (width - 8) + '" y2="' + avgY.toFixed(1) + '"/>';
    out += '<text class="avg-text" x="' + (width - 10) + '" y="' + (avgY - 8).toFixed(1) + '" text-anchor="end">' + t('chartAverage') + ' ' + st.avgCycle + '</text>';

    values.forEach(function (value, index) {
      var x = originX + slot * index + (slot - barW) / 2;
      var h = Math.max(3, (value - min) / span * plotH);
      var y = height - padBottom - h;
      out += '<rect class="bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4"><title>' +
        escapeAttr(t('cycleN', { n: index + 1 }) + ': ' + durationDays(value)) + '</title></rect>';
      var cx = x + barW / 2;
      out += '<rect class="bar-label-bg" x="' + (cx - 13).toFixed(1) + '" y="' + (y - 15).toFixed(1) + '" width="26" height="14" rx="3"/>';
      out += '<text class="bar-label" x="' + cx.toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle">' + value + '</text>';
      if (values.length <= 12) {
        out += '<text class="bar-label" x="' + cx.toFixed(1) + '" y="' + (height - 8) + '" text-anchor="middle">' + (index + 1) + '</text>';
      }
    });
    out += '</svg>';
    el.chartWrap.innerHTML = out;
  }

  function renderPredictions(s) {
    if (!s.predictions.length) {
      el.predictionList.innerHTML = '<div class="empty"><b>' + escapeAttr(t('noPredictions')) + '</b></div>';
      return;
    }
    var html = '';
    s.predictions.slice(0, 3).forEach(function (prediction) {
      var window = TD.fertileWindow(prediction.start, s.settings);
      html += '<div class="prediction">' +
        '<b>' + fmtDate(prediction.start, { day: 'numeric', month: 'long', year: 'numeric' }) + '</b>' +
        '<div class="dates">' + fmtRange(prediction.start, prediction.end) + ' · ' + durationDays(prediction.length) + '</div>' +
        '<div class="fertile">' + t('predictionFertile') + ': ' + fmtRange(window.start, window.end) + '</div>' +
        '<div class="ovulation">' + t('predictionOvulation') + ': ' + fmtDate(window.ovulation, { day: 'numeric', month: 'long' }) + '</div>' +
        '</div>';
    });
    el.predictionList.innerHTML = html;
  }

  function renderHistory(s) {
    var periods = s.periods.slice().reverse();
    if (!periods.length) {
      el.historyWrap.innerHTML = '<div class="empty"><b>' + escapeAttr(t('historyEmpty')) + '</b></div>';
      return;
    }
    var html = '<table class="data"><thead><tr>' +
      '<th>' + t('historyStart') + '</th><th>' + t('historyEnd') + '</th><th>' + t('historyLength') + '</th><th>' + t('historyGap') + '</th>' +
      '</tr></thead><tbody>';
    periods.forEach(function (period, index) {
      var gap = '-';
      var previous = periods[index + 1];
      if (previous) gap = TD.diffDays(previous.start, period.start) + ' ' + t('daysUnit');
      html += '<tr>' +
        '<td class="num">' + fmtDate(period.start, { day: 'numeric', month: 'short', year: 'numeric' }) + '</td>' +
        '<td class="num">' + fmtDate(period.end, { day: 'numeric', month: 'short', year: 'numeric' }) + '</td>' +
        '<td class="num">' + durationDays(period.length) + '</td>' +
        '<td class="num">' + gap + '</td></tr>';
    });
    html += '</tbody></table>';
    el.historyWrap.innerHTML = html;
  }

  function renderSymptoms() {
    var counts = {};
    Object.keys(state.days).forEach(function (iso) {
      (state.days[iso].symptoms || []).forEach(function (symptom) {
        counts[symptom] = (counts[symptom] || 0) + 1;
      });
    });
    var rows = Object.keys(counts).map(function (name) { return { name: name, count: counts[name] }; })
      .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
    if (!rows.length) {
      el.symptomChartWrap.innerHTML = '<div class="empty"><b>' + escapeAttr(t('symptomsHint')) + '</b></div>';
      return;
    }
    var max = rows[0].count;
    var html = '<table class="data"><tbody>';
    rows.slice(0, 8).forEach(function (row) {
      var key = SYMPTOM_KEYS[row.name];
      var label = key ? t(key) : row.name;
      var pct = Math.round(row.count / max * 100);
      html += '<tr><td style="width:38%">' + escapeAttr(label) + '</td>' +
        '<td><span style="display:inline-block;height:9px;border-radius:5px;background:var(--accent);width:' + pct + '%;min-width:6px"></span></td>' +
        '<td class="num" style="width:44px;text-align:right">' + row.count + '</td></tr>';
    });
    html += '</tbody></table>';
    el.symptomChartWrap.innerHTML = html;
  }

  function renderSettings() {
    el.defCycle.value = String(state.settings.cycleLength);
    el.defPeriod.value = String(state.settings.periodLength);
    el.lutealInput.value = String(state.settings.lutealPhase);
    el.weekStart.value = String(state.settings.weekStart);
    el.daysCount.textContent = String(Object.keys(state.days).length);
  }

  function renderPrint() {
    var s = state.summary;
    var st = s.stats;
    var today = TD.todayIso(new Date());
    var html = '<h1>' + escapeAttr(t('printTitle')) + '</h1>';
    html += '<p class="meta">' + escapeAttr(t('printGenerated', { date: fmtDate(today, { day: 'numeric', month: 'long', year: 'numeric' }) })) + '</p>';
    if (!s.periods.length) {
      html += '<p>' + escapeAttr(t('printNoData')) + '</p>';
    } else {
      html += '<h2>' + escapeAttr(t('printStatsTitle')) + '</h2><table><tbody>';
      html += '<tr><th>' + escapeAttr(t('avgCycle')) + '</th><td>' + durationDays(Math.round(st.avgCycle)) + '</td></tr>';
      html += '<tr><th>' + escapeAttr(t('avgPeriod')) + '</th><td>' + durationDays(Math.round(st.avgPeriod)) + '</td></tr>';
      html += '<tr><th>' + escapeAttr(t('shortest')) + '</th><td>' + durationDays(st.minCycle) + '</td></tr>';
      html += '<tr><th>' + escapeAttr(t('longest')) + '</th><td>' + durationDays(st.maxCycle) + '</td></tr>';
      html += '<tr><th>' + escapeAttr(t('cyclesTracked')) + '</th><td>' + st.cyclesCount + '</td></tr>';
      html += '</tbody></table>';
      html += '<h2>' + escapeAttr(t('historyTitle')) + '</h2><table><thead><tr>' +
        '<th>' + escapeAttr(t('historyStart')) + '</th><th>' + escapeAttr(t('historyEnd')) + '</th><th>' + escapeAttr(t('historyLength')) + '</th>' +
        '</tr></thead><tbody>';
      s.periods.slice().reverse().forEach(function (period) {
        html += '<tr><td>' + escapeAttr(fmtDate(period.start, { day: 'numeric', month: 'short', year: 'numeric' })) + '</td>' +
          '<td>' + escapeAttr(fmtDate(period.end, { day: 'numeric', month: 'short', year: 'numeric' })) + '</td>' +
          '<td>' + period.length + '</td></tr>';
      });
      html += '</tbody></table>';
      if (s.predictions.length) {
        html += '<h2>' + escapeAttr(t('predictionTitle')) + '</h2><table><tbody>';
        s.predictions.slice(0, 3).forEach(function (prediction) {
          html += '<tr><td>' + escapeAttr(fmtRange(prediction.start, prediction.end)) + '</td></tr>';
        });
        html += '</tbody></table>';
      }
    }
    html += '<p class="meta">' + escapeAttr(t('disclaimerText')) + '</p>';
    el.printReport.innerHTML = html;
  }

  /* ------------------------------------------------------------------ views */

  function setView(view) {
    state.view = view;
    Array.prototype.forEach.call(el.tabs.querySelectorAll('button'), function (button) {
      var active = button.getAttribute('data-view') === view;
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.setAttribute('tabindex', active ? '0' : '-1');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-view-panel]'), function (panel) {
      panel.hidden = panel.getAttribute('data-view-panel') !== view;
    });
  }

  /* --------------------------------------------------------------- mutation */

  function pushUndo() {
    state.undo.push(clone(state.days));
    if (state.undo.length > 40) state.undo.shift();
  }

  function commit(message) {
    save();
    renderAll();
    flashSaved();
    if (message) showToast(message, 'ok');
  }

  function updateDay(iso, patch) {
    pushUndo();
    var current = state.days[iso] ? clone(state.days[iso]) : { flow: 'none', symptoms: [], moods: [], notes: '', bbt: null };
    Object.keys(patch).forEach(function (key) { current[key] = patch[key]; });
    var normalized = TD.normalizeDay(current);
    var empty = !normalized || (normalized.flow === 'none' && !normalized.symptoms.length && !normalized.moods.length && !normalized.notes && normalized.bbt === null);
    if (empty) delete state.days[iso];
    else state.days[iso] = normalized;
    commit();
  }

  function undo() {
    if (!state.undo.length) { showToast(t('toastUndoEmpty')); return; }
    state.days = state.undo.pop();
    save();
    renderAll();
    showToast(t('toastSaved'), 'ok');
  }

  /* ----------------------------------------------------------------- events */

  function selectDay(iso) {
    state.selected = iso;
    state.cursor = { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1 };
    renderCalendar();
    renderEditor();
  }

  function buildChips() {
    var moodHtml = '<button type="button" class="chip" data-mood="" aria-pressed="true">' + escapeAttr(t('moodNone')) + '</button>';
    MOODS.forEach(function (mood) {
      moodHtml += '<button type="button" class="chip" data-mood="' + mood + '" aria-pressed="false">' + escapeAttr(t(MOOD_KEYS[mood])) + '</button>';
    });
    el.moodGroup.innerHTML = moodHtml;

    var symHtml = '';
    SYMPTOMS.forEach(function (symptom) {
      symHtml += '<button type="button" class="chip" data-symptom="' + symptom + '" aria-pressed="false">' + escapeAttr(t(SYMPTOM_KEYS[symptom])) + '</button>';
    });
    el.symptomGroup.innerHTML = symHtml;
  }

  function bind() {
    el.tabs.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-view]');
      if (button) setView(button.getAttribute('data-view'));
    });

    el.tabs.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      var buttons = Array.prototype.slice.call(el.tabs.querySelectorAll('button'));
      var index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      var next = event.key === 'ArrowRight' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
      buttons[next].focus();
      setView(buttons[next].getAttribute('data-view'));
    });

    el.brandLink.addEventListener('click', function (event) {
      event.preventDefault();
      setView('calendar');
    });

    el.langSelect.addEventListener('change', function () {
      setLanguage(el.langSelect.value);
    });

    el.themeBtn.addEventListener('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
      save();
    });

    el.undoBtn.addEventListener('click', undo);

    document.addEventListener('keydown', function (event) {
      var meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
    });

    el.prevBtn.addEventListener('click', function () { shiftMonth(-1); });
    el.nextBtn.addEventListener('click', function () { shiftMonth(1); });
    el.todayBtn.addEventListener('click', function () {
      var today = TD.todayIso(new Date());
      state.cursor = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
      selectDay(today);
    });

    el.calendarGrid.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-iso]');
      if (button) selectDay(button.getAttribute('data-iso'));
    });

    el.calendarGrid.addEventListener('keydown', function (event) {
      var button = event.target.closest('button[data-iso]');
      if (!button) return;
      var iso = button.getAttribute('data-iso');
      var step = 0;
      if (event.key === 'ArrowRight') step = 1;
      else if (event.key === 'ArrowLeft') step = -1;
      else if (event.key === 'ArrowDown') step = 7;
      else if (event.key === 'ArrowUp') step = -7;
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectDay(iso); return; }
      else return;
      event.preventDefault();
      selectDay(TD.addDays(iso, step));
      var next = el.calendarGrid.querySelector('button[data-iso="' + state.selected + '"]');
      if (next) next.focus();
    });

    el.flowGroup.addEventListener('click', function (event) {
      var chip = event.target.closest('.chip');
      if (!chip) return;
      updateDay(state.selected, { flow: chip.getAttribute('data-flow') });
      if (chip.getAttribute('data-flow') !== 'none') showToast(t('toastSaved'), 'ok');
    });

    el.moodGroup.addEventListener('click', function (event) {
      var chip = event.target.closest('.chip');
      if (!chip) return;
      var value = chip.getAttribute('data-mood');
      updateDay(state.selected, { moods: value ? [value] : [] });
    });

    el.symptomGroup.addEventListener('click', function (event) {
      var chip = event.target.closest('.chip');
      if (!chip) return;
      var entry = state.days[state.selected];
      var current = entry && entry.symptoms ? entry.symptoms.slice() : [];
      var symptom = chip.getAttribute('data-symptom');
      var index = current.indexOf(symptom);
      if (index >= 0) current.splice(index, 1);
      else current.push(symptom);
      updateDay(state.selected, { symptoms: current });
    });

    el.tempInput.addEventListener('change', function () {
      var raw = el.tempInput.value.trim().replace(',', '.');
      if (!raw) { updateDay(state.selected, { bbt: null }); return; }
      var value = Number(raw);
      if (!isFinite(value) || value < 34 || value > 42) {
        showToast(t('bbtLabel') + ': 34 - 42', 'error');
        renderEditor();
        return;
      }
      updateDay(state.selected, { bbt: Math.round(value * 100) / 100 });
    });

    el.clearTemp.addEventListener('click', function () {
      el.tempInput.value = '';
      updateDay(state.selected, { bbt: null });
    });

    var noteTimer = null;
    el.noteInput.addEventListener('input', function () {
      window.clearTimeout(noteTimer);
      var value = el.noteInput.value;
      noteTimer = window.setTimeout(function () {
        updateDay(state.selected, { notes: value });
      }, 500);
    });

    el.closeEditor.addEventListener('click', function () {
      setView('calendar');
      var today = TD.todayIso(new Date());
      selectDay(today);
    });

    el.clearDay.addEventListener('click', function () {
      if (!state.days[state.selected]) { showToast(t('toastCleared')); return; }
      pushUndo();
      delete state.days[state.selected];
      save();
      renderAll();
      showToast(t('toastCleared'), 'ok');
    });

    el.printBtn.addEventListener('click', function () {
      renderPrint();
      window.print();
    });

    ['defCycle', 'defPeriod', 'lutealInput'].forEach(function (id) {
      el[id].addEventListener('change', function () {
        var key = id === 'defCycle' ? 'cycleLength' : id === 'defPeriod' ? 'periodLength' : 'lutealPhase';
        var patch = {};
        patch[key] = Number(el[id].value);
        state.settings = TD.normalizeSettings(Object.assign({}, state.settings, patch));
        save();
        renderAll();
        showToast(t('toastSaved'), 'ok');
      });
    });

    el.weekStart.addEventListener('change', function () {
      state.settings = TD.normalizeSettings(Object.assign({}, state.settings, { weekStart: Number(el.weekStart.value) }));
      save();
      renderAll();
    });

    el.exportBtn.addEventListener('click', exportBackup);
    el.importBtn.addEventListener('click', function () { el.importFile.click(); });
    el.importFile.addEventListener('change', importBackup);

    el.resetBtn.addEventListener('click', function () {
      el.confirmTitle.textContent = t('clearAll');
      el.confirmText.textContent = t('clearConfirm');
      el.confirmOk.textContent = t('clearAll');
      el.confirmCancel.textContent = t('cancel');
      if (typeof el.confirmDialog.showModal === 'function') el.confirmDialog.showModal();
      else if (window.confirm(t('clearConfirm'))) resetAll();
    });

    el.confirmCancel.addEventListener('click', function () { el.confirmDialog.close(); });
    el.confirmOk.addEventListener('click', function () {
      el.confirmDialog.close();
      resetAll();
    });

    el.sampleBtn.addEventListener('click', loadSample);
    el.onboardSample.addEventListener('click', loadSample);
  }

  function applyTheme() {
    document.documentElement.classList.toggle('theme-dark', state.theme === 'dark');
  }

  function shiftMonth(delta) {
    var year = state.cursor.year;
    var month = state.cursor.month + delta;
    if (month < 0) { month = 11; year -= 1; }
    if (month > 11) { month = 0; year += 1; }
    state.cursor = { year: year, month: month };
    renderCalendar();
  }

  function exportBackup() {
    var payload = {
      app: APP_NAME,
      version: 1,
      exportedAt: new Date().toISOString(),
      days: state.days,
      settings: state.settings
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'cycle-calendar-backup-' + TD.todayIso(new Date()) + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    showToast(t('toastExported'), 'ok');
  }

  function importBackup(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var result = TD.parseBackup(String(reader.result));
      if (!result.ok) { showToast(t('importError'), 'error'); return; }
      pushUndo();
      state.days = result.days;
      if (result.settings) state.settings = result.settings;
      save();
      renderAll();
      showToast(t('importOk', { n: result.count }), 'ok');
    };
    reader.onerror = function () { showToast(t('importError'), 'error'); };
    reader.readAsText(file);
    event.target.value = '';
  }

  function resetAll() {
    pushUndo();
    state.days = {};
    state.settings = TD.normalizeSettings({});
    save();
    renderAll();
    showToast(t('toastAllCleared'), 'ok');
  }

  function loadSample() {
    pushUndo();
    var today = TD.todayIso(new Date());
    var lengths = [29, 27, 30, 28, 31];
    var durations = [4, 5, 4, 5, 4];
    var days = {};
    var start = TD.addDays(today, -13);
    for (var i = lengths.length - 1; i >= 0; i--) {
      var length = durations[i];
      for (var d = 0; d < length; d++) {
        var iso = TD.addDays(start, d);
        var flow = d === 0 ? 'medium' : d === 1 ? 'heavy' : d === 2 ? 'medium' : 'light';
        days[iso] = {
          flow: flow,
          symptoms: d === 0 ? ['cramps', 'fatigue'] : d === 1 ? ['cramps', 'backache'] : [],
          moods: d === 0 ? ['low'] : d === 3 ? ['calm'] : [],
          notes: d === 0 ? t('legendPeriod') : '',
          bbt: null
        };
      }
      start = TD.addDays(start, -lengths[i]);
    }
    state.days = TD.sanitizeDays(days);
    state.selected = TD.addDays(today, -13);
    state.cursor = { year: Number(state.selected.slice(0, 4)), month: Number(state.selected.slice(5, 7)) - 1 };
    save();
    renderAll();
    showToast(t('toastImported'), 'ok');
  }

  /* ------------------------------------------------------------------- boot */

  function boot() {
    ids.forEach(function (id) { el[id] = $(id); });
    load();
    state.cursor = null;
    applyTheme();
    el.langSelect.value = state.language;
    applyStatic();
    buildChips();
    bind();
    setView('calendar');
    renderAll();
    el.yearText.textContent = String(new Date().getUTCFullYear());
    el.versionText.textContent = t('version', { version: '1' });
    if (!state.storageOk) showToast(t('toastStorage'), 'error');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

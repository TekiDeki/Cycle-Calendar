/* Cycle Calendar · TekiDeki - date and cycle engine
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Kristian Mario Miskovic (TekiDeki)
 *
 * Pure functions only: no DOM, no storage, no clock. Every date is handled as
 * a 'YYYY-MM-DD' string and converted to UTC midnight internally, so a cycle
 * never shifts by a day because of a timezone or a daylight saving change.
 *
 * Loaded twice on purpose: as a plain <script> in the browser and with
 * require() in Node, so the tests exercise exactly the code the app ships.
 */
(function (root) {
  'use strict';

  var TD = root.TD || (root.TD = {});

  var DAY_MS = 86400000;
  var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  /* ------------------------------------------------------------------ dates */

  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function dateToIso(date) {
    return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
  }

  function isValidIso(value) {
    if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
    var parts = ISO_RE.exec(value);
    var year = Number(parts[1]);
    var month = Number(parts[2]);
    var day = Number(parts[3]);
    if (month < 1 || month > 12 || day < 1) return false;
    return day <= daysInMonth(year, month - 1);
  }

  function isoToDate(value) {
    var parts = ISO_RE.exec(value);
    if (!parts) throw new Error('invalid iso date: ' + value);
    return new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  }

  function addDays(value, amount) {
    var date = isoToDate(value);
    return dateToIso(new Date(date.getTime() + Math.round(amount) * DAY_MS));
  }

  /* b - a, in whole days. */
  function diffDays(a, b) {
    return Math.round((isoToDate(b).getTime() - isoToDate(a).getTime()) / DAY_MS);
  }

  /* 0 = Sunday ... 6 = Saturday, matching Date#getUTCDay. */
  function weekdayOf(value) {
    return isoToDate(value).getUTCDay();
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  function daysInMonth(year, monthIndex) {
    return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthIndex];
  }

  function todayIso(now) {
    var date = now ? new Date(now) : new Date();
    return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
  }

  function monthLabelIso(year, monthIndex) {
    return year + '-' + pad(monthIndex + 1) + '-01';
  }

  /* Six weeks of cells, always: a stable calendar height, no layout jump. */
  function monthMatrix(year, monthIndex, weekStart) {
    var first = monthLabelIso(year, monthIndex);
    var firstWeekday = weekdayOf(first);
    var start = ((weekStart || 0) % 7 + 7) % 7;
    var lead = (firstWeekday - start + 7) % 7;
    var begin = addDays(first, -lead);
    var cells = [];
    for (var index = 0; index < 42; index++) {
      var iso = addDays(begin, index);
      var parts = iso.split('-');
      cells.push({
        iso: iso,
        day: Number(parts[2]),
        month: Number(parts[1]) - 1,
        year: Number(parts[0]),
        inMonth: Number(parts[1]) - 1 === monthIndex && Number(parts[0]) === year
      });
    }
    return cells;
  }

  /* ---------------------------------------------------------------- periods */

  /* Contiguous days with flow form one period. A single missing day ends it:
   * the rule is strict on purpose, so what you log is what you get back. */
  function groupPeriods(days) {
    var isoDates = Object.keys(days || {}).filter(function (iso) {
      return isValidIso(iso) && days[iso] && days[iso].flow && days[iso].flow !== 'none';
    }).sort();

    var periods = [];
    var current = null;
    isoDates.forEach(function (iso) {
      if (current && diffDays(current.end, iso) === 1) {
        current.end = iso;
        current.length += 1;
        current.days.push(iso);
      } else {
        current = { start: iso, end: iso, length: 1, days: [iso] };
        periods.push(current);
      }
    });
    return periods;
  }

  function mean(values) {
    if (!values.length) return 0;
    var sum = 0;
    for (var i = 0; i < values.length; i++) sum += values[i];
    return sum / values.length;
  }

  function median(values) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function stddev(values) {
    if (values.length < 2) return 0;
    var average = mean(values);
    var sum = 0;
    for (var i = 0; i < values.length; i++) sum += Math.pow(values[i] - average, 2);
    return Math.sqrt(sum / (values.length - 1));
  }

  function clamp(value, low, high) {
    return value < low ? low : value > high ? high : value;
  }

  var SETTINGS = {
    cycleLength: 28,
    periodLength: 5,
    lutealPhase: 14,
    weekStart: 1,
    historyLimit: 6
  };

  function normalizeSettings(input) {
    var source = input || {};
    return {
      cycleLength: clamp(Math.round(Number(source.cycleLength) || SETTINGS.cycleLength), 21, 45),
      periodLength: clamp(Math.round(Number(source.periodLength) || SETTINGS.periodLength), 1, 12),
      lutealPhase: clamp(Math.round(Number(source.lutealPhase) || SETTINGS.lutealPhase), 9, 17),
      weekStart: source.weekStart === 0 ? 0 : 1,
      historyLimit: clamp(Math.round(Number(source.historyLimit) || SETTINGS.historyLimit), 1, 12)
    };
  }

  /* Cycle lengths are the gaps between consecutive period starts. */
  function cycleLengths(periods) {
    var lengths = [];
    for (var i = 1; i < periods.length; i++) {
      lengths.push({
        from: periods[i - 1].start,
        to: periods[i].start,
        length: diffDays(periods[i - 1].start, periods[i].start)
      });
    }
    return lengths;
  }

  function stats(periods, settings) {
    var config = normalizeSettings(settings);
    var lengths = cycleLengths(periods);
    var values = lengths.map(function (item) { return item.length; });
    var periodValues = periods.map(function (item) { return item.length; });
    var recent = values.slice(-config.historyLimit);
    var deviation = stddev(recent);
    var variability = 'unknown';
    if (recent.length >= 2) {
      if (deviation <= 2) variability = 'regular';
      else if (deviation <= 4) variability = 'slightly-irregular';
      else variability = 'irregular';
    }
    return {
      periodsCount: periods.length,
      cyclesCount: values.length,
      avgCycle: values.length ? Math.round(mean(values) * 10) / 10 : 0,
      medianCycle: median(values),
      minCycle: values.length ? Math.min.apply(null, values) : 0,
      maxCycle: values.length ? Math.max.apply(null, values) : 0,
      sdCycle: Math.round(deviation * 10) / 10,
      recentAvgCycle: recent.length ? Math.round(mean(recent) * 10) / 10 : 0,
      avgPeriod: periodValues.length ? Math.round(mean(periodValues) * 10) / 10 : 0,
      variability: variability,
      lastStart: periods.length ? periods[periods.length - 1].start : null,
      lastEnd: periods.length ? periods[periods.length - 1].end : null
    };
  }

  /* The number actually used for prediction: the mean of the last few cycles,
   * kept inside a range a human cycle can plausibly have. */
  function effectiveCycleLength(periods, settings) {
    var config = normalizeSettings(settings);
    var values = cycleLengths(periods)
      .map(function (item) { return item.length; })
      .filter(function (value) { return value >= 15 && value <= 90; })
      .slice(-config.historyLimit);
    if (!values.length) return config.cycleLength;
    return clamp(Math.round(mean(values)), 21, 45);
  }

  function effectivePeriodLength(periods, settings) {
    var config = normalizeSettings(settings);
    var values = periods.map(function (item) { return item.length; })
      .filter(function (value) { return value >= 1 && value <= 15; })
      .slice(-config.historyLimit);
    if (!values.length) return config.periodLength;
    return clamp(Math.round(mean(values)), 1, 12);
  }

  function predictPeriods(periods, settings, today, count) {
    var config = normalizeSettings(settings);
    if (!periods.length) return [];
    var wanted = clamp(count || 3, 1, 12);
    var cycle = effectiveCycleLength(periods, config);
    var periodLength = effectivePeriodLength(periods, config);
    var lastStart = periods[periods.length - 1].start;
    var baseline = todayIso(today);

    var predictions = [];
    var cursor = lastStart;
    /* Walk forward from the last known start. A gap of several missed months
     * is skipped rather than shown as a wall of stale predictions. */
    var guard = 0;
    while (guard < 240) {
      cursor = addDays(cursor, cycle);
      var end = addDays(cursor, periodLength - 1);
      /* diffDays(a, b) returns b - a, so this asks "does the period end on or
       * after today", which keeps the current cycle in the list. */
      if (diffDays(baseline, end) >= 0) {
        predictions.push({
          start: cursor,
          end: end,
          length: periodLength,
          cycleLength: cycle,
          daysAway: diffDays(baseline, cursor)
        });
      }
      if (predictions.length >= wanted) break;
      guard += 1;
    }
    return predictions;
  }

  /* Ovulation is estimated backwards from the next period, because the luteal
   * phase is the stable half of the cycle. */
  function fertileWindow(nextPeriodStart, settings) {
    var config = normalizeSettings(settings);
    var ovulation = addDays(nextPeriodStart, -config.lutealPhase);
    return {
      ovulation: ovulation,
      start: addDays(ovulation, -5),
      end: addDays(ovulation, 1)
    };
  }

  /* Everything the calendar needs to colour a day, in precedence order. */
  function dayStatus(iso, periods, predictions, settings) {
    var config = normalizeSettings(settings);
    var logged = null;
    for (var i = 0; i < periods.length; i++) {
      if (iso >= periods[i].start && iso <= periods[i].end) {
        logged = periods[i];
        break;
      }
    }
    if (logged) {
      return { type: 'period', cycleDay: diffDays(logged.start, iso) + 1, period: logged };
    }

    for (var p = 0; p < predictions.length; p++) {
      if (iso >= predictions[p].start && iso <= predictions[p].end) {
        return { type: 'predicted', cycleDay: diffDays(predictions[p].start, iso) + 1, prediction: predictions[p] };
      }
    }

    for (var q = 0; q < predictions.length; q++) {
      var window = fertileWindow(predictions[q].start, config);
      if (iso === window.ovulation) {
        return { type: 'ovulation', cycleDay: null, window: window, prediction: predictions[q] };
      }
      if (iso >= window.start && iso <= window.end) {
        return { type: 'fertile', cycleDay: null, window: window, prediction: predictions[q] };
      }
      if (iso >= addDays(predictions[q].start, -5) && iso < predictions[q].start) {
        return { type: 'pms', cycleDay: null, prediction: predictions[q] };
      }
    }

    /* A plain day still knows where it sits in its own cycle. */
    var cycleDay = null;
    for (var c = periods.length - 1; c >= 0; c--) {
      if (periods[c].start <= iso) {
        cycleDay = diffDays(periods[c].start, iso) + 1;
        break;
      }
    }
    return { type: null, cycleDay: cycleDay };
  }

  /* The full picture for one render: stats, predictions, and the next dates
   * a person actually asks about. */
  function summary(days, settings, today, options) {
    var config = normalizeSettings(settings);
    var periods = groupPeriods(days);
    var computed = stats(periods, config);
    var predictions = predictPeriods(periods, config, today, (options && options.predictions) || 3);
    var next = predictions.length ? predictions[0] : null;
    var window = next ? fertileWindow(next.start, config) : null;
    var baseline = todayIso(today);
    var cycleDay = null;
    if (computed.lastStart && baseline >= computed.lastStart) {
      cycleDay = diffDays(computed.lastStart, baseline) + 1;
    }
    return {
      today: baseline,
      settings: config,
      periods: periods,
      stats: computed,
      cycleDay: cycleDay,
      predictions: predictions,
      nextPeriod: next,
      fertile: window,
      daysToNextPeriod: next ? diffDays(baseline, next.start) : null,
      daysToOvulation: window ? diffDays(baseline, window.ovulation) : null,
      effectiveCycle: effectiveCycleLength(periods, config),
      effectivePeriod: effectivePeriodLength(periods, config)
    };
  }

  /* ------------------------------------------------------------ validation */

  /* Shapes accepted from a backup file. Anything else is rejected as a whole
   * instead of being half imported. */
  function normalizeDay(entry) {
    if (!entry || typeof entry !== 'object') return null;
    var flow = entry.flow;
    var allowed = ['none', 'spotting', 'light', 'medium', 'heavy'];
    var day = {
      flow: allowed.indexOf(flow) >= 0 ? flow : 'none',
      symptoms: Array.isArray(entry.symptoms) ? entry.symptoms.filter(function (item) { return typeof item === 'string'; }).slice(0, 24) : [],
      moods: Array.isArray(entry.moods) ? entry.moods.filter(function (item) { return typeof item === 'string'; }).slice(0, 12) : [],
      notes: typeof entry.notes === 'string' ? entry.notes.slice(0, 500) : '',
      bbt: typeof entry.bbt === 'number' && isFinite(entry.bbt) ? entry.bbt : null
    };
    return day;
  }

  function sanitizeDays(input) {
    var output = {};
    if (!input || typeof input !== 'object') return output;
    Object.keys(input).forEach(function (iso) {
      if (!isValidIso(iso)) return;
      var day = normalizeDay(input[iso]);
      if (!day) return;
      var empty = day.flow === 'none' && !day.symptoms.length && !day.moods.length && !day.notes && day.bbt === null;
      if (!empty) output[iso] = day;
    });
    return output;
  }

  /* A backup is accepted only when it looks like one of ours, so a random JSON
   * never silently wipes the diary. */
  function parseBackup(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { ok: false, reason: 'json' };
    }
    if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'shape' };
    if (parsed.app !== undefined && parsed.app !== 'Cycle Calendar') return { ok: false, reason: 'shape' };
    if (!parsed.days || typeof parsed.days !== 'object') return { ok: false, reason: 'shape' };
    var days = sanitizeDays(parsed.days);
    var settings = null;
    if (parsed.settings && typeof parsed.settings === 'object') settings = normalizeSettings(parsed.settings);
    return { ok: true, days: days, settings: settings, count: Object.keys(days).length };
  }

  TD.DAY_MS = DAY_MS;
  TD.dateToIso = dateToIso;
  TD.isValidIso = isValidIso;
  TD.isoToDate = isoToDate;
  TD.addDays = addDays;
  TD.diffDays = diffDays;
  TD.weekdayOf = weekdayOf;
  TD.isLeapYear = isLeapYear;
  TD.daysInMonth = daysInMonth;
  TD.todayIso = todayIso;
  TD.monthLabelIso = monthLabelIso;
  TD.monthMatrix = monthMatrix;
  TD.groupPeriods = groupPeriods;
  TD.mean = mean;
  TD.median = median;
  TD.stddev = stddev;
  TD.SETTINGS = SETTINGS;
  TD.normalizeSettings = normalizeSettings;
  TD.cycleLengths = cycleLengths;
  TD.stats = stats;
  TD.effectiveCycleLength = effectiveCycleLength;
  TD.effectivePeriodLength = effectivePeriodLength;
  TD.predictPeriods = predictPeriods;
  TD.fertileWindow = fertileWindow;
  TD.dayStatus = dayStatus;
  TD.summary = summary;
  TD.normalizeDay = normalizeDay;
  TD.sanitizeDays = sanitizeDays;
  TD.parseBackup = parseBackup;

  if (typeof module !== 'undefined' && module.exports) module.exports = TD;
})(typeof window !== 'undefined' ? window : global);

/**
 * GameVault bell schedule.
 *
 * One source of truth for the strip in the site header and the /schedule/ page,
 * so the two can never disagree. Times are 24-hour strings in Central time —
 * the school's clock, not the device's, which matters on a laptop that travels
 * or a VM set to UTC.
 *
 * Public surface: window.GVSchedule
 */
(function () {
  'use strict';

  var CLASS_KEY = 'gv.schedule.classes.v1';
  var ZONE = 'America/Chicago';

  var SCHEDULES = {
    Regular: {
      label: 'Regular day',
      periods: [
        { n: 'Period 1', s: '07:45', e: '08:35' },
        { n: 'Period 2', s: '08:41', e: '09:34' },
        { n: 'Period 3', s: '09:40', e: '10:30' },
        { n: 'Period 4', s: '10:36', e: '11:26' },
        { n: 'Period 5', s: '11:32', e: '12:22' },
        { n: 'Period 6', s: '12:28', e: '13:18' },
        { n: 'Period 7', s: '13:24', e: '14:14' },
        { n: 'Period 8', s: '14:20', e: '15:10' }
      ]
    },
    SOAR: {
      label: 'SOAR day',
      periods: [
        { n: 'Period 1', s: '07:45', e: '08:30' },
        { n: 'Period 2', s: '08:35', e: '09:20' },
        { n: 'SOAR',     s: '09:25', e: '10:10' },
        { n: 'Period 3', s: '10:15', e: '11:00' },
        { n: 'Period 4', s: '11:05', e: '11:50' },
        { n: 'Period 5', s: '11:55', e: '12:40' },
        { n: 'Period 6', s: '12:45', e: '13:30' },
        { n: 'Period 7', s: '13:35', e: '14:20' },
        { n: 'Period 8', s: '14:25', e: '15:10' }
      ]
    },
    LateStart: {
      label: 'Late start',
      periods: [
        { n: 'PLC',      s: '07:45', e: '08:45' },
        { n: 'Period 1', s: '09:00', e: '09:42' },
        { n: 'Period 2', s: '09:47', e: '10:29' },
        { n: 'Period 3', s: '10:34', e: '11:16' },
        { n: 'Period 4', s: '11:21', e: '12:03' },
        { n: 'Period 5', s: '12:08', e: '12:49' },
        { n: 'Period 6', s: '12:54', e: '13:36' },
        { n: 'Period 7', s: '13:41', e: '14:23' },
        { n: 'Period 8', s: '14:28', e: '15:10' }
      ]
    },
    HalfDay: {
      label: 'Half day',
      periods: [
        { n: 'Period 1', s: '07:45', e: '08:11' },
        { n: 'Period 2', s: '08:17', e: '08:45' },
        { n: 'Period 3', s: '08:51', e: '09:17' },
        { n: 'Period 4', s: '09:23', e: '09:49' },
        { n: 'Period 5', s: '09:55', e: '10:21' },
        { n: 'Period 6', s: '10:27', e: '10:54' },
        { n: 'Period 7', s: '11:00', e: '11:27' },
        { n: 'Period 8', s: '11:33', e: '12:00' }
      ]
    },
    Finals126: {
      label: 'Finals · 1, 2, 6',
      periods: [
        { n: 'Period 1 exam', s: '07:45', e: '09:25' },
        { n: 'Period 2 exam', s: '09:35', e: '11:15' },
        { n: 'Period 6 exam', s: '11:25', e: '13:05' }
      ]
    },
    Finals834: {
      label: 'Finals · 8, 3, 4',
      periods: [
        { n: 'Period 8 exam', s: '07:45', e: '09:25' },
        { n: 'Period 3 exam', s: '09:35', e: '11:15' },
        { n: 'Period 4 exam', s: '11:25', e: '13:05' }
      ]
    },
    Finals75M: {
      label: 'Finals · 7, 5, makeup',
      periods: [
        { n: 'Period 7 exam', s: '07:45', e: '09:25' },
        { n: 'Period 5 exam', s: '09:35', e: '11:15' },
        { n: 'Makeup exams',  s: '11:25', e: '13:05' }
      ]
    }
  };

  /* Which shape a plain week takes: Sunday index 0 through Saturday index 6. */
  var WEEK = [null, 'Regular', 'SOAR', 'LateStart', 'SOAR', 'Regular', null];

  /* District 203 calendar. Dates are MM-DD; a range that crosses New Year is
     handled by the lookup below. Edit this list each school year. */
  var CALENDAR = [
    { start: '09-07', title: 'Labor Day', kind: 'off' },
    { start: '10-08', title: 'Institute Day', kind: 'off' },
    { start: '10-09', title: 'Parent/Teacher Conferences', kind: 'off' },
    { start: '10-12', title: 'Indigenous Peoples’ Day', kind: 'off' },
    { start: '11-25', end: '11-27', title: 'Thanksgiving Break', kind: 'off' },
    { start: '12-21', end: '01-01', title: 'Winter Break', kind: 'off' },
    { start: '01-04', title: 'Institute Day', kind: 'off' },
    { start: '01-18', title: 'MLK Day', kind: 'off' },
    { start: '02-15', title: 'Presidents’ Day', kind: 'off' },
    { start: '02-26', title: 'County Institute Day', kind: 'off' },
    { start: '03-04', title: 'Institute Day', kind: 'off' },
    { start: '03-05', title: 'Parent/Teacher Conferences', kind: 'off' },
    { start: '03-26', title: 'Spring Holiday', kind: 'off' },
    { start: '03-29', end: '04-02', title: 'Spring Break', kind: 'off' },
    { start: '04-05', end: '04-06', title: 'Spring Break', kind: 'off' },
    { start: '05-31', title: 'Memorial Day', kind: 'off' },
    { start: '11-03', title: 'E-Learning Day (Election Day)', kind: 'remote' },
    { start: '02-23', title: 'E-Learning Day (Election Day)', kind: 'remote' },
    { start: '05-07', title: 'Half-Day Institute', kind: 'special', key: 'HalfDay' },
    { start: '12-16', title: 'December Finals', kind: 'special', key: 'Finals126' },
    { start: '12-17', title: 'December Finals', kind: 'special', key: 'Finals834' },
    { start: '12-18', title: 'December Finals', kind: 'special', key: 'Finals75M' },
    { start: '05-24', title: 'May Finals', kind: 'special', key: 'Finals126' },
    { start: '05-25', title: 'May Finals', kind: 'special', key: 'Finals834' },
    { start: '05-26', title: 'May Finals', kind: 'special', key: 'Finals75M' }
  ];

  var CLASS_PERIODS = ['Period 1', 'Period 2', 'Period 3', 'Period 4',
                       'Period 5', 'Period 6', 'Period 7', 'Period 8'];

  // ── Time in the school's zone ───────────────────────────────────────────

  var parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE, hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  var DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  /* Everything downstream works from this one object, so a caller can pass a
     fake "now" and get a fully deterministic answer. */
  function clock(date) {
    var d = date || new Date();
    var out = {};
    parts.formatToParts(d).forEach(function (p) { out[p.type] = p.value; });
    var hour = parseInt(out.hour, 10) % 24; // some engines render midnight as 24
    return {
      day: DAY_INDEX[out.weekday],
      weekday: out.weekday,
      year: parseInt(out.year, 10),
      month: parseInt(out.month, 10),
      date: parseInt(out.day, 10),
      md: out.month + '-' + out.day,
      minutes: hour * 60 + parseInt(out.minute, 10),
      seconds: parseInt(out.second, 10)
    };
  }

  function toMinutes(hhmm) {
    var bits = hhmm.split(':');
    return parseInt(bits[0], 10) * 60 + parseInt(bits[1], 10);
  }

  function fmtTime(hhmm) {
    var m = toMinutes(hhmm);
    var h = Math.floor(m / 60);
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(m % 60).padStart(2, '0') + ' ' + suffix;
  }

  function fmtCountdown(totalSeconds) {
    var s = Math.max(0, Math.floor(totalSeconds));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }

  // ── Calendar ────────────────────────────────────────────────────────────

  function inRange(md, entry) {
    var start = entry.start;
    var end = entry.end || entry.start;
    // A break that runs across New Year wraps, so the comparison has to as well.
    if (end < start) return md >= start || md <= end;
    return md >= start && md <= end;
  }

  function overrideFor(c) {
    for (var i = 0; i < CALENDAR.length; i++) {
      if (inRange(c.md, CALENDAR[i])) return CALENDAR[i];
    }
    return null;
  }

  /* What today looks like: the schedule to run, plus why. */
  function dayFor(date) {
    var c = clock(date);
    var override = overrideFor(c);

    if (override && override.kind === 'off') {
      return { clock: c, kind: 'off', title: override.title, key: null };
    }
    if (override && override.kind === 'remote') {
      return { clock: c, kind: 'remote', title: override.title, key: null };
    }
    if (c.day === 0 || c.day === 6) {
      return { clock: c, kind: 'weekend', title: 'Weekend', key: null };
    }
    if (override && override.kind === 'special') {
      return { clock: c, kind: 'school', title: override.title, key: override.key };
    }
    return { clock: c, kind: 'school', title: SCHEDULES[WEEK[c.day]].label, key: WEEK[c.day] };
  }

  // ── Saved class names ───────────────────────────────────────────────────

  function loadClasses() {
    try {
      var raw = JSON.parse(localStorage.getItem(CLASS_KEY) || '{}');
      return (raw && typeof raw === 'object') ? raw : {};
    } catch (e) { return {}; }
  }

  function saveClasses(map) {
    try { localStorage.setItem(CLASS_KEY, JSON.stringify(map || {})); } catch (e) {}
  }

  /* "Period 3 exam" and "Period 3" should both pick up whatever you called
     period 3, so match on the number rather than the full label. */
  function classFor(periodName, classes) {
    var m = /Period\s+(\d)/i.exec(periodName || '');
    if (!m) return '';
    return (classes || loadClasses())['Period ' + m[1]] || '';
  }

  // ── Current state ───────────────────────────────────────────────────────

  function stateFor(date) {
    var day = dayFor(date);
    var c = day.clock;
    var classes = loadClasses();

    var base = {
      day: day,
      classes: classes,
      periods: day.key ? SCHEDULES[day.key].periods : [],
      scheduleLabel: day.title,
      index: -1,
      progress: 0
    };

    if (day.kind !== 'school') {
      return Object.assign(base, {
        mode: day.kind,
        now: day.title,
        detail: day.kind === 'remote' ? 'Work from home today' : 'No school',
        clockText: '--:--',
        next: '',
        nextAt: ''
      });
    }

    var periods = base.periods;
    var mins = c.minutes;
    var secs = c.seconds;

    for (var i = 0; i < periods.length; i++) {
      var p = periods[i];
      var start = toMinutes(p.s);
      var end = toMinutes(p.e);
      if (mins >= start && mins < end) {
        var after = periods[i + 1];
        return Object.assign(base, {
          mode: 'in-class',
          index: i,
          now: p.n,
          detail: classFor(p.n, classes),
          clockText: fmtCountdown((end - mins) * 60 - secs),
          endsAt: fmtTime(p.e),
          next: after ? after.n : 'Done for the day',
          nextAt: after ? fmtTime(after.s) : '',
          progress: (mins + secs / 60 - start) / (end - start)
        });
      }
    }

    var first = periods[0];
    if (mins < toMinutes(first.s)) {
      return Object.assign(base, {
        mode: 'before',
        now: 'Before school',
        detail: classFor(first.n, classes),
        clockText: fmtCountdown((toMinutes(first.s) - mins) * 60 - secs),
        endsAt: fmtTime(first.s),
        next: first.n,
        nextAt: fmtTime(first.s)
      });
    }

    for (var j = 0; j < periods.length - 1; j++) {
      var endA = toMinutes(periods[j].e);
      var startB = toMinutes(periods[j + 1].s);
      if (mins >= endA && mins < startB) {
        return Object.assign(base, {
          mode: 'passing',
          index: j + 1,
          now: 'Passing',
          detail: classFor(periods[j + 1].n, classes),
          clockText: fmtCountdown((startB - mins) * 60 - secs),
          endsAt: fmtTime(periods[j + 1].s),
          next: periods[j + 1].n,
          nextAt: fmtTime(periods[j + 1].s)
        });
      }
    }

    return Object.assign(base, {
      mode: 'after',
      now: 'After school',
      detail: '',
      clockText: '00:00',
      next: 'Tomorrow',
      nextAt: ''
    });
  }

  window.GVSchedule = {
    SCHEDULES: SCHEDULES,
    CALENDAR: CALENDAR,
    CLASS_PERIODS: CLASS_PERIODS,
    clock: clock,
    dayFor: dayFor,
    stateFor: stateFor,
    loadClasses: loadClasses,
    saveClasses: saveClasses,
    classFor: classFor,
    fmtTime: fmtTime,
    fmtCountdown: fmtCountdown,
    toMinutes: toMinutes
  };
})();

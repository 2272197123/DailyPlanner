/* ═══════════════════════════════════════
   utils.js — Pure stateless utility functions
   ═══════════════════════════════════════ */
'use strict';

/** Parse HH:MM → total minutes */
function p2m(s) { var parts = s.split(':'); return parseInt(parts[0]) * 60 + parseInt(parts[1]); }

/** Parse "HH:MM-HH:MM" → duration in minutes */
function dur(s) { var parts = s.split('-'); return Math.max(0, p2m(parts[1].trim()) - p2m(parts[0].trim())); }

/** Render seconds as MM:SS */
function fmtTime(sec) { return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }

/** Render seconds as HH:MM:SS for elapsed-time displays */
function fmtTimeHMS(sec) {
  var tot = Math.max(0, Math.round(sec));
  var h = Math.floor(tot / 3600);
  var m = Math.floor((tot % 3600) / 60);
  var s = tot % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

/** HTML-escape user-supplied text to prevent XSS */
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/** Date → YYYY-MM-DD string (local) */
function toLocalDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

/** Simple stable hash for generated IDs */
function stableHash(s) {
  var hash = 5381;
  for (var i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** Pick a random encouragement for a given mode */
function pickEncouragement(mode) {
  var pool = ENCOURAGEMENTS[mode] || ENCOURAGEMENTS.full;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Pick a date-seeded encouragement — same date + mode always yields the same text.
 * Uses a simple DJB2 hash of "YYYY-MM-DD|mode" to pick an index deterministically.
 */
function pickEncouragementSeeded(dateStr, mode) {
  var pool = ENCOURAGEMENTS[mode] || ENCOURAGEMENTS.full;
  var key = dateStr + '|' + mode;
  var hash = 5381;
  for (var i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  }
  var idx = Math.abs(hash) % pool.length;
  return pool[idx];
}

/** Calculate wafer reward for a task: min(round(duration/5), 20) pieces */
function calcTaskReward(task) {
  var mins = task.duration || (task.time ? dur(task.time) : 25);
  return Math.max(1, Math.min(20, Math.round(mins / 5)));
}

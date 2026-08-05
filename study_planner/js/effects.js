/* ═══════════════════════════════════════
   effects.js — Particle & animation effects
   ═══════════════════════════════════════ */
'use strict';

function spawnSparks(el) {
  var emojis = ['✨','⭐','💫','🌟','🎉','💚'];
  for (var i = 0; i < 6; i++) {
    var spark = document.createElement('span');
    spark.className = 'routine-spark';
    spark.textContent = emojis[i];
    spark.style.left = (35 + Math.random() * 55) + 'px';
    spark.style.top  = (8 + Math.random() * 18) + 'px';
    var angle = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
    var dist  = 22 + Math.random() * 30;
    spark.style.setProperty('--sx', Math.cos(angle) * dist + 'px');
    spark.style.setProperty('--sy', Math.sin(angle) * dist + 'px');
    spark.style.setProperty('--sr', (Math.random() - 0.5) * 180 + 'deg');
    el.appendChild(spark);
    setTimeout(function() { spark.remove(); }, 700);
  }
}

function spawnConfetti(el) {
  var colors = ['#8b5cf6','#c7523e','#3aad8a','#f6b83b','#4a6090','#e8c84a'];
  var rect = el.getBoundingClientRect();
  for (var i = 0; i < 12; i++) {
    var p = document.createElement('div');
    p.className = 'confetti-particle';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.left = (Math.random() * rect.width) + 'px';
    p.style.top  = (rect.height / 2) + 'px';
    p.style.setProperty('--cx', (Math.random() - 0.5) * 110 + 'px');
    p.style.setProperty('--cy', -(Math.random() * 70 + 25) + 'px');
    el.appendChild(p);
    setTimeout(function() { p.remove(); }, 600);
  }
}

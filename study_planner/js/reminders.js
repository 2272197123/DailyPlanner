/* ═══════════════════════════════════════
   reminders.js — Browser notification scheduling
   ═══════════════════════════════════════ */
'use strict';

let _reminderInterval = null;

function requestNotif() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function scheduleReminderCheck() {
  if (_reminderInterval) return;
  _reminderInterval = setInterval(checkReminders, 60000);
  checkReminders();
}

function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  const today = toLocalDate(now);
  store.tasks.forEach(t => {
    if (t.completed || !t.reminder || !t.dueDate || t.dueDate !== today || !t.dueTime) return;
    const [th, tm] = t.dueTime.split(':').map(Number);
    const diff = th * 60 + tm - (now.getHours() * 60 + now.getMinutes());
    if (diff >= 0 && diff <= 5) {
      const k = `rm_${t.id}_${today}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
      new Notification('⏰ 任务提醒', { body: `${t.title} — ${t.dueTime}`, tag: t.id, requireInteraction: true });
    }
  });
}

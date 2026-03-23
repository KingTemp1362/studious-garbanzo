// ── Storage ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'schedule_events';

function loadEvents() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function saveEvents(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

// events = { "2024-03-15": [ { id, title, time, note, sortKey }, ... ], ... }
let events = loadEvents();

// ── Date Utilities ────────────────────────────────────────────────────────────
function toKey(date) {
  return date.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function todayKey() { return toKey(new Date()); }

function parseRelativeDate(str) {
  const s = str.toLowerCase().trim();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (/\btoday\b/.test(s)) return new Date(today);
  if (/\btomorrow\b/.test(s)) { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }
  if (/\byesterday\b/.test(s)) { const d = new Date(today); d.setDate(d.getDate() - 1); return d; }

  const nextMatch = s.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (nextMatch) return nextWeekday(today, nextMatch[1]);

  const thisMatch = s.match(/\b(?:this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (thisMatch) return nextOrThisWeekday(today, thisMatch[1]);

  const inDays = s.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDays) { const d = new Date(today); d.setDate(d.getDate() + parseInt(inDays[1])); return d; }

  // "March 15", "15th March", "3/15", "03-15" etc.
  const explicit = parseExplicitDate(s, today.getFullYear());
  if (explicit) return explicit;

  return new Date(today); // default: today
}

function parseExplicitDate(s, year) {
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  for (let i = 0; i < months.length; i++) {
    const re = new RegExp(`(${months[i]})\\s+(\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})(?:st|nd|rd|th)?\\s+${months[i]}`);
    const m = s.match(re);
    if (m) {
      const day = parseInt(m[2] || m[3]);
      let d = new Date(year, i, day);
      if (d < new Date()) d.setFullYear(year + 1); // auto-next-year if passed
      return d;
    }
  }
  // MM/DD or MM-DD
  const slashMatch = s.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (slashMatch) {
    const mo = parseInt(slashMatch[1]) - 1;
    const da = parseInt(slashMatch[2]);
    const yr = slashMatch[3] ? parseInt(slashMatch[3].length === 2 ? '20' + slashMatch[3] : slashMatch[3]) : year;
    return new Date(yr, mo, da);
  }
  return null;
}

const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function nextWeekday(from, name) {
  const target = WEEKDAYS.indexOf(name);
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== target) d.setDate(d.getDate() + 1);
  return d;
}

function nextOrThisWeekday(from, name) {
  const target = WEEKDAYS.indexOf(name);
  const d = new Date(from);
  if (d.getDay() === target) return d;
  return nextWeekday(from, name);
}

function parseTime(str) {
  // Returns { display: "3:00 PM", sortKey: "15:00" } or null
  const s = str.toLowerCase();

  const match = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (match) {
    let h = parseInt(match[1]);
    const m = match[2] ? parseInt(match[2]) : 0;
    const period = match[3];
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    return {
      display: formatTime(h, m),
      sortKey: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
    };
  }

  // 24h: "14:30" or "9:00"
  const h24 = s.match(/\b(\d{1,2}):(\d{2})\b/);
  if (h24) {
    const h = parseInt(h24[1]);
    const m = parseInt(h24[2]);
    return {
      display: formatTime(h, m),
      sortKey: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
    };
  }

  // word times
  if (/\bnoon\b/.test(s)) return { display: '12:00 PM', sortKey: '12:00' };
  if (/\bmidnight\b/.test(s)) return { display: '12:00 AM', sortKey: '00:00' };
  if (/\bmorning\b/.test(s)) return { display: 'Morning', sortKey: '08:00' };
  if (/\bafternoon\b/.test(s)) return { display: 'Afternoon', sortKey: '13:00' };
  if (/\bevening\b/.test(s)) return { display: 'Evening', sortKey: '18:00' };
  if (/\bnight\b/.test(s)) return { display: 'Night', sortKey: '20:00' };

  return null;
}

function formatTime(h, m) {
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${period}`;
}

function formatDateFull(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDateShort(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDayName(date) {
  const key = toKey(date);
  const tk  = todayKey();
  const d = new Date(date); d.setDate(d.getDate() + 1);
  const tmk = toKey(d);
  if (key === tk) return 'Today';
  if (key === tmk.slice(0,10)) {
    // compare properly
  }
  // yesterday/tomorrow
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((date - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

// ── Intent Parser ─────────────────────────────────────────────────────────────
function parseIntent(input) {
  const s = input.toLowerCase().trim();

  // SHOW / VIEW
  if (/\b(show|view|what'?s?|check|see|list)\b/.test(s) && !/\badd\b/.test(s)) {
    if (/\b(all|upcoming|future|everything)\b/.test(s)) return { type: 'list_all' };
    return { type: 'view', date: parseRelativeDate(s) };
  }

  // REMOVE / DELETE / CANCEL
  if (/\b(remove|delete|cancel|clear)\b/.test(s)) {
    const date = parseRelativeDate(s);
    // strip command words to extract title
    const title = s
      .replace(/\b(remove|delete|cancel|clear)\b/, '')
      .replace(/\b(on|from|for)\b.*$/, '')
      .replace(/\b(today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|this)\b.*$/, '')
      .trim();
    return { type: 'remove', title, date };
  }

  // ADD (default)
  const date = parseRelativeDate(s);
  const timeObj = parseTime(s);

  // Extract title: strip time/date/command words
  let title = input
    .replace(/\b(add|schedule|create|put|set up|remind me(?: (to|about))?)\b/gi, '')
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)/gi, '')
    .replace(/\bat\s+(?:noon|midnight|morning|afternoon|evening|night)/gi, '')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
    .replace(/\b(today|tomorrow|yesterday)\b/gi, '')
    .replace(/\bnext\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b(?:this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b(?:on|for|at|in)\b/gi, '')
    .replace(/\bin\s+\d+\s+days?\b/gi, '')
    .replace(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi, '')
    .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!title) title = 'Event';

  return { type: 'add', title, date, timeObj };
}

// ── Event CRUD ────────────────────────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2, 9); }

function addEvent(title, date, timeObj, note = '') {
  const key = toKey(date);
  if (!events[key]) events[key] = [];
  const ev = {
    id: genId(),
    title: capitalize(title),
    time: timeObj ? timeObj.display : 'All day',
    sortKey: timeObj ? timeObj.sortKey : '00:00',
    note
  };
  events[key].push(ev);
  events[key].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  saveEvents(events);
  return ev;
}

function removeEvent(title, date) {
  const key = toKey(date);
  if (!events[key]) return null;
  const idx = events[key].findIndex(e => e.title.toLowerCase().includes(title.toLowerCase()));
  if (idx === -1) return null;
  const [removed] = events[key].splice(idx, 1);
  if (events[key].length === 0) delete events[key];
  saveEvents(events);
  return removed;
}

function getEventsForDate(date) {
  return events[toKey(date)] || [];
}

function getAllUpcoming() {
  const today = toKey(new Date());
  return Object.entries(events)
    .filter(([k]) => k >= today)
    .sort(([a], [b]) => a.localeCompare(b));
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Response Generator ────────────────────────────────────────────────────────
function generateResponse(intent) {
  switch (intent.type) {
    case 'add': {
      const ev = addEvent(intent.title, intent.date, intent.timeObj);
      const dayStr = formatDayName(intent.date);
      const dateStr = formatDateShort(intent.date);
      const timeStr = ev.time;
      return `Got it! I've added <b>${ev.title}</b> on <b>${dayStr}, ${dateStr}</b> at <b>${timeStr}</b>.`;
    }
    case 'remove': {
      const removed = removeEvent(intent.title, intent.date);
      if (!removed) {
        const dayStr = formatDayName(intent.date);
        return `I couldn't find an event matching "<b>${intent.title}</b>" on ${dayStr}. Check the schedule on the left and try again.`;
      }
      return `Done! Removed <b>${removed.title}</b> from the schedule.`;
    }
    case 'view': {
      const evs = getEventsForDate(intent.date);
      const dayStr = formatDayName(intent.date);
      const dateStr = formatDateFull(intent.date);
      if (evs.length === 0) return `Nothing scheduled for <b>${dayStr}</b> (${dateStr}).`;
      const list = evs.map(e => `• <b>${e.time}</b> — ${e.title}`).join('<br>');
      return `Here's <b>${dayStr}</b> (${dateStr}):<br><br>${list}`;
    }
    case 'list_all': {
      const upcoming = getAllUpcoming();
      if (upcoming.length === 0) return `No upcoming events scheduled.`;
      let out = `Here are all your upcoming events:<br><br>`;
      for (const [key, evs] of upcoming) {
        const d = new Date(key + 'T00:00:00');
        out += `<b>${formatDayName(d)}, ${formatDateShort(d)}</b><br>`;
        out += evs.map(e => `&nbsp;&nbsp;• ${e.time} — ${e.title}`).join('<br>') + '<br><br>';
      }
      return out.trim();
    }
    default:
      return `I'm not sure what you mean. Try: "Add meeting at 2pm tomorrow" or "What's on Friday?"`;
  }
}

// ── UI: Day View ──────────────────────────────────────────────────────────────
let viewDate = new Date();
viewDate.setHours(0, 0, 0, 0);

function renderDayView() {
  const evs = getEventsForDate(viewDate);
  const now = new Date();

  document.getElementById('day-label').textContent = formatDayName(viewDate);
  document.getElementById('date-label').textContent = viewDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const list = document.getElementById('schedule-list');
  if (evs.length === 0) {
    list.innerHTML = '<p class="empty-msg">No events — ask me to add one!</p>';
    return;
  }

  list.innerHTML = evs.map(ev => {
    const isPast = viewDate < now && toKey(viewDate) !== todayKey()
      ? true
      : (toKey(viewDate) === todayKey() && ev.sortKey < `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
    return `
      <div class="event-card${isPast ? ' past' : ''}" data-id="${ev.id}">
        <div class="event-info">
          <div class="event-time">${ev.time}</div>
          <div class="event-title">${ev.title}</div>
          ${ev.note ? `<div class="event-note">${ev.note}</div>` : ''}
        </div>
        <button class="delete-btn" data-key="${toKey(viewDate)}" data-id="${ev.id}" title="Remove">×</button>
      </div>`;
  }).join('');

  // Delete buttons
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (!events[key]) return;
      events[key] = events[key].filter(e => e.id !== btn.dataset.id);
      if (events[key].length === 0) delete events[key];
      saveEvents(events);
      renderDayView();
      appendBotMessage('Event removed.');
    });
  });
}

// ── UI: Chat ──────────────────────────────────────────────────────────────────
function appendMessage(text, role) {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `<div class="bubble">${text}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function appendBotMessage(text) { appendMessage(text, 'bot'); }
function appendUserMessage(text) { appendMessage(escapeHtml(text), 'user'); }

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Event Listeners ───────────────────────────────────────────────────────────
document.getElementById('chat-form').addEventListener('submit', e => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  appendUserMessage(text);

  const intent = parseIntent(text);
  const response = generateResponse(intent);
  appendBotMessage(response);

  // Navigate sidebar to relevant date
  if (intent.type === 'add' || intent.type === 'view') {
    viewDate = new Date(intent.date);
  }
  renderDayView();
});

document.getElementById('prev-day').addEventListener('click', () => {
  viewDate.setDate(viewDate.getDate() - 1);
  renderDayView();
});

document.getElementById('next-day').addEventListener('click', () => {
  viewDate.setDate(viewDate.getDate() + 1);
  renderDayView();
});

document.getElementById('today-btn').addEventListener('click', () => {
  viewDate = new Date();
  viewDate.setHours(0, 0, 0, 0);
  renderDayView();
});

// ── Init ──────────────────────────────────────────────────────────────────────
renderDayView();

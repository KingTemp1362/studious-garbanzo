// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL = 'claude-opus-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const STORAGE_KEY_KEY = 'schedule_api_key';
const STORAGE_SCHEDULE_KEY = 'schedule_events_v2';
const STORAGE_HISTORY_KEY = 'schedule_history_v2';

const SYSTEM_PROMPT = `You are a holistic daily schedule optimizer for a high-performance masculine male. The user is on a testosterone protocol running approximately 2000ng/dL — an enhanced athlete / TRT optimization protocol. Your role is to help him build and refine his optimal daily schedule.

## YOUR CONTEXT AND KNOWLEDGE BASE

**Hormonal Timing:**
- Cortisol awakening response (CAR) peaks ~30-45min post-wake — use this window for high-focus cognitive work, NOT max-effort training
- Testosterone peaks mid-morning for optimized individuals; maintain favorable T:Cortisol ratio throughout day
- Growth hormone primary pulse occurs 60-90min into deep sleep (NREM3) — protect 8-9hr sleep window
- Cold exposure (AM): stimulates norepinephrine, testosterone response; do within 60min of waking
- Blue light avoidance 90min pre-bed preserves melatonin onset

**Training Optimization:**
- Optimal resistance training window: 2–5 hours post-wake (after cortisol settles, T still elevated)
- Avoid heavy training within 3 hours of sleep — elevated cortisol delays sleep onset
- Pre-workout nutrition: carbs + moderate protein 60–90min before; stimulants 30–45min before
- Post-workout anabolic window: 30–60 min — 40–60g protein + fast carbs is priority for enhanced athletes
- Training fasted (AM) can work if cardio/conditioning; heavy compound work benefits from fed state

**Nutrition Timing for Enhanced Athletes:**
- Minimum 40g protein per meal to maximally stimulate MPS (muscle protein synthesis)
- Protein distribution: every 3–5 hours, 40–60g per sitting
- Pre-sleep protein: 30–40g casein or cottage cheese for overnight MPS
- Dietary fat non-negotiable for hormone synthesis — include with at least 2 meals
- Carbohydrates: cluster around training windows; reduce later in day unless pre-bed glucose helps sleep
- Total protein target: 1.2–1.6g/lb bodyweight for enhanced athletes

**Supplementation Timing:**
- Morning (with food/fats): Vitamin D3 + K2, Fish Oil/Omega-3
- Pre-workout (30–45min prior): Creatine (if not taken AM), Pre-workout stimulants
- Post-workout: Creatine (if not taken earlier), protein
- Pre-sleep (60min before bed): Zinc (empty stomach or light food), Magnesium Glycinate, Vitamin C, any testosterone-support compounds

**Recovery Protocols:**
- Cold water immersion / contrast therapy: ideally AM, avoids suppressing post-training inflammation response if done right after training
- Sauna: post-training or evening (heat shock proteins, GH stimulus); not within 2hr of sleep
- Walking / Zone 2 / active recovery: any time, but post-meal walks improve insulin sensitivity
- Sleep environment: 65–68°F (18–20°C), complete darkness, no screens 90min prior

**Masculine Performance Structure:**
- First 90min post-wake: "Golden Hour" — cold exposure, sunlight, no phone, high-focus task or journaling
- Deep work blocks: 90–120min uninterrupted (ultradian rhythm); schedule 2–3 per day
- Decision fatigue compounds throughout day — schedule most important work and decisions AM
- Evening: protect recovery window; wind-down, low stimulation, no new high-stress inputs after 8pm

## YOUR BEHAVIOR

When the user tells you about their activities, routines, and lifestyle:
1. Call the \`update_schedule\` tool with well-timed events based on what they've shared
2. In your conversational response: acknowledge their inputs, explain the timing rationale, and ask smart follow-up questions to fill gaps in the schedule
3. As the picture builds, proactively suggest what's missing (e.g., if they mention training but no post-workout nutrition, flag it)
4. Build the schedule progressively — don't overwhelm with suggestions, guide them through it

Be direct, knowledgeable, and efficient. No fluff. Reference specific protocol considerations where relevant.`;

const TOOLS = [
  {
    name: 'update_schedule',
    description: 'Add or update events in the daily schedule. Call this whenever the user shares information about their routine, activities, or when you want to place an optimized event on the timeline.',
    input_schema: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          description: 'List of events to add to the schedule',
          items: {
            type: 'object',
            properties: {
              time: {
                type: 'string',
                description: 'Time in HH:MM 24-hour format, e.g. "06:30"'
              },
              title: {
                type: 'string',
                description: 'Short, clear event title, e.g. "Heavy Compound Training", "Protein + Carb Meal", "Cold Shower"'
              },
              category: {
                type: 'string',
                enum: ['morning_protocol', 'training', 'nutrition', 'recovery', 'work', 'sleep', 'supplementation', 'evening_protocol', 'other'],
                description: 'Category of the event'
              },
              duration_min: {
                type: 'number',
                description: 'Duration in minutes (optional)'
              },
              notes: {
                type: 'string',
                description: 'Brief optimization note, e.g. "40g protein + 60g fast carbs post-training", "Cold exposure stimulates T and NE"'
              }
            },
            required: ['time', 'title', 'category']
          }
        }
      },
      required: ['events']
    }
  }
];

const CATEGORY_META = {
  morning_protocol: { label: 'Morning', color: '#d4a843' },
  training:         { label: 'Training', color: '#e05c4e' },
  nutrition:        { label: 'Nutrition', color: '#5caa6f' },
  recovery:         { label: 'Recovery', color: '#4f9de0' },
  work:             { label: 'Work', color: '#9b7fe8' },
  sleep:            { label: 'Sleep', color: '#3a6aaa' },
  supplementation:  { label: 'Supps', color: '#4fbfb5' },
  evening_protocol: { label: 'Evening', color: '#7b6da8' },
  other:            { label: 'Other', color: '#5c6080' }
};

// ── State ─────────────────────────────────────────────────────────────────────

let apiKey = '';
let scheduleEvents = [];    // { id, time, sortKey, title, category, duration_min, notes }
let conversationHistory = []; // { role, content } — full messages array for API

// ── Storage ───────────────────────────────────────────────────────────────────

function loadState() {
  apiKey = localStorage.getItem(STORAGE_KEY_KEY) || '';
  try { scheduleEvents = JSON.parse(localStorage.getItem(STORAGE_SCHEDULE_KEY)) || []; } catch { scheduleEvents = []; }
  try { conversationHistory = JSON.parse(localStorage.getItem(STORAGE_HISTORY_KEY)) || []; } catch { conversationHistory = []; }
}

function saveSchedule() { localStorage.setItem(STORAGE_SCHEDULE_KEY, JSON.stringify(scheduleEvents)); }
function saveHistory()  { localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(conversationHistory)); }
function saveKey(k)     { apiKey = k; localStorage.setItem(STORAGE_KEY_KEY, k); }

// ── Schedule Logic ────────────────────────────────────────────────────────────

function timeToSortKey(timeStr) {
  // "06:30" → "0630"
  return (timeStr || '00:00').replace(':', '');
}

function addOrUpdateEvents(events) {
  for (const ev of events) {
    const id = `${ev.time}-${ev.title}`.replace(/\s+/g, '-').toLowerCase();
    const existing = scheduleEvents.findIndex(e => e.id === id);
    const entry = {
      id,
      time: ev.time,
      sortKey: timeToSortKey(ev.time),
      title: ev.title,
      category: ev.category || 'other',
      duration_min: ev.duration_min || null,
      notes: ev.notes || ''
    };
    if (existing >= 0) scheduleEvents[existing] = entry;
    else scheduleEvents.push(entry);
  }
  scheduleEvents.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  saveSchedule();
}

function clearSchedule() {
  scheduleEvents = [];
  saveSchedule();
}

// ── Render Schedule ───────────────────────────────────────────────────────────

function renderSchedule() {
  const empty = document.getElementById('timeline-empty');
  const list  = document.getElementById('timeline-list');

  if (scheduleEvents.length === 0) {
    empty.classList.remove('hidden');
    list.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  empty.classList.add('hidden');
  list.classList.remove('hidden');

  list.innerHTML = scheduleEvents.map((ev, i) => {
    const meta  = CATEGORY_META[ev.category] || CATEGORY_META.other;
    const color = meta.color;
    const label = meta.label;
    const isLast = i === scheduleEvents.length - 1;

    const durationStr = ev.duration_min ? `${ev.duration_min}min` : '';
    const metaParts = [durationStr, ev.notes].filter(Boolean);

    return `
      <div class="tl-item">
        <div class="tl-connector">
          <div class="tl-dot" style="background:${color}"></div>
          ${isLast ? '' : '<div class="tl-line"></div>'}
        </div>
        <div class="tl-content cat-${ev.category}">
          <div class="tl-time" style="color:${color}">${ev.time}</div>
          <div class="tl-name">${escHtml(ev.title)}</div>
          ${metaParts.length ? `<div class="tl-meta">${escHtml(metaParts.join(' · '))}</div>` : ''}
          <span class="tl-badge" style="background:${color}22;color:${color}">${label}</span>
        </div>
      </div>`;
  }).join('');
}

// ── Claude API ────────────────────────────────────────────────────────────────

async function callClaude(messages) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  return data;
}

async function runConversation(userText) {
  setThinking(true);
  removeTypingIndicator();

  // Add user message to history
  conversationHistory.push({ role: 'user', content: userText });

  let messages = [...conversationHistory];
  let finalText = '';
  let loopCount = 0;

  try {
    while (loopCount < 5) {
      loopCount++;
      const data = await callClaude(messages);

      // Collect text from this response
      const textBlocks = (data.content || []).filter(b => b.type === 'text');
      if (textBlocks.length) {
        finalText += textBlocks.map(b => b.text).join('');
      }

      if (data.stop_reason === 'tool_use') {
        // Append assistant turn to messages
        messages.push({ role: 'assistant', content: data.content });

        // Process tool calls
        const toolUseBlocks = data.content.filter(b => b.type === 'tool_use');
        const toolResults = [];

        for (const tu of toolUseBlocks) {
          if (tu.name === 'update_schedule') {
            const events = tu.input?.events || [];
            if (events.length) {
              addOrUpdateEvents(events);
              renderSchedule();
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: `Schedule updated with ${events.length} event(s).`
            });
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: 'Tool executed.'
            });
          }
        }

        // Append tool results
        messages.push({ role: 'user', content: toolResults });
        continue; // loop again for final text response
      }

      // end_turn or other stop
      break;
    }

    // Save the full assistant response to history (last assistant turn)
    // Find the last assistant message we appended, or add the final text
    if (finalText) {
      // The conversation history should track the final assistant message
      conversationHistory.push({ role: 'assistant', content: finalText });
      saveHistory();
    }

    appendBotMessage(finalText || 'Done. Check the schedule on the left.');

  } catch (err) {
    const errMsg = err.message || 'Something went wrong.';
    appendBotMessage(`<b>Error:</b> ${escHtml(errMsg)}<br><small>Check your API key or try again.</small>`);
    setStatus('error');
    // Remove last user message from history on error
    conversationHistory.pop();
    setTimeout(() => setStatus('idle'), 3000);
  } finally {
    setThinking(false);
  }
}

// ── Chat UI ───────────────────────────────────────────────────────────────────

function appendMessage(html, role) {
  const msgs = document.getElementById('chat-messages');
  const div  = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML  = `<div class="bubble">${html}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function appendBotMessage(text) {
  // Convert basic markdown-ish formatting
  const html = formatText(text);
  appendMessage(html, 'bot');
}

function appendUserMessage(text) {
  appendMessage(escHtml(text).replace(/\n/g, '<br>'), 'user');
}

function showTypingIndicator() {
  const msgs = document.getElementById('chat-messages');
  const div  = document.createElement('div');
  div.className = 'msg bot';
  div.id = 'typing-indicator-msg';
  div.innerHTML = `<div class="bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('typing-indicator-msg');
  if (el) el.remove();
}

function setThinking(on) {
  setStatus(on ? 'thinking' : 'idle');
  document.getElementById('send-btn').disabled = on;
  document.getElementById('chat-input').disabled = on;
  if (on) showTypingIndicator();
  else    removeTypingIndicator();
}

function setStatus(state) {
  const dot = document.getElementById('status-dot');
  dot.className = `status-dot ${state}`;
}

function formatText(text) {
  if (!text) return '';
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<b>$1</b>')
    .replace(/^[-•]\s+(.+)$/gm, '• $1')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Restore conversation from history ────────────────────────────────────────

function restoreChat() {
  if (!conversationHistory.length) return;
  const msgs = document.getElementById('chat-messages');
  // Clear default welcome message
  msgs.innerHTML = '';

  for (const msg of conversationHistory) {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      appendUserMessage(msg.content);
    } else if (msg.role === 'assistant' && typeof msg.content === 'string') {
      appendBotMessage(msg.content);
    }
  }
}

// ── Setup / API Key Flow ──────────────────────────────────────────────────────

function showSetup() {
  document.getElementById('setup-overlay').classList.remove('hidden');
  document.getElementById('api-key-input').focus();
}

function hideSetup() {
  document.getElementById('setup-overlay').classList.add('hidden');
}

// ── Auto-resize textarea ──────────────────────────────────────────────────────

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ── Init ──────────────────────────────────────────────────────────────────────

(function init() {
  loadState();

  const overlay    = document.getElementById('setup-overlay');
  const apiInput   = document.getElementById('api-key-input');
  const saveKeyBtn = document.getElementById('save-key-btn');
  const form       = document.getElementById('chat-form');
  const input      = document.getElementById('chat-input');
  const clearBtn   = document.getElementById('clear-schedule-btn');
  const changeBtn  = document.getElementById('change-key-btn');

  // Setup flow
  if (!apiKey) {
    showSetup();
  } else {
    hideSetup();
    restoreChat();
    renderSchedule();
  }

  saveKeyBtn.addEventListener('click', () => {
    const key = apiInput.value.trim();
    if (!key.startsWith('sk-')) {
      apiInput.style.borderColor = '#e05c4e';
      return;
    }
    apiInput.style.borderColor = '';
    saveKey(key);
    hideSetup();
    renderSchedule();
    restoreChat();
  });

  apiInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveKeyBtn.click();
  });

  changeBtn.addEventListener('click', () => {
    apiInput.value = apiKey;
    showSetup();
  });

  clearBtn.addEventListener('click', () => {
    if (!confirm('Clear all schedule events?')) return;
    clearSchedule();
    renderSchedule();
  });

  // Chat form
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !apiKey) return;
    input.value = '';
    input.style.height = 'auto';
    appendUserMessage(text);
    await runConversation(text);
  });

  // Shift+Enter for newline, Enter to send
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });

  input.addEventListener('input', () => autoResize(input));
})();

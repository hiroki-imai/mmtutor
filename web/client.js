const mermaid = window.mermaid;
const marked = window.marked;
const DOMPurify = window.DOMPurify;
const hljs = window.hljs;

const lessonEl = document.getElementById('lesson-content');
const textarea = document.getElementById('diagram-input');
const previewEl = document.getElementById('preview');
const errorBanner = document.getElementById('error-banner');
const statusEl = document.getElementById('status');
const topicSelect = document.getElementById('topic-select');
const themeToggle = document.getElementById('theme-toggle');
const verticalDivider = document.getElementById('splitter-vertical');
const horizontalDivider = document.getElementById('splitter-horizontal');
const layoutEl = document.querySelector('.layout');
const editorEl = document.querySelector('.editor');

let currentDiagram = '';
let lastSaved = '';
let currentTopic = getTopicFromUrl() ?? 'flow';
let currentTheme = 'light';
let savingTimer = null;
let renderTimer = null;
let renderToken = 0;
let prefersDarkMediaQuery;
const THEME_STORAGE_KEY = 'mmtutor-theme';

const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

const saveDebounced = debounce(saveDiagram, 300);

init();

async function init() {
  if (!lessonEl || !textarea || !topicSelect || !layoutEl || !editorEl || !themeToggle) {
    throw new Error('Required elements are missing in the document.');
  }
  initializeTheme(loadInitialTheme());
  await populateTopics();
  topicSelect.value = currentTopic;
  attachEventListeners();
  setupSplitters();
  setupThemeToggle();
  await Promise.all([loadLesson(currentTopic), loadDiagram()]);
  updateUrl(currentTopic);
  openEventStream();
}

function initializeTheme(theme) {
  currentTheme = theme;
  document.body.dataset.theme = theme;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: theme === 'dark' ? 'dark' : 'default'
  });
  updateThemeToggle(theme);
}

function loadInitialTheme() {
  let stored;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    stored = null;
  }
  if (stored === 'dark' || stored === 'light') {
    return stored;
  }
  prefersDarkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  return prefersDarkMediaQuery.matches ? 'dark' : 'light';
}

function getTopicFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('topic');
}

async function populateTopics() {
  try {
    const res = await fetch('/api/topics');
    if (!res.ok) {
      throw new Error(`Failed to fetch topics: ${res.status}`);
    }
    const topics = await res.json();
    topicSelect.innerHTML = '';
    for (const entry of topics) {
      const option = document.createElement('option');
      option.value = entry.slug;
      option.textContent = entry.title;
      topicSelect.appendChild(option);
    }
  } catch (error) {
    console.error(error);
  }
}

function attachEventListeners() {
  textarea.addEventListener('input', (event) => {
    const value = event.target.value;
    currentDiagram = value;
    saveDebounced(value);
    scheduleRender(value);
    indicateSaving();
  });

  topicSelect.addEventListener('change', async (event) => {
    const newTopic = event.target.value;
    currentTopic = newTopic;
    await fetchLessonAndTemplate(newTopic);
    updateUrl(newTopic);
    await notifyTopicChange(newTopic);
  });
}

async function loadLesson(topic) {
  const res = await fetch(`/api/lesson?topic=${encodeURIComponent(topic)}`);
  if (!res.ok) {
    throw new Error('Lesson fetch failed');
  }
  const data = await res.json();
  const html = DOMPurify.sanitize(marked.parse(data.markdown));
  lessonEl.innerHTML = html;
  if (hljs?.highlightElement) {
    lessonEl.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
  }
  enhanceLessonCodeBlocks();
}

async function loadDiagram() {
  const res = await fetch('/api/diagram');
  if (!res.ok) {
    throw new Error('Diagram fetch failed');
  }
  const data = await res.json();
  currentDiagram = data.content;
  lastSaved = data.content;
  textarea.value = data.content;
  renderMermaid(data.content);
  setStatus('Ready');
}

async function fetchLessonAndTemplate(topic) {
  try {
    await loadLesson(topic);
    lessonEl.scrollTop = 0;
    const templateRes = await fetch(`/static/templates/${topic}.mmd`);
    if (templateRes.ok) {
      const content = await templateRes.text();
      textarea.value = content;
      currentDiagram = content;
      renderMermaid(content);
      await saveDiagram(content);
    }
  } catch (error) {
    console.error(error);
  }
}

async function notifyTopicChange(topic) {
  try {
    await fetch('/api/topic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic })
    });
  } catch (error) {
    console.error(error);
  }
}

async function saveDiagram(content) {
  try {
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const res = await fetch('/api/diagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: normalized })
    });
    if (!res.ok) {
      throw new Error('Failed to save');
    }
    lastSaved = normalized;
    currentDiagram = normalized;
    setStatus('Saved');
  } catch (error) {
    console.error(error);
    setStatus('Save failed');
  }
}

function scheduleRender(value) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => renderMermaid(value), 100);
}

function indicateSaving() {
  setStatus('Saving…');
}

function setStatus(text) {
  statusEl.textContent = text;
  clearTimeout(savingTimer);
  if (text === 'Saved') {
    savingTimer = setTimeout(() => {
      statusEl.textContent = '';
    }, 1500);
  }
}

function openEventStream() {
  const source = new EventSource('/events');

  source.addEventListener('open', () => {
    setStatus('Connected');
  });

  source.addEventListener('diagram', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (typeof payload.content !== 'string') return;
      if (payload.content === lastSaved) return;
      if (payload.content === textarea.value) return;
      currentDiagram = payload.content;
      textarea.value = payload.content;
      renderMermaid(payload.content);
      setStatus('Live update');
    } catch (error) {
      console.error(error);
    }
  });

  source.addEventListener('topic', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (!payload.topic) return;
      currentTopic = payload.topic;
      topicSelect.value = payload.topic;
      void loadLesson(payload.topic);
      updateUrl(payload.topic);
    } catch (error) {
      console.error(error);
    }
  });

  source.addEventListener('error', () => {
    setStatus('Disconnected');
  });
}

function renderMermaid(content) {
  if (!mermaid) return;
  if (!content?.trim()) {
    previewEl.innerHTML = '<p class="muted">Nothing to render yet.</p>';
    hideError();
    return;
  }
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const renderId = `diagram-${Date.now()}`;
  const token = ++renderToken;
  try {
    previewEl.innerHTML = '';
    mermaid.render(renderId, normalized).then(({ svg, bindFunctions }) => {
      if (token !== renderToken) {
        return;
      }
      previewEl.innerHTML = svg;
      if (bindFunctions) {
        bindFunctions(previewEl);
      }
      hideError();
    }).catch((error) => {
      showError(error);
    });
  } catch (error) {
    showError(error);
  }
}

function showError(error) {
  renderToken += 1;
  const message = error?.message || 'Mermaid render failed';
  errorBanner.textContent = message;
  errorBanner.hidden = false;
  previewEl.innerHTML = '<p class="muted">Preview unavailable due to an error.</p>';
}

function hideError() {
  errorBanner.hidden = true;
  errorBanner.textContent = '';
}

function updateUrl(topic) {
  const url = new URL(window.location.href);
  url.searchParams.set('topic', topic);
  window.history.replaceState({}, '', url);
}

function setupSplitters() {
  if (!verticalDivider || !horizontalDivider) {
    return;
  }

  const root = document.documentElement;
  let activeDrag = null;

  const cleanup = () => {
    if (activeDrag?.element) {
      activeDrag.element.classList.remove('dragging');
      if (activeDrag.element.hasPointerCapture?.(activeDrag.pointerId)) {
        activeDrag.element.releasePointerCapture(activeDrag.pointerId);
      }
    }
    activeDrag = null;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const handleVerticalMove = (clientX) => {
    const rect = layoutEl.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = clamp((clientX - rect.left) / rect.width, 0.25, 0.75);
    root.style.setProperty('--lesson-width', `${(ratio * 100).toFixed(2)}%`);
  };

  const handleHorizontalMove = (clientY) => {
    const rect = editorEl.getBoundingClientRect();
    if (!rect.height) return;
    const ratio = clamp((clientY - rect.top) / rect.height, 0.25, 0.8);
    root.style.setProperty('--editor-top-height', `${(ratio * 100).toFixed(2)}%`);
  };

  const onPointerMove = (event) => {
    if (!activeDrag) return;
    if (activeDrag.type === 'vertical') {
      handleVerticalMove(event.clientX);
    } else if (activeDrag.type === 'horizontal') {
      handleHorizontalMove(event.clientY);
    }
  };

  const startDrag = (event, type) => {
    if (type === 'vertical' && window.matchMedia('(max-width: 960px)').matches) {
      return;
    }
    event.preventDefault();
    const target = event.currentTarget;
    activeDrag = {
      type,
      pointerId: event.pointerId,
      element: target
    };
    target.classList.add('dragging');
    target.setPointerCapture(event.pointerId);
  };

  for (const divider of [verticalDivider, horizontalDivider]) {
    divider.addEventListener('pointerdown', (event) => {
      const type = divider === verticalDivider ? 'vertical' : 'horizontal';
      startDrag(event, type);
    });

    divider.addEventListener('pointermove', onPointerMove);
    divider.addEventListener('pointerup', cleanup);
    divider.addEventListener('pointercancel', cleanup);

    divider.addEventListener('keydown', (event) => {
      const isVertical = divider === verticalDivider;
      const step = event.shiftKey ? 6 : 3;
      const stacked = window.matchMedia('(max-width: 960px)').matches;
      if (isVertical && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        if (stacked) return;
        event.preventDefault();
        const current = parseFloat(getComputedStyle(root).getPropertyValue('--lesson-width')) || 45;
        const delta = event.key === 'ArrowLeft' ? -step : step;
        const next = clamp(current + delta, 25, 75);
        root.style.setProperty('--lesson-width', `${next}%`);
      } else if (!isVertical && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        const current = parseFloat(getComputedStyle(root).getPropertyValue('--editor-top-height')) || 55;
        const delta = event.key === 'ArrowUp' ? -step : step;
        const next = clamp(current + delta, 25, 80);
        root.style.setProperty('--editor-top-height', `${next}%`);
      }
    });
  }

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', cleanup);
  window.addEventListener('pointercancel', cleanup);
  window.addEventListener('resize', () => {
    // Ensure values stay within bounds after resize
    const lessonVal = parseFloat(getComputedStyle(root).getPropertyValue('--lesson-width')) || 45;
    const editorVal = parseFloat(getComputedStyle(root).getPropertyValue('--editor-top-height')) || 55;
    root.style.setProperty('--lesson-width', `${clamp(lessonVal, 25, 75)}%`);
    root.style.setProperty('--editor-top-height', `${clamp(editorVal, 25, 80)}%`);
  });
}

function setupThemeToggle() {
  if (!themeToggle) {
    return;
  }

  themeToggle.addEventListener('click', () => {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme, true);
  });

  if (!prefersDarkMediaQuery) {
    prefersDarkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  }

  const media = prefersDarkMediaQuery;
  if (media?.addEventListener) {
    media.addEventListener('change', handleSystemThemeChange);
  } else if (media?.addListener) {
    media.addListener(handleSystemThemeChange);
  }

  updateThemeToggle(currentTheme);
}

function handleSystemThemeChange(event) {
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    stored = null;
  }
  if (stored === 'dark' || stored === 'light') {
    return;
  }
  const nextTheme = event.matches ? 'dark' : 'light';
  setTheme(nextTheme, false);
}

function setTheme(theme, persist) {
  initializeTheme(theme);
  renderMermaid(currentDiagram);
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      // ignore storage errors
    }
  }
}

function updateThemeToggle(theme) {
  if (!themeToggle) return;
  const isDark = theme === 'dark';
  themeToggle.classList.toggle('is-dark', isDark);
  themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  const label = isDark ? 'ライトテーマに切り替え' : 'ダークテーマに切り替え';
  themeToggle.setAttribute('title', label);
}

function enhanceLessonCodeBlocks() {
  const preBlocks = lessonEl.querySelectorAll('pre');
  preBlocks.forEach((pre) => {
    if (pre.closest('.code-block')) {
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    pre.parentElement?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    button.textContent = 'コピー';
    button.setAttribute('aria-label', 'コードをコピー');

    button.addEventListener('click', async () => {
      const code = pre.innerText;
      const reset = () => {
        button.classList.remove('success');
        button.textContent = 'コピー';
      };
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
        } else {
          fallbackCopy(code);
        }
        button.classList.add('success');
        button.textContent = 'コピー済み';
      } catch (error) {
        console.error('Copy failed', error);
        button.textContent = '失敗';
      }
      setTimeout(reset, 1500);
    });

    wrapper.insertBefore(button, pre);
  });
}

function fallbackCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', 'true');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(area);
  }
}

const VISITED_SESSION_KEY = 'discovery-room:visited';
const QUESTION_JAR_STORAGE_KEY = 'discovery-room:question-jar';

export const MARBLE_COLORS = [
  '#f4b942',
  '#6ec6ca',
  '#e87a90',
  '#95d5b2',
  '#b892ff',
  '#f79d65'
];

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    }
  };
}

function getDefaultSessionStorage() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    // Ignore security errors in sandboxed contexts
  }
  return createMemoryStorage();
}

function getDefaultLocalStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore security errors in sandboxed contexts
  }
  return createMemoryStorage();
}

/**
 * Creates the storage manager for session-only visited marks,
 * localStorage Question Jar (with JSON export/import), and storage diagnostics.
 */
export function createStorage(options = {}) {
  const sessionStore = options.sessionStorage || getDefaultSessionStorage();
  const localStore = options.localStorage || getDefaultLocalStorage();
  const listeners = new Set();

  function readVisitedSet() {
    try {
      const raw = sessionStore.getItem(VISITED_SESSION_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === 'string')) : new Set();
    } catch {
      return new Set();
    }
  }

  function writeVisitedSet(set) {
    try {
      sessionStore.setItem(VISITED_SESSION_KEY, JSON.stringify([...set]));
    } catch {
      // Ignore quota errors
    }
  }

  const visitedSet = readVisitedSet();

  function markVisited(stopId) {
    if (typeof stopId !== 'string' || !stopId.trim()) return false;
    const had = visitedSet.has(stopId);
    visitedSet.add(stopId);
    writeVisitedSet(visitedSet);
    if (!had) {
      notify();
    }
    return !had;
  }

  function isVisited(stopId) {
    return visitedSet.has(stopId);
  }

  function getVisitedStopIds() {
    return [...visitedSet];
  }

  function clearVisited() {
    visitedSet.clear();
    try {
      sessionStore.removeItem(VISITED_SESSION_KEY);
    } catch {
      // Ignore
    }
    notify();
  }

  function normalizeQuestionEntry(entry, index = 0) {
    if (!entry || typeof entry !== 'object') return null;
    const text = typeof entry.text === 'string' ? entry.text.trim() : '';
    if (!text) return null;
    const id =
      typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim()
        : `q-${Date.now()}-${index}`;
    const createdAt =
      typeof entry.createdAt === 'string' && entry.createdAt.trim()
        ? entry.createdAt.trim()
        : new Date().toISOString();
    const color =
      typeof entry.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(entry.color)
        ? entry.color
        : MARBLE_COLORS[index % MARBLE_COLORS.length];
    return { id, text, createdAt, color };
  }

  function getQuestions() {
    try {
      const raw = localStore.getItem(QUESTION_JAR_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const normalized = [];
      for (let i = 0; i < parsed.length; i++) {
        const item = normalizeQuestionEntry(parsed[i], i);
        if (item) normalized.push(item);
      }
      return normalized;
    } catch {
      return [];
    }
  }

  function saveQuestions(questions) {
    try {
      localStore.setItem(QUESTION_JAR_STORAGE_KEY, JSON.stringify(questions));
    } catch {
      // Ignore quota errors
    }
    notify();
  }

  function addQuestion(text) {
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (!cleanText) return null;
    const current = getQuestions();
    const color = MARBLE_COLORS[current.length % MARBLE_COLORS.length];
    const entry = {
      id: `q-${Date.now()}-${current.length}`,
      text: cleanText,
      createdAt: new Date().toISOString(),
      color
    };
    current.push(entry);
    saveQuestions(current);
    return entry;
  }

  function removeQuestion(id) {
    const current = getQuestions();
    const filtered = current.filter((q) => q.id !== id);
    if (filtered.length !== current.length) {
      saveQuestions(filtered);
      return true;
    }
    return false;
  }

  function exportQuestionsJson() {
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      questions: getQuestions()
    };
    return JSON.stringify(payload, null, 2);
  }

  function importQuestionsJson(jsonString) {
    if (typeof jsonString !== 'string' || !jsonString.trim()) {
      throw new Error('Import JSON cannot be empty.');
    }
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error('Invalid JSON format.');
    }

    const rawList = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)
        ? parsed.questions
        : null;

    if (!rawList) {
      throw new Error('Expected an array of questions or an object with a "questions" array.');
    }

    const normalized = [];
    for (let i = 0; i < rawList.length; i++) {
      const item = normalizeQuestionEntry(rawList[i], i);
      if (!item) {
        throw new Error(`Question entry at index ${i} is missing valid text.`);
      }
      normalized.push(item);
    }

    saveQuestions(normalized);
    return normalized;
  }

  let persistRequested = false;

  async function requestPersistentStorage(navOverride) {
    let persisted = false;
    try {
      const nav =
        navOverride !== undefined
          ? navOverride
          : typeof navigator !== 'undefined'
            ? navigator
            : null;
      if (nav?.storage) {
        persistRequested = true;
        if (typeof nav.storage.persisted === 'function') {
          persisted = Boolean(await nav.storage.persisted());
        }
        if (!persisted && typeof nav.storage.persist === 'function') {
          persisted = Boolean(await nav.storage.persist());
        }
      }
    } catch {
      // Ignore storage permission errors
    }
    return persisted;
  }

  async function getStorageDiagnostics(navOverride) {
    let persisted = false;
    let usageBytes = 0;
    let quotaBytes = 0;

    try {
      const nav =
        navOverride !== undefined
          ? navOverride
          : typeof navigator !== 'undefined'
            ? navigator
            : null;
      if (nav?.storage) {
        if (typeof nav.storage.persisted === 'function') {
          persisted = Boolean(await nav.storage.persisted());
        }
        if (typeof nav.storage.estimate === 'function') {
          const est = await nav.storage.estimate();
          usageBytes = est?.usage ?? 0;
          quotaBytes = est?.quota ?? 0;
        }
      }
    } catch {
      // Ignore storage API errors
    }

    return {
      persisted,
      persistRequested,
      usageBytes,
      quotaBytes
    };
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function notify() {
    for (const listener of listeners) {
      listener({
        visited: getVisitedStopIds(),
        questions: getQuestions()
      });
    }
  }

  return {
    markVisited,
    isVisited,
    getVisitedStopIds,
    clearVisited,
    getQuestions,
    addQuestion,
    removeQuestion,
    exportQuestionsJson,
    importQuestionsJson,
    requestPersistentStorage,
    getStorageDiagnostics,
    subscribe
  };
}

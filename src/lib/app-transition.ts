const ACTIVE_APP_KEY = "cxyj-active-system-app";

type TransitionKind = "app-open" | "app-close" | "push" | "pop" | "tab";

interface ViewTransitionDocument extends Document {
  startViewTransition?: (update: () => void | Promise<void>) => {
    finished: Promise<void>;
  };
}

function setOrigin(element?: HTMLElement | null) {
  const root = document.documentElement;
  if (!element) {
    root.style.setProperty("--transition-origin-x", "50%");
    root.style.setProperty("--transition-origin-y", "78%");
    return;
  }

  const rect = element.getBoundingClientRect();
  root.style.setProperty("--transition-origin-x", `${rect.left + rect.width / 2}px`);
  root.style.setProperty("--transition-origin-y", `${rect.top + rect.height / 2}px`);
}

async function runTransition(kind: TransitionKind, update: () => void | Promise<void>) {
  const root = document.documentElement;
  const transitionDocument = document as ViewTransitionDocument;
  root.dataset.systemTransition = kind;

  if (!transitionDocument.startViewTransition) {
    root.classList.add("system-transition-fallback");
    await update();
    window.setTimeout(() => {
      delete root.dataset.systemTransition;
      root.classList.remove("system-transition-fallback");
    }, 430);
    return;
  }

  const transition = transitionDocument.startViewTransition(update);
  try {
    await transition.finished;
  } finally {
    delete root.dataset.systemTransition;
  }
}

export function openSystemApp(
  appId: string,
  source: HTMLElement | null,
  navigate: () => void | Promise<void>,
) {
  setOrigin(source);
  sessionStorage.setItem(ACTIVE_APP_KEY, appId);
  return runTransition("app-open", navigate);
}

export function closeSystemApp(appId: string, navigate: () => void | Promise<void>) {
  if (sessionStorage.getItem(ACTIVE_APP_KEY) !== appId) {
    return runTransition("pop", navigate);
  }

  sessionStorage.removeItem(ACTIVE_APP_KEY);
  return runTransition("app-close", navigate);
}

export function pushSystemPage(navigate: () => void | Promise<void>) {
  return runTransition("push", navigate);
}

export function popSystemPage(navigate: () => void | Promise<void>) {
  return runTransition("pop", navigate);
}

export function switchSystemTab(navigate: () => void | Promise<void>) {
  return runTransition("tab", navigate);
}

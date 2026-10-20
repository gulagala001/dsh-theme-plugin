const surfaces = {
  root: '[data-slot="root"]',
  sidebar: '[data-omd-surface="sidebar"],[data-slot="sidebar"]',
  conversation: '[data-omd-surface="conversation"],[class*="_centerCol"]',
  'session-header': '[data-slot="conversation.session.header"]',
  composer: '[data-composer-card]',
  details: '[data-rightbar-col]',
  settings: '[data-shortcut-modal="settings"]',
  overlay: '[data-shell-overlay],[data-slot="shell.overlay"]',
};
const parts = {
  'message-row': '[data-chat-flow-kind]', 'message-body': '[data-streaming]',
  scrollport: '[data-conversation-scroll]', 'composer-input': '[data-composer-input]',
  'composer-chip': '[data-decoration="chip"]', 'queue-dock': '[data-queue-dock]',
  'turn-tail': '[data-turn-tail]', 'resize-handle': '[data-side]', 'new-session': '[data-omd-nav-part="create"]',
};
export function semanticAdapter() {
  const owned = new Map();
  const refresh = () => {
    for (const [attribute, rules] of [['data-dsh-surface', surfaces], ['data-dsh-part', parts]]) for (const [value, selector] of Object.entries(rules)) {
      for (const el of document.querySelectorAll(selector)) {
        if (el.hasAttribute(attribute)) continue;
        el.setAttribute(attribute, value);
        if (!owned.has(el)) owned.set(el, new Map());
        owned.get(el).set(attribute, value);
      }
    }
  };
  let frame;
  const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(() => { frame = null; refresh(); }); });
  observer.observe(document.body, { childList: true, subtree: true }); refresh();
  return () => {
    observer.disconnect(); cancelAnimationFrame(frame);
    for (const [el, attrs] of owned) for (const [key, value] of attrs) if (el.getAttribute(key) === value) el.removeAttribute(key);
  };
}

import { useEffect, useRef } from 'react';
import { comboFromEvent, shortcuts, type KeyScope } from '@hyzerlines/design';

export type CommandHandlers = Record<string, () => void>;

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE.has(target.tagName) || target.isContentEditable;
}

/**
 * Binds the keyboard registry to a set of command handlers.
 *
 * All shortcut handling in the app funnels through here. The registry in
 * @hyzerlines/design is the only place a key combination is declared; this hook
 * just resolves combos to command ids and calls whatever handler is registered.
 * A command with no handler is simply inert, which is what lets the registry
 * reserve keys for tools that arrive in later PRs.
 *
 * Handlers are held in a ref so callers can pass inline closures without
 * re-binding the listener on every render.
 */
export function useShortcuts(
  handlers: CommandHandlers,
  activeScopes: KeyScope[] = ['global', 'map'],
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const scopesRef = useRef(activeScopes);
  scopesRef.current = activeScopes;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const typing = isTypingTarget(e.target);
      const combo = comboFromEvent(e);

      for (const shortcut of shortcuts) {
        // Holds are declared for the help overlay but need a keyup this
        // dispatcher never sees; whoever owns the mode binds both edges.
        if (shortcut.hold) continue;
        if (!scopesRef.current.includes(shortcut.scope)) continue;
        if (typing && !shortcut.allowInInput) continue;
        if (!shortcut.keys.includes(combo)) continue;

        const handler = handlersRef.current[shortcut.id];
        if (!handler) continue; // reserved but not yet implemented

        e.preventDefault();
        handler();
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

import { useSyncExternalStore } from "react";

/** Whether the global top-up dialog (ManagedTopUpDialog, mounted once in the root
 *  layout) is open. Module-level like use-managed-account, because the opener is
 *  not a component: the credits-exhausted toast action calls openManagedTopUp()
 *  from wherever the failing AI call happened. */
let open = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}

/** Open the dialog from anywhere – no-op when it already is. */
export function openManagedTopUp() {
  if (open) return;
  open = true;
  emit();
}

export function setManagedTopUpOpen(next: boolean) {
  if (open === next) return;
  open = next;
  emit();
}

/** Exported for tests and useSyncExternalStore – not for components. */
export function subscribeManagedTopUp(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getManagedTopUpOpen() {
  return open;
}

export function useManagedTopUp(): { open: boolean; setOpen: (next: boolean) => void } {
  const isOpen = useSyncExternalStore(subscribeManagedTopUp, getManagedTopUpOpen, getManagedTopUpOpen);
  return { open: isOpen, setOpen: setManagedTopUpOpen };
}

import { useSyncExternalStore } from "react";

let cycle = 0;
let advancing = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useCycle() {
  return useSyncExternalStore(
    subscribe,
    () => cycle,
    () => cycle,
  );
}

export function useAdvancing() {
  return useSyncExternalStore(
    subscribe,
    () => advancing,
    () => advancing,
  );
}

export async function advanceMonth() {
  if (advancing) return;
  advancing = true;
  emit();
  await new Promise((r) => setTimeout(r, 1000));
  cycle += 1;
  advancing = false;
  emit();
}

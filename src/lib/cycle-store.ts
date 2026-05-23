import { useSyncExternalStore } from "react";
import { advanceStripeMonth } from "@/lib/stripe.functions";

let cycle = 0;
let advancing = false;
let lastMessage: string | null = null;
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

export function useLastAdvanceMessage() {
  return useSyncExternalStore(
    subscribe,
    () => lastMessage,
    () => lastMessage,
  );
}

export async function advanceMonth() {
  if (advancing) return;
  advancing = true;
  emit();
  try {
    const result = await advanceStripeMonth();
    lastMessage = result.message;
  } catch (e) {
    lastMessage = `Advance failed: ${(e as Error).message}`;
  } finally {
    // Small UX delay so KPIs refetch after webhooks have written to DB
    await new Promise((r) => setTimeout(r, 1500));
    cycle += 1;
    advancing = false;
    emit();
  }
}

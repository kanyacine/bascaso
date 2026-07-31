import { proxyCloud } from "@/lib/managed/proxy";

/** Stripe billing portal session for the signed-in account. */
export function POST() {
  return proxyCloud("portal", "POST");
}

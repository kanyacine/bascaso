import { proxyCloud } from "@/lib/managed/proxy";

/** Pack and subscription prices, read from Stripe by the cloud backend.
 *
 *  The client used to carry them as literals marked "indicative, non-definitive",
 *  which meant the price a customer saw on the button and the price Stripe
 *  actually charged were two independent values that nothing kept in step. */
export function GET() {
  return proxyCloud("catalog");
}

import Link from "next/link";
import { FileSignature } from "lucide-react";

/**
 * Non-blocking heads-up that a Merchant Agreement is waiting to be signed.
 * Never gates ordering or any other dashboard action — just a nudge toward
 * Settings, where the full "Merchant agreement" section lives.
 */
export function AgreementReminderBanner() {
  return (
    <Link
      href="/dashboard/settings"
      className="flex items-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 text-sm px-4 py-2.5 transition-colors border-b border-purple-100"
    >
      <FileSignature size={15} strokeWidth={2.5} className="shrink-0" />
      <span className="font-medium">Your Merchant Agreement is ready to sign</span>
      <span className="text-purple-500">— review in Settings &rarr;</span>
    </Link>
  );
}

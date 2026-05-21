"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  restaurantId: string;
  senderId: string | null;
  senderStatus: "pending" | "approved" | "rejected" | null;
  requestedAt: string | null;
}

type Action = "register" | "approve" | "reject" | "reset";

const statusStyles: Record<string, string> = {
  approved: "bg-viridian-100 text-viridian-600",
  pending: "bg-jasmine-100 text-jasmine-600",
  rejected: "bg-cinnabar-100 text-cinnabar-500",
  none: "bg-black-100 text-black-500",
};

export function MerchantSmsSenderCard({
  restaurantId,
  senderId,
  senderStatus,
  requestedAt,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const statusLabel = senderStatus ?? "none";

  async function run(action: Action) {
    setError(null);
    const res = await fetch("/api/admin/merchants/sms-sender", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, action }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Request failed (${res.status})`);
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <div className="bg-white border border-black-100 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-black-900">SMS Sender ID (Sendchamp)</h3>
          <p className="text-xs text-black-500 mt-1">
            Per-restaurant sender name shown to customers on order SMS. Approval is set
            manually after checking the Sendchamp dashboard.
          </p>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[statusLabel]}`}
        >
          {statusLabel}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-black-500">Sender ID</dt>
          <dd className="font-mono text-black-900">{senderId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-black-500">Requested at</dt>
          <dd className="text-black-900">
            {requestedAt ? new Date(requestedAt).toLocaleString("en-NG") : "—"}
          </dd>
        </div>
      </dl>

      {error && (
        <div className="mt-3 text-xs text-cinnabar-500 bg-cinnabar-100 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!senderId && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run("register")}
            className="text-xs px-3 py-1.5 rounded-xl bg-purple-500 text-white hover:bg-purple-400 disabled:opacity-50"
          >
            Register with Sendchamp
          </button>
        )}
        {senderStatus === "pending" && (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run("approve")}
              className="text-xs px-3 py-1.5 rounded-xl bg-green-600 text-white hover:bg-green-500 disabled:opacity-50"
            >
              Mark approved
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run("reject")}
              className="text-xs px-3 py-1.5 rounded-xl bg-cinnabar-500 text-white hover:bg-cinnabar-400 disabled:opacity-50"
            >
              Mark rejected
            </button>
          </>
        )}
        {senderId && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run("reset")}
            className="text-xs px-3 py-1.5 rounded-xl border border-black-200 text-black-700 hover:bg-black-50 disabled:opacity-50"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

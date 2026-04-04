"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

type PaystackBank = { id: number; name: string; code: string };

export default function RestaurantBankingPage() {
  const { id } = useParams<{ id: string }>();

  const [banks, setBanks] = useState<PaystackBank[]>([]);
  const [banksLoaded, setBanksLoaded] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    bank_account_name: string;
    bank_account_number: string;
    paystack_recipient_code: string;
  } | null>(null);

  async function loadBanks() {
    if (banksLoaded) return;
    try {
      const res = await fetch("https://api.paystack.co/bank?country=nigeria&perPage=100");
      const data = await res.json();
      if (data.status) setBanks(data.data ?? []);
    } catch {
      // ignore
    }
    setBanksLoaded(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/restaurants/${id}/banking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank_code: bankCode, account_number: accountNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-extrabold text-black-900 mb-2">Bank Account</h1>
      <p className="text-black-500 text-sm mb-6">
        Register or update the bank account for restaurant <code className="bg-black-100 px-1 rounded">{id}</code>
      </p>

      {result ? (
        <div className="bg-viridian-50 border border-viridian-200 rounded-2xl px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-viridian-700">Bank account registered</p>
          <p className="text-sm text-black-900">{result.bank_account_name}</p>
          <p className="text-sm text-black-500">{result.bank_account_number}</p>
          <p className="text-xs text-black-400">Recipient: {result.paystack_recipient_code}</p>
          <button
            onClick={() => setResult(null)}
            className="text-sm text-purple-500 font-medium hover:underline"
          >
            Update again
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          onFocus={() => loadBanks()}
          className="bg-white rounded-2xl border border-black-200 px-4 py-4 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">Bank</label>
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500 bg-white"
            >
              <option value="">Select bank…</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">Account number</label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
              required
              maxLength={10}
              pattern="\d{10}"
              placeholder="10-digit NUBAN"
              className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
            />
          </div>
          {error && <p className="text-sm text-cinnabar-500">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {saving ? "Verifying…" : "Register bank account"}
          </button>
        </form>
      )}
    </div>
  );
}

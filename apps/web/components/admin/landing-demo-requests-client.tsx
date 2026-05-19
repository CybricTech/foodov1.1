"use client";

import { useState } from "react";
import { Inbox, Mail, Phone, Building2, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";

type DemoRequest = {
  id: string;
  name: string;
  restaurant_name: string;
  email: string;
  phone: string;
  message: string | null;
  status: "new" | "contacted" | "closed_won" | "closed_lost";
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

interface Props {
  initialRequests: DemoRequest[];
}

const STATUS_OPTIONS: { value: DemoRequest["status"]; label: string; tone: string }[] = [
  { value: "new", label: "New", tone: "bg-purple-100 text-purple-700" },
  { value: "contacted", label: "Contacted", tone: "bg-blue-100 text-blue-700" },
  { value: "closed_won", label: "Closed — won", tone: "bg-viridian-100 text-viridian-700" },
  { value: "closed_lost", label: "Closed — lost", tone: "bg-black-100 text-black-500" },
];

function toneFor(status: DemoRequest["status"]) {
  return STATUS_OPTIONS.find((o) => o.value === status)?.tone ?? "bg-black-100 text-black-500";
}

function labelFor(status: DemoRequest["status"]) {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function LandingDemoRequestsClient({ initialRequests }: Props) {
  const [requests, setRequests] = useState<DemoRequest[]>(initialRequests);
  const [filter, setFilter] = useState<"all" | DemoRequest["status"]>("all");
  const [selected, setSelected] = useState<DemoRequest | null>(null);
  const [updating, setUpdating] = useState(false);

  const filtered =
    filter === "all" ? requests : requests.filter((r) => r.status === filter);

  async function updateStatus(id: string, status: DemoRequest["status"]) {
    setUpdating(true);
    const res = await fetch(`/api/admin/landing/demo-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const { request: updated } = await res.json();
      setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setSelected(updated);
    }
    setUpdating(false);
  }

  async function updateNotes(id: string, notes: string) {
    const res = await fetch(`/api/admin/landing/demo-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    if (res.ok) {
      const { request: updated } = await res.json();
      setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
    }
  }

  const counts = STATUS_OPTIONS.reduce(
    (acc, opt) => ({ ...acc, [opt.value]: requests.filter((r) => r.status === opt.value).length }),
    {} as Record<DemoRequest["status"], number>
  );

  return (
    <div className="p-6 max-w-5xl">
      <Link
        href="/admin/landing"
        className="inline-flex items-center gap-2 text-sm text-black-500 hover:text-black-900 mb-4"
      >
        <ArrowLeft size={16} />
        Back to Landing
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Inbox size={20} className="text-purple-500" />
        <h1 className="text-2xl font-bold text-black-900">
          Demo Requests ({requests.length})
        </h1>
      </div>

      <div className="flex items-center gap-2 mb-4 overflow-x-auto">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label={`All (${requests.length})`}
        />
        {STATUS_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            active={filter === opt.value}
            onClick={() => setFilter(opt.value)}
            label={`${opt.label} (${counts[opt.value] ?? 0})`}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black-200 p-12 text-center">
          <Inbox size={32} className="text-black-300 mx-auto mb-3" />
          <p className="text-black-500 text-sm">No demo requests in this view.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          {filtered.map((req) => (
            <button
              key={req.id}
              onClick={() => setSelected(req)}
              className="w-full text-left flex items-start gap-4 px-4 py-4 border-b border-black-200 last:border-0 hover:bg-black-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <span className="text-purple-700 font-semibold text-sm">
                  {req.restaurant_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-black-900 truncate">
                    {req.restaurant_name}
                  </p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${toneFor(req.status)}`}
                  >
                    {labelFor(req.status)}
                  </span>
                </div>
                <p className="text-xs text-black-500 truncate">
                  {req.name} · {req.email}
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs text-black-500 flex-shrink-0">
                <Clock size={12} />
                {timeAgo(req.created_at)}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <DetailPanel
          request={selected}
          updating={updating}
          onClose={() => setSelected(null)}
          onUpdateStatus={(s) => updateStatus(selected.id, s)}
          onUpdateNotes={(n) => updateNotes(selected.id, n)}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-500 text-white whitespace-nowrap"
          : "px-3 py-1.5 rounded-full text-xs font-semibold text-black-500 hover:bg-black-100 whitespace-nowrap"
      }
    >
      {label}
    </button>
  );
}

function DetailPanel({
  request,
  updating,
  onClose,
  onUpdateStatus,
  onUpdateNotes,
}: {
  request: DemoRequest;
  updating: boolean;
  onClose: () => void;
  onUpdateStatus: (s: DemoRequest["status"]) => void;
  onUpdateNotes: (n: string) => void;
}) {
  const [notes, setNotes] = useState(request.notes ?? "");

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg md:rounded-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-black-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-black-900">{request.restaurant_name}</h2>
            <p className="text-xs text-black-500">
              {timeAgo(request.created_at)} · from {request.source}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-black-500 hover:text-black-900 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-black-500 mb-2">
              Contact
            </p>
            <div className="space-y-1.5 text-sm">
              <p className="flex items-center gap-2">
                <Building2 size={14} className="text-black-300" />
                {request.name}
              </p>
              <a
                href={`mailto:${request.email}`}
                className="flex items-center gap-2 text-purple-700 hover:underline"
              >
                <Mail size={14} className="text-black-300" />
                {request.email}
              </a>
              <a
                href={`tel:${request.phone}`}
                className="flex items-center gap-2 text-purple-700 hover:underline"
              >
                <Phone size={14} className="text-black-300" />
                {request.phone}
              </a>
            </div>
          </div>

          {request.message && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-black-500 mb-2">
                Message
              </p>
              <p className="text-sm text-black-900 bg-black-50 rounded-xl p-3 whitespace-pre-wrap">
                {request.message}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-black-500 mb-2">
              Status
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={updating}
                  onClick={() => onUpdateStatus(opt.value)}
                  className={
                    request.status === opt.value
                      ? `text-xs px-3 py-1.5 rounded-full font-semibold ${opt.tone}`
                      : "text-xs px-3 py-1.5 rounded-full font-medium text-black-500 border border-black-200 hover:bg-black-100"
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-black-500 mb-2">
              Notes (internal)
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (request.notes ?? "")) onUpdateNotes(notes);
              }}
              rows={4}
              placeholder="Add follow-up notes…"
              className="w-full bg-white border border-black-200 rounded-xl px-3 py-2 text-sm text-black-900 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { cn } from "@foodo/ui";

interface OrderStatusAnimationProps {
  status: string;
  size?: number;
  brandColor?: string;
  className?: string;
}

/* ── Shared pulse ring ─────────────────────────────────────────────── */
function PulseRing({ color, size }: { color: string; size: number }) {
  return (
    <span
      className="absolute inset-0 rounded-full animate-ping opacity-20"
      style={{ backgroundColor: color, width: size, height: size }}
    />
  );
}

/* ── Confirmed: ringing bell ──────────────────────────────────────── */
function ConfirmedAnimation({ size, brandColor }: { size: number; brandColor: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="animate-in fade-in zoom-in duration-500">
      <circle cx="32" cy="32" r="28" fill={brandColor} opacity="0.1" />
      <g className="origin-center" style={{ animation: "bell-ring 2s ease-in-out infinite" }}>
        <path d="M32 14c-1.1 0-2 .9-2 2v1.5c-4.8 1-8 5.2-8 10v8l-3 4h26l-3-4v-8c0-4.8-3.2-9-8-10V16c0-1.1-.9-2-2-2z" fill={brandColor} />
        <path d="M28 44c0 2.2 1.8 4 4 4s4-1.8 4-4" stroke={brandColor} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <style>{`
        @keyframes bell-ring {
          0%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(12deg); }
          20% { transform: rotate(-10deg); }
          30% { transform: rotate(8deg); }
          40% { transform: rotate(-6deg); }
          50% { transform: rotate(4deg); }
          60% { transform: rotate(-2deg); }
          70% { transform: rotate(1deg); }
          80% { transform: rotate(0deg); }
        }
      `}</style>
    </svg>
  );
}

/* ── Preparing: sizzling frying pan ───────────────────────────────── */
function PreparingAnimation({ size, brandColor }: { size: number; brandColor: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="animate-in fade-in zoom-in duration-500">
      <circle cx="32" cy="32" r="28" fill={brandColor} opacity="0.1" />
      {/* Pan */}
      <ellipse cx="32" cy="36" rx="16" ry="5" stroke={brandColor} strokeWidth="2.5" fill="none" />
      <ellipse cx="32" cy="34" rx="16" ry="5" fill={brandColor} opacity="0.15" />
      <path d="M46 34h10" stroke={brandColor} strokeWidth="2.5" strokeLinecap="round" />
      {/* Steam / sizzle particles */}
      <g style={{ animation: "sizzle 1.4s ease-in-out infinite" }}>
        <circle cx="26" cy="26" r="1.5" fill={brandColor} opacity="0.7" />
        <circle cx="32" cy="22" r="2" fill={brandColor} opacity="0.5" />
        <circle cx="38" cy="25" r="1.5" fill={brandColor} opacity="0.6" />
      </g>
      <g style={{ animation: "sizzle 1.4s ease-in-out 0.35s infinite" }}>
        <circle cx="28" cy="24" r="1.2" fill={brandColor} opacity="0.5" />
        <circle cx="35" cy="20" r="1.8" fill={brandColor} opacity="0.4" />
        <circle cx="30" cy="27" r="1" fill={brandColor} opacity="0.6" />
      </g>
      <style>{`
        @keyframes sizzle {
          0% { transform: translateY(0) scale(1); opacity: 0.8; }
          50% { opacity: 0.4; }
          100% { transform: translateY(-10px) scale(0.5); opacity: 0; }
        }
      `}</style>
    </svg>
  );
}

/* ── Ready for pickup: package with check ─────────────────────────── */
function ReadyAnimation({ size, brandColor }: { size: number; brandColor: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="animate-in fade-in zoom-in duration-500">
      <circle cx="32" cy="32" r="28" fill={brandColor} opacity="0.1" />
      <rect x="18" y="22" width="28" height="24" rx="3" stroke={brandColor} strokeWidth="2.5" fill="none" />
      <path d="M18 28h28" stroke={brandColor} strokeWidth="2" />
      <path d="M28 22v-4a4 4 0 018 0v4" stroke={brandColor} strokeWidth="2" fill="none" />
      <g style={{ animation: "check-pop 2s ease-in-out infinite" }}>
        <path d="M26 34l4 4 8-8" stroke={brandColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <style>{`
        @keyframes check-pop {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>
    </svg>
  );
}

/* ── In transit: moving bike ──────────────────────────────────────── */
function TransitAnimation({ size, brandColor }: { size: number; brandColor: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="animate-in fade-in zoom-in duration-500">
      <circle cx="32" cy="32" r="28" fill={brandColor} opacity="0.1" />
      {/* Road */}
      <line x1="8" y1="46" x2="56" y2="46" stroke={brandColor} strokeWidth="2" opacity="0.3" strokeDasharray="4 4" style={{ animation: "road-move 0.8s linear infinite" }} />
      {/* Bike body */}
      <g style={{ animation: "bike-bounce 0.6s ease-in-out infinite" }}>
        <circle cx="20" cy="40" r="5" stroke={brandColor} strokeWidth="2" fill="none" />
        <circle cx="42" cy="40" r="5" stroke={brandColor} strokeWidth="2" fill="none" />
        <path d="M20 40l8-12 6 4-4 8" stroke={brandColor} strokeWidth="2" fill="none" strokeLinejoin="round" />
        <path d="M34 32l8-2v10h-6" stroke={brandColor} strokeWidth="2" fill="none" strokeLinejoin="round" />
        {/* Package on back */}
        <rect x="40" y="26" width="8" height="7" rx="1" stroke={brandColor} strokeWidth="1.5" fill="none" />
      </g>
      <style>{`
        @keyframes road-move {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -16; }
        }
        @keyframes bike-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
      `}</style>
    </svg>
  );
}

/* ── Delivered: celebration check ─────────────────────────────────── */
function DeliveredAnimation({ size, brandColor }: { size: number; brandColor: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="animate-in fade-in zoom-in duration-500">
      <circle cx="32" cy="32" r="28" fill={brandColor} opacity="0.1" />
      <circle cx="32" cy="32" r="20" fill={brandColor} opacity="0.9" />
      <path d="M24 32l6 6 10-12" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" style={{ animation: "check-draw 0.8s ease-out forwards" }} />
      {/* Confetti particles */}
      <g style={{ animation: "confetti-fall 2s ease-in-out infinite" }}>
        <rect x="14" y="12" width="3" height="3" rx="0.5" fill={brandColor} opacity="0.7" />
        <rect x="48" y="16" width="3" height="3" rx="0.5" fill={brandColor} opacity="0.5" />
        <circle cx="12" cy="28" r="1.5" fill={brandColor} opacity="0.6" />
        <circle cx="52" cy="30" r="2" fill={brandColor} opacity="0.4" />
      </g>
      <style>{`
        @keyframes check-draw {
          0% { stroke-dasharray: 0 30; }
          100% { stroke-dasharray: 30 30; }
        }
        @keyframes confetti-fall {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.8; }
          50% { transform: translateY(6px) rotate(15deg); opacity: 0.4; }
        }
      `}</style>
    </svg>
  );
}

/* ── Cancelled: X mark ────────────────────────────────────────────── */
function CancelledAnimation({ size, brandColor: _brandColor }: { size: number; brandColor: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="animate-in fade-in zoom-in duration-500">
      <circle cx="32" cy="32" r="28" fill="#EF4444" opacity="0.1" />
      <circle cx="32" cy="32" r="20" fill="#EF4444" opacity="0.9" />
      <path d="M24 24l16 16M40 24l-16 16" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ── Pending: waiting clock ───────────────────────────────────────── */
function PendingAnimation({ size, brandColor }: { size: number; brandColor: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="animate-in fade-in zoom-in duration-500">
      <circle cx="32" cy="32" r="28" fill={brandColor} opacity="0.1" />
      <circle cx="32" cy="32" r="18" stroke={brandColor} strokeWidth="2.5" fill="none" />
      <line x1="32" y1="20" x2="32" y2="32" stroke={brandColor} strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 2s linear infinite", transformOrigin: "32px 32px" }} />
      <line x1="32" y1="32" x2="40" y2="32" stroke={brandColor} strokeWidth="2" strokeLinecap="round" style={{ animation: "spin 12s linear infinite", transformOrigin: "32px 32px" }} />
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}

/* ── Public component ─────────────────────────────────────────────── */
export function OrderStatusAnimation({ status, size = 80, brandColor = "#2D6A4F", className }: OrderStatusAnimationProps) {
  const normalized = status.toLowerCase().trim();

  const render = () => {
    switch (normalized) {
      case "pending": return <PendingAnimation size={size} brandColor={brandColor} />;
      case "confirmed": return <ConfirmedAnimation size={size} brandColor={brandColor} />;
      case "preparing": return <PreparingAnimation size={size} brandColor={brandColor} />;
      case "ready_for_pickup": return <ReadyAnimation size={size} brandColor={brandColor} />;
      case "assigned_to_rider": return <TransitAnimation size={size} brandColor={brandColor} />;
      case "in_transit": return <TransitAnimation size={size} brandColor={brandColor} />;
      case "delivered": return <DeliveredAnimation size={size} brandColor={brandColor} />;
      case "cancelled": return <CancelledAnimation size={size} brandColor={brandColor} />;
      default: return <PendingAnimation size={size} brandColor={brandColor} />;
    }
  };

  return (
    <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <PulseRing color={brandColor} size={size} />
      {render()}
    </div>
  );
}

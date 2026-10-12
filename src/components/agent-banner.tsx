import { VERIFICATION_LABELS } from "@/lib/constants";

export function AgentVerificationBanner({ status }: { status: string }) {
  if (status === "VERIFIED") return null;
  return (
    <div className={`rounded-xl p-4 text-sm ${status === "REJECTED" ? "bg-red-50 text-red-800" : "bg-gold-100"}`}>
      <strong>Verification: {VERIFICATION_LABELS[status]}.</strong>{" "}
      {status === "REJECTED"
        ? "We couldn't verify your Ghana Card details. Please contact support."
        : "We're checking your Ghana Card details. You can see available jobs, but can only accept them once verified."}
    </div>
  );
}

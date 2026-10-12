import type { Tone } from "@/components/ui/basics";

export const disputeTone = (s: string): Tone => (s === "RESOLVED" ? "green" : s === "REJECTED" ? "grey" : s === "AWAITING_PARTY" ? "blue" : "gold");

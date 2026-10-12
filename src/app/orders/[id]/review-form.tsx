"use client";

import { useState } from "react";

export function ReviewForm({ action, businessName }: { action: (formData: FormData) => Promise<void>; businessName: string }) {
  const [rating, setRating] = useState(0);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">How did {businessName} do?</h2>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)} className={`text-3xl ${n <= rating ? "text-gold-400" : "text-stone-300"}`}>
            ★
          </button>
        ))}
      </div>
      <input type="hidden" name="rating" value={rating} />
      <textarea name="comment" rows={3} className="input" placeholder="Tell others about the fit, finishing and service (optional)" />
      <button className="btn-primary" disabled={rating === 0}>Submit review</button>
    </form>
  );
}

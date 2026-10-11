"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-md space-y-3 text-center">
      <p className="text-3xl">😕</p>
      <h1 className="font-semibold">Something went wrong</h1>
      <p className="text-sm text-stone-600">
        {process.env.NODE_ENV === "development" ? error.message : "Please refresh the page and try again."}
      </p>
      <button className="btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}

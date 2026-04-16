"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <p className="text-4xl mb-4">⚠️</p>
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-gray-400 text-sm mb-6 max-w-sm">{error.message}</p>
      <button
        onClick={reset}
        className="px-6 py-2 bg-liquity-yellow text-black rounded-xl font-semibold text-sm hover:bg-yellow-300 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

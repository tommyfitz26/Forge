'use client';

import { useState, useTransition } from 'react';
import { sendMagicLink, type LoginResult } from './actions';

export function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<LoginResult | null>(null);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const r = await sendMagicLink(formData);
      setResult(r);
    });
  }

  if (result?.ok) {
    return (
      <div className="rounded-md border border-neutral-300 bg-neutral-50 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-900">
        If that email is authorized, a magic link is on its way. Check your inbox.
      </div>
    );
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
        />
      </div>

      {result && !result.ok && (
        <div className="text-sm text-red-600 dark:text-red-400">{result.error}</div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? 'Sending…' : 'Send magic link'}
      </button>
    </form>
  );
}

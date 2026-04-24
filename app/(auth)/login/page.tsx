import { LoginForm } from './LoginForm';

type SearchParams = Promise<{ error?: string; next?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Forge</h1>
          <p className="mt-2 text-sm text-neutral-500">Sign in with a magic link.</p>
        </div>

        {error === 'unauthorized' && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
            That email isn&apos;t authorized for this app.
          </div>
        )}

        <LoginForm />
      </div>
    </main>
  );
}

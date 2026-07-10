import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from '@/api/middleware/auth';
import { Button } from '@/components/ui/button';

export default async function Home() {
  const session = await getServerSession();

  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-canvas)] text-[var(--color-text-ink)] p-4">
      <div className="max-w-xl text-center space-y-6">
        <h1 className="text-display-xl font-bold tracking-tight">
          SpendSense
        </h1>
        <p className="text-body-lg text-[var(--color-text-mute)]">
          A lightweight, privacy-focused individual expense tracker. 
          Upload receipts via a synchronous, zero-storage local OCR pipeline 
          that leaves no trace behind.
        </p>
        <div className="flex items-center justify-center gap-4 pt-4">
          <Link href="/login">
            <Button variant="secondary" size="lg">
              Log In
            </Button>
          </Link>
          <Link href="/register">
            <Button size="lg">
              Sign Up
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

import { redirect } from 'next/navigation';

// Phase 4.1: root of the authed shell now lands on /today.
// The previous dashboard list lives at /stream.
export default function RootRedirect() {
  redirect('/today');
}

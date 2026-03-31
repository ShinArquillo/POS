import { Suspense } from "react";
import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";
import { LoginAccessGate } from "@/components/auth/LoginAccessGate";
import { getLoginGateHash, LOGIN_GATE_COOKIE } from "@/lib/loginGate";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const gateHash = await getLoginGateHash();
  const cookieStore = await cookies();
  const gateCookie = cookieStore.get(LOGIN_GATE_COOKIE)?.value ?? "";
  const gatePassed = !gateHash || gateCookie === gateHash;

  return (
    <div className="relative flex min-h-dvh flex-col tablet:flex-row">
      <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0f4415] via-[#0d3a12] to-[#081f0c] px-8 py-10 text-[var(--color-cream-deep)] tablet:px-12 tablet:py-14">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(226,215,171,0.12),transparent_70%)] tablet:h-96 tablet:w-96"
          aria-hidden
        />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/20 to-transparent" aria-hidden />
        <div className="relative">
          <div className="relative mb-8 h-14 w-14 overflow-hidden rounded-2xl bg-white/10 backdrop-blur">
            <Image src="/logo.svg" alt="PHOEBE logo" fill sizes="56px" className="object-cover" priority />
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight tablet:text-4xl">
            PHOEBE Drugstore
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/85 text-balance tablet:text-lg">
            A calm, fast point of sale built for tablets—inventory, receiving, and checkout in one place.
          </p>
        </div>
        <p className="relative mt-12 text-xs font-medium uppercase tracking-widest text-white/45 tablet:mt-0">
          Retail POS · Secure session
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[var(--color-cream)] px-4 py-10 tablet:px-10 tablet:py-0">
        <div className="w-full max-w-md rounded-[var(--radius-2xl)] border border-white/80 bg-[var(--color-surface)] p-8 shadow-[var(--shadow-lg)] backdrop-blur-xl tablet:p-10">
          <div className="mb-8 text-[var(--foreground)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--foreground-muted)]">
              Welcome back
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight tablet:text-3xl">Sign in</h2>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              Use your store credentials to open the register.
            </p>
          </div>
          <Suspense
            fallback={<p className="text-center text-sm text-[var(--foreground-muted)]">Loading…</p>}
          >
            {gatePassed ? <LoginForm /> : <LoginAccessGate />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

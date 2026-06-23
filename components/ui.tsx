"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const appNavItems = [
  { href: "/", label: "구매 기록", caption: "Kiosk" },
  { href: "/weekly", label: "주간통계", caption: "Stats" },
  { href: "/my-ledger", label: "구매 랭킹", caption: "Ranking" },
  { href: "/suggestions", label: "간식 제안", caption: "Suggest" },
  { href: "/admin", label: "운영관리", caption: "Admin" },
];

export function AppShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <main className={cn("section-shell grid-field-light", className)}>{children}</main>;
}

function BrandLockup() {
  return (
    <Link
      href="/"
      className="inline-flex items-center justify-center gap-3 border border-zinc-200 bg-white px-3 py-2 text-center shadow-sm"
    >
      <Image
        alt="Next Challenge School"
        src="/ncs-logo.png"
        width={128}
        height={40}
        className="h-8 w-auto"
        priority
      />
      <div className="hidden sm:block">
        <div className="brand-display text-[10px] font-black uppercase text-zinc-500">NCS Snack Store</div>
        <div className="text-sm font-bold text-zinc-950">넥스트챌린지스쿨 매점</div>
      </div>
    </Link>
  );
}

export function AppMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function lockAdminIfLeaving(href: string) {
    if (pathname !== "/admin" || href === "/admin") return;
    void fetch("/api/admin/logout", {
      method: "POST",
      keepalive: true,
    });
  }

  return (
    <div className={className}>
      <button
        aria-label="앱 메뉴 열기"
        className="flex h-11 w-11 items-center justify-center border border-zinc-200 bg-white shadow-sm transition active:scale-95"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="grid gap-1.5">
          <span className="block h-0.5 w-5 bg-zinc-950" />
          <span className="block h-0.5 w-5 bg-zinc-950" />
          <span className="block h-0.5 w-5 bg-zinc-950" />
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-zinc-950/30 p-3 backdrop-blur-sm" role="dialog">
          <button
            aria-label="앱 메뉴 닫기"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setOpen(false)}
            type="button"
          />
          <nav className="relative ml-auto flex h-full max-w-[340px] flex-col border border-zinc-200 bg-[#f8fafc] p-4 text-center shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <Image
                alt="Next Challenge School"
                className="h-9 w-auto"
                height={44}
                priority
                src="/ncs-logo.png"
                width={144}
              />
              <button
                className="flex h-10 w-10 items-center justify-center border border-zinc-200 bg-white text-lg font-black text-zinc-950"
                onClick={() => setOpen(false)}
                type="button"
              >
                X
              </button>
            </div>
            <div className="brand-gradient mx-auto mt-5 h-1.5 w-20" />
            <p className="mt-3 text-xs font-black uppercase tracking-[0.24em] text-zinc-500">NCS Snack App</p>
            <div className="mt-6 grid gap-2">
              {appNavItems.map((item) => (
                <Link
                  className={cn(
                    "border px-4 py-4 text-center transition active:scale-[0.99]",
                    pathname === item.href
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white hover:border-zinc-950",
                  )}
                  href={item.href}
                  key={item.href}
                  onClick={() => {
                    lockAdminIfLeaving(item.href);
                    setOpen(false);
                  }}
                >
                  <div
                    className={cn(
                      "text-[11px] font-black uppercase tracking-[0.2em]",
                      pathname === item.href ? "text-white/70" : "text-zinc-400",
                    )}
                  >
                    {item.caption}
                  </div>
                  <div className={cn("mt-1 text-lg font-black", pathname === item.href ? "text-white" : "text-zinc-950")}>
                    {item.label}
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-auto border border-zinc-200 bg-white p-3 text-sm font-semibold leading-6 text-zinc-600">
              패드에서는 홈 화면에 추가하면 앱처럼 바로 열 수 있어요.
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}

export function Header({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="grid grid-cols-[44px_minmax(0,1fr)_minmax(44px,auto)] items-center gap-3">
        <AppMenu />
        <div className="flex justify-center">
          <BrandLockup />
        </div>
        {action ? <div className="justify-self-end sm:min-w-36">{action}</div> : <div />}
      </div>
      <div className="mx-auto mt-6 max-w-[48rem] text-center">
        <div className="brand-gradient mx-auto mb-5 h-1.5 w-20" />
        {eyebrow ? (
          <p className="brand-display mb-2 text-xs font-black uppercase text-zinc-500">{eyebrow}</p>
        ) : null}
        <h1 className="text-3xl font-black text-zinc-950 sm:text-4xl">{title}</h1>
        {description ? <p className="mt-3 text-sm leading-6 text-zinc-600">{description}</p> : null}
      </div>
    </header>
  );
}

export function Hero({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={cn("card-dark p-5 sm:p-6", className)}>{children}</section>;
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={cn("card p-4", className)}>{children}</section>;
}

export function PrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "brand-display flex h-12 w-full items-center justify-center bg-zinc-950 px-5 text-xs font-black uppercase text-white transition hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-500",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "flex h-12 w-full items-center justify-center border border-zinc-300 bg-white px-4 text-sm font-black text-zinc-800 transition hover:border-zinc-950 hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Pill({
  active,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "border px-3 py-2 text-sm font-black transition",
        active
          ? "border-zinc-950 bg-zinc-950 text-white"
          : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-950",
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StickyBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("sticky bottom-0 mt-auto border-t border-zinc-200 bg-[#f4f6fa]/95 py-3 backdrop-blur", className)}>
      {children}
    </div>
  );
}

export function NavCard({
  href,
  title,
  description,
  label,
}: {
  href: string;
  title: string;
  description: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="card flex min-h-[136px] flex-col justify-between p-4 transition hover:border-zinc-950 hover:bg-white"
    >
      <div className="brand-display text-xs font-black uppercase text-zinc-500">{label}</div>
      <div>
        <h2 className="text-xl font-black text-zinc-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
      </div>
    </Link>
  );
}

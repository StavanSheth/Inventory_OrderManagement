"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { onReveal } from "./ScoopLoader";
import { nav } from "../content";
import { loadCartFromStorage } from "@/frontend/modules/customer/cart-storage";

/** Tell the nav something went into the order (the cone builder does this). */
export const addToOrder = () => window.dispatchEvent(new Event("melt:order"));

/** The brand mark: a tiny scoop on a cone. */
export const ScoopMark = ({ className = "h-[1em] w-auto" }: { className?: string }) => (
  <svg viewBox="0 0 20 26" className={className} aria-hidden>
    <path d="M4.5 12.5 10 25l5.5-12.5Z" fill="#e9b170" />
    <path d="M3 13a7 7 0 1 1 14 0c0 1.2-1.3 1.5-2.2.8-.8.9-2 .9-2.8 0-.8.9-2 .9-2.8 0-.8.9-2 .9-2.8 0C4.3 14.5 3 14.2 3 13Z" fill="currentColor" />
  </svg>
);

/** N2: one floating white pill (mark · links with a sliding pink blob · Order count). Phone: pill + full pink sheet. */
export default function ScoopNav() {
  const ref = useRef<HTMLElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const [active, setActive] = useState(-1);
  const [blob, setBlob] = useState<{ x: number; w: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    const offIntro = onReveal(() => {
      if (!prefersReducedMotion()) gsap.from(ref.current, { y: -90, opacity: 0, duration: 0.9, delay: 0.3, ease: "power3.out" });
    });

    const syncCount = () => {
      const items = loadCartFromStorage();
      const totalCount = items.reduce((sum, it) => sum + it.quantity, 0);
      setCount(totalCount);
    };
    syncCount();

    const onOrder = () => {
      syncCount();
      setBump((n) => n + 1);
    };
    window.addEventListener("melt:order", onOrder);
    window.addEventListener("melt:cart-updated", onOrder);

    // the section whose top has passed 45% of the screen is "active"
    const targets = nav.links.map((l) => document.querySelector<HTMLElement>(l.href));
    const onScroll = () => {
      const line = window.innerHeight * 0.45;
      let k = -1;
      targets.forEach((t, i) => {
        if (t && t.getBoundingClientRect().top < line) k = i;
      });
      setActive(k);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      offIntro();
      window.removeEventListener("melt:order", onOrder);
      window.removeEventListener("melt:cart-updated", onOrder);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // the pink blob slides to the active link
  useEffect(() => {
    const a = links.current[active];
    setBlob(a ? { x: a.offsetLeft, w: a.offsetWidth } : null);
  }, [active]);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) window.__lenis?.stop();
    else if (wasOpen.current) window.__lenis?.start();
    wasOpen.current = open;
  }, [open]);

  const order = (
    <a
      href={count > 0 ? "/order?tab=cart" : "/order"}
      aria-label={`${count > 0 ? "Cart" : nav.cta.label}, ${count} items`}
      className="flex items-center gap-2 rounded-full bg-accent py-2 pr-2 pl-4 text-[14px] font-extrabold text-accent-fg transition-transform hover:scale-[1.04]"
    >
      {count > 0 ? "Cart" : nav.cta.label}
      <span key={bump} className={`tnum grid h-7 min-w-7 place-items-center rounded-full bg-white px-1.5 text-[13px] text-accent ${bump ? "order-bump" : ""}`}>
        {count}
      </span>
    </a>
  );

  return (
    <>
      <header ref={ref} className="fixed inset-x-0 top-3 z-50 flex justify-center px-3 md:top-5">
        <div className="flex w-full max-w-[860px] items-center gap-2 rounded-full bg-white/95 p-1.5 pl-5 shadow-[0_14px_40px_-16px_rgba(120,20,60,.35)] md:w-auto md:gap-4">
          <a href="#" aria-label="Melt Theory, home" className="font-display flex items-center gap-1.5 text-[22px] whitespace-nowrap text-accent md:text-[24px]">
            <ScoopMark className="h-[1.05em] w-auto text-[#ff8fb1]" />
            {nav.logo}
          </a>
          <nav className="relative hidden items-center lg:flex">
            {blob && <span aria-hidden className="absolute top-0 h-full rounded-full bg-[var(--strawberry)] transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)]" style={{ left: blob.x, width: blob.w }} />}
            {nav.links.map((l, i) => (
              <a
                key={l.label}
                ref={(el) => {
                  links.current[i] = el;
                }}
                href={l.href}
                className={`relative rounded-full px-4 py-2.5 text-[14px] font-bold whitespace-nowrap transition-colors ${i === active ? "text-accent" : "text-fg/75 hover:text-fg"}`}
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            {order}
            <button onClick={() => setOpen(true)} className="rounded-full px-3.5 py-2.5 text-[14px] font-extrabold lg:hidden">
              Menu
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-[var(--strawberry)]">
          <div className="flex items-center justify-between px-6 pt-6">
            <span className="font-display flex items-center gap-1.5 text-[24px] text-accent">
              <ScoopMark className="h-[1.05em] w-auto text-white" />
              {nav.logo}
            </span>
            <button onClick={() => setOpen(false)} className="rounded-full bg-white px-4 py-2.5 text-[14px] font-extrabold">
              Close
            </button>
          </div>
          <nav className="flex flex-1 flex-col justify-center gap-2 px-6">
            {nav.links.map((l) => (
              <a key={l.label} href={l.href} onClick={() => setOpen(false)} className="font-display text-[clamp(44px,12vw,72px)] leading-[1.05] text-fg">
                {l.label}
              </a>
            ))}
          </nav>
          <p className="px-6 pb-8 text-[14px] font-bold text-fg/70">Open till midnight on weekends · Jubilee Hills · Gachibowli · Banjara Hills</p>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { onReveal } from "./ScoopLoader";
import { Scripted } from "./Heading";
import { hero } from "../content";

/**
 * H5: a giant "MELT" behind a big three-scoop cone on a soft pink blob, toppings drifting around it.
 * Opens with the loader; on scroll the cone lifts and the word slides apart.
 */
export default function MeltHero() {
  const root = useRef<HTMLElement>(null);
  const left = useRef<HTMLSpanElement>(null);
  const right = useRef<HTMLSpanElement>(null);
  const cone = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLDivElement>(null);
  const toppings = useRef<HTMLDivElement>(null);
  const half = Math.ceil(hero.word.length / 2);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let ctx: gsap.Context | undefined;
    const off = onReveal(() => {
      ctx = gsap.context(() => {
        // intro, as the loader's circle opens
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        if (toppings.current) {
          tl.from(toppings.current.children, { scale: 0.4, opacity: 0, duration: 0.9, stagger: 0.08 }, 0.4);
        }
        tl.from([copy.current, side.current], { y: 30, opacity: 0, duration: 0.9, stagger: 0.1 }, 0.5);

        // scroll: the word slides apart, the cone lifts
        const st = { trigger: root.current, start: "top top", end: "bottom top", scrub: true };
        gsap.to(left.current, { xPercent: -18, ease: "none", scrollTrigger: st });
        gsap.to(right.current, { xPercent: 18, ease: "none", scrollTrigger: st });
        gsap.to(cone.current, { yPercent: -10, ease: "none", scrollTrigger: st });
        if (toppings.current) {
          (Array.from(toppings.current.children) as HTMLElement[]).forEach((t) =>
            gsap.to(t, { yPercent: -120 * Number(t.dataset.depth), ease: "none", scrollTrigger: st }),
          );
        }
      }, root);
    });
    return () => {
      off();
      ctx?.revert();
    };
  }, []);

  return (
    <section ref={root} id="top" className="relative h-[100svh] min-h-[640px] overflow-hidden">
      <div aria-hidden data-record-label="Hero" data-record-time="0" data-record-hold="3" className="pointer-events-none absolute inset-x-0 top-0 h-px" />

      {/* soft blob */}
      <div aria-hidden className="blob absolute top-[50%] left-1/2 h-[min(76vh,86vw)] w-[min(76vh,86vw)] -translate-x-1/2 -translate-y-1/2 bg-[var(--strawberry)] opacity-70 md:top-[52%]" />

      {/* giant word */}
      <p aria-hidden className="font-display absolute inset-x-0 top-[17%] flex -translate-y-1/2 justify-center gap-[3vw] text-[clamp(96px,27vw,440px)] md:gap-[12vw] md:text-[clamp(150px,27vw,470px)] leading-none font-bold tracking-[-0.03em] text-accent select-none md:top-[45%]">
        <span ref={left} className="inline-block">
          {hero.word.slice(0, half)}
        </span>
        <span ref={right} className="inline-block">
          {hero.word.slice(half)}
        </span>
      </p>

      {/* toppings */}
      <div ref={toppings} aria-hidden>
        {hero.toppings.map((t) => (
          <div key={t.src} data-depth={t.depth} className={`absolute ${t.className}`}>
            <img src={t.src} alt={t.alt} className="drift w-full drop-shadow-[0_18px_18px_rgba(120,20,60,.18)]" style={{ animationDelay: `${-t.depth * 9}s` }} />
          </div>
        ))}
      </div>

      {/* the cone */}
      <div ref={cone} className="absolute top-[21%] left-1/2 h-[56%] -translate-x-1/2 md:top-[10%] md:h-[84%]">
        <img src={hero.cone} alt="A waffle cone with pistachio, strawberry and mango scoops" className="float-soft h-full w-auto drop-shadow-[0_30px_30px_rgba(120,20,60,.22)]" />
      </div>

      {/* copy, bottom left */}
      <div className="container-x pointer-events-none absolute inset-x-0 bottom-[4%] flex flex-col gap-3 md:bottom-[7%] md:flex-row md:items-end md:justify-between">
        <div ref={copy} className="pointer-events-auto max-w-[440px]">
          <h1 className="font-display text-[clamp(46px,4.3vw,70px)]">
            {hero.heading.map((l) => (
              <span key={l} className="block">
                <Scripted text={l} />
              </span>
            ))}
          </h1>
          <p className="mt-3 hidden max-w-[360px] text-[16px] leading-relaxed text-muted md:block">{hero.text}</p>
        </div>

        <div ref={side} className="pointer-events-auto flex flex-col items-start gap-4 md:items-end">
          <p className="eyebrow hidden whitespace-nowrap md:inline-flex" style={{ textTransform: "none", letterSpacing: "0.02em", fontSize: 13 }}>
            <span>
              {hero.pill.label}: <span className="text-fg">{hero.pill.value}</span>
            </span>
          </p>
          <div className="flex gap-2.5 md:gap-3">
            <a href={hero.ctas[0].href} className="btn btn-solid">
              {hero.ctas[0].label}
            </a>
            <a href={hero.ctas[1].href} className="btn btn-outline">
              {hero.ctas[1].label}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

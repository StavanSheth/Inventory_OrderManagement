"use client";

import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import DripEdge from "./DripEdge";
import { wave } from "../content";

// Waves in a 1440 × 320 box, starting far off-screen left so the text always covers the visible part.
const wavePath = (y: number, amp: number, phase: number) => {
  let d = `M${-4200 + phase} ${y}q120 ${-amp} 240 0`;
  for (let i = 0; i < 32; i++) d += "t240 0";
  return d;
};
const TOP = wavePath(128, 56, 0);
const BOTTOM = wavePath(236, 36, -120);
const REPS = { top: 4, bottom: 8 } as const;

/** Marquee → flavour names running along a wave (SVG text path), a small second row going the other way. Scroll speeds it up. */
export default function FlavourWave() {
  const topText = useRef<SVGTextPathElement>(null);
  const bottomText = useRef<SVGTextPathElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const len = (el: SVGTextPathElement | null, reps: number) => {
      if (!el || !el.parentNode) return 0;
      return (el.parentNode as SVGTextElement).getComputedTextLength() / reps;
    };
    let units = { top: 0, bottom: 0 };
    const measure = () => {
      if (!topText.current || !bottomText.current) return;
      try {
        units = {
          top: len(topText.current, REPS.top) || 1,
          bottom: len(bottomText.current, REPS.bottom) || 1,
        };
      } catch {
        // SVG element may not yet be attached or styled
      }
    };
    measure();
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }

    let a = 0;
    let b = 0;
    let boost = 0;
    const tick = (_t: number, dt: number) => {
      if (!topText.current || !bottomText.current || !units.top || !units.bottom) return;
      const s = dt / 1000;
      boost += (Math.min(Math.abs(window.__lenis?.velocity ?? 0) * 18, 700) - boost) * 0.08;
      a = (a + (70 + boost) * s) % units.top;
      b = (b + (45 + boost * 0.6) * s) % units.bottom;
      topText.current.setAttribute("startOffset", String(units.top - a)); // moves left
      bottomText.current.setAttribute("startOffset", String(b)); // moves right
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);

  const row = (items: string[], reps: number) => Array.from({ length: reps }, () => items.map((t) => `${t}  •  `).join("")).join("");

  return (
    <section
      aria-label={wave.top.join(", ")}
      className="relative z-[1] bg-[var(--pistachio)] pt-[clamp(40px,6vw,100px)] pb-[clamp(10px,2vw,30px)]"
      data-record-label="Flavour wave"
      data-record-time="1.5"
      data-record-align="center"
    >
      <DripEdge color="var(--bg)" layout={0} />
      <svg aria-hidden viewBox="0 0 1440 320" preserveAspectRatio="xMidYMid slice" className="block h-[max(22.2vw,220px)] w-full">
        <path id="wave-top" d={TOP} fill="none" />
        <path id="wave-bottom" d={BOTTOM} fill="none" />
        <text className="wave-text" fontSize="74" fill="#2b1233">
          <textPath ref={topText} href="#wave-top">
            {row(wave.top, REPS.top)}
          </textPath>
        </text>
        <text fontSize="26" fontWeight="800" letterSpacing="3" fill="#4a3350" style={{ fontFamily: "var(--font-body-family)" }}>
          <textPath ref={bottomText} href="#wave-bottom">
            {row(wave.bottom.map((t) => t.toUpperCase()), REPS.bottom)}
          </textPath>
        </text>
      </svg>
    </section>
  );
}

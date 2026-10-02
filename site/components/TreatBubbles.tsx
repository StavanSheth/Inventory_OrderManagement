"use client";

import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import DripEdge from "./DripEdge";
import Heading from "./Heading";
import Photo from "./Photo";
import { treats } from "../content";

/** C8 category circles on a white band: they pop in one by one; a pink ring grows around the one under the mouse. */
export default function TreatBubbles() {
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (prefersReducedMotion() || !list.current) return;
    // Pops in when the circles are really on screen (IntersectionObserver), not at a scroll position
    // measured earlier, which could be stale while images/fonts were still loading and fire too late.
    const bubbles = list.current.querySelectorAll(".bubble");
    let tween: gsap.core.Tween | undefined;
    gsap.set(bubbles, { scale: 0.55, opacity: 0 });
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        tween = gsap.to(bubbles, { scale: 1, opacity: 1, duration: 0.9, ease: "power3.out", stagger: 0.09 });
      },
      { threshold: 0.25 },
    );
    io.observe(list.current);
    return () => {
      io.disconnect();
      tween?.kill();
      gsap.set(bubbles, { clearProps: "transform,opacity" });
    };
  }, []);

  return (
    <section
      id="treats"
      className="relative z-[1] bg-surface pt-[clamp(120px,13vw,210px)] pb-[clamp(90px,10vw,150px)]"
      data-record-label="Pick a treat (hold)"
      data-record-time="1.5"
      data-record-hold="1.5"
      data-record-align="center"
    >
      <DripEdge color="var(--bg)" layout={2} />
      <div className="container-x">
        <div className="text-center">
          <p className="eyebrow !bg-[var(--bg)]">{treats.eyebrow}</p>
          <Heading lines={treats.heading} className="mt-5 text-[clamp(48px,6vw,104px)]" />
        </div>
        <ul ref={list} className="mt-12 grid grid-cols-3 gap-x-4 gap-y-8 md:mt-16 lg:grid-cols-6 lg:gap-6">
          {treats.items.map((t) => (
            <li key={t.name}>
              <a href="#treats" className="group flex flex-col items-center text-center" data-cursor="Open">
                <span className="bubble relative block aspect-square w-full max-w-[200px] rounded-full p-1.5 ring-[3px] ring-transparent transition-[box-shadow,--tw-ring-color] duration-500 group-hover:ring-accent">
                  <span className="absolute inset-1.5 overflow-hidden rounded-full transition-transform duration-500 group-hover:scale-[0.96]">
                    <Photo photo={t.photo} tone={t.tone} alt={t.name} eager className="absolute inset-0" />
                  </span>
                </span>
                <span className="font-display mt-4 text-[18px] md:text-[24px]">{t.name}</span>
                <span className="mt-1 text-[13px] font-bold text-muted md:text-[14px]">{t.count}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

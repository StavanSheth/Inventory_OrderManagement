"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { atFromUrl, waitForClock } from "@/lib/atTime";

// The engine loader is switched off (meta.loader = false). This one always takes exactly LOADER_SECONDS,
// then tells the page to play its intro. With &at=HH:MM:SS it shows its first frame, frozen, until that
// time, while it preloads every image on the page (docs/RECORDING.md).

const DROP = 1.7; // cone rises, a scoop drops in and squishes, the name pops up
const OPEN = 0.8; // a circle opens from the cone and reveals the page
export const LOADER_SECONDS = DROP + OPEN; // 2.5

let revealed = false;

/** Run once the loader has opened (immediately with ?static=1). */
export function onReveal(fn: () => void) {
  if (revealed) {
    fn();
    return () => {};
  }
  const h = () => fn();
  window.addEventListener("melt:reveal", h, { once: true });
  return () => window.removeEventListener("melt:reveal", h);
}

function reveal() {
  if (revealed) return;
  revealed = true;
  window.dispatchEvent(new Event("melt:reveal"));
}

const loadImage = (src: string) =>
  new Promise<void>((done) => {
    const img = new Image();
    img.onload = img.onerror = () => done();
    img.src = src;
  });

/** Every <img> on the page (fetched by URL, so lazy or hidden ones count too) and the fonts. */
async function preloadAll() {
  const urls = [...new Set(Array.from(document.images).map((i) => i.currentSrc || i.src).filter(Boolean))];
  await Promise.all([...urls.map(loadImage), document.fonts.ready]);
}

/** Scoop drop: a waffle cone on pink, a scoop drops in with a squish, the name pops up, then a circle opens from the cone. */
export default function ScoopLoader({ name, cone, scoop }: { name: string; cone: string; scoop: string }) {
  const root = useRef<HTMLDivElement>(null);
  const coneEl = useRef<HTMLImageElement>(null);
  const scoopEl = useRef<HTMLImageElement>(null);
  const word = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // ?static=1: a class that stops the CSS loops (floats, blob, spinning badges)
    if (new URLSearchParams(window.location.search).has("static")) document.documentElement.classList.add("is-static");
    if (prefersReducedMotion()) {
      setGone(true);
      reveal();
      return;
    }
    window.scrollTo(0, 0);
    window.__lenis?.stop();

    // &at=: freeze on the first frame (cone + name visible), preload everything, play at that time
    const target = atFromUrl();
    let ready = !target;
    let cancelClock = () => {};
    if (target) {
      const t0 = performance.now();
      preloadAll().then(() => {
        ready = true;
        console.log(`[record] loader: all images ready in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
      });
    }

    const el = root.current;
    if (!el || !coneEl.current) return;
    const hole = { r: 0 };
    const setHole = () => {
      if (!coneEl.current || !root.current) return;
      const c = coneEl.current.getBoundingClientRect();
      const m = `radial-gradient(circle at ${c.left + c.width / 2}px ${c.top + c.height * 0.2}px, transparent ${hole.r}px, #000 ${hole.r + 1}px)`;
      root.current.style.maskImage = m;
      root.current.style.webkitMaskImage = m;
    };

    // context + revert: React dev mode runs this effect twice
    const ctx = gsap.context(() => {
      // The server-rendered first frame IS the start state (cone only, scoop above the screen, name hidden),
      // so nothing jumps when this script takes over. &at= shows the name on the frozen frame.
      const tl = gsap.timeline({ paused: !!target });
      gsap.set(scoopEl.current, { clearProps: "transform" }); // hand the inline start position over to GSAP (same frame)
      if (target) gsap.set(word.current, { opacity: 1 });
      else tl.fromTo(word.current, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.9);
      tl.fromTo(scoopEl.current, { yPercent: -420 }, { yPercent: 0, duration: 0.55, ease: "power2.in" }, 0.4)
        .fromTo(scoopEl.current, { scaleY: 0.8, scaleX: 1.12 }, { scaleY: 1, scaleX: 1, duration: 0.4, ease: "power3.out", immediateRender: false }, 0.95)
        .fromTo(coneEl.current, { y: 0 }, { y: 6, duration: 0.12, yoyo: true, repeat: 1, ease: "power1.out" }, 0.95)
        .addLabel("go", DROP - 0.05)
        .add(() => {
          // &at= and still loading: hold on the full cone until everything is in, then open
          if (ready) return;
          tl.pause();
          const wait = () => (ready ? tl.play() : requestAnimationFrame(wait));
          wait();
        }, "go")
        .addLabel("open", DROP)
        .to(hole, { r: Math.hypot(window.innerWidth, window.innerHeight), duration: OPEN, ease: "power2.in", onUpdate: setHole }, "open")
        .add(() => {
          window.__lenis?.start();
          reveal();
        }, `open+=${OPEN * 0.35}`)
        .add(() => setGone(true), LOADER_SECONDS);

      if (target) {
        if (Date.now() < target.getTime()) console.log(`[record] loader frozen until ${target.toLocaleTimeString()}`);
        cancelClock = waitForClock(target, () => {
          if (!ready) console.warn("[record] assets not ready at start time: the cone waits until they are");
          tl.play(0);
        });
      }
    });

    return () => {
      cancelClock();
      ctx.revert();
    };
  }, []);

  if (gone) return null;

  return (
    <div ref={root} data-loader aria-hidden className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 overflow-hidden bg-[var(--strawberry)]">
      <div className="blob absolute h-[70vmin] w-[70vmin] bg-[#ffd6e2]" />
      <div className="relative flex flex-col items-center">
        <img ref={scoopEl} src={scoop} alt="" className="relative z-[2] -mb-[7vh] w-[16vh] origin-bottom" style={{ transform: "translateY(-420%)" }} />
        <img ref={coneEl} src={cone} alt="" className="relative z-[1] h-[22vh] w-auto" />
      </div>
      <div ref={word} className="relative flex flex-col items-center gap-2" style={{ opacity: 0 }}>
        <span className="font-display text-[clamp(36px,5vw,64px)] text-accent">{name}</span>
        <span className="text-[12px] font-extrabold tracking-[0.3em] text-[#2b1233]/60 uppercase">Hand-churned daily</span>
      </div>
    </div>
  );
}

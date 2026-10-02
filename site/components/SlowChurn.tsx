"use client";

import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { onSiteReady } from "@/lib/loading";
import { getManifest, loadFrames } from "@/lib/frames";
import DripEdge from "./DripEdge";
import Heading from "./Heading";
import { builder, slow } from "../content";

/** Horizontal centre of the scoop in the video (0..1 of the frame width) as the camera pushes in. */
function focusAt(p: number) {
  const keys = slow.focus;
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const [p0, f0] = keys[i - 1];
      const [p1, f1] = keys[i];
      return f0 + ((p - p0) / (p1 - p0)) * (f1 - f0);
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * The pour video, scrubbed by scroll. Like the engine's frame player, but the crop follows the scoop
 * (it starts on the right and ends near the centre) so the scoop always stays in view in a narrower box.
 */
function usePour(folder: string, canvas: React.RefObject<HTMLCanvasElement | null>) {
  const progress = useRef(0);
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let player: ReturnType<typeof loadFrames> | null = null;
    let count = 0;
    let raf = 0;
    let last = "";
    let cancelled = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = cv.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      last = "";
    };
    const render = () => {
      raf = requestAnimationFrame(render);
      if (!player) return;
      const p = Math.min(1, Math.max(0, progress.current));
      const i = Math.round(p * (count - 1));
      const img = player.get(i);
      if (!img) return;
      const key = `${i}:${img.src}:${cv.width}x${cv.height}`;
      if (key === last) return;
      last = key;
      const { width: w, height: h } = cv;
      // phone (a wide, short box): show ~94% of the frame width so the whole bowl fits, sitting on the bottom edge.
      // laptop (a tall box): cover, with the crop following the scoop.
      const wide = w / h > 1.25;
      const s = wide ? w / (img.naturalWidth * 0.94) : Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      const x = Math.min(0, Math.max(w - dw, w / 2 - focusAt(p) * dw));
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, x, wide ? h - dh : (h - dh) / 2, dw, dh);
    };

    getManifest(folder)
      .then((m) => {
        if (cancelled) return;
        count = m.count;
        player = loadFrames(folder, m, () => (last = ""));
      })
      .catch((e) => console.warn(e.message));
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    raf = requestAnimationFrame(render);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      player?.cancel();
    };
  }, [folder, canvas]);
  return progress;
}

/**
 * FrameScrub → a big rounded pink panel inside the page. The pour video scrubs with the scroll on the right;
 * the heading and three round fact stickers sit on the matching pink on the left, so they never cover the scoop.
 */
export default function SlowChurn() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const progress = usePour(slow.frames, canvas);

  useEffect(() => {
    if (prefersReducedMotion()) {
      progress.current = 0.75;
      return;
    }
    let ctx: gsap.Context | undefined;
    const off = onSiteReady(() => {
      ctx = gsap.context(() => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.5,
            onUpdate: (self) => {
              progress.current = self.progress;
            },
          },
        });
        tl.set({}, {}, 1);
        slow.captions.forEach((c, i) => {
          tl.fromTo(`[data-sticker="${i}"]`, { scale: 0, rotate: -20 }, { scale: 1, rotate: i % 2 ? 6 : -6, duration: 0.08, ease: "power3.out" }, c.at);
        });
      }, root);
    });
    return () => {
      off();
      ctx?.revert();
    };
  }, [progress]);

  return (
    <section ref={root} aria-label="Made the slow way" className="relative z-[1] h-[240vh] [.is-static_&]:h-auto">
      {/* the cone builder's last colour drips into this section */}
      <DripEdge color={builder.tints[builder.tints.length - 1]} layout={1} />
      <div aria-hidden data-record-label="Made slow: start" data-record-time="1.5" className="pointer-events-none absolute inset-x-0 top-0 h-px" />
      <div aria-hidden data-record-label="Made slow: pour" data-record-time="3.5" data-record-align="bottom" className="pointer-events-none absolute inset-x-0 bottom-0 h-px" />

      <div className="sticky top-0 flex h-[100svh] items-center pt-[calc(var(--nav-h)-16px)] pb-4 md:pb-6 [.is-static_&]:relative">
        <div className="container-x h-full">
          <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-[32px] md:block md:rounded-[48px]" style={{ background: slow.panel }}>
            <div className="relative z-[1] px-6 md:max-w-[40%] md:p-14">
              <p className="eyebrow">{slow.eyebrow}</p>
              <Heading lines={slow.heading} className="mt-4 text-[clamp(42px,5.6vw,100px)] md:mt-5" />
              <p className="mt-5 hidden max-w-[360px] text-[17px] leading-relaxed text-fg/80 md:block">{slow.text}</p>
            </div>

            <div className="relative z-[1] mt-5 flex gap-2 px-5 md:static md:mt-0 md:px-0">
              {slow.captions.map((c, i) => (
                <div
                  key={c.title}
                  data-sticker={i}
                  className={`relative grid aspect-square w-[88px] shrink-0 place-items-center rounded-full text-center text-[#2b1233] shadow-[0_18px_30px_-14px_rgba(80,20,40,.45)] md:absolute md:w-[clamp(130px,11.5vw,190px)] ${c.pos}`}
                  style={{ background: c.fill }}
                >
                  <div className="px-2 md:px-3">
                    <p className="font-display text-[17px] leading-none md:text-[clamp(22px,2.1vw,34px)]">{c.title}</p>
                    <p className="mt-1 text-[12px] leading-tight font-bold md:text-[14px]">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* phone: under the stickers, the whole bowl in view · laptop: the right 64% of the panel */}
            <canvas ref={canvas} role="img" aria-label={slow.alt} className="pour-canvas relative mt-6 block aspect-[16/9.6] w-full md:absolute md:inset-y-0 md:right-0 md:mt-0 md:aspect-auto md:h-full md:w-[64%]" />
          </div>
        </div>
      </div>
    </section>
  );
}

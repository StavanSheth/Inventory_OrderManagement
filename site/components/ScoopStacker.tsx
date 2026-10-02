"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import Heading from "./Heading";
import { addToOrder } from "./ScoopNav";
import { builder, flavours, Flavour } from "../content";
import { addItemsToCartStorage } from "@/frontend/modules/customer/cart-storage";
import { CartItem } from "@/frontend/modules/customer/catalog-view";

type SelectedScoop = Flavour & { uid: number };

export default function ScoopStacker() {
  const router = useRouter();
  const root = useRef<HTMLElement>(null);
  const drops = useRef<(HTMLDivElement | null)[]>([]);
  const squish = useRef<(HTMLImageElement | null)[]>([]);
  const [selectedScoops, setSelectedScoops] = useState<SelectedScoop[]>([]);
  const [done, setDone] = useState(false);
  const ordered = useRef(false);
  const nextUid = useRef(0);
  const prevLength = useRef(0);

  const handleAddScoop = (f: Flavour) => {
    if (selectedScoops.length >= 3 || done) return;
    setSelectedScoops([...selectedScoops, { ...f, uid: nextUid.current++ }]);
  };

  const handleRemoveScoop = (uid: number) => {
    setSelectedScoops(selectedScoops.filter(s => s.uid !== uid));
    setDone(false);
    ordered.current = false;
  };

  const handleReset = () => {
    setSelectedScoops([]);
    setDone(false);
    ordered.current = false;
  };

  useEffect(() => {
    const isAdding = selectedScoops.length > prevLength.current;
    prevLength.current = selectedScoops.length;

    if (prefersReducedMotion() || selectedScoops.length === 0 || !isAdding) return;
    const k = selectedScoops.length - 1;
    const dropEl = drops.current[k];
    const squishEl = squish.current[k];
    if (!dropEl || !squishEl) return;

    // Use gsap directly without reverting, so scoops stay where they land
    const tl = gsap.timeline();
    tl.fromTo(
      dropEl,
      { y: -window.innerHeight * 1.1, rotate: k % 2 ? 5 : -5 },
      { y: 0, rotate: 0, duration: 0.5, ease: "power2.in" }
    );
    tl.fromTo(
      squishEl,
      { scaleY: 0.84, scaleX: 1.1 },
      { scaleY: 1, scaleX: 1, duration: 0.25, ease: "power3.out" }
    );
  }, [selectedScoops.length]);

  const total = selectedScoops.reduce((s, f) => s + f.price, 0);
  const currentTint = builder.tints[0]; // always use builder.tints[0] for the background

  return (
    <section ref={root} id="build" aria-label="Build your cone" className="relative z-[1]">
      <div
        className="stack-tint relative flex flex-col overflow-hidden py-16 lg:py-28 pt-[var(--nav-h)] transition-colors duration-700"
        style={{ backgroundColor: currentTint }}
      >
        <div className="container-x grid flex-1 grid-rows-[auto_1fr_auto] items-center gap-3 py-3 lg:grid-cols-[1fr_auto_1fr] lg:grid-rows-1 lg:gap-12 lg:py-8">
          {/* left: heading + steps */}
          <div>
            <p className="eyebrow hidden lg:inline-flex">{builder.eyebrow}</p>
            <Heading lines={builder.heading} className="text-[clamp(40px,5.4vw,96px)] max-lg:text-center max-lg:[&>span]:inline max-lg:[&>span+span]:ml-[0.22em] lg:mt-5" />
            <p className="mt-5 hidden max-w-[340px] text-[17px] leading-relaxed text-muted lg:block">
              {builder.text}
            </p>
            
            <div className="mt-8 hidden flex-col gap-3 lg:flex">
              {flavours.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleAddScoop(f)}
                  disabled={selectedScoops.length >= 3 || done}
                  className="group flex w-max items-center gap-3 text-[16px] font-bold transition-all disabled:opacity-40"
                >
                  <span
                    className="grid h-8 w-8 place-items-center rounded-full transition-transform group-hover:scale-110 group-active:scale-95"
                    style={{ background: f.fill, color: f.ink }}
                  >
                    +
                  </span>
                  <span className="group-hover:text-accent transition-colors">{f.name}</span>
                </button>
              ))}
              {selectedScoops.length > 0 && (
                <button
                  onClick={handleReset}
                  className="mt-2 w-max text-[14px] font-bold text-accent underline opacity-70 hover:opacity-100"
                >
                  Start over
                </button>
              )}
            </div>
            
            {/* Mobile flavors selection */}
            <div className="mt-6 flex flex-wrap justify-center gap-2 lg:hidden">
              {flavours.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleAddScoop(f)}
                  disabled={selectedScoops.length >= 3 || done}
                  className="flex items-center gap-1.5 rounded-full bg-white/60 border border-transparent px-3 py-1.5 text-[13px] font-bold transition-all hover:bg-white hover:border-accent disabled:opacity-40"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: f.fill }} />
                  {f.name}
                </button>
              ))}
              {selectedScoops.length > 0 && (
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-[13px] font-bold text-accent"
                >
                  Start over
                </button>
              )}
            </div>
          </div>

          {/* centre: the stack */}
          <div className="relative mx-auto mt-6 h-[calc(var(--u)*4.3)] w-[calc(var(--u)*1.35)] [--u:min(11.5svh,104px)] lg:mt-0 lg:[--u:min(14.5vh,150px)]">
            <div aria-hidden className="absolute bottom-[-4%] left-1/2 h-[6%] w-[90%] -translate-x-1/2 rounded-[50%] bg-[#2b1233]/10 blur-md transition-opacity duration-500" />
            <img src={builder.cone} alt="Waffle cone" className="absolute bottom-0 left-1/2 z-[1] w-[calc(var(--u))] -translate-x-1/2" />
            {selectedScoops.map((f, k) => (
              <div
                key={f.uid}
                ref={(el) => {
                  drops.current[k] = el;
                }}
                className="absolute left-0 w-full transition-[bottom] duration-500 ease-out"
                style={{ bottom: `calc(var(--u) * ${1.55 + k * 0.72})`, zIndex: 10 + k }}
              >
                <img
                  ref={(el) => {
                    squish.current[k] = el;
                  }}
                  src={f.image}
                  alt={`${f.name} scoop`}
                  className="w-full origin-bottom drop-shadow-[0_10px_10px_rgba(60,10,30,.18)]"
                />
              </div>
            ))}
          </div>

          {/* right: the receipt */}
          <div className="w-full max-w-[380px] justify-self-center rounded-[28px] bg-white p-5 shadow-[var(--soft-shadow)] max-lg:px-5 max-lg:py-4 lg:justify-self-end lg:p-7">
            <div className="flex items-baseline justify-between">
              <p className="font-display text-[24px] lg:text-[28px]">Your cone</p>
              <p className="label">Order #MT-0426</p>
            </div>
            <ul className="mt-3 space-y-1.5 text-[14px] lg:mt-5 lg:space-y-2.5 lg:text-[16px]">
              <li className="hidden justify-between font-semibold lg:flex">
                <span>{builder.coneLine.name}</span>
                <span className="text-muted">{builder.coneLine.price}</span>
              </li>
              {selectedScoops.map((f) => (
                <li key={f.uid} className="receipt-line flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: f.fill }} />
                    {f.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="tnum">₹{f.price}</span>
                    {!done && (
                      <button
                        onClick={() => handleRemoveScoop(f.uid)}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[12px] text-muted/40 transition-colors hover:bg-red-50 hover:text-red-500"
                        title="Remove scoop"
                        aria-label={`Remove ${f.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {Array.from({ length: 3 - selectedScoops.length }).map((_, k) => (
                <li key={`empty-${k}`} className="receipt-line flex items-center justify-between font-semibold text-muted/40">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-muted/20" />
                    Pick a scoop
                  </span>
                  <span className="tnum">—</span>
                </li>
              ))}
            </ul>
            <div className="dash mt-3 flex items-baseline justify-between pt-3 lg:mt-5 lg:pt-4">
              <span className="label">Total</span>
              <span key={total} className="font-display tnum text-[30px] text-accent lg:text-[40px]">
                ₹{total}
              </span>
            </div>
            <button
              onClick={() => {
                if (selectedScoops.length === 0 || ordered.current) return;
                ordered.current = true;
                setDone(true);
                addToOrder();

                const flavourMap: Record<string, { id: string; name: string; price: number; description: string }> = {
                  pistachio: {
                    id: 'prod-alpha-pistachio',
                    name: 'Roasted Pistachio Scoop',
                    price: 180,
                    description: 'Slow-churned roasted Sicilian pistachio gelato with crushed kernels.',
                  },
                  mango: {
                    id: 'prod-alpha-mango',
                    name: 'Alphonso Mango Scoop',
                    price: 140,
                    description: 'Ratnagiri Alphonsos churned fresh, folded into sweet malai cream.',
                  },
                  strawberry: {
                    id: 'prod-alpha-strawberry',
                    name: 'Strawberry Cream Scoop',
                    price: 140,
                    description: 'Fresh seasonal strawberries with homemade ripple jam.',
                  },
                  coffee: {
                    id: 'prod-alpha-coffee',
                    name: 'Filter Coffee Scoop',
                    price: 150,
                    description: 'Real South Indian decoction with organic jaggery.',
                  },
                  cocoa: {
                    id: 'prod-alpha-dark-chocolate',
                    name: '70% Single Origin Dark Chocolate',
                    price: 190,
                    description: 'Velvety Ecuadorian dark chocolate churned to silky perfection.',
                  },
                  meetha: {
                    id: 'prod-alpha-meetha',
                    name: 'Double ka Meetha Scoop',
                    price: 160,
                    description: 'Saffron cream, caramelised bread, and toasted almond slivers.',
                  },
                };

                const counts: Record<string, number> = {};
                for (const s of selectedScoops) {
                  counts[s.id] = (counts[s.id] || 0) + 1;
                }

                const itemsToAdd: CartItem[] = Object.entries(counts).map(([flavourId, qty]) => {
                  const meta = flavourMap[flavourId] || {
                    id: `prod-alpha-${flavourId}`,
                    name: `${flavourId.charAt(0).toUpperCase() + flavourId.slice(1)} Scoop`,
                    price: 140,
                    description: 'Handcrafted fresh scoop.',
                  };
                  return {
                    product: {
                      id: meta.id,
                      branch_id: 'branch-alpha',
                      category_id: 'cat-alpha-scoops',
                      name: meta.name,
                      description: meta.description,
                      price: meta.price,
                      active: true,
                      image_url: `/images/melt/scoop-${flavourId}.webp`,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    quantity: qty,
                  };
                });

                addItemsToCartStorage(itemsToAdd);

                setTimeout(() => {
                  router.push('/order?tab=cart');
                }, 300);
              }}
              className={`btn mt-3 w-full justify-center lg:mt-5 ${selectedScoops.length > 0 ? "btn-solid" : "btn-outline opacity-50"}`}
              disabled={selectedScoops.length === 0 || done}
            >
              {done ? `Added! Taking you to cart →` : `${builder.cta} · ₹${total}`}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

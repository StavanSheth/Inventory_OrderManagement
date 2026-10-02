"use client";

import { useEffect } from "react";
import ScoopLoader from "./components/ScoopLoader";
import ScoopNav from "./components/ScoopNav";
import MeltHero from "./components/MeltHero";
import FlavourWave from "./components/FlavourWave";
import ScoopShelf from "./components/ScoopShelf";
import ScoopStacker from "./components/ScoopStacker";
import SlowChurn from "./components/SlowChurn";
import TreatBubbles from "./components/TreatBubbles";
import SweetDeals from "./components/SweetDeals";
import LoveNotes from "./components/LoveNotes";
import Parlours from "./components/Parlours";
import MeltFooter from "./components/MeltFooter";
import { builder, flavours } from "./content";
import { meta } from "./site";

/** Melt Theory: a strawberry-milk parlour that melts. Plan + reasons: site/DESIGN.md. */
export default function Page() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      history.scrollRestoration = "manual";
      if (/[?&]record/.test(window.location.search)) {
        const s = document.createElement("style");
        s.textContent =
          "*,*::before,*::after{cursor:none!important}html{scrollbar-width:none}html::-webkit-scrollbar{display:none}";
        document.head.appendChild(s);
      }
    }
  }, []);

  return (
    <>
      <ScoopLoader name={meta.loaderText ?? meta.name} cone={builder.cone} scoop={flavours[2].image} />
      <ScoopNav />
      <main className="relative z-[1] overflow-x-clip">
        <MeltHero />
        <FlavourWave />
        <ScoopShelf />
        <ScoopStacker />
        <SlowChurn />
        <TreatBubbles />
        <SweetDeals />
        <LoveNotes />
        <Parlours />
      </main>
      <MeltFooter />
    </>
  );
}

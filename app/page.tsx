import { AppShell } from "@/frontend/components/ui";
import SitePage from "@/site/Page";
import { meta } from "@/site/site";

/**
 * Route-level composition for root landing page.
 * Strictly presents application shell and presentation view without business logic.
 */
export default function Home() {
  return (
    <AppShell
      title={meta.loaderText ?? meta.name}
      enableLoader={meta.loader ?? true}
      enableCursor={meta.cursor !== false}
      recordOptions={meta.record}
    >
      <SitePage />
    </AppShell>
  );
}


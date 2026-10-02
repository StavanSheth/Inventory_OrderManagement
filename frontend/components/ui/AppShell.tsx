'use client';

import React from 'react';
import Loader from '@/components/engine/Loader';
import Cursor from '@/components/engine/Cursor';
import SmoothScroll from '@/components/engine/SmoothScroll';
import Animations from '@/components/engine/Animations';
import RecordMode from '@/components/engine/RecordMode';

export interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  enableLoader?: boolean;
  enableCursor?: boolean;
  recordOptions?: {
    speed?: number;
    duration?: number;
    delay?: number;
  };
}

/**
 * AppShell: Primary application visual shell for frontend presentation.
 * Encapsulates smooth scrolling, animation hooks, cursor tracking, and loader states.
 */
export default function AppShell({
  children,
  title = 'Melt Ice Cream',
  enableLoader = true,
  enableCursor = false,
  recordOptions,
}: AppShellProps) {
  return (
    <div className="app-shell min-h-screen">
      <Loader text={title} enabled={enableLoader} />
      <SmoothScroll />
      <Animations />
      <RecordMode
        speed={recordOptions?.speed}
        duration={recordOptions?.duration}
        delay={recordOptions?.delay}
      />
      {enableCursor && <Cursor />}
      <main className="app-main">{children}</main>
    </div>
  );
}

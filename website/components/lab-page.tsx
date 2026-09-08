'use client';

import { MandelbrotJuliaExplorer } from '@/components/dynamics-explorer';
import { MandelbrotMotion } from '@/components/mandelbrot-motion';
import { CorrespondenceExplorer } from '@/components/correspondence-explorer';

export default function LabPage() {
  return (
    <main id="main-content" className="lab-page">
      <div className="blog-laboratory-content">
        <header className="journal-heading"><h1>Laboratory</h1></header>
        <MandelbrotJuliaExplorer />
        <MandelbrotMotion />
        <CorrespondenceExplorer />
      </div>
    </main>
  );
}

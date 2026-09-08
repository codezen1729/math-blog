import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import '../app/globals.css';
import { SiteApp } from '@/components/site-app';

const root = document.getElementById('root');

if (!root) {
  throw new Error('The page is missing its #root mount point.');
}

createRoot(root).render(<SiteApp />);

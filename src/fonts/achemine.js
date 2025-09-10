import localFont from 'next/font/local';

// Fonte Achemine centralisée pour simplifier les imports.
// Utilisation: import { achemineFont } from '@/fonts/achemine';
// Puis ajouter className={achemineFont.className} sur un conteneur.
export const achemineFont = localFont({
  src: [
    { path: 'Achemine/achemine_normal.woff', weight: '400', style: 'normal' },
    { path: 'Achemine/achemin_italic.woff', weight: '400', style: 'italic' },
    { path: 'Achemine/achemine_bold.woff', weight: '700', style: 'normal' },
    { path: 'Achemine/achemine_extrabold.woff', weight: '800', style: 'normal' }
  ]
});


import { achemineFont } from '@/fonts/achemine';

// Layout spécifique aux afficheurs: applique uniquement la police Achemine
// et n'ajoute aucun footer / chrome supplémentaire.
export default function AfficheursLayout({ children }) {
  return (
    <div className={`afficheurs-layout ${achemineFont.className}`}>
      {children}
    </div>
  );
}

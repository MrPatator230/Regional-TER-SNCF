import { requireRole } from '@/app/lib/auth';

async function fetchFavorites() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/public/favorites`, { cache: 'no-store' });
    const json = await res.json();
    return Array.isArray(json.favorites) ? json.favorites : [];
  } catch { return []; }
}

export default async function FavorisPage() {
  await requireRole(['client']);
  const favorites = await fetchFavorites();
  return (
    <div className="container my-5" style={{maxWidth:'760px'}}>
      <h1 className="h4 mb-4">Mes favoris</h1>
      {favorites.length === 0 && <p>Aucun favori enregistré.</p>}
      {favorites.length > 0 && (
        <ul className="list-group">
          {favorites.map(id => (
            <li key={id} className="list-group-item d-flex justify-content-between align-items-center">
              Sillon #{id}
              <a className="btn btn-outline-secondary btn-sm" href={`/se-deplacer/prochains-departs?focus=${id}`}>Voir</a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4"><a href="/espace/client">Retour espace client</a></p>
    </div>
  );
}


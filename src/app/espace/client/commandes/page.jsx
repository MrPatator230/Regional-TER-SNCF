import { requireRole } from '@/app/lib/auth';

async function fetchOrders() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/public/orders`, { cache: 'no-store' });
    const json = await res.json();
    return Array.isArray(json.orders) ? json.orders : [];
  } catch { return []; }
}

export default async function CommandesPage() {
  await requireRole(['client']);
  const orders = await fetchOrders();
  return (
    <div className="container my-5" style={{maxWidth:'860px'}}>
      <h1 className="h4 mb-4">Mes commandes</h1>
      {orders.length === 0 && <p>Vous n'avez pas encore de commande.</p>}
      {orders.length > 0 && (
        <div className="table-responsive">
          <table className="table table-sm align-middle">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Trajet</th>
                <th>Voyageurs</th>
                <th>Billets</th>
                <th>Carte</th>
                <th>Prix</th>
                <th>Statut</th>
                <th>Date</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id}>
                  <td><strong>{o.reference}</strong></td>
                  <td>{o.origin} → {o.destination}</td>
                  <td>{o.passengers}</td>
                  <td>{o.tickets_count ?? '—'}</td>
                  <td>{o.card === 'none' ? '—' : o.card}</td>
                  <td>{(o.price_cents/100).toFixed(2)} €</td>
                  <td>{o.status}</td>
                  <td>{new Date(o.created_at).toLocaleString('fr-FR')}</td>
                  <td><a href={`/espace/client/commandes/${o.id}`}>Billets</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4"><a href="/espace/client">Retour espace client</a></p>
    </div>
  );
}

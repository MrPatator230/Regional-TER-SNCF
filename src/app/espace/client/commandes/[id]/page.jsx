import { requireRole } from '@/app/lib/auth';

async function fetchOrder(id) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/public/orders/${id}`, { cache:'no-store' });
    if(!res.ok) return null;
    const json = await res.json();
    return json && json.order ? json : null;
  } catch { return null; }
}

export default async function CommandeDetailPage(props){
  await requireRole(['client']);
  const { id } = await props.params; // Next 15: params thenable
  const data = await fetchOrder(id);
  if(!data) {
    return (
      <div className="container my-5" style={{maxWidth:'860px'}}>
        <h1 className="h5 mb-3">Commande introuvable</h1>
        <p><a href="/espace/client/commandes">Retour à mes commandes</a></p>
      </div>
    );
  }
  const { order, tickets } = data;
  return (
    <div className="container my-5" style={{maxWidth:'860px'}}>
      <nav aria-label="Fil d'ariane" className="mb-3 small">
        <ol className="breadcrumb" style={{margin:0}}>
          <li className="breadcrumb-item"><a href="/espace/client">Espace client</a></li>
          <li className="breadcrumb-item"><a href="/espace/client/commandes">Mes commandes</a></li>
          <li className="breadcrumb-item active" aria-current="page">{order.reference}</li>
        </ol>
      </nav>
      <h1 className="h4 mb-3">Commande {order.reference}</h1>
      <p className="mb-2">Trajet: <strong>{order.origin} → {order.destination}</strong></p>
      <p className="mb-2">Voyageurs: {order.passengers} · Carte: {order.card === 'none' ? '—' : order.card}</p>
      <p className="mb-4">Montant: {(order.price_cents/100).toFixed(2)} € · Statut: {order.status}</p>
      <h2 className="h6 mb-3">Billets</h2>
      {(!tickets || tickets.length===0) && <p>Aucun billet généré.</p>}
      {tickets && tickets.length>0 && (
        <div className="d-flex flex-wrap gap-4">
          {tickets.map(t => (
            <div key={t.id} className="text-center" style={{width:'180px'}}>
              <img src={t.qr_data} alt={`QR billet ${t.passenger_index}`} style={{width:'160px', height:'160px'}} />
              <div className="small mt-1">Voyageur {t.passenger_index}</div>
              <a className="small d-inline-block mt-1" download={`billet-${order.reference}-v${t.passenger_index}.png`} href={t.qr_data}>Télécharger</a>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4"><a href="/espace/client/commandes">← Retour à mes commandes</a></p>
    </div>
  );
}


import { requireRole } from '@/app/lib/auth';

export default async function ClientEspace() {
  const user = await requireRole(['client']);
  return (
    <div className="container my-5">
      <h1 className="h3">Espace client</h1>
      <p>Bienvenue{user?.first_name ? `, ${user.first_name}` : ''} dans votre espace client.</p>
      <ul className="list-unstyled mt-4" style={{ maxWidth: '360px' }}>
        <li className="mb-2">
          <a href="/espace/client/commandes">Mes commandes</a>
        </li>
        <li className="mb-2">
          <a href="/espace/client/favoris">Mes favoris</a>
        </li>
      </ul>
    </div>
  );
}

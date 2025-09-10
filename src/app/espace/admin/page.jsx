import { requireRole } from '@/app/lib/auth';

export default function AdminEspace() {
  requireRole(['admin']);
  return (
    <div className="container my-5">
      <h1 className="h3">Espace administrateur</h1>
      <p>Bienvenue dans l’espace administrateur.</p>
    </div>
  );
}


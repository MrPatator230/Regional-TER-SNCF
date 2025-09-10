import { requireRole } from '@/app/lib/auth';

export default async function AgentEspace() {
  await requireRole(['agent']);
  return (
    <div className="container my-5">
      <h1 className="h3">Espace agent</h1>
      <p>Bienvenue dans l’espace agent.</p>
    </div>
  );
}

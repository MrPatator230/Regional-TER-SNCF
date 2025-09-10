import { requireRole } from '@/app/lib/auth';
import StationsManager from './stations-manager.jsx';

export default async function StationsPage() {
  await requireRole(['admin']);
  return (
    <div className="container my-4">
      <h1 className="h3 mb-3">Gares</h1>
      <p className="text-muted">Créez, modifiez et supprimez les gares desservies.</p>
      <StationsManager />
    </div>
  );
}

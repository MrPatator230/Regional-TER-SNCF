import { requireRole } from '@/app/lib/auth';
import QuaisPage from '@/app/espace/admin/quais/ui/QuaisPage';

export default async function AdminQuaisPage(){
  await requireRole(['admin']);
  return <section>
    <h1 className="h1 m-0">Attribution des quais</h1>
    <p className="text-muted">Assignez les quais aux sillons par gare.</p>
    <QuaisPage />
  </section>;
}

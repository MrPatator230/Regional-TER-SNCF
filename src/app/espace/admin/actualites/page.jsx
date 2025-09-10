import { requireRole } from '@/app/lib/auth';
import AdminInfosEventsNews from './AdminInfosEventsNews';

export default async function ActualitesPage(){
  await requireRole(['admin']);
  return <AdminInfosEventsNews />;
}

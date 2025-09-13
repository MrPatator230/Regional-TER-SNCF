import { requireRole } from '@/app/lib/auth';
import SchedulesClient from './SchedulesClient';

export default async function Page(){
  await requireRole(['admin']);
  return <SchedulesClient />;
}

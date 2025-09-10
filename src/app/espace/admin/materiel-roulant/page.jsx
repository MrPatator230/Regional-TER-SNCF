import { requireRole } from "@/app/lib/auth";
import CreateMaterielModal from "@/app/espace/admin/materiel-roulant/ui/CreateMaterielModal";
import MaterielList from "@/app/espace/admin/materiel-roulant/ui/MaterielList";

export default async function MaterielRoulantPage() {
  await requireRole(['admin']);
  return (
    <section>
      <div className="d-flex align-items-center justify-content-between">
        <div>
          <h1 className="h1 m-0">Matériel Roulant</h1>
          <p className="text-muted mb-0">Créez et gérez le matériel roulant (visuels stockés sur disque).</p>
        </div>
        <CreateMaterielModal />
      </div>

      <div className="mt-4">
        <MaterielList />
      </div>
    </section>
  );
}

"use client";
import React, { useState } from "react";
import MaterielForm from "@/app/espace/admin/materiel-roulant/ui/MaterielForm";

export default function CreateMaterielModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>Créer</button>
      {open ? (
        <div className="modal show" style={{ display: "block", background: "rgba(0,0,0,.3)" }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Créer un matériel roulant</h5>
                <button className="close" onClick={() => setOpen(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <MaterielForm hidePreview onSuccess={() => setOpen(false)} />
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setOpen(false)}>Fermer</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}


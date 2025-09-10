import React, { Suspense } from "react";
import SeConnecterContent from "./SeConnecterContent";

export default function SeConnecterPage() {
  return (
    <Suspense fallback={<div>Chargement…</div>}>
      <SeConnecterContent />
    </Suspense>
  );
}

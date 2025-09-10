"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function InscriptionPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    birthDate: "",
    email: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function update(k, v) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur d'inscription");
      router.push("/se-connecter?registered=1");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container my-5">
      <div className="row justify-content-center">
        <div className="col-12 col-md-10 col-lg-8">
          <wcs-card>
            <div className="p-4">
              <h1 className="h3 mb-3">Créer un compte</h1>
              {error && <div className="alert alert-danger" role="alert">{error}</div>}
              <form onSubmit={handleSubmit} noValidate>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label htmlFor="firstName" className="form-label">Prénom</label>
                    <input id="firstName" className="form-control" value={form.firstName} onChange={(e)=>update('firstName', e.target.value)} required />
                  </div>
                  <div className="col-md-6">
                    <label htmlFor="lastName" className="form-label">Nom</label>
                    <input id="lastName" className="form-control" value={form.lastName} onChange={(e)=>update('lastName', e.target.value)} required />
                  </div>
                  <div className="col-md-6">
                    <label htmlFor="birthDate" className="form-label">Date de naissance</label>
                    <input id="birthDate" type="date" className="form-control" value={form.birthDate} onChange={(e)=>update('birthDate', e.target.value)} />
                    <div className="form-text">Utile pour les offres -26 ans.</div>
                  </div>
                  <div className="col-md-6">
                    <label htmlFor="email" className="form-label">Adresse e-mail</label>
                    <input id="email" type="email" className="form-control" value={form.email} onChange={(e)=>update('email', e.target.value)} required autoComplete="email" />
                  </div>
                  <div className="col-md-6">
                    <label htmlFor="password" className="form-label">Mot de passe</label>
                    <input id="password" type="password" className="form-control" value={form.password} onChange={(e)=>update('password', e.target.value)} required autoComplete="new-password" />
                  </div>
                </div>
                <div className="d-grid gap-2 mt-4">
                  <button type="submit" disabled={loading} className="btn btn-primary">
                    {loading ? "Création..." : "Créer mon compte"}
                  </button>
                </div>
              </form>
              <hr className="my-4" />
              <p className="mb-0">Déjà inscrit ? <Link href="/se-connecter" className="link-primary">Se connecter</Link></p>
            </div>
          </wcs-card>
        </div>
      </div>
    </div>
  );
}

"use client";
import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function SeConnecterContent() {
  const router = useRouter();
  const search = useSearchParams();
  const registered = search.get("registered") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur de connexion");
      // Redirection selon le rôle
      const role = data?.role || "client";
      router.push(`/espace/${role}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container my-5">
      <div className="row justify-content-center">
        <div className="col-12 col-md-8 col-lg-6">
          {/* Carte WCS */}
          <wcs-card>
            <div className="p-4">
              <h1 className="h3 mb-3">Se connecter</h1>
              {registered && (
                <div className="alert alert-success" role="alert">
                  Inscription réussie. Vous pouvez vous connecter.
                </div>
              )}
              {error && (
                <div className="alert alert-danger" role="alert">{error}</div>
              )}
              <form onSubmit={handleSubmit} noValidate>
                <div className="mb-3">
                  <label htmlFor="email" className="form-label">Adresse e-mail</label>
                  <input
                    id="email"
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="password" className="form-label">Mot de passe</label>
                  <input
                    id="password"
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                  {loading ? "Connexion…" : "Se connecter"}
                </button>
              </form>
              <div className="mt-3 text-center">
                <Link href="/inscription">Créer un compte</Link>
              </div>
            </div>
          </wcs-card>
        </div>
      </div>
    </div>
  );
}


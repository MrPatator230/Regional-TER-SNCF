import React from 'react';
import Header from '../../components/Header';
import { notFound } from 'next/navigation';

async function fetchArticle(slug){
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const r = await fetch(`${base}/api/public/articles/${encodeURIComponent(slug)}`, { cache:'no-store' });
    if(!r.ok) return null;
    const j = await r.json();
    return j.item || null;
  } catch { return null; }
}

function sanitize(html){
  if(!html) return '';
  // Très simple: retirer scripts & iframes
  return html
    .replace(/<\/(?:script|style)>/gi,'')
    .replace(/<script[\s\S]*?<\/script>/gi,'')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi,'');
}

export async function generateMetadata({ params }){
  const article = await fetchArticle(params.slug);
  if(!article) return { title:'Article introuvable - Ferrovia Connect' };
  return { title: `${article.titre} - Ferrovia Connect`, description: article.resume || undefined };
}

export default async function ArticlePage({ params }){
  const article = await fetchArticle(params.slug);
  if(!article) return notFound();
  return (
    <>
      <Header />
      <main className="main-content" style={{padding:'2rem 0'}}>
        <div className="main-container" style={{maxWidth:'920px'}}>
          <nav className="mb-3 small"><a href="/articles">← Tous les articles</a></nav>
          <h1 className="h3 mb-3">{article.titre}</h1>
          {article.image_path && <div className="mb-4"><img src={article.image_path} alt="illustration" style={{maxWidth:'100%',height:'auto'}}/></div>}
          {article.resume && <p className="lead">{article.resume}</p>}
          <article className="article-body" dangerouslySetInnerHTML={{ __html: sanitize(article.contenu) }} />
          <p className="text-muted small mt-4">Mis à jour le {new Date(article.updated_at).toLocaleString()}</p>
        </div>
      </main>
    </>
  );
}


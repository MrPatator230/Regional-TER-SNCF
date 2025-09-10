import React from 'react';
import Header from '../components/Header';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Articles - Ferrovia Connect' };

async function getArticles(page){
  try {
    const r = await fetch(`/api/public/articles?page=${page}&limit=12`, { cache:'no-store' });
    if(!r.ok) return { items:[], page:1, pageCount:1 };
    const j = await r.json();
    return { items: j.items||[], page: j.page||1, pageCount: j.pageCount||1 };
  } catch { return { items:[], page:1, pageCount:1 }; }
}

export default async function ArticlesListPage(props){
  const sp = await props.searchParams; // Next 15: searchParams peut être une Promise
  const currentPage = Math.max(1, parseInt((sp?.page)||'1',10));
  const { items, page, pageCount } = await getArticles(currentPage);
  const pages = (()=>{ const arr=[]; for(let i=1;i<=pageCount;i++) arr.push(i); return arr; })();
  return (
    <>
      <Header />
      <main className="main-content" style={{padding:'2rem 0'}}>
        <div className="main-container">
          <h1 className="h3 mb-4">Articles</h1>
          {!items.length && <p>Aucun article pour le moment.</p>}
          <div className="row g-4 mb-4">
            {items.map(a=> (
              <div key={a.slug} className="col-md-4">
                <div className="card h-100 d-flex flex-column">
                  {a.image_path && <img src={a.image_path} alt={a.titre} style={{maxHeight:160,objectFit:'contain',padding:'1rem'}} />}
                  <div className="card-body d-flex flex-column">
                    <h2 className="h5">{a.titre}</h2>
                    {a.resume && <p className="flex-grow-1 small mb-3">{a.resume}</p>}
                    <a href={`/articles/${a.slug}`} className="mt-auto"><wcs-button>Lire</wcs-button></a>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {pageCount>1 && (
            <div className="d-flex flex-wrap align-items-center gap-2">
              {pages.map(p=> (
                <a key={p} href={`/articles?page=${p}`} style={{textDecoration:'none'}}>
                  <wcs-button size="s" mode={p===page? 'plain':'stroked'}>{p}</wcs-button>
                </a>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

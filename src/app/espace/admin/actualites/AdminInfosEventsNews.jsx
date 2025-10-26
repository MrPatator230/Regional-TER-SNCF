"use client";
import React from 'react';

function Spinner(){ return <wcs-spinner mode="dark" />; }
const TYPES_INFO = [
  { value:'information', label:'Information' },
  { value:'annulation', label:'Annulation' },
  { value:'attention', label:'Attention' },
  { value:'travaux', label:'Travaux' }
];
function formatDate(dt){ if(!dt) return ''; const d=new Date(dt); if(isNaN(d)) return ''; return d.toLocaleString(); }
function useModal(){ const [open,setOpen]=React.useState(false); return { open, openModal:()=>setOpen(true), close:()=>setOpen(false) }; }

export default function AdminInfosEventsNews(){
  return <section>
    <h1 className="h3 mb-3">Gestion Infos Trafic / Évènements / Actualités</h1>
    <wcs-tabs gutter selected-index={0}>
      <wcs-tab header="Infos Trafic"><InfosTraficManager /></wcs-tab>
      <wcs-tab header="Évènements"><EvenementsManager /></wcs-tab>
      <wcs-tab header="Actualités"><ActualitesManager /></wcs-tab>
      <wcs-tab header="Articles"><ArticlesManager /></wcs-tab>
    </wcs-tabs>
  </section>;
}

/* ============== INFOS TRAFIC ============== */
function InfosTraficManager(){
  const [items,setItems]=React.useState([]); const [loading,setLoading]=React.useState(true); const [error,setError]=React.useState('');
  const modal=useModal(); const [editing,setEditing]=React.useState(null); const [submitting,setSubmitting]=React.useState(false); const formRef=React.useRef(null);
  async function load(){ setLoading(true); setError(''); try { const r=await fetch('/api/infos-trafics'); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); setItems(j.items||[]);} catch(e){ setError(e.message);} finally { setLoading(false);} }
  React.useEffect(()=>{ load(); },[]);
  function openCreate(){ setEditing(null); modal.openModal(); setTimeout(()=> formRef.current?.reset?.(),0);}
  function openEdit(item){ setEditing(item); modal.openModal(); setTimeout(()=>{ if(!formRef.current) return; const f=formRef.current; f.querySelector('[name="titre"]').value=item.titre; f.querySelector('[name="type"]').value=item.type; const hidden=f.querySelector('input[name="contenu"]'); const ed=f.querySelector('[data-editor-for="contenu"]'); if(hidden){ hidden.value=item.contenu||''; } if(ed){ ed.innerHTML=item.contenu||''; } },0);}
  async function handleSubmit(e){ e.preventDefault(); setSubmitting(true); const fd=new FormData(formRef.current); const payload={ titre:fd.get('titre'), contenu:fd.get('contenu'), type:fd.get('type') }; try { const url= editing? `/api/infos-trafics?id=${editing.id}`:'/api/infos-trafics'; const method= editing? 'PUT':'POST'; const r=await fetch(url,{method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); modal.close(); await load(); } catch(e){ alert(e.message);} finally { setSubmitting(false);} }
  async function del(item){ if(!confirm('Supprimer cette info trafic ?')) return; try { const r=await fetch(`/api/infos-trafics?id=${item.id}`,{method:'DELETE'}); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); await load(); } catch(e){ alert(e.message);} }
  return <div className="mb-4">
    <div className="d-flex justify-content-between align-items-center mb-2">
      <h2 className="h5 mb-0">Infos Trafic</h2>
      <wcs-button size="s" onClick={openCreate}>Nouvelle info trafic</wcs-button>
    </div>
    {loading? <p><Spinner /> Chargement...</p>: error? <wcs-alert intent="error" show><span slot="title">{error}</span></wcs-alert> :
      <div className="table-responsive">
        <table className="table table-sm align-middle">
          <thead><tr><th>ID</th><th>Type</th><th>Titre</th><th>Créée</th><th></th></tr></thead>
          <tbody>
            {items.map(it=> <tr key={it.id}>
              <td>{it.id}</td>
              <td><wcs-badge color="primary">{it.type}</wcs-badge></td>
              <td>{it.titre}</td>
              <td>{formatDate(it.created_at)}</td>
              <td className="text-end nowrap">
                <wcs-button mode="stroked" size="s" onClick={()=>openEdit(it)}>Éditer</wcs-button>{' '}
                <wcs-button mode="clear" size="s" onClick={()=>del(it)}>Suppr.</wcs-button>
              </td>
            </tr>)}
            {!items.length && <tr><td colSpan={5} className="text-center">Aucune info</td></tr>}
          </tbody>
        </table>
      </div>}

    {modal.open && <wcs-modal show size="m" show-close-button close-button-aria-label="Fermer" hide-actions>
      <h3 slot="header">{editing? 'Modifier':'Créer'} une info trafic</h3>
      <form ref={formRef} id="infos-trafic-form" onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="form-label">Titre *</label>
          <input name="titre" required className="form-control" />
        </div>
        <div className="mb-3">
          <label className="form-label">Type</label>
          <select name="type" className="form-select">
            {TYPES_INFO.map(t=> <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="mb-3">
          <label className="form-label">Contenu *</label>
          <RichTextEditor name="contenu" required />
        </div>
        <div className="d-flex gap-2 justify-content-end pt-2 border-top">
          <wcs-button mode="stroked" type="button" onClick={modal.close}>Annuler</wcs-button>
          <wcs-button type="submit" loading={submitting? true: undefined}>Enregistrer</wcs-button>
        </div>
      </form>
    </wcs-modal>}
  </div>; }

/* ============== EVENEMENTS ============== */
function EvenementsManager(){
  const [items,setItems]=React.useState([]); const [loading,setLoading]=React.useState(true); const [error,setError]=React.useState('');
  const modal=useModal(); const [editing,setEditing]=React.useState(null); const [submitting,setSubmitting]=React.useState(false); const formRef=React.useRef(null);
  async function load(){ setLoading(true); setError(''); try { const r=await fetch('/api/evenements'); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); setItems(j.items||[]);} catch(e){ setError(e.message);} finally { setLoading(false);} }
  React.useEffect(()=>{ load(); },[]);
  function openCreate(){ setEditing(null); modal.openModal(); setTimeout(()=> formRef.current?.reset?.(),0);}
  function openEdit(item){ setEditing(item); modal.openModal(); setTimeout(()=>{ if(!formRef.current) return; const f=formRef.current; f.querySelector('[name="titre"]').value=item.titre; f.querySelector('[name="duree"]').value=item.duree||''; const lienInput=f.querySelector('[name="lien"]'); if(lienInput) lienInput.value=item.lien||''; const hidden=f.querySelector('input[name="description"]'); const ed=f.querySelector('[data-editor-for="description"]'); if(hidden){ hidden.value=item.description||''; } if(ed){ ed.innerHTML=item.description||''; } const hl=f.querySelector('input[name="highlight"]'); if(hl) hl.checked=!!item.highlight; },0);}
  async function handleSubmit(e){ e.preventDefault(); setSubmitting(true); const fd=new FormData(formRef.current); const payload={ titre:fd.get('titre'), duree:fd.get('duree'), lien: fd.get('lien'), description:fd.get('description'), highlight: fd.get('highlight')==='on' }; try { const url= editing? `/api/evenements?id=${editing.id}`:'/api/evenements'; const method= editing? 'PUT':'POST'; const r=await fetch(url,{method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); modal.close(); await load(); } catch(e){ alert(e.message);} finally { setSubmitting(false);} }
  async function toggleHighlight(item){ try { const r=await fetch(`/api/evenements?id=${item.id}`,{method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...item, highlight: !item.highlight })}); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); await load(); } catch(e){ alert(e.message);} }
  async function del(item){ if(!confirm('Supprimer cet évènement ?')) return; try { const r=await fetch(`/api/evenements?id=${item.id}`,{method:'DELETE'}); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); await load(); } catch(e){ alert(e.message);} }
  return <div className="mb-4">
    <div className="d-flex justify-content-between align-items-center mb-2">
      <h2 className="h5 mb-0">Évènements</h2>
      <wcs-button size="s" onClick={openCreate}>Créer un évènement</wcs-button>
    </div>
    {loading? <p><Spinner /> Chargement...</p>: error? <wcs-alert intent="error" show><span slot="title">{error}</span></wcs-alert> :
      <div className="table-responsive">
        <table className="table table-sm align-middle">
          <thead><tr><th>ID</th><th>Titre</th><th>Durée</th><th>Mise en valeur</th><th>Créé</th><th></th></tr></thead>
          <tbody>
            {items.map(it=> <tr key={it.id}>
              <td>{it.id}</td><td>{it.titre}</td><td>{it.duree}</td>
              <td><wcs-button size="s" mode={it.highlight? 'plain':'stroked'} onClick={()=>toggleHighlight(it)}>{it.highlight? 'Oui':'Non'}</wcs-button></td>
              <td>{formatDate(it.created_at)}</td>
              <td className="text-end nowrap">
                <wcs-button mode="stroked" size="s" onClick={()=>openEdit(it)}>Éditer</wcs-button>{' '}
                <wcs-button mode="clear" size="s" onClick={()=>del(it)}>Suppr.</wcs-button>
              </td>
            </tr>)}
            {!items.length && <tr><td colSpan={6} className="text-center">Aucun évènement</td></tr>}
          </tbody>
        </table>
      </div>}

    {modal.open && <wcs-modal show size="m" show-close-button close-button-aria-label="Fermer" hide-actions>
      <h3 slot="header">{editing? 'Modifier':'Créer'} un évènement</h3>
      <form ref={formRef} id="evenement-form" onSubmit={handleSubmit}>
        <div className="mb-3"><label className="form-label">Titre *</label><input name="titre" required className="form-control" /></div>
        <div className="mb-3"><label className="form-label">Durée</label><input name="duree" className="form-control" placeholder="Ex: 2h, Journée..." /></div>
        <div className="mb-3"><label className="form-label">Lien article (optionnel)</label><input name="lien" type="url" className="form-control" placeholder="https://..." /></div>
        <div className="mb-3"><label className="form-label">Description</label><RichTextEditor name="description" /></div>
        <div className="form-check mb-3">
          <input type="checkbox" name="highlight" id="ev-highlight" className="form-check-input" /> <label htmlFor="ev-highlight" className="form-check-label">Mettre en valeur</label>
        </div>
        <div className="d-flex gap-2 justify-content-end pt-2 border-top">
          <wcs-button mode="stroked" type="button" onClick={modal.close}>Annuler</wcs-button>
          <wcs-button type="submit" loading={submitting? true: undefined}>Enregistrer</wcs-button>
        </div>
      </form>
    </wcs-modal>}
  </div>; }

/* ============== ACTUALITES ============== */
function ActualitesManager(){
  const [items,setItems]=React.useState([]); const [loading,setLoading]=React.useState(true); const [error,setError]=React.useState('');
  const modal=useModal(); const [editing,setEditing]=React.useState(null); const [submitting,setSubmitting]=React.useState(false); const formRef=React.useRef(null);
  async function load(){ setLoading(true); setError(''); try { const r=await fetch('/api/actualites'); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); setItems(j.items||[]);} catch(e){ setError(e.message);} finally { setLoading(false);} }
  React.useEffect(()=>{ load(); },[]);
  function openCreate(){ setEditing(null); modal.openModal(); setTimeout(()=> formRef.current?.reset?.(),0);}
  function openEdit(item){ setEditing(item); modal.openModal(); setTimeout(()=>{ if(!formRef.current) return; const f=formRef.current; f.querySelector('[name="titre"]').value=item.titre; const pd=f.querySelector('input[name="publication_date"]'); if(pd) pd.value= item.publication_date? new Date(item.publication_date).toISOString().slice(0,16):''; const hidden=f.querySelector('input[name="contenu"]'); const ed=f.querySelector('[data-editor-for="contenu"]'); if(hidden){ hidden.value=item.contenu||''; } if(ed){ ed.innerHTML=item.contenu||''; } },0);}
  async function handleSubmit(e){ e.preventDefault(); setSubmitting(true); const fd=new FormData(formRef.current); try { const url= editing? `/api/actualites?id=${editing.id}`:'/api/actualites'; const method= editing? 'PUT':'POST'; const r=await fetch(url,{method, body: fd}); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); modal.close(); await load(); } catch(e){ alert(e.message);} finally { setSubmitting(false);} }
  async function del(item){ if(!confirm('Supprimer cette actualité ?')) return; try { const r=await fetch(`/api/actualites?id=${item.id}`,{method:'DELETE'}); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); await load(); } catch(e){ alert(e.message);} }
  return <div>
    <div className="d-flex justify-content-between align-items-center mb-2">
      <h2 className="h5 mb-0">Actualités</h2>
      <wcs-button size="s" onClick={openCreate}>Créer une actualité</wcs-button>
    </div>
    {loading? <p><Spinner /> Chargement...</p>: error? <wcs-alert intent="error" show><span slot="title">{error}</span></wcs-alert> :
      <div className="table-responsive">
        <table className="table table-sm align-middle">
          <thead><tr><th>ID</th><th>Titre</th><th>Publication</th><th>Image</th><th>Créée</th><th></th></tr></thead>
          <tbody>
            {items.map(it=> <tr key={it.id}>
              <td>{it.id}</td>
              <td>{it.titre}</td>
              <td>{it.publication_date? formatDate(it.publication_date): <span className="text-muted">—</span>}</td>
              <td>{it.image_path? <img src={it.image_path} alt="img" className="img-small"/>: <span className="text-muted">—</span>}</td>
              <td>{formatDate(it.created_at)}</td>
              <td className="text-end nowrap">
                <wcs-button mode="stroked" size="s" onClick={()=>openEdit(it)}>Éditer</wcs-button>{' '}
                <wcs-button mode="clear" size="s" onClick={()=>del(it)}>Suppr.</wcs-button>
              </td>
            </tr>)}
            {!items.length && <tr><td colSpan={6} className="text-center">Aucune actualité</td></tr>}
          </tbody>
        </table>
      </div>}

    {modal.open && <wcs-modal show size="l" show-close-button close-button-aria-label="Fermer" hide-actions>
      <h3 slot="header">{editing? 'Modifier':'Créer'} une actualité</h3>
      <form ref={formRef} id="actualite-form" onSubmit={handleSubmit}>
        <div className="row g-3">
          <div className="col-md-8">
            <div className="mb-3"><label className="form-label">Titre *</label><input name="titre" required className="form-control" /></div>
            <div className="mb-3"><label className="form-label">Date de publication</label><input type="datetime-local" name="publication_date" className="form-control" /></div>
            <div className="mb-3"><label className="form-label">Contenu</label><RichTextEditor name="contenu" initialValue="" /></div>
          </div>
          <div className="col-md-4">
            <div className="mb-3"><label className="form-label">Image (illustration)</label><input name="image" type="file" accept="image/*" className="form-control" /></div>
            <div className="mb-3"><label className="form-label">Fichiers joints</label><input name="attachments" type="file" multiple className="form-control" /></div>
            {editing?.attachments && <div className="small text-muted">Pièces existantes: {Array.isArray(editing.attachments)? editing.attachments.length: ''}</div>}
          </div>
        </div>
        <div className="d-flex gap-2 justify-content-end pt-2 border-top mt-2">
          <wcs-button mode="stroked" type="button" onClick={modal.close}>Annuler</wcs-button>
          <wcs-button type="submit" loading={submitting? true: undefined}>Enregistrer</wcs-button>
        </div>
      </form>
    </wcs-modal>}
  </div>; }

/* ============== ARTICLES ============== */
function ArticlesManager(){
  const [items,setItems]=React.useState([]); const [loading,setLoading]=React.useState(true); const [error,setError]=React.useState('');
  const modal=useModal(); const [editing,setEditing]=React.useState(null); const [submitting,setSubmitting]=React.useState(false); const formRef=React.useRef(null);
  async function load(){ setLoading(true); setError(''); try { const r=await fetch('/api/articles'); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); setItems(j.items||[]);} catch(e){ setError(e.message);} finally { setLoading(false);} }
  React.useEffect(()=>{ load(); },[]);
  function openCreate(){ setEditing(null); modal.openModal(); setTimeout(()=> formRef.current?.reset?.(),0); }
  function openEdit(item){ setEditing(item); modal.openModal(); setTimeout(()=>{ if(!formRef.current) return; const f=formRef.current; f.querySelector('[name="titre"]').value=item.titre; if(f.querySelector('[name="slug"]')) f.querySelector('[name="slug"]').value=item.slug; if(f.querySelector('[name="resume"]')) f.querySelector('[name="resume"]').value=item.resume||''; if(f.querySelector('[name="image_path"]')) f.querySelector('[name="image_path"]').value=item.image_path||''; const hidden=f.querySelector('input[name="contenu"]'); const ed=f.querySelector('[data-editor-for="contenu"]'); if(hidden){ hidden.value=item.contenu||''; } if(ed){ ed.innerHTML=item.contenu||''; } const hp=f.querySelector('input[name="homepage"]'); if(hp) hp.checked=!!item.homepage; },0); }
  async function handleSubmit(e){ e.preventDefault(); setSubmitting(true); const fd=new FormData(formRef.current); const payload={ titre:fd.get('titre'), slug:fd.get('slug'), resume:fd.get('resume'), contenu:fd.get('contenu'), image_path:fd.get('image_path'), homepage: fd.get('homepage')==='on' }; try { const url= editing? `/api/articles?id=${editing.id}`:'/api/articles'; const method= editing? 'PUT':'POST'; const r=await fetch(url,{method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); modal.close(); await load(); } catch(e){ alert(e.message);} finally { setSubmitting(false);} }
  async function del(item){ if(!confirm('Supprimer cet article ?')) return; try { const r=await fetch(`/api/articles?id=${item.id}`,{method:'DELETE'}); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); await load(); } catch(e){ alert(e.message);} }
  async function toggleHomepage(item){ try { const r=await fetch(`/api/articles?id=${item.id}`,{method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...item, homepage: item.homepage?0:1 })}); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur'); await load(); } catch(e){ alert(e.message);} }
  return <div className="mb-4">
    <div className="d-flex justify-content-between align-items-center mb-2"><h2 className="h5 mb-0">Articles</h2><wcs-button size="s" onClick={openCreate}>Créer un article</wcs-button></div>
    {loading? <p><Spinner /> Chargement...</p>: error? <wcs-alert intent="error" show><span slot="title">{error}</span></wcs-alert> :
      <div className="table-responsive">
        <table className="table table-sm align-middle">
          <thead><tr><th>ID</th><th>Titre</th><th>Slug</th><th>Homepage</th><th>Créé</th><th></th></tr></thead>
          <tbody>
            {items.map(it=> <tr key={it.id}>
              <td>{it.id}</td>
              <td>{it.titre}</td>
              <td className="small text-muted">{it.slug}</td>
              <td><wcs-button size="s" mode={it.homepage? 'plain':'stroked'} onClick={()=>toggleHomepage(it)}>{it.homepage? 'Oui':'Non'}</wcs-button></td>
              <td>{formatDate(it.created_at)}</td>
              <td className="text-end nowrap">
                <wcs-button mode="stroked" size="s" onClick={()=>openEdit(it)}>Éditer</wcs-button>{' '}
                <wcs-button mode="clear" size="s" onClick={()=>del(it)}>Suppr.</wcs-button>
              </td>
            </tr>)}
            {!items.length && <tr><td colSpan={6} className="text-center">Aucun article</td></tr>}
          </tbody>
        </table>
      </div>}
    {modal.open && <wcs-modal show size="l" show-close-button close-button-aria-label="Fermer" hide-actions>
      <h3 slot="header">{editing? 'Modifier':'Créer'} un article</h3>
      <form ref={formRef} id="article-form" onSubmit={handleSubmit}>
        <div className="row g-3">
          <div className="col-md-8">
            <div className="mb-3"><label className="form-label">Titre *</label><input name="titre" required className="form-control" /></div>
            <div className="mb-3"><label className="form-label">Slug (optionnel)</label><input name="slug" className="form-control" placeholder="laisser vide pour auto" /></div>
            <div className="mb-3"><label className="form-label">Résumé</label><textarea name="resume" className="form-control" rows={2}></textarea></div>
            <div className="mb-3"><label className="form-label">Contenu</label><RichTextEditor name="contenu" /></div>
          </div>
          <div className="col-md-4">
            <div className="mb-3"><label className="form-label">Image (URL publique)</label><input name="image_path" className="form-control" placeholder="/img/..." /></div>
            <div className="form-check mb-3"><input type="checkbox" name="homepage" id="article-homepage" className="form-check-input" /> <label htmlFor="article-homepage" className="form-check-label">Afficher sur page d'accueil</label></div>
          </div>
        </div>
        <div className="d-flex gap-2 justify-content-end pt-2 border-top mt-2">
          <wcs-button mode="stroked" type="button" onClick={modal.close}>Annuler</wcs-button>
          <wcs-button type="submit" loading={submitting? true: undefined}>Enregistrer</wcs-button>
        </div>
      </form>
    </wcs-modal>}
  </div>;
}

function RichTextEditor({ name, required, initialValue='' }){
  const ref = React.useRef(null);
  const inputRef = React.useRef(null);
  React.useEffect(()=>{ if(ref.current && inputRef.current){ ref.current.innerHTML = initialValue; inputRef.current.value = initialValue; } },[initialValue]);
  function exec(cmd, val=null){ document.execCommand(cmd,false,val); ref.current?.focus(); sync(); }
  function sync(){ if(inputRef.current && ref.current){ inputRef.current.value = ref.current.innerHTML; } }
  function onPaste(e){ e.preventDefault(); const text = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, text); }
  return <div className="rte" data-rte>
    <div className="rte-toolbar mb-1 d-flex gap-1 flex-wrap">
      <wcs-button size="s" mode="stroked" type="button" onClick={()=>exec('bold')}><strong>B</strong></wcs-button>
      <wcs-button size="s" mode="stroked" type="button" onClick={()=>exec('italic')}><em>I</em></wcs-button>
      <wcs-button size="s" mode="stroked" type="button" onClick={()=>exec('underline')}><u>U</u></wcs-button>
      <wcs-button size="s" mode="stroked" type="button" onClick={()=>exec('insertUnorderedList')}>• Liste</wcs-button>
      <wcs-button size="s" mode="stroked" type="button" onClick={()=>exec('insertOrderedList')}>1. Liste</wcs-button>
      <wcs-button size="s" mode="stroked" type="button" onClick={()=>{ const url=prompt('URL du lien:'); if(url) exec('createLink', url); }}>Lien</wcs-button>
      <wcs-button size="s" mode="stroked" type="button" onClick={()=>{ if(ref.current){ ref.current.innerHTML=''; sync(); } }}>Effacer</wcs-button>
    </div>
    <div ref={ref} className="form-control rich-editor" contentEditable data-editor-for={name} onInput={sync} onBlur={sync} onPaste={onPaste}></div>
    <input ref={inputRef} type="hidden" name={name} required={required} />
  </div>;
}

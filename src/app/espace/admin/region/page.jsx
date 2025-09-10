'use client'

import React, { useEffect, useRef, useState, useId } from 'react';

// Interop simples pour WCS custom elements dans React
function useWcsBind(ref, value, onChange, events = ['wcsChange', 'wcsInput']) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e) => {
      const v = e?.detail?.value ?? el.value;
      onChange?.(v);
    };
    events.forEach((evt) => el.addEventListener(evt, handler));
    return () => events.forEach((evt) => el.removeEventListener(evt, handler));
  }, [onChange, ref, events]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Aligne la valeur côté webcomponent
    try { if (el.value !== value) el.value = value ?? ''; } catch {}
  }, [value]);
}

function WcsInput({ value, onChange, type = 'text', placeholder, ...props }) {
  const ref = useRef(null);
  useWcsBind(ref, value, onChange);
  return <wcs-input ref={ref} type={type} placeholder={placeholder} {...props}></wcs-input>;
}

function WcsTextarea({ value, onChange, rows = 4, placeholder, ...props }) {
  const ref = useRef(null);
  useWcsBind(ref, value, onChange, ['wcsChange', 'wcsInput']);
  return <wcs-textarea ref={ref} rows={rows} placeholder={placeholder} {...props}></wcs-textarea>;
}

function WcsSelect({ value, onChange, children, ...props }) {
  const ref = useRef(null);
  useWcsBind(ref, value, onChange, ['wcsChange']);
  return <wcs-select ref={ref} {...props}>{children}</wcs-select>;
}

function WcsSelectOption({ value, children }) {
  return <wcs-select-option value={value}>{children}</wcs-select-option>;
}

// Date picker SNCF (markup fourni), utilisé dans le formulaire des offres
function DatePickerSncf({ id, label = 'Date (jj/mm/aaaa)', value, onChange, placeholder = 'Sélectionner une date', style }) {
  const uid = useId();
  const inputRef = useRef(null);
  const finalId = id || `date-${uid}`;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const v = value ?? '';
    if (el.value !== v) el.value = v;
  }, [value]);

  return (
    <div style={style}>
      <label htmlFor={finalId} className="font-weight-medium mb-2">{label}</label>
      <div data-component="picker">
        <div className="input-group" data-toggle>
          <div className="form-control-container">
            <input id={finalId} type="text" className="form-control" placeholder={placeholder} data-input ref={inputRef}
                   onChange={(e)=>onChange?.(e.target.value)} />
            <span className="form-control-state"></span>
          </div>
          <div className="input-group-append">
            <button type="button" className="btn btn-primary btn-only-icon" data-role="btn" tabIndex={-1} aria-expanded="false">
              <i className="icons-calendar" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const CURRENCIES = ['EUR','USD','CHF','GBP'];
const AUDIENCES = [
  { value: 'tous', label: 'Tous' },
  { value: 'moins26', label: '-26 ans' },
  { value: 'plus26', label: '+26 ans' },
];

function useRegionData() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({
    company: { name: '', currency: 'EUR', description: '' },
    types: [], footerLinks: [], tickets: [], promotions: [], subscriptions: [], events: [],
  });
  const [logoPath, setLogoPath] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/region', { cache: 'no-store' });
        if (!res.ok) throw new Error('Erreur de chargement');
        const json = await res.json();
        if (!alive) return;
        setData(json.data || {});
        setLogoPath(json.assets?.logoPath || null);
      } catch (e) {
        if (alive) setError('Impossible de charger les données.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function patch(p) {
    setSaving(true);
    try {
      const res = await fetch('/api/region', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch: p }),
      });
      if (!res.ok) throw new Error('Erreur de sauvegarde');
      const json = await res.json();
      setData(json.data);
      return json.data;
    } finally {
      setSaving(false);
    }
  }

  return { data, setData, patch, loading, saving, error, logoPath, setLogoPath };
}

export default function RegionSettingsPage() {
  const { data, setData, patch, loading, saving, error, logoPath, setLogoPath } = useRegionData();

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><wcs-spinner></wcs-spinner> Chargement…</div>;
  if (error) return <wcs-alert>{error}</wcs-alert>;

  return (
    <section>
      <h1>Paramètres de la région / exploitant</h1>

      <wcs-tabs aria-label="Paramètres région" align="start">
        <wcs-tab header="Entreprise" item-key="company">
          <CompanyTab data={data} setData={setData} patch={patch} logoPath={logoPath} setLogoPath={setLogoPath} saving={saving} />
        </wcs-tab>
        <wcs-tab header="Types de trains" item-key="types">
          <TypesTab data={data} setData={setData} patch={patch} saving={saving} />
        </wcs-tab>
        <wcs-tab header="Liens footer" item-key="links">
          <LinksTab data={data} setData={setData} patch={patch} saving={saving} />
        </wcs-tab>
        <wcs-tab header="Tickets & abonnements" item-key="offers">
          <OffersTab data={data} setData={setData} patch={patch} saving={saving} />
        </wcs-tab>
      </wcs-tabs>
    </section>
  );
}

function CompanyTab({ data, setData, patch, logoPath, setLogoPath, saving }) {
  const [local, setLocal] = useState(data.company || { name: '', currency: 'EUR', description: '' });
  useEffect(() => { setLocal(data.company || { name: '', currency: 'EUR', description: '' }); }, [data.company]);

  async function save() {
    await patch({ company: local });
  }

  async function uploadLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    const res = await fetch('/api/region/logo', { method: 'POST', body: fd });
    if (res.ok) {
      const json = await res.json();
      setLogoPath(json.path || null);
    } else {
      alert('Échec envoi logo');
    }
  }

  return (
    <div style={{ maxWidth: 720, display: 'grid', gap: 12 }}>
      <div>
        <label>Nom de l’entreprise</label>
        <WcsInput value={local.name} onChange={(v)=>setLocal({ ...local, name: v })} />
      </div>
      <div>
        <label>Devise</label>
        <WcsSelect value={local.currency} onChange={(v)=>setLocal({ ...local, currency: v })}>
          {CURRENCIES.map(c=> <WcsSelectOption key={c} value={c}>{c}</WcsSelectOption>)}
        </WcsSelect>
      </div>
      <div>
        <label>Description</label>
        <WcsTextarea rows={4} value={local.description} onChange={(v)=>setLocal({ ...local, description: v })} />
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <label>Logo</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="file" accept="image/*" onChange={uploadLogo} />
          {logoPath && <img src={logoPath} alt="logo" style={{ height: 40 }} />}
        </div>
        <small>Le logo est stocké sous public/img/logo.(jpg|png|webp|svg)</small>
      </div>

      <div>
        <wcs-button mode="primary" onClick={save} disabled={saving}>Enregistrer</wcs-button>
      </div>
    </div>
  );
}

// Composant de sélection de logo avec aperçu
function LogoSelector({ value, onChange, disabled = false }) {
  const [availableLogos, setAvailableLogos] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Charger la liste des logos disponibles depuis data.json
    async function loadLogos() {
      setLoading(true);
      try {
        const response = await fetch('/img/type/data.json');
        if (response.ok) {
          const data = await response.json();
          const categories = data.categories || [];

          // Transformer les données en format utilisable
          const logos = [];
          categories.forEach(category => {
            Object.entries(category.logos || {}).forEach(([filename, displayName]) => {
              logos.push({
                filename, // nom du fichier (ex: "logo-ter.svg")
                name: displayName, // nom affiché (ex: "TER")
                category: category.name,
                path: `/img/type/${filename}`
              });
            });
          });

          setAvailableLogos(logos);
        }
      } catch (error) {
        console.error('Erreur lors du chargement des logos:', error);
      } finally {
        setLoading(false);
      }
    }

    loadLogos();
  }, []);

  const selectedLogo = availableLogos.find(logo => logo.filename === value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {selectedLogo && (
          <img
            src={selectedLogo.path}
            alt={selectedLogo.name}
            style={{ width: 32, height: 32, objectFit: 'contain', border: '1px solid #ddd', borderRadius: 4 }}
          />
        )}
        <WcsSelect
          value={value || ''}
          onChange={onChange}
          disabled={disabled || loading}
          placeholder={loading ? "Chargement..." : "Choisir un logo"}
          style={{ minWidth: 200 }}
        >
          <WcsSelectOption value="">Aucun logo</WcsSelectOption>
          {availableLogos.reduce((acc, logo) => {
            const categoryGroup = acc.find(g => g.category === logo.category);
            if (categoryGroup) {
              categoryGroup.logos.push(logo);
            } else {
              acc.push({ category: logo.category, logos: [logo] });
            }
            return acc;
          }, []).map((group, index) => (
            <optgroup key={index} label={group.category}>
              {group.logos.map(logo => (
                <WcsSelectOption key={logo.filename} value={logo.filename}>
                  {logo.name}
                </WcsSelectOption>
              ))}
            </optgroup>
          ))}
        </WcsSelect>
      </div>
      {selectedLogo && (
        <small style={{ color: '#666', fontSize: '12px' }}>
          Fichier : {selectedLogo.filename}
        </small>
      )}
    </div>
  );
}

function TypesTab({ data, setData, patch, saving }) {
  const [availableLogos, setAvailableLogos] = useState([]);
  const [loadingLogos, setLoadingLogos] = useState(false);
  const [errorLogos, setErrorLogos] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(()=>{
    let alive = true;
    (async()=>{
      setLoadingLogos(true); setErrorLogos('');
      try {
        // Lecture directe du fichier généré (plus complet) si présent
        let r = await fetch('/api/train-types?ts=' + Date.now());
        if(!r.ok) throw new Error();
        const j = await r.json();
        if(!alive) return;
        setAvailableLogos(j.logos||[]);
      } catch(e){
        try {
          const r2 = await fetch('/img/type/data.json?ts=' + Date.now());
          if(r2.ok){
            const j2 = await r2.json();
            if(alive) setAvailableLogos(j2.logos||[]);
          } else throw new Error();
        } catch(e2){ if(alive) setErrorLogos('Impossible de charger les logos.'); }
      } finally { if(alive) setLoadingLogos(false); }
    })();
    return ()=>{ alive=false };
  }, []);

  function categorize(slug, name){
    const s = slug.toLowerCase();
    // Logos SNCF
    if(/sncf/.test(s) || s === 'sncf-voyageurs-logo') return 'Logos SNCF';
    // International
    if(['db','sbb','sncb','eurostar','frecciarossa','renfeave','cfl','ice','lyria'].includes(s)) return 'International';
    // Régions (après 2016)
    if(['aleop','breizhgo','lio','fluo','mobigo','occitanie','remi','nomad','hautsdefrance','auvergerhonealpes'].includes(s)) return 'Régions (après 2016)';
    // Régions (avant 2016) – anciens / historiques / marques TER locales
    if(['metrolor','ler','lunea'].includes(s)) return 'Régions (avant 2016)';
    // RER spécifiques => classé régional
    if(/^rer-/.test(s)) return 'Régional';
    // National / réseau assimilé => Intercités, OUIGO, OUIGO classique, TER générique, TGV InOui etc.
    if(['intercites','ouigo','ouigo-classique','ter','inoui','tgv'].some(k=> s.includes(k))) return 'Régional';
    // Par défaut régional
    return 'Régional';
  }

  function buildAutoTypes(){
    const generated = availableLogos.map(l => ({
      slug: l.slug,
      name: l.name,
      icon: l.path,
      logo: l.file,
      category: categorize(l.slug,l.name)
    }));
    // Fusion : si existant, conserver nom personnalisé sinon généré; mettre à jour icon & category
    const bySlugExisting = new Map((data.types||[]).map(t=> [t.slug, t]));
    const merged = generated.map(g => {
      const prev = bySlugExisting.get(g.slug);
      if(prev){
        return { ...prev, icon: g.icon, logo: g.logo, category: g.category };
      }
      return g;
    });
    return merged.sort((a,b)=> a.category.localeCompare(b.category,'fr') || a.name.localeCompare(b.name,'fr'));
  }

  async function syncFromFiles(){
    if(syncing) return; setSyncing(true);
    try {
      const next = buildAutoTypes();
      await patch({ types: next });
    } finally { setSyncing(false); }
  }

  function groupedTypes(){
    const list = (data.types && data.types.length)? data.types : buildAutoTypes();
    const groups = {};
    list.forEach(t=> { const cat = t.category || categorize(t.slug,t.name); (groups[cat] ||= []).push(t); });
    Object.values(groups).forEach(arr=> arr.sort((a,b)=> a.name.localeCompare(b.name,'fr')));
    const order = ['Régions (avant 2016)','Régions (après 2016)','International','Régional','Logos SNCF'];
    return order.filter(o=> groups[o]).map(key => ({ key, items: groups[key] }));
  }

  async function renameType(slug,value){
    const next = (data.types||[]).map(t=> t.slug===slug? { ...t, name:value }: t);
    await patch({ types: next });
  }
  async function removeType(slug){
    const next = (data.types||[]).filter(t=> t.slug!==slug);
    await patch({ types: next });
  }

  const groups = groupedTypes();

  return (
    <div style={{ display:'grid', gap:20 }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:12, alignItems:'center' }}>
        <wcs-button mode="primary" onClick={syncFromFiles} disabled={saving||syncing||loadingLogos} icon={syncing? 'refresh' : undefined}>
          {syncing? 'Synchronisation…' : 'Synchroniser depuis les fichiers'}
        </wcs-button>
        {loadingLogos && <span style={{ display:'flex', alignItems:'center', gap:6 }}><wcs-spinner></wcs-spinner> Chargement logos…</span>}
        {errorLogos && <wcs-alert mode="warning">{errorLogos}</wcs-alert>}
        <small style={{ color:'#666' }}>La liste est générée automatiquement à partir de /public/img/type (data.json).</small>
      </div>
      {groups.map(g => (
        <div key={g.key} style={{ display:'grid', gap:12 }}>
          <h4 style={{ margin:'4px 0 0' }}>{g.key}</h4>
          <ul className="list-group" style={{ display:'grid', gap:8 }}>
            {g.items.map(t=> (
              <li key={t.slug} className="list-group-item" style={{ display:'flex', flexWrap:'wrap', gap:12, alignItems:'center' }}>
                {t.icon ? (
                  <div style={{ width:40, height:40, background:'#1c1f23', border:'1px solid #2a2e33', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <img src={t.icon} alt={t.name} style={{ maxWidth:'70%', maxHeight:'70%', objectFit:'contain' }} />
                  </div>
                ) : (
                  <div style={{ width:40, height:40, background:'#1c1f23', border:'1px solid #2a2e33', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#888' }}>Logo</div>
                )}
                {/* Remplacement slug affiché par le nom lisible */}
                <code title={t.slug}>{t.name}</code>
                <WcsInput value={t.name} style={{ maxWidth:260 }} onChange={v=>renameType(t.slug,v)} />
                <span style={{ fontSize:12, color:'#999' }}>{t.category || categorize(t.slug,t.name)}</span>
                <wcs-button mode="stroked" shape="small" onClick={()=>removeType(t.slug)}>Supprimer</wcs-button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {(!groups.length) && (
        <div style={{ color:'#666' }}>Aucun logo détecté.</div>
      )}
    </div>
  );
}

function LinksTab({ data, setData, patch, saving }) {
  const [tmp, setTmp] = useState({ label: '', url: '' });

  function genId() { return Math.random().toString(36).slice(2,9); }

  async function addLink() {
    if (!tmp.label || !tmp.url) return;
    const next = [...(data.footerLinks||[]), { id: genId(), label: tmp.label, url: tmp.url }];
    await patch({ footerLinks: next });
    setTmp({ label: '', url: '' });
  }
  async function updateLink(id, k, v) {
    const next = (data.footerLinks||[]).map(l=> l.id===id? { ...l, [k]: v } : l);
    await patch({ footerLinks: next });
  }
  async function removeLink(id) {
    const next = (data.footerLinks||[]).filter(l=>l.id!==id);
    await patch({ footerLinks: next });
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <WcsInput placeholder="Libellé" value={tmp.label} onChange={v=>setTmp({ ...tmp, label: v })} />
        <WcsInput placeholder="URL" value={tmp.url} onChange={v=>setTmp({ ...tmp, url: v })} />
        <wcs-button mode="primary" onClick={addLink} disabled={saving}>Ajouter</wcs-button>
      </div>
      <ul className="list-group" style={{ display: 'grid', gap: 8 }}>
        {(data.footerLinks||[]).map(l => (
          <li key={l.id} className="list-group-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <WcsInput style={{ maxWidth: 260 }} value={l.label} onChange={v=>updateLink(l.id,'label', v)} />
            <WcsInput value={l.url} onChange={v=>updateLink(l.id,'url', v)} />
            <wcs-button mode="stroked" onClick={()=>removeLink(l.id)}>Supprimer</wcs-button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OffersTab({ data, setData, patch, saving }) {
  const [modalOpen, setModalOpen] = useState(false);
  const triggerId = 'create-offer-btn';
  const [kind, setKind] = useState('ticket');
  const [filterType, setFilterType] = useState('all');
  const [form, setForm] = useState({
    t_name: '', t_audience: 'tous', t_description: '', t_price: '',
    s_title: '', s_audience: 'tous', s_description: '', s_price: '',
    p_code: '', p_label: '', p_description: '', p_discount: '', p_start: '', p_end: '',
    e_name: '', e_ticketId: '', e_description: '', e_discount: '', e_start: '', e_end: '',
  });

  function genId() { return Math.random().toString(36).slice(2, 9); }

  async function addOffer() {
    if (kind === 'ticket') {
      const price = parseFloat(String(form.t_price).replace(',', '.'));
      if (!form.t_name || Number.isNaN(price) || price < 0) return;
      const next = [...(data.tickets || []), {
        id: genId(), name: form.t_name, audience: form.t_audience, description: form.t_description, price
      }];
      await patch({ tickets: next });
      setForm({ ...form, t_name: '', t_audience: 'tous', t_description: '', t_price: '' });
      return;
    }
    if (kind === 'subscription') {
      const price = parseFloat(String(form.s_price).replace(',', '.'));
      if (!form.s_title || Number.isNaN(price) || price < 0) return;
      const next = [...(data.subscriptions || []), {
        id: genId(), title: form.s_title, audience: form.s_audience, description: form.s_description, price
      }];
      await patch({ subscriptions: next });
      setForm({ ...form, s_title: '', s_audience: 'tous', s_description: '', s_price: '' });
      return;
    }
    if (kind === 'promotion') {
      const discountPercent = Number(form.p_discount);
      if (!form.p_code || !form.p_label || Number.isNaN(discountPercent)) return;
      const next = [...(data.promotions || []), {
        id: genId(), code: form.p_code, label: form.p_label, description: form.p_description,
        discountPercent, startDate: form.p_start || null, endDate: form.p_end || null
      }];
      await patch({ promotions: next });
      setForm({ ...form, p_code: '', p_label: '', p_description: '', p_discount: '', p_start: '', p_end: '' });
      return;
    }
    if (kind === 'event') {
      const discountPercent = Number(form.e_discount);
      if (!form.e_name || !form.e_ticketId || Number.isNaN(discountPercent)) return;
      const next = [...(data.events || []), {
        id: genId(), name: form.e_name, ticketId: form.e_ticketId, description: form.e_description,
        discountPercent, startDate: form.e_start || null, endDate: form.e_end || null
      }];
      await patch({ events: next });
      setForm({ ...form, e_name: '', e_ticketId: '', e_description: '', e_discount: '', e_start: '', e_end: '' });
    }
  }

  function getTicketName(id) {
    const t = (data.tickets || []).find((x) => x.id === id);
    return t?.name || '';
  }

  async function removeOffer(row) {
    if (row.type === 'ticket') {
      const next = (data.tickets || []).filter((x) => x.id !== row.id);
      await patch({ tickets: next });
    } else if (row.type === 'subscription') {
      const next = (data.subscriptions || []).filter((x) => x.id !== row.id);
      await patch({ subscriptions: next });
    } else if (row.type === 'promotion') {
      const next = (data.promotions || []).filter((x) => x.id !== row.id);
      await patch({ promotions: next });
    } else if (row.type === 'event') {
      const next = (data.events || []).filter((x) => x.id !== row.id);
      await patch({ events: next });
    }
  }

  const combined = [
    ...(data.tickets || []).map((t) => ({ type: 'ticket', id: t.id, title: t.name, audience: t.audience, description: t.description, price: t.price })),
    ...(data.subscriptions || []).map((s) => ({ type: 'subscription', id: s.id, title: s.title, audience: s.audience, description: s.description, price: s.price })),
    ...(data.promotions || []).map((p) => ({ type: 'promotion', id: p.id, title: p.label, code: p.code, description: p.description, discountPercent: p.discountPercent, startDate: p.startDate || '', endDate: p.endDate || '' })),
    ...(data.events || []).map((e) => ({ type: 'event', id: e.id, title: e.name, ticketId: e.ticketId, description: e.description, discountPercent: e.discountPercent, startDate: e.startDate || '', endDate: e.endDate || '' })),
  ];

  const filtered = filterType === 'all' ? combined : combined.filter((r) => r.type === filterType);

  return (
    <section className="d-grid" style={{ gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Offres</h3>
        <wcs-button id={triggerId} mode="primary" onClick={() => setModalOpen(true)}>Créer une offre</wcs-button>
      </div>

      <wcs-modal show={modalOpen} show-close-button="" modal-trigger-controls-id={triggerId} onWcsDialogClosed={() => setModalOpen(false)}>
        <span slot="header">Créer une offre</span>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 220 }}>
              <label>Offre</label>
              <WcsSelect value={kind} onChange={setKind}>
                <WcsSelectOption value="ticket">Ticket</WcsSelectOption>
                <WcsSelectOption value="subscription">Abonnement</WcsSelectOption>
                <WcsSelectOption value="promotion">Offre promotionnelle</WcsSelectOption>
                <WcsSelectOption value="event">Évènement</WcsSelectOption>
              </WcsSelect>
            </div>

            {kind === 'ticket' && (
              <>
                <WcsInput placeholder="Nom" value={form.t_name} onChange={(v)=>setForm({ ...form, t_name: v })} />
                <WcsSelect value={form.t_audience} onChange={(v)=>setForm({ ...form, t_audience: v })}>
                  {AUDIENCES.map(a=> <WcsSelectOption key={a.value} value={a.value}>{a.label}</WcsSelectOption>)}
                </WcsSelect>
                <WcsInput placeholder="Description" value={form.t_description} onChange={(v)=>setForm({ ...form, t_description: v })} />
                <WcsInput placeholder="Prix" type="number" value={form.t_price} onChange={(v)=>setForm({ ...form, t_price: v })} />
              </>
            )}

            {kind === 'subscription' && (
              <>
                <WcsInput placeholder="Titre" value={form.s_title} onChange={(v)=>setForm({ ...form, s_title: v })} />
                <WcsSelect value={form.s_audience} onChange={(v)=>setForm({ ...form, s_audience: v })}>
                  {AUDIENCES.map(a=> <WcsSelectOption key={a.value} value={a.value}>{a.label}</WcsSelectOption>)}
                </WcsSelect>
                <WcsInput placeholder="Description" value={form.s_description} onChange={(v)=>setForm({ ...form, s_description: v })} />
                <WcsInput placeholder="Prix" type="number" value={form.s_price} onChange={(v)=>setForm({ ...form, s_price: v })} />
              </>
            )}

            {kind === 'promotion' && (
              <>
                <WcsInput placeholder="Code" value={form.p_code} onChange={(v)=>setForm({ ...form, p_code: v })} />
                <WcsInput placeholder="Libellé" value={form.p_label} onChange={(v)=>setForm({ ...form, p_label: v })} />
                <WcsInput placeholder="Description" value={form.p_description} onChange={(v)=>setForm({ ...form, p_description: v })} />
                <WcsInput placeholder="Réduction %" type="number" value={form.p_discount} onChange={(v)=>setForm({ ...form, p_discount: v })} />
                <DatePickerSncf label="Début (jj/mm/aaaa)" value={form.p_start} onChange={(v)=>setForm({ ...form, p_start: v })} />
                <DatePickerSncf label="Fin (jj/mm/aaaa)" value={form.p_end} onChange={(v)=>setForm({ ...form, e_end: v })} />
              </>
            )}

            {kind === 'event' && (
              <>
                <WcsInput placeholder="Nom de l'évènement" value={form.e_name} onChange={(v)=>setForm({ ...form, e_name: v })} />
                <WcsSelect value={form.e_ticketId} onChange={(v)=>setForm({ ...form, e_ticketId: v })}>
                  <WcsSelectOption value="">Ticket lié…</WcsSelectOption>
                  {(data.tickets||[]).map(t => <WcsSelectOption key={t.id} value={t.id}>{t.name}</WcsSelectOption>)}
                </WcsSelect>
                <WcsInput placeholder="Description" value={form.e_description} onChange={(v)=>setForm({ ...form, e_description: v })} />
                <WcsInput placeholder="Réduction %" type="number" value={form.e_discount} onChange={(v)=>setForm({ ...form, e_discount: v })} />
                <DatePickerSncf label="Début (jj/mm/aaaa)" value={form.e_start} onChange={(v)=>setForm({ ...form, e_start: v })} />
                <DatePickerSncf label="Fin (jj/mm/aaaa)" value={form.e_end} onChange={(v)=>setForm({ ...form, e_end: v })} />
              </>
            )}
          </div>
        </div>
        <div slot="actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <wcs-button mode="stroked" onClick={() => setModalOpen(false)}>Annuler</wcs-button>
          <wcs-button mode="primary" onClick={async () => { await addOffer(); setModalOpen(false); }}>Ajouter</wcs-button>
        </div>
      </wcs-modal>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label>Filtrer par type</label>
        <WcsSelect value={filterType} onChange={setFilterType}>
          <WcsSelectOption value="all">Tous</WcsSelectOption>
          <WcsSelectOption value="ticket">Tickets</WcsSelectOption>
          <WcsSelectOption value="subscription">Abonnements</WcsSelectOption>
          <WcsSelectOption value="promotion">Promotions</WcsSelectOption>
          <WcsSelectOption value="event">Évènements</WcsSelectOption>
        </WcsSelect>
      </div>

      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Intitulé</th>
              <th>Audience</th>
              <th>Description</th>
              <th>Prix / Réduction</th>
              <th>Début</th>
              <th>Fin</th>
              <th>Ticket lié</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.type}-${r.id}`}>
                <td>{r.type}</td>
                <td>{r.title || r.code || ''}</td>
                <td>{r.audience || ''}</td>
                <td>{r.description || ''}</td>
                <td>{r.type === 'promotion' || r.type === 'event' ? `${r.discountPercent ?? ''}%` : (r.price ?? '')}</td>
                <td>{r.startDate || ''}</td>
                <td>{r.endDate || ''}</td>
                <td>{r.type === 'event' ? getTicketName(r.ticketId) : ''}</td>
                <td>
                  <wcs-button mode="stroked" onClick={() => removeOffer(r)}>Supprimer</wcs-button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', color: '#666' }}>Aucune offre.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

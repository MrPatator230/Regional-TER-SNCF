"use client";
import React, { useState } from 'react';

export default function AdminAfficheursPage(){
  const [type,setType]=useState('classiques');
  const [sens,setSens]=useState('departs');
  const [gare,setGare]=useState('');
  const openAfficheur=(e)=>{
    e.preventDefault();
    if(!gare.trim()) return;
    let base = `/afficheurs/${type}`;
    if(type==='classiques'){ base += `/${sens}`; }
    else if(type==='eva'){ base += `/arrivees`; }
    // futurs autres types: AFL / Transilien pourront avoir une structure différente
    const url = `${base}?gare=${encodeURIComponent(gare.trim())}`;
    window.open(url, '_blank');
  };
  return (
    <div>
      <h1>Création d'afficheur</h1>
      <p>Choisissez un type d'afficheur et la gare cible. Les types AFL / Transilien seront ajoutés plus tard.</p>
      <form onSubmit={openAfficheur} style={{maxWidth:520, background:'#fff', padding:'16px 20px', borderRadius:8, boxShadow:'0 2px 4px rgba(0,0,0,.08)'}}>
        <wcs-form-field label="Type d'afficheur">
          <div style={{display:'flex', gap:'16px', flexWrap:'wrap'}}>
            <label><input type="radio" name="type" value="classiques" checked={type==='classiques'} onChange={()=>setType('classiques')} /> Classiques</label>
            <label><input type="radio" name="type" value="eva" checked={type==='eva'} onChange={()=>setType('eva')} /> EVA</label>
            <label style={{opacity:.5}}><input type="radio" name="type" value="afl" disabled /> AFL (à venir)</label>
            <label style={{opacity:.5}}><input type="radio" name="type" value="transilien" disabled /> Transilien (à venir)</label>
          </div>
        </wcs-form-field>
        {type==='classiques' && (
          <wcs-form-field label="Sens">
            <div style={{display:'flex', gap:'16px'}}>
              <label><input type="radio" name="sens" value="departs" checked={sens==='departs'} onChange={()=>setSens('departs')} /> Départs</label>
              <label><input type="radio" name="sens" value="arrivees" checked={sens==='arrivees'} onChange={()=>setSens('arrivees')} /> Arrivées</label>
            </div>
          </wcs-form-field>
        )}
        <wcs-form-field label="Gare">
          <wcs-input value={gare} onInput={e=>setGare(e.target.value)} placeholder="Nom de la gare" />
        </wcs-form-field>
        <wcs-button type="submit" mode="primary" disabled={!gare.trim()}>Ouvrir l'afficheur</wcs-button>
      </form>
    </div>
  );
}

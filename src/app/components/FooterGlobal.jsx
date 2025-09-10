"use client";
import React from 'react';
import { usePathname } from 'next/navigation';

export default function FooterGlobal(){
  const pathname = usePathname();
  if(pathname && pathname.startsWith('/afficheurs/')) return null; // pas de footer sur les afficheurs
  return (
    <wcs-footer>
      <p>Contenu libre</p>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Fusce vel neque et dolor egestas posuere nec sed neque.
        In porttitor orci vitae orci maximus, eget convallis nisi auctor. Nunc maximus vulputate maximus. Mauris ornare
        tortor mi. Quisque laoreet, erat sit amet volutpat ornare, ligula ante pharetra lacus, sit amet ornare libero
        odio eget nunc. Cras facilisis sem id tellus tempor, consectetur laoreet erat ornare. Sed aliquam tortor et quam
        viverra, nec finibus lacus mattis.</p>
      <a slot="end-left" href="#">Plan du site</a>
      <a slot="end-left" href="#">Mentions légales &amp; CGU</a>
      <a slot="end-left" href="#">Données personnelles &amp; cookies</a>
      <a slot="end-left" href="#">Portail de la cybersécurité</a>
      <span slot="end-right">Séléction de la langue</span>
    </wcs-footer>
  );
}

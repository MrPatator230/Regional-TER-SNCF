"use client";
import React, { useRef, useEffect, useState } from 'react';

// Marquee: fait défiler de droite à gauche en boucle le contenu s'il dépasse la largeur
// Props: children (string | node), speed (px/second), className
export default function Marquee({ children, speed = 40, className = '' }){
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const rafRef = useRef(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [singleWidth, setSingleWidth] = useState(0);
  const [gapWidth, setGapWidth] = useState(0);

  useEffect(()=>{
    const update = ()=>{
      const cont = containerRef.current;
      const content = contentRef.current;
      if(!cont || !content) return;
      // measure single item width (first child)
      const item = content.querySelector('.marquee-item');
      const contW = cont.getBoundingClientRect().width;
      const itemW = item ? item.getBoundingClientRect().width : 0;
      setSingleWidth(itemW);
      setGapWidth(contW);
      setShouldScroll(itemW > contW + 1);
      // reset transform when not scrolling
      if(!itemW || itemW <= contW){
        content.style.transform = 'translateX(0)';
      }
    };
    update();
    const ro = new ResizeObserver(()=> update());
    if(containerRef.current) ro.observe(containerRef.current);
    if(contentRef.current) ro.observe(contentRef.current);
    window.addEventListener('load', update);
    window.addEventListener('resize', update);
    return ()=>{ ro.disconnect(); window.removeEventListener('load', update); window.removeEventListener('resize', update); };
  },[children]);

  useEffect(()=>{
    let start = null;
    if(!shouldScroll || !singleWidth) return;
    let lastOffset = 0;
    const step = (t)=>{
      if(start === null) start = t;
      const elapsed = t - start;
      const delta = (speed * elapsed) / 1000;
      const period = singleWidth + (gapWidth || 0);
      const offset = period > 0 ? (delta % period) : 0;
      if(contentRef.current){
        contentRef.current.style.transform = `translateX(-${offset}px)`;
      }
      lastOffset = offset;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return ()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; start=null; };
  },[shouldScroll, singleWidth, speed]);

  // Render: container with inner track containing two copies for seamless loop
  return (
    <div ref={containerRef} className={`marquee-outer ${className}`} style={{overflow:'hidden'}} aria-hidden={false}>
      <div
        ref={contentRef}
        className="marquee-track"
        style={{display:'inline-block', whiteSpace:'nowrap', willChange:'transform', transform:'translateX(0)'}}
        >
        <span className="marquee-item" style={{display:'inline-block', paddingRight:24}}>{children}</span>
        {/* spacer with dynamic width equal to container width */}
        <span className="marquee-gap" style={{display:'inline-block', width: gapWidth ? `${gapWidth}px` : '0px'}} aria-hidden="true" />
        <span className="marquee-item" style={{display:'inline-block', paddingRight:24}} aria-hidden="true">{children}</span>
      </div>
      <style jsx>{`
        .marquee-outer{width:100%}
        .marquee-track{display:inline-block}
        .marquee-item{opacity:1}
        .marquee-gap{display:inline-block}
      `}</style>
    </div>
  );
}

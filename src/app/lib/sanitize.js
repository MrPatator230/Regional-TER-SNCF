import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

let purifyInstance;
function getPurify(){
  if(!purifyInstance){
    const window = new JSDOM('').window;
    purifyInstance = createDOMPurify(window);
  }
  return purifyInstance;
}

export function sanitizeHtml(dirty){
  if(!dirty) return '';
  const DOMPurify = getPurify();
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html:true },
    ALLOWED_ATTR: ['href','title','alt','src','target','rel','class','id'],
    ALLOWED_TAGS: ['a','p','strong','em','u','ul','ol','li','br','span','h1','h2','h3','h4','h5','h6','blockquote','code','pre','img']
  });
}


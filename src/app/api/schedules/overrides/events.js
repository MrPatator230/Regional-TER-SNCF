import { EventEmitter } from 'events';

// Singleton EventEmitter pour les overrides
const emitter = global.__OVERRIDES_EMITTER__ || new EventEmitter();
if(!global.__OVERRIDES_EMITTER__) {
  emitter.setMaxListeners(200);
  global.__OVERRIDES_EMITTER__ = emitter;
}

export function broadcastOverrideEvent(evt){
  try { emitter.emit('override-event', evt); } catch(e){ /* noop */ }
}

export function subscribeOverrideEvents(cb){
  emitter.on('override-event', cb);
  return () => { try { emitter.off('override-event', cb); } catch{} };
}



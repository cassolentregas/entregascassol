// Dentro do arquivo: service-worker.js

importScripts('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
importScripts('https://unpkg.com/dexie@3/dist/dexie.js');

const CACHE_NAME = 'comprovante-entrega-cache-v1';
const urlsToCache = [ '/', '/index.html', '/manifest.json' ];

// ATENÇÃO: Confirme que estas chaves são as mesmas do seu index.html
const SUPABASE_URL = 'https://sdwmjiohhkmfdbvypshg.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkd21qaW9oaGttZmRidnlwc2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3OTU2MjgsImV4cCI6MjA3NTM3MTYyOH0.IPBHlwiidD-w710Tk0SAA_zfEwR8jlX_adoICRSkqBY';
const BUCKET_NAME = 'comprovantes';
const ENTREGAS_TABLE = 'entregas'; 
const FOTOS_TABLE = 'fotos_comprovantes'; 

const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const db = new Dexie('entregas_offline');
db.version(1).stores({ entregas: '++id, numero_pedido' });

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
    ))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'sync-entregas') {
    event.waitUntil(sincronizarEntregas());
  }
});

async function sincronizarEntregas() {
  const todasAsEntregas = await db.entregas.toArray();
  if (todasAsEntregas.length === 0) return;

  console.log(`[SW] Sincronizando ${todasAsEntregas.length} entrega(s)...`);

  for (const entrega of todasAsEntregas) {
    try {
      const { data: entregaData, error: dbError } = await supabase
        .from(ENTREGAS_TABLE).insert([{
          numero_pedido: entrega.numero_pedido,
          endereco: entrega.endereco,
          nome_cliente: entrega.nome_cliente,
          assinatura_base64: entrega.assinatura_base64,
          user_id: entrega.user_id,
          created_at: entrega.criado_em
        }]).select('id').single();

      if (dbError) throw dbError;
      
      const entregaId = entregaData.id;
      const fotosParaInserir = [];
      for (const fotoFile of entrega.fotos) {
        const photoPath = `public/${entregaId}_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(photoPath, fotoFile);
        if (uploadError) { console.warn(`[SW] Falha no upload da foto: ${uploadError.message}.`); continue; }
        const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(photoPath);
        fotosParaInserir.push({ entrega_id: entregaId, url: publicUrlData.publicUrl });
      }

      if (fotosParaInserir.length > 0) {
        const { error: fotosError } = await supabase.from(FOTOS_TABLE).insert(fotosParaInserir);
        if (fotosError) console.error('[SW] Erro ao salvar URLs das fotos:', fotosError);
      }

      await db.entregas.delete(entrega.id);
      console.log(`[SW] Entrega ${entrega.numero_pedido} sincronizada.`);
    } catch (error) {
      console.error(`[SW] Falha ao sincronizar entrega ${entrega.numero_pedido}.`, error);
    }
  }
}

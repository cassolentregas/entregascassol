// Dentro do arquivo: service-worker.js

// Importa as bibliotecas necessárias para o Service Worker
// O Supabase é necessário para enviar os dados durante a sincronização
importScripts('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
importScripts('https://unpkg.com/dexie@3/dist/dexie.js');

// --- CONFIGURAÇÃO ---
const CACHE_NAME = 'comprovante-entrega-cache-v2'; // Mude a versão se alterar os arquivos cacheados
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ATENÇÃO: COLOQUE AQUI AS MESMAS CHAVES DO SEU ARQUIVO index.html
const SUPABASE_URL = 'https://sdwmjiohhkmfdbvypshg.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkd21qaW9oaGttZmRidnlwc2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3OTU2MjgsImV4cCI6MjA3NTM3MTYyOH0.IPBHlwiidD-w710Tk0SAA_zfEwR8jlX_adoICRSkqBY';
const BUCKET_NAME = 'comprovantes';
const ENTREGAS_TABLE = 'entregas'; 
const FOTOS_TABLE = 'fotos_comprovantes'; 

// Inicializa o cliente Supabase e o Dexie DENTRO do Service Worker
const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const db = new Dexie('entregas_offline');
db.version(1).stores({
  entregas: '++id, numero_pedido'
});


// --- LÓGICA DO SERVICE WORKER ---

// 1. Instalação: Salva a "casca" do aplicativo no cache
self.addEventListener('install', event => {
  self.skipWaiting(); // Força o novo Service Worker a ativar
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache aberto. Cacheando arquivos do app shell.');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. Ativação: Limpa caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
                 .map(name => caches.delete(name))
      );
    })
  );
});

// 3. Fetch: Responde com o cache quando o app está offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

// 4. Sync: Ouve o evento de sincronização para enviar dados
self.addEventListener('sync', event => {
  if (event.tag === 'sync-entregas') {
    console.log('[SW] Sincronização em background iniciada...');
    event.waitUntil(sincronizarEntregas());
  }
});

// Função que faz o trabalho de enviar os dados para o Supabase
async function sincronizarEntregas() {
  const todasAsEntregas = await db.entregas.toArray();
  if (todasAsEntregas.length === 0) {
    console.log('[SW] Nenhuma entrega para sincronizar.');
    return;
  }

  console.log(`[SW] Sincronizando ${todasAsEntregas.length} entrega(s)...`);

  for (const entrega of todasAsEntregas) {
    try {
      // --- LÓGICA DE UPLOAD (similar à da sua página) ---
      
      // 1. Insere o registro principal da entrega
      const { data: entregaData, error: dbError } = await supabase
        .from(ENTREGAS_TABLE)
        .insert([{
          numero_pedido: entrega.numero_pedido,
          endereco: entrega.endereco,
          nome_cliente: entrega.nome_cliente,
          assinatura_base64: entrega.assinatura_base64,
          user_id: entrega.user_id,
          created_at: entrega.criado_em // Usa a data original
        }])
        .select('id')
        .single();

      if (dbError) throw dbError;
      
      const entregaId = entregaData.id;

      // 2. Faz o upload das fotos
      const fotosParaInserir = [];
      for (const fotoFile of entrega.fotos) {
        const photoPath = `public/${entregaId}_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(photoPath, fotoFile);

        if (uploadError) {
            console.warn(`[SW] Falha no upload da foto: ${uploadError.message}.`);
            continue;
        }

        const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(photoPath);
        fotosParaInserir.push({ entrega_id: entregaId, url: publicUrlData.publicUrl });
      }

      // 3. Salva as URLs das fotos no banco
      if (fotosParaInserir.length > 0) {
        const { error: fotosError } = await supabase.from(FOTOS_TABLE).insert(fotosParaInserir);
        if (fotosError) console.error('[SW] Erro ao salvar URLs das fotos:', fotosError);
      }

      // 4. Se tudo deu certo, remove a entrega do "caderno" (IndexedDB)
      await db.entregas.delete(entrega.id);
      console.log(`[SW] Entrega ${entrega.numero_pedido} sincronizada e removida do banco local.`);

    } catch (error) {
      console.error(`[SW] Falha ao sincronizar entrega ${entrega.numero_pedido}. Tentará novamente mais tarde.`, error);
      // Se der erro, a entrega continua no IndexedDB para a próxima tentativa de sync
    }
  }
}

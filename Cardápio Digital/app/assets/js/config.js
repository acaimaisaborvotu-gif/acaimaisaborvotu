// =============================================================================
// CONFIG — preencha após criar o projeto no Supabase (veja docs/GUIA-SUPABASE.md)
// Enquanto SUPABASE_URL/ANON_KEY estiverem vazios, o cardápio funciona com os
// dados locais (seed) e o pedido é enviado por WhatsApp como fallback.
// =============================================================================

export const CONFIG = {
  SUPABASE_URL: 'https://favfyeyyzopsoigvyyim.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_RjfJ17RTGzGLpFrikEb_YA_KZ_28DdD',
  STORE_ID: 'acai-mais-sabor', // identificador da loja (preparado p/ multi-loja)
  GTM_ID: 'GTM-WC3TM37P',
  WHATSAPP_FALLBACK: '5517996653639',
};

export const hasSupabase = () =>
  Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

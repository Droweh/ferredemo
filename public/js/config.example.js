/* Ejemplo de configuración de FerroMax.
   Copiá este archivo como js/config.js o ejecutá configurar.bat en Windows.

   - mode: "supabase" para usar Supabase; "local" fuerza la demo sin conexión.
   - supabaseUrl: Project URL del proyecto (Settings > API).
   - supabaseAnonKey: publishable key o anon public key. NUNCA la service_role.
   - turnstileSiteKey: site key pública de Cloudflare Turnstile (opcional).
*/
window.FERROMAX_CONFIG = {
  mode: 'supabase',
  supabaseUrl: 'https://TU-PROYECTO.supabase.co',
  supabaseAnonKey: 'sb_publishable_TU_CLAVE_PUBLICA',
  turnstileSiteKey: '0x4AAAAAAA_TU_SITE_KEY',
};

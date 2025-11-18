# Admin Panel Build

Bu dizin, statik admin panelini üretmek ve `.env` içeriğini tarayıcıya global değişkenler olarak aktarabilmek için küçük bir build adımı içerir.

## Ortam değişkenlerini aktarma

1. `admin/.env` dosyasını oluşturun (gerekirse `admin/.env.example` dosyasından kopyalayın). Yerel gelişimde geçici değerler için `admin/.env.local` ekleyebilirsiniz. Build adımı **yalnızca** bu iki dosyayı okur; CI veya çalışma ortamından gelen süreç değişkenleri kullanılmaz. Allowlist açıktır ve sadece aşağıdaki anahtarlar `window.*` global değişkenlere dönüştürülür (gerekirse `VITE_` ön ekleri kaldırılarak):
   - API ve harita uçları: `VITE_API_BASE_URL`, `VITE_API_WEBSOCKET_URL`, `VITE_TILE_CDN_URL`, `VITE_MAP_PACKAGE_BASE_URL`, `VITE_MAP_PACKAGE_INDEX_URL`
   - Auth/OIDC: `VITE_AUTH_DOMAIN`, `VITE_AUTH_CLIENT_ID`, `VITE_AUTH_AUDIENCE`, `VITE_AUTH_SCOPE`, `VITE_AUTH_REDIRECT_URI`, `VITE_AUTH_POST_LOGOUT_REDIRECT_URI`, `OIDC_AUTHORIZE_URL`, `OIDC_TOKEN_URL`, `OIDC_CLIENT_ID`, `OIDC_SCOPE`, `OIDC_AUDIENCE`, `OIDC_REDIRECT_URI`
   - Ayar varsayılanları: `VITE_SETTINGS_DEFAULT_REGION`, `VITE_SETTINGS_DEFAULT_MAP_STYLE`, `VITE_SETTINGS_FEATURE_FLAGS`
   - UI markalama: `VITE_UI_BRAND`
   - API kökü: `API_BASE_URL`

2. Build komutunu çalıştırın:
   ```bash
   node admin/build.js
   ```

3. Çıktı `admin/dist/` klasörüne yazılır. `env.js` dosyası yukarıdaki anahtarları `window.API_BASE_URL`, `window.OIDC_AUTHORIZE_URL` vb. olarak tanımlar; `index.html` dosyası aynı klasöre kopyalanır. Statik dosyaları bu klasörden servis edin.

`node admin/build.js` komutu hem yerel ortamda hem de CI'da aynı yolu izler; `admin/.env` (ve varsa `admin/.env.local`) değerlerini baz alır. Kök `.env` dosyası okunmaz ve `VITE_` değişkenleri için allowlist (örn. `VITE_UI_BRAND`) uygulanır.

Sayfa yüklenirken `env.js` önce çalışır ve ayar formundaki alanlar (bölge, harita stili, feature flag'ler vb.) `admin/.env` içeriğindeki allowlist edilmiş `VITE_*` değerleriyle otomatik olarak dolar.

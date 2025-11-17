# Admin Panel Build

Bu dizin, statik admin panelini üretmek ve `.env` içeriğini tarayıcıya global değişkenler olarak aktarabilmek için küçük bir build adımı içerir.

## Ortam değişkenlerini aktarma

1. `admin/.env` dosyasını oluşturun (gerekirse `admin/.env.example` dosyasından kopyalayın). Yerel gelişimde geçici değerler için `admin/.env.local` ekleyebilirsiniz. Build adımı **yalnızca** bu iki dosyayı okur; CI veya çalışma ortamından gelen süreç değişkenleri, aşağıdaki allowlist’e takılmadıkça kullanılmaz. Aşağıdaki anahtarlar otomatik olarak `window.*` global değişkenlere dönüştürülür:
   - `API_BASE_URL`
   - `OIDC_AUTHORIZE_URL`
   - `OIDC_TOKEN_URL`
   - `OIDC_CLIENT_ID`
   - `OIDC_SCOPE`
   - `OIDC_AUDIENCE`
   - `OIDC_REDIRECT_URI`
   - `VITE_UI_BRAND` (başındaki `VITE_` kaldırılarak aktarılır)

2. Build komutunu çalıştırın:
   ```bash
   node admin/build.js
   ```

3. Çıktı `admin/dist/` klasörüne yazılır. `env.js` dosyası yukarıdaki anahtarları `window.API_BASE_URL`, `window.OIDC_AUTHORIZE_URL` vb. olarak tanımlar; `index.html` dosyası aynı klasöre kopyalanır. Statik dosyaları bu klasörden servis edin.

`node admin/build.js` komutu hem yerel ortamda hem de CI'da aynı yolu izler; `admin/.env` (ve varsa `admin/.env.local`) değerlerini baz alır. Kök `.env` dosyası okunmaz ve `VITE_` değişkenleri için allowlist (örn. `VITE_UI_BRAND`) uygulanır.

Sayfa yüklenirken `env.js` önce çalışır ve ayar formundaki alanlar `admin/.env` içeriğiyle otomatik olarak dolar.

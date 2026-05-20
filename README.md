# alpakay.dev — Portfolio

Ahmet Alp Akay'ın kişisel portfolyo sitesi. Unity Game Developer.

**Live:** [alpakay.dev](https://alpakay.dev)

## Stack

- [Astro](https://astro.build) — statik site
- Vanilla CSS — Unity sarısı / kömür palet
- Saf HTML/CSS dil değiştirici (TR | EN), localStorage ile kalıcı
- GitHub Pages + GitHub Actions ile otomatik deploy

## Yerel geliştirme

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ üretir
npm run preview  # build çıktısını yerelde dener
```

## Deploy

`main` branch'ine her push otomatik olarak `.github/workflows/deploy.yml` workflow'unu tetikler.

İlk seferde GitHub'da yapılacaklar:

1. **Repo → Settings → Pages** → Source: **GitHub Actions**
2. Workflow başarıyla çalıştıktan sonra **Custom domain** alanına `alpakay.dev` yaz, Save.
3. **Enforce HTTPS** kutusunu işaretle (DNS yayıldıktan sonra aktif olur).

## DNS (Spaceship)

Apex `alpakay.dev` için A kayıtları (GitHub Pages):

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

`www.alpakay.dev` için CNAME → `alpakay.github.io`

> A kayıtları zaman zaman güncellenir — push öncesi [GitHub Pages docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) üzerinden teyit edilmeli.

## Yapı

```
.
├── public/                    # Statik dosyalar (favicon, CNAME, görseller)
│   ├── images/
│   ├── favicon.svg
│   ├── CNAME
│   └── robots.txt
├── src/
│   ├── components/            # Hero, About, Projects, Skills, Experience, Contact, Nav, Icons
│   ├── layouts/Layout.astro   # HTML kabuğu, meta, global script'ler
│   ├── pages/index.astro      # Tek sayfa
│   └── styles/global.css      # Palet + tüm stiller
├── .github/workflows/deploy.yml
├── astro.config.mjs
└── package.json
```

## i18n yaklaşımı

Tüm çevirilebilir metin DOM'da iki kez render edilir:

```html
<span data-l="tr">Türkçe metin</span>
<span data-l="en">English text</span>
```

CSS, `<html lang>` değerine göre yalnızca aktif dili gösterir. Toggle butonu `<html>` lang attribute'ünü değiştirir ve localStorage'a yazar. Sayfa açılışında pre-paint inline script kayıtlı dili uygular — FOUC yok.

# Agent Readiness Inspector

## Özet

Siteleri yapay zekâ ajanlarına hazırlık için denetleyin: robots.txt, llms.txt, Markdown, MCP, Content Signals.

## Açıklama

**Yapay zekâ ajanlarının bu sitede gerçekten neyi bulabildiğini, okuyabildiğini ve kullanabildiğini görün.**

Agent Readiness Inspector, standartlara dayalı 22 denetimi doğrudan tarayıcınızda çalıştırır: robots.txt ve yapay zekâ tarayıcı kuralları, site haritaları, llms.txt, Markdown içerik pazarlığı, Content Signals, Link başlıkları, Agent Skills, API Catalogs, MCP Server Cards, OAuth keşfi, Web Bot Auth, WebMCP ve gelişmekte olan ticaret protokolleri.

- Karşılaştırılabilir bir puan ve hazırlık seviyesi
- Her karar için ham kanıt
- Önceliklendirilmiş, kopyalamaya hazır düzeltme istemleri
- Geçerli sekmenin yanında kalan bir panel
- Kayıtlı siteler, toplu yeniden tarama ve puan geçmişi
- Yerel bildirim kutusuyla zamanlanmış izleme
- Bir denetim geri gittiğinde isteğe bağlı bildirimler
- İsteğe bağlı puan rozeti ve otomatik tarama, ayarlardan

Denetim tarayıcının içinde çalıştığı için, dış bir tarayıcının erişemediği staging sitelerine ve oturum arkasındaki birçok sayfaya ulaşır. Tarayıcının çerez korumaları bazı sitelerde oturum erişimini sınırlayabilir.

### Onarım kitleri

Başarısız her denetim düzeltmesiyle birlikte gelir: standardın ne istediği, sitenin üzerinde çalıştığı görünen altyapı için gereken değişiklik (Cloudflare, Vercel, Netlify, nginx, Next.js) ve düzeltmenin işe yaradığını kanıtlayan tek komut.

### Gizlilik

Uzantı, site adreslerini ve yanıtlarını yalnızca denetimi üretmek için işler. Sonuçlar, kayıtlı siteler, geçmiş, ayarlar ve bildirimler tarayıcının yerel deposunda kalır. 301.st hiçbir tarama veya gezinme verisi almaz. Analitik, telemetri, reklam veya uzak kod yoktur. Bir denetim DNS okur: denetlenen alan adının ajan keşif kayıtları yayımlayıp yayımlamadığını açık bir DNS-over-HTTPS çözücüsüne sorar.

Uzantı seçtiğiniz her siteyi denetler; bunun için o sitenin başlıklarına, robots.txt, site haritası ve well-known kaynaklarına erişmesi gerekir. Ziyaret ettiğiniz sayfalara hiçbir içerik eklemez.

Agent Readiness Inspector, açık web standartlarının bağımsız bir uygulamasıdır. Cloudflare ile bağlantılı değildir ve Cloudflare tarafından onaylanmamıştır.

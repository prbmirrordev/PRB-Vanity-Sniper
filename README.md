# PRB-Vanity-Sniper
1ms ile girdiğiniz discord urlsi boşa düştüğü anda urlyi alabilirsiniz ve loglu şekilde size belirtilicektir.

# KURULUM

programda bulunan config.json dosyasını açın açtığınız zaman karşınızda bu seçenekler gözükücektir
```bash
{
    "claimToken": "",
    "monitorToken": "",
    "server": "",
    "webhookURL": "",
    "password": "",
    "FilterEnabled": "off" 
}
```

burada nelere göre doldurucağınızı anlatıyorum:

1. claimtoken: Vanity URL boşaldığında, URL'yi sizin sunucunuz adına "talep edecek, urlyi değiştiricek" olan hesabın Discord Tokenıdır. Genellikle sunucu sahibi veya yönetici yetkisi olan bir hesabın tokenı buraya yazılır.
2. monitorToken: URL'nin değişip değişmediğini sürekli kontrol eden (izleyen) hesabın tokenıdır. Bazı yazılımlar hız limitlerine (rate limit) takılmamak için izleme ve talep etme işlemlerini farklı hesaplar (tokenlar) üzerinden yapar.
3. server: Vanity URL'nin hangi sunucuya çekilmesini istiyorsanız o sunucunun ID numarasını girmelisiniz. Discord'da sunucu ismine sağ tıklayıp "ID'yi Kopyala" diyerek alabilirsiniz. "İD KOPYALAMAK İÇİN HESABINIZIN GELİŞTİRİCİ İZNİ OLMAK ZORUNDADIR AYARLARDAN AÇABİLİRSİNİZ"
4. webhookURL: Sniper bir işlem yaptığında (başarılı veya başarısız) size Discord üzerinden bildirim göndermesi için oluşturduğunuz Webhook bağlantısıdır.
5. password: Bu alan monitor token hesabının şifresidir
6. filtreEnabled: küfürlü, yasaklı veya istenmeyen kelimeleri içeren URL'leri atlamak için kullanılan bir filtredir. off durumunda gördüğü her hedef URL'yi yakalamaya çalışır.


# https://fakecrime.bio/3forMirror
# https://guns.lol/prbmirror

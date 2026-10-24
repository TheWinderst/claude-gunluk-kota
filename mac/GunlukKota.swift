// Gunluk kota gostergesi (menu cubugu) - claude-gunluk-kota projesinin
// macOS uyesi. Cekirdekten ayri: HICBIR kota mantigi burada yok; her 60
// saniyede tek bir `kota.mjs olc --json` cagrisi yapilir ve donen durum
// JSON'u cizilir.
//
// Veri kokleri:
//   KOK = GUNLUK_KOTA_EV ortam degiskeni yoksa ~/.gunluk-kota
//   KOK/cekirdek/kota.mjs   olcum/durum CLI'si (tek cagri)
//   KOK/uygulama.json       {"node": "<mutlak node yolu>"} - launchd
//                           ortaminda PATH icinde node olmaz, kurulumda
//                           cozulup yazilir
//   KOK/ayar.json           bildirimEsikleri (yoksa 5, 10, 13)
//   KOK/bildirim.json       esik/engel bildirimi defteri
//   KOK/gosterge.log        uygulama gunlugu
//
// Menu cubugu simgesi Claude'un on bir isinli burst'u: normalde beyaz,
// uyari esiginde turuncu, tavan asilinca ya da engel acikken kirmizi.
// Derleme: bash mac/derle.sh

import Cocoa
import UserNotifications

let ORT = ProcessInfo.processInfo.environment
// Sembol baglanti yollari fiziksel yola cozulur: kota.mjs dogrudan calisma
// denetimini process.argv[1] ile import.meta.url karsilastirmasiyla yapar;
// sembol baglanti yoldan cagrilirsa (orn. /tmp -> /private/tmp) CLI sessizce
// is yapmadan cikar.
let KOK = ((ORT["GUNLUK_KOTA_EV"] ?? NSHomeDirectory() + "/.gunluk-kota") as NSString)
    .resolvingSymlinksInPath
let KOTA_BETIK = KOK + "/cekirdek/kota.mjs"
let UYGULAMA_JSON = KOK + "/uygulama.json"
let AYAR_DOSYASI = KOK + "/ayar.json"
let BILDIRIM_DEFTERI = KOK + "/bildirim.json"
let GUNLUK_DOSYA = KOK + "/gosterge.log"

// launchd ortaminda /opt/homebrew/bin PATH icinde olmaz; kurulum yazdisi
// uygulama.json'daki yol once denenir, sonra bilinen adaylar.
let NODE_ADAYLARI = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
let VARSAYILAN_ESIKLER: [Double] = [5, 10, 13]

func nodeYolu() -> String? {
    var adaylar = NODE_ADAYLARI
    if let veri = FileManager.default.contents(atPath: UYGULAMA_JSON),
       let j = (try? JSONSerialization.jsonObject(with: veri)) as? [String: Any],
       let n = j["node"] as? String {
        adaylar.insert(n, at: 0)
    }
    return adaylar.first { FileManager.default.isExecutableFile(atPath: $0) }
}

func gunluk(_ s: String) {
    let satir = "\(ISO8601DateFormatter().string(from: Date()))  \(s)\n"
    guard let d = satir.data(using: .utf8) else { return }
    try? FileManager.default.createDirectory(atPath: KOK, withIntermediateDirectories: true)
    if let h = FileHandle(forWritingAtPath: GUNLUK_DOSYA) {
        h.seekToEndOfFile(); h.write(d); try? h.close()
    } else {
        FileManager.default.createFile(atPath: GUNLUK_DOSYA, contents: d)
    }
}

/// Es zaman korumasi icin paylasilan kutu (kapanislar referans yakalar,
/// Data dogrudan degistirilemez).
final class VeriKutusu { var veri = Data() }

/// Bir komutu calistirir, stdout'u dondurur. Surec `zamanAsimi` saniyede
/// bitmezse once terminate, 2 sn sonra SIGKILL; okuma ayri kuyruktadir,
/// EOF surecin olmesiyle gelir, kilitlenme olmaz.
@discardableResult
func calistir(_ argumanlar: [String], zamanAsimi: Double = 30) -> String? {
    guard let node = nodeYolu() else { return nil }
    let p = Process()
    p.executableURL = URL(fileURLWithPath: node)
    p.arguments = argumanlar
    let boru = Pipe()
    p.standardOutput = boru
    p.standardError = FileHandle.nullDevice
    do { try p.run() } catch { return nil }

    let kutu = VeriKutusu()
    let okumaKuyrugu = DispatchQueue(label: "gunluk-kota.okuma")
    okumaKuyrugu.async {
        kutu.veri.append(boru.fileHandleForReading.readDataToEndOfFile())
    }

    let baslangic = Date()
    while p.isRunning && Date().timeIntervalSince(baslangic) < zamanAsimi {
        Thread.sleep(forTimeInterval: 0.05)
    }
    if p.isRunning {
        gunluk("komut zaman aşımına uğradı (\(Int(zamanAsimi)) sn), süreç durduruluyor")
        p.terminate()
        let olumBaslangici = Date()
        while p.isRunning && Date().timeIntervalSince(olumBaslangici) < 2 {
            Thread.sleep(forTimeInterval: 0.05)
        }
        if p.isRunning { kill(p.processIdentifier, SIGKILL) }
    }
    p.waitUntilExit()
    okumaKuyrugu.sync {}   // okumanin tamamlanmasini bekle
    return String(data: kutu.veri, encoding: .utf8)
}

// MARK: - Durum (cekirdeğin durum JSON'u)

struct Durum {
    var gun: String?
    var harcanan = 0.0
    var tavan = 15.0
    var kalan = 15.0
    var uyari = false
    var asildi = false
    var baslangic: String?
    var aktif = false
    var bypass = false
    var engel = false
    var son7g: Double?
    var son5s: Double?
    var reset5: Double?
    var reset7: Double?
    var kaynak: String?
    var olcumZamani: String?
    var hata: String?
    var gecmis: [(String, Double)] = []
    var oran: Double { tavan > 0 ? min(1, harcanan / tavan) : 0 }
}

func durumCoz(_ j: [String: Any]) -> Durum {
    var d = Durum()
    d.gun = j["gun"] as? String
    d.harcanan = j["harcanan"] as? Double ?? 0
    d.tavan = j["tavan"] as? Double ?? 15
    d.kalan = j["kalan"] as? Double ?? 15
    d.uyari = j["uyari"] as? Bool ?? false
    d.asildi = j["asildi"] as? Bool ?? false
    d.baslangic = j["baslangic"] as? String
    d.aktif = j["aktif"] as? Bool ?? false
    d.bypass = j["bypass"] as? Bool ?? false
    d.engel = j["engel"] as? Bool ?? false
    d.son7g = j["son7g"] as? Double
    d.son5s = j["son5s"] as? Double
    d.reset5 = j["reset5"] as? Double
    d.reset7 = j["reset7"] as? Double
    d.kaynak = j["kaynak"] as? String
    d.olcumZamani = j["olcumZamani"] as? String
    d.hata = j["hata"] as? String
    if let g = j["gecmis"] as? [String: Any] {
        d.gecmis = g.compactMap { k, v in (v as? Double).map { (k, $0) } }.sorted { $0.0 > $1.0 }
    }
    return d
}

/// Ciktidaki SON bos olmayan satiri JSON olarak cozer; node uyarilari gibi
/// fazla satirlar sorun etmez.
func durumCoz(_ cikti: String?) -> Durum? {
    guard let cikti = cikti else { return nil }
    let satirlar = cikti.components(separatedBy: .newlines)
        .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    guard let son = satirlar.last,
          let veri = son.data(using: .utf8),
          let j = (try? JSONSerialization.jsonObject(with: veri)) as? [String: Any] else { return nil }
    return durumCoz(j)
}

func sayi(_ x: Double) -> String {
    x == x.rounded() ? String(Int(x)) : String(format: "%.1f", x)
}

/// "4 sa 20 dk sonra" gibi kalan sure metni.
func kalanSure(_ unix: Double?) -> String? {
    guard let u = unix else { return nil }
    let fark = u - Date().timeIntervalSince1970
    if fark <= 0 { return "sıfırlandı" }
    if fark > 10 * 86400 { return nil }  // anlamsiz/bozuk deger, gosterme
    let dk = Int(fark / 60), sa = dk / 60, gun = sa / 24
    if gun >= 1 { return sa % 24 == 0 ? "\(gun) gün sonra" : "\(gun) gün \(sa % 24) sa sonra" }
    if sa >= 1  { return dk % 60 == 0 ? "\(sa) sa sonra" : "\(sa) sa \(dk % 60) dk sonra" }
    return "\(max(1, dk)) dk sonra"
}

/// ISO 8601 zamandan "3 sa önce" gibi kisa gecmis sure metni (bayat uyarisi icin).
func gecenSure(_ iso: String?) -> String? {
    guard let iso = iso else { return nil }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let t = f.date(from: iso) else { return nil }
    let dk = Int(Date().timeIntervalSince(t) / 60)
    if dk < 1 { return "az önce" }
    if dk < 60 { return "\(dk) dk önce" }
    let sa = dk / 60
    return sa < 48 ? "\(sa) sa önce" : "\(sa / 24) gün önce"
}

/// Kaynak 'bayat' ise blok altbilgisine olcum zamani notu ekler. Olcum hatti
/// bozulunca degerler sessizce kayboluyordu; son iyi deger bayat etiketiyle
/// ve olcum aniyla gosterilir.
func bayatNotu(_ d: Durum, alt: String?) -> String? {
    guard d.kaynak == "bayat" else { return alt }
    let not = gecenSure(d.olcumZamani).map { "ölçüm \($0) · bayat" } ?? "ölçüm bayat"
    return alt.map { "\($0) · \(not)" } ?? not
}

/// Durum satiri rengi: engel/asildi kirmizi, uyari turuncu, normal etiket rengi.
/// Hem panel barinda hem menubaru simgesinde ayni kural.
func durumRengi(_ d: Durum) -> NSColor {
    if d.engel || d.asildi { return NSColor.systemRed }
    if d.uyari { return NSColor.systemOrange }
    return NSColor.labelColor
}

/// Menu cubugu simgesinin rengi; nil = normal (beyaz) simge.
func simgeRengi(_ d: Durum?) -> NSColor? {
    guard let d = d else { return nil }
    if d.engel || d.asildi { return NSColor.systemRed }
    if d.uyari { return NSColor.systemOrange }
    return nil
}

/// "2026-10-28" -> "28.10"; bozuk girdi oldugu gibi doner.
func kisaGun(_ iso: String) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    guard let t = f.date(from: iso) else { return iso }
    let c = DateFormatter()
    c.dateFormat = "dd.MM"
    return c.string(from: t)
}

/// Uzun metni kelime kelime sarar, en cok `enCok` satir uretir; artan kisim
/// son satira "…" ile toplanir (hata metinleri panel genisligini asmasin).
func sar(_ metin: String, font: NSFont, maxGenislik: CGFloat, enCok: Int) -> [String] {
    func gen(_ s: String) -> CGFloat {
        NSAttributedString(string: s, attributes: [.font: font]).size().width
    }
    var satirlar: [String] = []
    var suanki = ""
    for kelime in metin.components(separatedBy: " ") where !kelime.isEmpty {
        let aday = suanki.isEmpty ? kelime : suanki + " " + kelime
        if suanki.isEmpty || gen(aday) <= maxGenislik {
            suanki = aday
        } else {
            satirlar.append(suanki)
            suanki = kelime
        }
    }
    if !suanki.isEmpty { satirlar.append(suanki) }
    if satirlar.count > enCok {
        let kalanlar = satirlar[(enCok - 1)...].joined(separator: " ")
        var kisa = kalanlar + "…"
        while gen(kisa) > maxGenislik && kisa.count > 1 {
            kisa = String(kisa.dropLast(2)) + "…"
        }
        satirlar = Array(satirlar[..<(enCok - 1)])
        satirlar.append(kisa)
    }
    return satirlar
}

// MARK: - Esik ve engel bildirimleri

final class BildirimDelegesi: NSObject, UNUserNotificationCenterDelegate {
    // Uygulama accessory politikada calisir; banner yine de gosterilsin diye acikca soyluyoruz.
    func userNotificationCenter(_ merkez: UNUserNotificationCenter,
                                willPresent bildirim: UNNotification,
                                withCompletionHandler bitti: @escaping (UNNotificationPresentationOptions) -> Void) {
        bitti([.banner, .sound])
    }
}

func bildir(baslik: String, mesaj: String) {
    let icerik = UNMutableNotificationContent()
    icerik.title = baslik
    icerik.body = mesaj
    icerik.sound = .default
    let istek = UNNotificationRequest(identifier: UUID().uuidString, content: icerik, trigger: nil)
    UNUserNotificationCenter.current().add(istek)
}

func esikleriOku() -> [Double] {
    guard let veri = FileManager.default.contents(atPath: AYAR_DOSYASI),
          let j = (try? JSONSerialization.jsonObject(with: veri)) as? [String: Any],
          let liste = j["bildirimEsikleri"] as? [Any] else { return VARSAYILAN_ESIKLER }
    let esikler = liste.compactMap { ($0 as? NSNumber)?.doubleValue }.sorted()
    return esikler.isEmpty ? VARSAYILAN_ESIKLER : esikler
}

func bildirimDefteriOku() -> [String: Any] {
    guard let veri = FileManager.default.contents(atPath: BILDIRIM_DEFTERI),
          let j = (try? JSONSerialization.jsonObject(with: veri)) as? [String: Any] else { return [:] }
    return j
}

func bildirimDefterineYaz(_ j: [String: Any]) {
    try? FileManager.default.createDirectory(atPath: KOK, withIntermediateDirectories: true)
    guard let veri = try? JSONSerialization.data(withJSONObject: j) else { return }
    FileManager.default.createFile(atPath: BILDIRIM_DEFTERI, contents: veri)
}

func gunMetni(_ d: Durum) -> String {
    if let g = d.gun { return g }
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Date())
}

/// Dakikalik okumada esik gecisini ve engelin acilmasini arar. Defter her
/// tikte guncel degerle yazilir; uygulama yeniden baslayinca ayni esik tekrar
/// haber vermez, gun degisinde (gece yarisi ya da elle sifirlamada) esikler
/// yeniden kurulur. Gunun ilk okumasi mevcut degerle tohumlanir ki acilista
/// uc bildirim birden yagmasin.
func esikKontrol(_ d: Durum?) {
    guard let d = d else { return }
    let defter = bildirimDefteriOku()
    let ayniGun = (defter["gun"] as? String) == gunMetni(d)
    var onceki = ayniGun ? (defter["onceki"] as? Double ?? -1) : -1
    let eskiEngel = ayniGun ? (defter["engel"] as? Bool ?? false) : false
    if onceki < 0 { onceki = d.harcanan }
    let esikler = esikleriOku()
    for e in esikler where onceki < e && d.harcanan >= e {
        let kalan = max(0, d.tavan - d.harcanan)
        let not = e == esikler.last ? " Tavana çok az kaldı." : ""
        bildir(baslik: "Kota: %\(sayi(e)) doldu",
               mesaj: "Bugün %\(sayi(d.harcanan)) / %\(sayi(d.tavan)) · %\(sayi(kalan)) kaldı.\(not)")
        gunluk("eşik bildirimi -> %\(sayi(e)) · bugün %\(sayi(d.harcanan))")
    }
    if d.engel && !eskiEngel {
        bildir(baslik: "Günlük kota doldu",
               mesaj: "Bugün %\(sayi(d.harcanan)) / %\(sayi(d.tavan)). Devam etmek için \"kota devam\" yaz; gece yarısı sıfırlanır.")
        gunluk("engel bildirimi · bugün %\(sayi(d.harcanan))")
    }
    bildirimDefterineYaz(["gun": gunMetni(d), "onceki": d.harcanan, "engel": d.engel])
}

// MARK: - Menudeki bar paneli

final class BarPaneli: NSView {
    var durum: Durum?
    /// --panel-png zemin kipi: opak arka plan rengi (nil = menu zeminine birak).
    var zeminRengi: NSColor?
    static let GENISLIK: CGFloat = 272
    private var genislik: CGFloat { BarPaneli.GENISLIK }

    // Yukseklik icerikten hesaplanir; sabit deger verilince altta bos alan kaliyordu.
    static let UST: CGFloat = 22, ARA: CGFloat = 11, ALT: CGFloat = 10, BLOK: CGFloat = 43
    static let DURUM_ARALIK: CGFloat = 8, DURUM_SATIR: CGFloat = 13

    /// Uc blogun altindaki durum satirlari: baslangic tarihi, engel, bypass,
    /// olcum hatasi. (metin, kirmizi mi, koyu mu).
    static func durumSatirlari(_ d: Durum) -> [(metin: String, kirmizi: Bool, koyu: Bool)] {
        var s: [(String, Bool, Bool)] = []
        if !d.aktif, let b = d.baslangic, !b.isEmpty {
            s.append(("Engel \(kisaGun(b)) itibarıyla devrede", false, false))
        }
        if d.engel {
            s.append(("ENGEL AÇIK · devam için \"kota devam\" yaz", true, true))
        }
        if d.bypass {
            s.append(("Bugün için engel kaldırıldı", false, false))
        }
        if let h = d.hata, !h.isEmpty {
            let font = NSFont.systemFont(ofSize: 10)
            for satir in sar(h, font: font, maxGenislik: GENISLIK - 32, enCok: 2) {
                s.append((satir, true, false))
            }
        }
        return s.map { (metin: $0.0, kirmizi: $0.1, koyu: $0.2) }
    }

    static func yukseklik(_ d: Durum?) -> CGFloat {
        guard let d = d else { return 46 }
        let n = durumSatirlari(d).count
        return UST + BLOK * 3 + ARA * 2 + (n > 0 ? DURUM_ARALIK + CGFloat(n) * DURUM_SATIR : 0) + ALT
    }

    init(durum: Durum?) {
        self.durum = durum
        super.init(frame: NSRect(x: 0, y: 0, width: BarPaneli.GENISLIK, height: BarPaneli.yukseklik(durum)))
    }
    required init?(coder: NSCoder) { fatalError() }

    private func yaz(_ s: String, _ x: CGFloat, _ y: CGFloat, boyut: CGFloat,
                     renk: NSColor, agirlik: NSFont.Weight = .regular,
                     tekEn: Bool = false, sagKenar: CGFloat? = nil, aralik: CGFloat = 0) {
        var oz: [NSAttributedString.Key: Any] = [
            .font: tekEn ? NSFont.monospacedDigitSystemFont(ofSize: boyut, weight: agirlik)
                         : NSFont.systemFont(ofSize: boyut, weight: agirlik),
            .foregroundColor: renk,
        ]
        if aralik != 0 { oz[.kern] = aralik }
        let a = NSAttributedString(string: s, attributes: oz)
        let g = a.size().width
        a.draw(at: NSPoint(x: sagKenar != nil ? sagKenar! - g : x, y: y))
    }

    private func bar(_ y: CGFloat, oran: Double, renk: NSColor) {
        let sol: CGFloat = 16, sag = genislik - 16, h: CGFloat = 5
        let zemin = NSBezierPath(roundedRect: NSRect(x: sol, y: y, width: sag - sol, height: h),
                                 xRadius: h / 2, yRadius: h / 2)
        NSColor.quaternaryLabelColor.setFill()
        zemin.fill()
        let dolu = max(0, min(1, oran)) * (sag - sol)
        if dolu > 0.5 {
            let p = NSBezierPath(roundedRect: NSRect(x: sol, y: y, width: max(h, dolu), height: h),
                                 xRadius: h / 2, yRadius: h / 2)
            renk.setFill()
            p.fill()
        }
    }

    /// Bir blok cizer, kullandigi yuksekligi dondurur.
    /// `ana` olan blok (gunluk tavan) daha buyuk ve tam kontrastli yazilir;
    /// digerleri ikincil kalir, boylece bakinca once gunluk rakam okunur.
    private func blok(_ ustY: CGFloat, etiket: String, deger: String,
                      oran: Double, renk: NSColor, altBilgi: String?, ana: Bool = false) -> CGFloat {
        var y = ustY
        yaz(etiket, 16, y, boyut: 10, renk: ana ? .secondaryLabelColor : .tertiaryLabelColor,
            agirlik: .semibold, aralik: 0.9)
        yaz(deger, 0, y - (ana ? 2 : 1), boyut: ana ? 13 : 12,
            renk: ana ? .labelColor : .secondaryLabelColor,
            agirlik: ana ? .semibold : .medium, tekEn: true, sagKenar: genislik - 16)
        y -= 15
        bar(y, oran: oran, renk: renk)
        y -= 15
        if let alt = altBilgi {
            yaz(alt, 16, y, boyut: 10, renk: .tertiaryLabelColor)
        }
        y -= 13
        return ustY - y
    }

    override func draw(_ dirtyRect: NSRect) {
        if let zemin = zeminRengi {
            zemin.setFill()
            bounds.fill()
        }
        guard let d = durum else {
            yaz("Sayaç okunamadı", 16, 16, boyut: 12, renk: .secondaryLabelColor)
            return
        }
        var y = bounds.height - BarPaneli.UST

        // 1) Gunluk tavan: ana metrik
        let gRenk = durumRengi(d)
        let gAlt: String? = d.harcanan >= d.tavan
            ? "tavan aşıldı"
            : "kalan %\(sayi(d.kalan)) · gece yarısı sıfırlanır"
        y -= blok(y, etiket: "BUGÜN", deger: "%\(sayi(d.harcanan)) / %\(sayi(d.tavan))",
                  oran: d.oran, renk: gRenk, altBilgi: gAlt, ana: true)
        y -= BarPaneli.ARA

        // 2) Bes saatlik pencere
        let b5 = d.son5s ?? 0
        y -= blok(y, etiket: "5 SAATLİK", deger: "%\(sayi(b5))", oran: b5 / 100,
                  renk: b5 >= 85 ? .systemRed : (b5 >= 60 ? .systemOrange : .tertiaryLabelColor),
                  altBilgi: bayatNotu(d, alt: kalanSure(d.reset5).map { "\($0) sıfırlanır" }))
        y -= BarPaneli.ARA

        // 3) Haftalik pencere
        let b7 = d.son7g ?? 0
        y -= blok(y, etiket: "HAFTALIK", deger: "%\(sayi((b7 * 10).rounded() / 10))", oran: b7 / 100,
                  renk: b7 >= 85 ? .systemRed : (b7 >= 60 ? .systemOrange : .tertiaryLabelColor),
                  altBilgi: bayatNotu(d, alt: kalanSure(d.reset7).map { "\($0) sıfırlanır" }))

        // 4) Durum satirlari: baslangic, engel, bypass, hata
        let satirlar = BarPaneli.durumSatirlari(d)
        if !satirlar.isEmpty {
            y -= BarPaneli.DURUM_ARALIK
            for s in satirlar {
                y -= BarPaneli.DURUM_SATIR
                yaz(s.metin, 16, y, boyut: 10,
                    renk: s.kirmizi ? .systemRed : .secondaryLabelColor,
                    agirlik: s.koyu ? .semibold : .regular)
            }
        }
    }
}

// MARK: - Uygulama

final class Delege: NSObject, NSApplicationDelegate {
    var oge: NSStatusItem!
    var zamanlayici: Timer?
    let bildirimDelegesi = BildirimDelegesi()
    // Dakikalik olcumler bu serilik kuyrugunda calisir; ust uste binmez.
    let isKuyrugu = DispatchQueue(label: "gunluk-kota.is", qos: .utility)
    var mesgul = false        // yalniz isKuyrugu uzerinden erisilir
    var bypassAcik = false    // menu kuruldugu andaki bypass durumu (ana kuyruk)

    func applicationDidFinishLaunching(_ n: Notification) {
        let merkez = UNUserNotificationCenter.current()
        merkez.delegate = bildirimDelegesi
        merkez.requestAuthorization(options: [.alert, .sound]) { verildi, hata in
            gunluk("bildirim izni: \(verildi)\(hata.map { " · \($0.localizedDescription)" } ?? "")")
        }

        // Menu cubugu dar: simge olabildigince dar tutuluyor (18px logo + kenar).
        oge = NSStatusBar.system.statusItem(withLength: 24)
        oge.isVisible = true
        oge.button?.image = claudeSimgesi(kenar: 17)
        oge.button?.imagePosition = .imageOnly
        gunluk("durum ogesi olusturuldu · kok: \(KOK)")
        yenile()
        zamanlayici = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.yenile()
        }
    }

    /// Tek yenileme: `olc --json` cagrisi hem olcer hem durumu donerur; eski
    /// uygulamadaki iki ayri cagri bunda tektir.
    func yenile() {
        isKuyrugu.async { self.yenileIs() }
    }

    private func yenileIs() {
        guard !mesgul else {
            gunluk("onceki yenileme hala suruyor, tur atlandi")
            return
        }
        mesgul = true
        defer { mesgul = false }
        let d = durumCoz(calistir([KOTA_BETIK, "olc", "--json"]))
        esikKontrol(d)
        DispatchQueue.main.async {
            self.ciz(d)
            self.menuKur(d)
        }
    }

    /// Menu eylemleri (ac/kapat/sifirla) cekirdek CLI'siyle yurutulur,
    /// ardindan panel tazelenir.
    private func eylem(_ komut: String) {
        isKuyrugu.async {
            _ = calistir([KOTA_BETIK, komut])
            self.yenileIs()
        }
    }

    func ciz(_ d: Durum?) {
        guard let dugme = oge.button else { return }
        // Normalde beyaz sablon simge; yalniz uyari ve tavan/engel durumunda
        // renge donerek dikkat ceker.
        dugme.image = claudeSimgesi(kenar: 17, renk: simgeRengi(d))
        if let d = d {
            dugme.toolTip = "Claude · bugün %\(sayi(d.harcanan)) / %\(sayi(d.tavan))"
            gunluk("cizildi -> oran \(String(format: "%.2f", d.oran)), bugün %\(sayi(d.harcanan))")
        } else {
            dugme.toolTip = "Kota sayacı okunamadı"
            gunluk("cizildi -> veri yok")
        }
    }

    func menuKur(_ d: Durum?) {
        let m = NSMenu()
        let panel = NSMenuItem()
        panel.view = BarPaneli(durum: d)
        m.addItem(panel)
        m.addItem(.separator())

        if let d = d, !d.gecmis.isEmpty {
            let alt = NSMenu()
            for (gun, v) in d.gecmis.prefix(7) {
                let o = NSMenuItem(title: "\(gun)    %\(sayi(v))", action: nil, keyEquivalent: "")
                o.isEnabled = false
                alt.addItem(o)
            }
            let ust = NSMenuItem(title: "Son günler", action: nil, keyEquivalent: "")
            m.addItem(ust)
            m.setSubmenu(alt, for: ust)
            m.addItem(.separator())
        }

        bypassAcik = d?.bypass ?? false
        m.addItem(NSMenuItem(title: "Şimdi ölç", action: #selector(elleYenile), keyEquivalent: "r"))
        m.addItem(NSMenuItem(title: bypassAcik ? "Engeli geri koy" : "Bugünlük engeli aç",
                             action: #selector(engelDegistir), keyEquivalent: ""))
        m.addItem(NSMenuItem(title: "Bugünkü sayacı sıfırla", action: #selector(sifirla), keyEquivalent: ""))
        m.addItem(.separator())
        m.addItem(NSMenuItem(title: "Çık", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        for o in m.items where o.action != nil { o.target = self }
        oge.menu = m
    }

    @objc func elleYenile() { yenile() }
    @objc func engelDegistir() { eylem(bypassAcik ? "kapat" : "ac") }
    @objc func sifirla() { eylem("sifirla") }
}

// MARK: - Tani kipleri
//
// GUI olmadan cizip cikarlar; menu cubugu ogesi olusturulmaz.
//   GunlukKota --ciz <cikti.png> <harcanan> <tavan> <normal|uyari|asildi> [acik|koyu]
//     Menubaru simgesini 64 px cizer. Arka plan, secilen gorunumun menu
//     cubugunu temsil eder (koyu/acik); simge rengi uygulamanin cizdigi
//     renktir: normal beyaz, uyari turuncu, asildi kirmizi.
//   GunlukKota --panel-png <cikti.png> --ornek <durum.json> [acik|koyu] [zemin]
//     Ornek durum JSON'undan paneli PNG'ye cizer. `zemin` verilirse arka plan
//     opak boyanir (koyu #2B2B2E, acik #F4F4F6); PNG menu disinda da okunur.

func hataYaz(_ s: String) {
    FileHandle.standardError.write((s + "\n").data(using: .utf8)!)
}

// Cok dosyali derlemede top-level ifade yalniz "main.swift" dosyasinda
// olabilir; giris noktasi bu yuzden @main ile kurulur. Delege'yi NSApplication
// zayif referansla tuttugundan static let canli tutar.
@main
enum Giris {
    static let delege = Delege()

    static func main() {
        let arguments = CommandLine.arguments

        if let i = arguments.firstIndex(of: "--ciz") {
            let kalan = Array(arguments[(i + 1)...])
            guard kalan.count >= 4,
                  let harcanan = Double(kalan[1]),
                  let tavan = Double(kalan[2]) else {
                hataYaz("Kullanım: GunlukKota --ciz <çıktı.png> <harcanan> <tavan> <normal|uyari|asildi> [acik|koyu]")
                exit(1)
            }
            let ciktiYolu = kalan[0]
            let durumAdi = kalan[3]
            let tema = kalan.count > 4 ? kalan[4] : "koyu"
            let renk: NSColor
            switch durumAdi {
            case "normal": renk = .white
            case "uyari": renk = .systemOrange
            case "asildi": renk = .systemRed
            default:
                hataYaz("Bilinmeyen durum: \(durumAdi) (normal|uyari|asildi olmalı)")
                exit(1)
            }
            guard tema == "acik" || tema == "koyu" else {
                hataYaz("Bilinmeyen tema: \(tema) (acik|koyu olmalı)")
                exit(1)
            }
            let arkaPlan = tema == "acik"
                ? NSColor(calibratedWhite: 0.93, alpha: 1)
                : NSColor(calibratedWhite: 0.16, alpha: 1)
            let img = NSImage(size: NSSize(width: 64, height: 64), flipped: false) { r in
                arkaPlan.setFill()
                r.fill()
                let yol = svgYolu(CLAUDE_PATH_D, hedef: 64)
                renk.setFill()
                yol.fill()
                return true
            }
            guard let tiff = img.tiffRepresentation,
                  let rep = NSBitmapImageRep(data: tiff),
                  let png = rep.representation(using: .png, properties: [:]),
                  (try? png.write(to: URL(fileURLWithPath: ciktiYolu))) != nil else {
                hataYaz("PNG yazılamadı: \(ciktiYolu)")
                exit(1)
            }
            print("ok: \(ciktiYolu) 64x64 \(durumAdi) \(tema) (%\(sayi(harcanan)) / %\(sayi(tavan)))")
            exit(0)
        }

        if let i = arguments.firstIndex(of: "--panel-png") {
            guard i + 1 < arguments.count else {
                hataYaz("Kullanım: GunlukKota --panel-png <çıktı.png> --ornek <durum.json> [acik|koyu] [zemin]")
                exit(1)
            }
            let ciktiYolu = arguments[i + 1]
            var ornekYolu: String?
            var tema = "koyu"
            var zemin = false
            var j = i + 2
            while j < arguments.count {
                if arguments[j] == "--ornek", j + 1 < arguments.count {
                    ornekYolu = arguments[j + 1]; j += 2
                } else if arguments[j] == "acik" || arguments[j] == "koyu" {
                    tema = arguments[j]; j += 1
                } else if arguments[j] == "zemin" {
                    zemin = true; j += 1
                } else {
                    j += 1
                }
            }
            guard let ornek = ornekYolu,
                  let veri = FileManager.default.contents(atPath: ornek),
                  let jo = (try? JSONSerialization.jsonObject(with: veri)) as? [String: Any] else {
                hataYaz("Örnek durum JSON'u okunamadı (--ornek <durum.json>)")
                exit(1)
            }
            let d = durumCoz(jo)
            // `zemin` kipinde arka plan opak doldurulur; PNG menu disinda da
            // (dosya gezgini, tarayici) kendi zeminini tasir.
            let zeminRengi: NSColor? = zemin
                ? (tema == "acik"
                    ? NSColor(srgbRed: 0xF4 / 255.0, green: 0xF4 / 255.0, blue: 0xF6 / 255.0, alpha: 1)
                    : NSColor(srgbRed: 0x2B / 255.0, green: 0x2B / 255.0, blue: 0x2E / 255.0, alpha: 1))
                : nil
            let panel = BarPaneli(durum: d)
            panel.zeminRengi = zeminRengi
            let gorunum = NSAppearance(named: tema == "acik" ? .aqua : .darkAqua)!
            panel.appearance = gorunum
            let kutu = NSRect(x: 0, y: 0, width: BarPaneli.GENISLIK, height: BarPaneli.yukseklik(d))
            panel.frame = kutu
            guard let rep = panel.bitmapImageRepForCachingDisplay(in: kutu) else {
                hataYaz("Panel bitmap'i oluşturulamadı")
                exit(1)
            }
            gorunum.performAsCurrentDrawingAppearance {
                panel.cacheDisplay(in: kutu, to: rep)
            }
            guard let png = rep.representation(using: .png, properties: [:]),
                  (try? png.write(to: URL(fileURLWithPath: ciktiYolu))) != nil else {
                hataYaz("PNG yazılamadı: \(ciktiYolu)")
                exit(1)
            }
            print("ok: \(ciktiYolu) \(rep.pixelsWide)x\(rep.pixelsHigh) \(tema)\(zemin ? " zemin" : "") (durum satırları: \(BarPaneli.durumSatirlari(d).count))")
            exit(0)
        }

        let uygulama = NSApplication.shared
        uygulama.delegate = delege
        uygulama.setActivationPolicy(.accessory)
        uygulama.run()
    }
}

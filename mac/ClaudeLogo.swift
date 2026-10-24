// Claude logosunun resmi vektor yolu (simpleicons CDN'den alindi).
// 24x24 viewBox, SVG y ekseni asagi dogru; cizerken ters cevriliyor.

import Cocoa

let CLAUDE_PATH_D = "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"

/// SVG "d" dizesini NSBezierPath'e cevirir. Claude logosunda gecen komutlar:
/// m/l/L/h/v/c/Z. Kucuk harf gorelidir, buyuk harf mutlak.
func svgYolu(_ d: String, kutu: CGFloat = 24, hedef: CGFloat) -> NSBezierPath {
    let yol = NSBezierPath()
    let o = hedef / kutu                    // olcek
    // SVG'de y asagi artar, Cocoa'da yukari: y'yi ters cevir.
    func nokta(_ x: CGFloat, _ y: CGFloat) -> NSPoint { NSPoint(x: x * o, y: (kutu - y) * o) }

    var sayilar: [CGFloat] = []
    var komutlar: [(Character, [CGFloat])] = []
    var suanki: Character = " "
    var tampon = ""

    func tamponuBosalt() {
        if !tampon.isEmpty, let v = Double(tampon) { sayilar.append(CGFloat(v)) }
        tampon = ""
    }
    func komutuKapat() {
        tamponuBosalt()
        if suanki != " " { komutlar.append((suanki, sayilar)) }
        sayilar = []
    }

    for ch in d {
        if ch.isLetter {
            komutuKapat()
            suanki = ch
        } else if ch == "-" {
            // Eksi isareti yeni sayi baslatir (ussel gosterim yok bu yolda).
            if !tampon.isEmpty { tamponuBosalt() }
            tampon = "-"
        } else if ch == "." {
            // Ikinci nokta yeni sayi demektir: ".079-.2307.079" gibi yazimlar var.
            if tampon.contains(".") { tamponuBosalt() }
            tampon += "."
        } else if ch.isNumber {
            tampon.append(ch)
        } else {           // bosluk veya virgul
            tamponuBosalt()
        }
    }
    komutuKapat()

    var imlec = NSPoint(x: 0, y: 0)          // SVG koordinatinda
    var baslangic = NSPoint(x: 0, y: 0)

    for (k, s) in komutlar {
        var i = 0
        switch k {
        case "m", "M":
            while i + 1 < s.count {
                let p = (k == "m" && i > 0) || k == "m"
                    ? NSPoint(x: imlec.x + s[i], y: imlec.y + s[i+1])
                    : NSPoint(x: s[i], y: s[i+1])
                if i == 0 { yol.move(to: nokta(p.x, p.y)); baslangic = p }
                else { yol.line(to: nokta(p.x, p.y)) }
                imlec = p; i += 2
            }
        case "l", "L":
            while i + 1 < s.count {
                let p = k == "l" ? NSPoint(x: imlec.x + s[i], y: imlec.y + s[i+1])
                                 : NSPoint(x: s[i], y: s[i+1])
                yol.line(to: nokta(p.x, p.y)); imlec = p; i += 2
            }
        case "h", "H":
            while i < s.count {
                let x = k == "h" ? imlec.x + s[i] : s[i]
                imlec = NSPoint(x: x, y: imlec.y)
                yol.line(to: nokta(imlec.x, imlec.y)); i += 1
            }
        case "v", "V":
            while i < s.count {
                let y = k == "v" ? imlec.y + s[i] : s[i]
                imlec = NSPoint(x: imlec.x, y: y)
                yol.line(to: nokta(imlec.x, imlec.y)); i += 1
            }
        case "c", "C":
            while i + 5 < s.count {
                let goreli = (k == "c")
                let k1 = NSPoint(x: (goreli ? imlec.x : 0) + s[i],   y: (goreli ? imlec.y : 0) + s[i+1])
                let k2 = NSPoint(x: (goreli ? imlec.x : 0) + s[i+2], y: (goreli ? imlec.y : 0) + s[i+3])
                let uc = NSPoint(x: (goreli ? imlec.x : 0) + s[i+4], y: (goreli ? imlec.y : 0) + s[i+5])
                yol.curve(to: nokta(uc.x, uc.y),
                          controlPoint1: nokta(k1.x, k1.y),
                          controlPoint2: nokta(k2.x, k2.y))
                imlec = uc; i += 6
            }
        case "z", "Z":
            yol.close(); imlec = baslangic
        default:
            break
        }
    }
    return yol
}

/// Menu cubugu simgesi: Claude burst'u, tek renk.
///
/// Cizim `NSImage(size:flipped:drawingHandler:)` ile yapiliyor; lockFocus
/// kullaniminda menu cubugunda bos (seffaf) simge olusuyordu, drawingHandler
/// cizimi her ihtiyac aninda yeniden calistirdigi icin bu sorunu yasamiyor.
/// Iki tuzak olculdu: isTemplate modu menu cubugunda bos simge veriyordu;
/// dinamik tema renkleri bu baglamda yanlış çözülüyordu. O yüzden renk
/// acikca veriliyor: varsayilan beyaz (menu cubugu pratikte koyu zeminli),
/// uyari/tavan durumunda cagiran renk geciyor.
func claudeSimgesi(kenar: CGFloat = 18, renk: NSColor? = nil) -> NSImage {
    let cizimRengi = renk ?? NSColor.white
    let img = NSImage(size: NSSize(width: kenar, height: kenar), flipped: false) { _ in
        let yol = svgYolu(CLAUDE_PATH_D, hedef: kenar)
        cizimRengi.setFill()
        yol.fill()
        return true
    }
    img.isTemplate = false
    return img
}

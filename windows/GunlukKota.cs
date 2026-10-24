// GunlukKota · Windows tepsi gostergesi (C# 5, WinForms, .NET Framework 4.x).
// Mac'teki kota-gostergesi uygulamasinin Windows ikizi: KOTA MANTIGI YOKTUR;
// her 60 saniyede bir `node <KOK>\cekirdek\kota.mjs olc --json` calistirir ve
// donen durum JSON'unu cizer. Tani kipleri: --ciz, --panel-png (GUI'siz).
//
// Derleme: derle.ps1 (Windows ile gelen csc.exe; C# 5 kurallarina gore yazildi:
// string interp, null-kosullu erisim, expression-body uyeler KULLANILMAZ).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

static class Win32
{
    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool DestroyIcon(IntPtr hIcon);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool AttachConsole(uint surecId);
}

static class Arac
{
    public static readonly CultureInfo TR = new CultureInfo("tr-TR");
    public static readonly CultureInfo ISO = CultureInfo.InvariantCulture;
    private static readonly DateTime Epok = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    public static readonly string KOK = KokBul();

    private static string KokBul()
    {
        string e = Environment.GetEnvironmentVariable("GUNLUK_KOTA_EV");
        if (!string.IsNullOrEmpty(e)) return e;
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".gunluk-kota");
    }

    public static double SimdiUnix()
    {
        return (DateTime.UtcNow - Epok).TotalSeconds;
    }

    // "9.2" -> "9,2"; tam sayiysa "15". Mac tarafindaki sayi() ile ayni.
    public static string Sayi(double x)
    {
        if (x == Math.Round(x)) return ((long)x).ToString(ISO);
        return x.ToString("0.0", TR);
    }

    public static double Cift(object o)
    {
        if (o == null) return 0.0;
        try { return Convert.ToDouble(o, ISO); }
        catch { return 0.0; }
    }

    public static double CiftSozluk(Dictionary<string, object> j, string anahtar, double varsayilan)
    {
        object o;
        if (j == null || !j.TryGetValue(anahtar, out o) || o == null) return varsayilan;
        try { return Convert.ToDouble(o, ISO); }
        catch { return varsayilan; }
    }

    public static string Metin(Dictionary<string, object> j, string anahtar)
    {
        object o;
        if (j == null || !j.TryGetValue(anahtar, out o) || o == null) return null;
        string s = o.ToString();
        return s.Length == 0 ? null : s;
    }

    public static bool Mantik(Dictionary<string, object> j, string anahtar)
    {
        object o;
        if (j == null || !j.TryGetValue(anahtar, out o)) return false;
        return o is bool && (bool)o;
    }

    // "4 sa 20 dk sonra" biciminde kalan sure metni (main.swift kalanSure tasimasi).
    public static string KalanSure(double? unix)
    {
        if (unix == null || unix.Value <= 0) return null;
        double fark = unix.Value - SimdiUnix();
        if (fark <= 0) return "sıfırlandı";
        if (fark > 10 * 86400) return null;                       // anlamsiz/bozuk deger
        int dk = (int)(fark / 60), sa = dk / 60, gun = sa / 24;
        if (gun >= 1) return sa % 24 == 0 ? gun + " gün sonra" : gun + " gün " + (sa % 24) + " sa sonra";
        if (sa >= 1) return dk % 60 == 0 ? sa + " sa sonra" : sa + " sa " + (dk % 60) + " dk sonra";
        return Math.Max(1, dk) + " dk sonra";
    }

    // ISO zamandan "3 sa once" gibi gecmis sure metni (main.swift gecenSure tasimasi).
    public static string GecenSure(string iso)
    {
        if (string.IsNullOrEmpty(iso)) return null;
        DateTime t;
        if (!DateTime.TryParse(iso, ISO, DateTimeStyles.RoundtripKind, out t)) return null;
        DateTime taban = t.Kind == DateTimeKind.Utc ? DateTime.UtcNow : DateTime.Now;
        double dkf = (taban - t).TotalMinutes;
        if (dkf < 1) return "az önce";
        if (dkf < 60) return ((int)dkf) + " dk önce";
        int sa = (int)(dkf / 60);
        return sa < 48 ? sa + " sa önce" : (sa / 24) + " gün önce";
    }

    public static Dictionary<string, object> JsonOku(string yol)
    {
        try
        {
            if (!File.Exists(yol)) return null;
            return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(yol));
        }
        catch { return null; }
    }

    public static void JsonYaz(string yol, Dictionary<string, object> j)
    {
        try
        {
            string klasor = Path.GetDirectoryName(yol);
            if (!string.IsNullOrEmpty(klasor) && !Directory.Exists(klasor)) Directory.CreateDirectory(klasor);
            string gecici = Path.Combine(Path.GetDirectoryName(yol),
                Path.GetFileNameWithoutExtension(yol) + ".tmp-" + Process.GetCurrentProcess().Id.ToString() + ".json");
            File.WriteAllText(gecici, new JavaScriptSerializer().Serialize(j));
            if (File.Exists(yol)) File.Delete(yol);
            File.Move(gecici, yol);
        }
        catch (Exception ex) { Log("json yazılamadı: " + yol + " · " + ex.Message); }
    }

    public static void Log(string mesaj)
    {
        try
        {
            string yol = Path.Combine(KOK, "gosterge.log");
            string satir = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'") + "  " + mesaj + Environment.NewLine;
            FileInfo fi = new FileInfo(yol);
            if (fi.Exists && fi.Length > 1024 * 1024)
            {
                byte[] b = File.ReadAllBytes(yol);
                int bas = b.Length - 200 * 1024;
                while (bas < b.Length && b[bas] != (byte)'\n') bas++;
                if (bas < b.Length) bas++;
                if (bas > 0 && bas < b.Length)
                {
                    byte[] kalan = new byte[b.Length - bas];
                    Array.Copy(b, bas, kalan, 0, kalan.Length);
                    File.WriteAllBytes(yol, kalan);
                }
            }
            File.AppendAllText(yol, satir);
        }
        catch { }
    }

    // HKCU temasi: ad = "SystemUsesLightTheme" ya da "AppsUseLightTheme".
    // 1 -> acik tema, 0/yoK -> koyu varsayilan. Hata durumunda -1.
    public static int TemaDegeri(string ad)
    {
        try
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"))
            {
                if (k == null) return -1;
                object v = k.GetValue(ad);
                if (v is int) return (int)v;
            }
        }
        catch { }
        return -1;
    }

    public static bool AcikGorevCubugu() { return TemaDegeri("SystemUsesLightTheme") == 1; }
    public static bool AcikUygulama()    { return TemaDegeri("AppsUseLightTheme") == 1; }

    public static string NodeYoluBul()
    {
        // 1) KOK\uygulama.json {"node": "..."}
        Dictionary<string, object> u = JsonOku(Path.Combine(KOK, "uygulama.json"));
        if (u != null)
        {
            object n;
            if (u.TryGetValue("node", out n) && n != null && File.Exists(n.ToString())) return n.ToString();
        }
        // 2) PATH dizinleri
        string ortam = Environment.GetEnvironmentVariable("PATH") ?? "";
        string[] parcalar = ortam.Split(';');
        foreach (string pz in parcalar)
        {
            string dz = pz.Trim();
            if (dz.Length == 0) continue;
            try
            {
                string aday = Path.Combine(dz, "node.exe");
                if (File.Exists(aday)) return aday;
            }
            catch { }
        }
        // 3) Program Files\nodejs
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string son = Path.Combine(pf, "nodejs", "node.exe");
        return File.Exists(son) ? son : null;
    }

    // node kota.mjs <ekArglar> calistirir; stdout doner. Hata/zaman asiminda null.
    public static string NodeCalistir(string ekArglar, int zamanAsimiMs)
    {
        string node = NodeYoluBul();
        if (node == null) { Log("node bulunamadı"); return null; }
        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = node;
        psi.Arguments = "\"" + Path.Combine(KOK, "cekirdek", "kota.mjs") + "\"" +
                        (string.IsNullOrEmpty(ekArglar) ? "" : " " + ekArglar);
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;

        StringBuilder cikti = new StringBuilder();
        StringBuilder hatalar = new StringBuilder();
        try
        {
            using (Process p = new Process())
            {
                p.StartInfo = psi;
                p.OutputDataReceived += delegate(object gonderen, DataReceivedEventArgs e)
                { if (e.Data != null) lock (cikti) cikti.AppendLine(e.Data); };
                p.ErrorDataReceived += delegate(object gonderen, DataReceivedEventArgs e)
                { if (e.Data != null) lock (hatalar) hatalar.AppendLine(e.Data); };
                p.Start();
                p.BeginOutputReadLine();
                p.BeginErrorReadLine();
                if (!p.WaitForExit(zamanAsimiMs))
                {
                    try { p.Kill(); } catch { }
                    Log("node zaman aşımı: " + ekArglar);
                    return null;
                }
                p.WaitForExit();
            }
        }
        catch (Exception ex)
        {
            Log("node başlatılamadı: " + ex.Message);
            return null;
        }
        if (hatalar.Length > 0) Log("node stderr: " + hatalar.ToString().Trim());
        return cikti.ToString();
    }

    // Son bos olmayan satir (JSON cikti onundeki log satirlarini atlar).
    public static string SonSatir(string metin)
    {
        if (string.IsNullOrEmpty(metin)) return null;
        string[] satirlar = metin.Replace("\r", "").Split('\n');
        for (int i = satirlar.Length - 1; i >= 0; i--)
            if (satirlar[i].Trim().Length > 0) return satirlar[i].Trim();
        return null;
    }

    // KOK\ayar.json "bildirimEsikleri"; yoksa 5, 10, 13.
    public static List<double> Esikler()
    {
        List<double> l = new List<double>();
        Dictionary<string, object> a = JsonOku(Path.Combine(KOK, "ayar.json"));
        if (a != null)
        {
            object o;
            if (a.TryGetValue("bildirimEsikleri", out o) && o is object[])
            {
                foreach (object e in (object[])o)
                {
                    try { l.Add(Convert.ToDouble(e, ISO)); } catch { }
                }
            }
        }
        if (l.Count == 0) { l.Add(5); l.Add(10); l.Add(13); }
        l.Sort();
        return l;
    }
}

class Durum
{
    public double harcanan, tavan, kalan, uyariEsigi;
    public bool uyari, asildi, aktif, bypass, engel;
    public string gun, saatDilimi, baslangic, kaynak, olcumZamani, hata;
    public double? son7g, son5s, reset5, reset7;
    public int gozlemSayisi;
    public List<KeyValuePair<string, double>> gecmis = new List<KeyValuePair<string, double>>(); // azalan tarihli

    public double Oran
    {
        get { return tavan > 0 ? Math.Min(1.0, harcanan / tavan) : 0.0; }
    }
}

static class DurumYapici
{
    public static Durum Parse(Dictionary<string, object> j)
    {
        Durum d = new Durum();
        d.harcanan = Arac.CiftSozluk(j, "harcanan", 0.0);
        d.tavan = Arac.CiftSozluk(j, "tavan", 15.0);
        d.kalan = Arac.CiftSozluk(j, "kalan", Math.Max(0.0, d.tavan - d.harcanan));
        d.uyariEsigi = Arac.CiftSozluk(j, "uyariEsigi", 12.0);
        d.uyari = Arac.Mantik(j, "uyari");
        d.asildi = Arac.Mantik(j, "asildi");
        d.aktif = Arac.Mantik(j, "aktif");
        d.bypass = Arac.Mantik(j, "bypass");
        d.engel = Arac.Mantik(j, "engel");
        d.gun = Arac.Metin(j, "gun");
        d.saatDilimi = Arac.Metin(j, "saatDilimi");
        d.baslangic = Arac.Metin(j, "baslangic");
        d.kaynak = Arac.Metin(j, "kaynak");
        d.olcumZamani = Arac.Metin(j, "olcumZamani");
        d.hata = Arac.Metin(j, "hata");
        GozlemSayisiOku(j, d);
        d.son7g = CiftNull(j, "son7g");
        d.son5s = CiftNull(j, "son5s");
        d.reset5 = CiftNull(j, "reset5");
        d.reset7 = CiftNull(j, "reset7");
        object g;
        if (j != null && j.TryGetValue("gecmis", out g))
        {
            Dictionary<string, object> gd = g as Dictionary<string, object>;
            if (gd != null)
            {
                List<KeyValuePair<string, double>> l = new List<KeyValuePair<string, double>>();
                foreach (KeyValuePair<string, object> cift in gd)
                    l.Add(new KeyValuePair<string, double>(cift.Key, Arac.Cift(cift.Value)));
                l.Sort(delegate(KeyValuePair<string, double> a, KeyValuePair<string, double> b) { return string.CompareOrdinal(b.Key, a.Key); });
                d.gecmis = l;
            }
        }
        return d;
    }

    private static void GozlemSayisiOku(Dictionary<string, object> j, Durum d)
    {
        object o;
        if (j != null && j.TryGetValue("gozlemSayisi", out o) && o != null)
        {
            try { d.gozlemSayisi = Convert.ToInt32(o, Arac.ISO); } catch { }
        }
    }

    private static double? CiftNull(Dictionary<string, object> j, string anahtar)
    {
        object o;
        if (j == null || !j.TryGetValue(anahtar, out o) || o == null) return null;
        try { return Convert.ToDouble(o, Arac.ISO); }
        catch { return null; }
    }
}
// ---------------------------------------------------------------------------
// Renk paleti: macOS durumRengi ile ayni kurallar (systemRed 255,59,48;
// systemOrange 255,149,0; normalde temaya gore tek renk).
// ---------------------------------------------------------------------------
static class Palet
{
    public static readonly Color Kirmizi = Color.FromArgb(255, 59, 48);
    public static readonly Color Turuncu = Color.FromArgb(255, 149, 0);

    public static Color Bg(bool acik)       { return acik ? Color.FromArgb(246, 246, 248) : Color.FromArgb(40, 40, 43); }
    public static Color Kenar(bool acik)    { return acik ? Color.FromArgb(214, 214, 220) : Color.FromArgb(58, 58, 63); }
    public static Color Etiket(bool acik)   { return acik ? Color.FromArgb(24, 24, 27)    : Color.FromArgb(244, 244, 246); }
    public static Color Ikincil(bool acik)  { return acik ? Color.FromArgb(124, 124, 129) : Color.FromArgb(168, 168, 174); }
    public static Color Ucuncul(bool acik)  { return acik ? Color.FromArgb(188, 188, 194) : Color.FromArgb(120, 120, 126); }
    public static Color Dorduncul(bool acik){ return acik ? Color.FromArgb(226, 226, 231) : Color.FromArgb(70, 70, 76); }
    public static Color Vurgu(bool acik)    { return acik ? Color.FromArgb(0, 122, 255)   : Color.FromArgb(100, 160, 255); }

    // durumRengi(oran) tasimasi: tavan -> kirmizi, %80+ -> turuncu, yoksa etiket rengi.
    public static Color DurumRengi(double oran, bool acik)
    {
        if (oran >= 1.0) return Kirmizi;
        if (oran >= 0.8) return Turuncu;
        return Etiket(acik);
    }

    public static Color PencereRengi(double yuzde)
    {
        if (yuzde >= 85) return Kirmizi;
        if (yuzde >= 60) return Turuncu;
        return Color.Empty;                                        // cizen taraf ucuncul renge dusurur
    }
}

// ---------------------------------------------------------------------------
// Claude burst logosu: resmi SVG yolu (ClaudeLogo.swift CLAUDE_PATH_D, 24x24
// viewBox) GDI+ GraphicsPath'e cevrilir. SVG ve GDI+ eksenleri de y asagi
// oldugundan y ters cevrilMEZ (Swift'teki ters cevirme Cocoa'ya ozeldir).
// ---------------------------------------------------------------------------
static class LogoYolu
{
    private const string YOL_D =
        "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z";

    private class Komut
    {
        public char K;
        public float[] S;
    }

    private static readonly List<Komut> komutlar = Ayristir(YOL_D);

    // SVG "d" ayristirici (svgYolu tasimasi): m/M l/L h/H v/V c/C z/Z.
    // Eksi isareti yeni sayi baslatir; ikinci nokta yeni sayi demektir.
    private static List<Komut> Ayristir(string d)
    {
        List<Komut> komutlar2 = new List<Komut>();
        List<float> sayilar = new List<float>();
        StringBuilder tampon = new StringBuilder();
        char suanki = ' ';

        Action tamponuBosalt = delegate
        {
            if (tampon.Length > 0)
            {
                float v;
                if (float.TryParse(tampon.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out v))
                    sayilar.Add(v);
                tampon.Length = 0;
            }
        };
        Action komutuKapat = delegate
        {
            tamponuBosalt();
            if (suanki != ' ')
            {
                Komut k = new Komut();
                k.K = suanki;
                k.S = sayilar.ToArray();
                komutlar2.Add(k);
            }
            sayilar = new List<float>();
        };

        foreach (char ch in d)
        {
            if (char.IsLetter(ch)) { komutuKapat(); suanki = ch; }
            else if (ch == '-')
            {
                if (tampon.Length > 0) tamponuBosalt();
                tampon.Append('-');
            }
            else if (ch == '.')
            {
                if (tampon.ToString().Contains(".")) tamponuBosalt();
                tampon.Append('.');
            }
            else if (char.IsDigit(ch)) tampon.Append(ch);
            else tamponuBosalt();                                  // bosluk ya da virgul
        }
        komutuKapat();
        return komutlar2;
    }

    // 24x24 kutudan hedef kenara olceklenmis, (0,0) kokenli yol.
    public static GraphicsPath YolYap(float kenar)
    {
        float o = kenar / 24f;
        GraphicsPath p = new GraphicsPath();
        p.FillMode = FillMode.Winding;                             // SVG nonzero dolgu kurali
        float ix = 0f, iy = 0f, bx = 0f, by = 0f;
        foreach (Komut km in komutlar)
        {
            char kk = char.ToLower(km.K);
            bool goreli = char.IsLower(km.K);
            float[] s = km.S;
            int i = 0;
            if (kk == 'm' || kk == 'l')
            {
                while (i + 1 < s.Length)
                {
                    float nx = goreli ? ix + s[i] : s[i];
                    float ny = goreli ? iy + s[i + 1] : s[i + 1];
                    if (kk == 'm' && i == 0) { p.StartFigure(); bx = nx; by = ny; }
                    else p.AddLine(ix * o, iy * o, nx * o, ny * o);
                    ix = nx; iy = ny; i += 2;
                }
            }
            else if (kk == 'h' || kk == 'v')
            {
                while (i < s.Length)
                {
                    float nx = ix, ny = iy;
                    if (kk == 'h') nx = goreli ? ix + s[i] : s[i];
                    else ny = goreli ? iy + s[i] : s[i];
                    p.AddLine(ix * o, iy * o, nx * o, ny * o);
                    ix = nx; iy = ny; i += 1;
                }
            }
            else if (kk == 'c')
            {
                while (i + 5 < s.Length)
                {
                    float gx = goreli ? ix : 0f, gy = goreli ? iy : 0f;
                    p.AddBezier(ix * o, iy * o,
                        (gx + s[i]) * o, (gy + s[i + 1]) * o,
                        (gx + s[i + 2]) * o, (gy + s[i + 3]) * o,
                        (gx + s[i + 4]) * o, (gy + s[i + 5]) * o);
                    ix = gx + s[i + 4]; iy = gy + s[i + 5]; i += 6;
                }
            }
            else if (kk == 'z')
            {
                p.CloseFigure();
                ix = bx; iy = by;
            }
        }
        return p;
    }

    // Tepsi/gorev cubugu simgesi rengi: durumRengi kuralli; soluk isinlar
    // temanin tek rengiyle duskuk alfa cizilir.
    public static void SimgeRenkleri(double oran, bool engel, bool acikTema, out Color dolu, out Color soluk)
    {
        Color taban = acikTema ? Color.FromArgb(28, 28, 30) : Color.White;
        if (engel || oran >= 1.0) dolu = Palet.Kirmizi;
        else if (oran >= 0.8) dolu = Palet.Turuncu;
        else dolu = taban;
        soluk = Color.FromArgb(80, taban.R, taban.G, taban.B);
    }

    // Burst'u cizer: once tum yol soluk, sonra gunluk doluluk orani kadarlik
    // dilim (ustten saat yonunde) kiliplenip dolu renkle tekrar doldurulur.
    // Boylece isinlar harcanan/tavan oraninda dolar.
    public static void BurstCiz(Graphics g, RectangleF kutu, double oran, Color doluRenk, Color solukRenk)
    {
        float kenar = Math.Min(kutu.Width, kutu.Height);
        if (kenar < 2f) return;
        GraphicsState durum = g.Save();
        try
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TranslateTransform(kutu.X + (kutu.Width - kenar) / 2f, kutu.Y + (kutu.Height - kenar) / 2f);
            using (GraphicsPath yol = YolYap(kenar))
            {
                using (SolidBrush solukFirca = new SolidBrush(solukRenk)) g.FillPath(solukFirca, yol);
                double o = oran < 0 ? 0 : (oran > 1 ? 1 : oran);
                if (o > 0)
                {
                    using (GraphicsPath dilim = new GraphicsPath())
                    {
                        float r = kenar * 0.85f;
                        dilim.AddPie(kenar / 2f - r, kenar / 2f - r, 2f * r, 2f * r, -90f, (float)(360.0 * o));
                        g.SetClip(dilim);
                        using (SolidBrush firca = new SolidBrush(doluRenk)) g.FillPath(firca, yol);
                        g.ResetClip();
                    }
                }
            }
        }
        finally { g.Restore(durum); }
    }
}

// ---------------------------------------------------------------------------
// Program girisi: tanı kipleri (--ciz, --panel-png) GUI'siz; normal kip tek
// ornekli (Mutex) tepsi uygulamasi.
// ---------------------------------------------------------------------------
static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--ciz") { KonsolBagla(); Environment.Exit(CizAna(args)); }
        if (args.Length > 0 && args[0] == "--panel-png") { KonsolBagla(); Environment.Exit(PanelAna(args)); }

        bool yeniKilit;
        using (Mutex kilit = new Mutex(true, @"Local\ClaudeGunlukKota", out yeniKilit))
        {
            if (!yeniKilit) return;                                // ikinci ornek sessizce cikar
            try { Win32.SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new Gosterge());
            GC.KeepAlive(kilit);
        }
    }

    // winexe olmasina ragmen tani kiplerinde konsola yazabilmek icin.
    private static void KonsolBagla()
    {
        try
        {
            if (Win32.AttachConsole(0xFFFFFFFF))
            {
                StreamWriter o = new StreamWriter(Console.OpenStandardOutput(), Encoding.UTF8);
                o.AutoFlush = true;
                Console.SetOut(o);
                StreamWriter e = new StreamWriter(Console.OpenStandardError(), Encoding.UTF8);
                e.AutoFlush = true;
                Console.SetError(e);
            }
        }
        catch { }
    }

    // --ciz <cikti.png> <harcanan> <tavan> <normal|uyari|asildi> [acik|koyu]
    private static int CizAna(string[] args)
    {
        if (args.Length < 5)
        {
            Console.WriteLine("kullanım: --ciz <çıktı.png> <harcanan> <tavan> <normal|uyari|asildi> [acik|koyu]");
            return 2;
        }
        double harcanan, tavan;
        if (!double.TryParse(args[2], NumberStyles.Float, CultureInfo.InvariantCulture, out harcanan) ||
            !double.TryParse(args[3], NumberStyles.Float, CultureInfo.InvariantCulture, out tavan) || tavan <= 0)
        {
            Console.WriteLine("HATA: harcanan/tavan sayı değil");
            return 2;
        }
        string durumAd = args[4].ToLower(Arac.ISO);
        string temaAd = args.Length > 5 ? args[5].ToLower(Arac.ISO) : "koyu";
        bool acikTema = temaAd == "acik";
        double oran = Math.Max(0.0, Math.Min(1.0, harcanan / tavan));

        Color dolu, soluk;
        LogoYolu.SimgeRenkleri(double.MinValue, false, acikTema, out dolu, out soluk);   // taban renk
        if (durumAd == "uyari" || durumAd == "uyarı") dolu = Palet.Turuncu;
        else if (durumAd == "asildi" || durumAd == "aşıldı") dolu = Palet.Kirmizi;

        using (Bitmap b = new Bitmap(64, 64))
        using (Graphics g = Graphics.FromImage(b))
        {
            LogoYolu.BurstCiz(g, new RectangleF(0f, 0f, 64f, 64f), oran, dolu, soluk);
            b.Save(args[1], ImageFormat.Png);
        }
        Console.WriteLine("yazıldı: " + args[1]);
        return 0;
    }

    // --panel-png <cikti.png> --ornek <durum.json> [acik|koyu]
    private static int PanelAna(string[] args)
    {
        string cikti = null, ornek = null, temaAd = "koyu";
        for (int i = 1; i < args.Length; i++)
        {
            if (args[i] == "--ornek" && i + 1 < args.Length) { ornek = args[i + 1]; i++; }
            else if (args[i] == "acik" || args[i] == "koyu") temaAd = args[i];
            else if (cikti == null) cikti = args[i];
        }
        if (cikti == null || ornek == null)
        {
            Console.WriteLine("kullanım: --panel-png <çıktı.png> --ornek <durum.json> [acik|koyu]");
            return 2;
        }
        Dictionary<string, object> j = Arac.JsonOku(ornek);
        if (j == null) { Console.WriteLine("HATA: örnek JSON okunamadı: " + ornek); return 1; }
        Durum d = DurumYapici.Parse(j);
        bool acikTema = temaAd == "acik";

        float olcek = 2f;
        PanelCizici.PanelVeri v = PanelCizici.VeriYap(d, null);
        float h = PanelCizici.Yukseklik(v);
        using (Bitmap b = new Bitmap((int)Math.Round(PanelCizici.GENISLIK * olcek), (int)Math.Round(h * olcek)))
        {
            b.SetResolution(96f * olcek, 96f * olcek);
            using (Graphics g = Graphics.FromImage(b))
            {
                List<RectangleF> dugmeler = new List<RectangleF>();
                PanelCizici.Ciz(g, v, acikTema, olcek, -1, dugmeler);
                b.Save(cikti, ImageFormat.Png);
            }
        }
        Console.WriteLine("yazıldı: " + cikti);
        return 0;
    }
}
// ---------------------------------------------------------------------------
// Panel cizimi: Mac BarPaneli'nin Windows karsiligi. Hem PanelForm (tiklanan
// tepsi paneli) hem --panel-png tani kipi ayni Ciz() kodunu kullanir.
// Olcumler 96 dpi "mantiksal" piksel uzerinden yapilir; Ciz() hepsini olcek
// carpaniyle gercek piksele cevirir.
// ---------------------------------------------------------------------------
static class PanelCizici
{
    public const float GENISLIK = 340f;
    private const float KENAR = 16f;
    private const float UST = 18f, ALT = 16f, ARA = 11f;
    private const float DUGME_H = 30f;

    public class Satir
    {
        public string Metin;
        public bool Kirmizi, Koyu;
        public Satir(string metin, bool kirmizi, bool koyu) { Metin = metin; Kirmizi = kirmizi; Koyu = koyu; }
    }

    public class GecmisGunu
    {
        public string Etiket, Deger;
    }

    public class PanelVeri
    {
        public Durum D;
        public string B1Alt = "", B2Alt = "", B3Alt = "";
        public double B1Oran, B2Oran, B3Oran;
        public string B1Buyuk = "", B1Kucuk = "", B2Deger = "", B3Deger = "";
        public List<Satir> DurumSatirlari = new List<Satir>();
        public List<GecmisGunu> SonGunler = new List<GecmisGunu>();
        public string[] Dugmeler = new string[] { "Şimdi ölç", "Engeli aç", "Sayacı sıfırla" };
    }

    private static readonly StringFormat TY = StringFormat.GenericTypographic;
    private static readonly Font FBaslik = new Font("Segoe UI", 10f, FontStyle.Bold);
    private static readonly Font FBuyuk = new Font("Segoe UI", 20f, FontStyle.Bold);
    private static readonly Font FBuyukKucuk = new Font("Segoe UI", 11f);
    private static readonly Font FOrta = new Font("Segoe UI", 12.5f, FontStyle.Bold);
    private static readonly Font FAlt = new Font("Segoe UI", 10f);
    private static readonly Font FAltKoyu = new Font("Segoe UI", 10f, FontStyle.Bold);
    private static readonly Font FGun = new Font("Segoe UI", 11f);
    private static readonly Font FDugme = new Font("Segoe UI", 10.5f);

    private static readonly Graphics olcuG = OlcuGrafikYap();
    private static Graphics OlcuGrafikYap()
    {
        Bitmap b = new Bitmap(1, 1);
        b.SetResolution(96f, 96f);
        Graphics g = Graphics.FromImage(b);
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        return g;
    }

    private static float Ms(Graphics g, Font f) { return g.MeasureString("Ay", f, int.MaxValue, TY).Height; }
    private static float SatirYuk(Font f) { return Ms(olcuG, f); }

    public static string[] DugmeMetinleri(Durum d)
    {
        return new string[]
        {
            "Şimdi ölç",
            d != null && d.bypass ? "Engeli geri koy" : "Engeli aç",
            "Sayacı sıfırla"
        };
    }

    public static PanelVeri VeriYap(Durum d, string yerelHata)
    {
        PanelVeri v = new PanelVeri();
        v.D = d;
        v.Dugmeler = DugmeMetinleri(d);
        if (d == null)
        {
            if (!string.IsNullOrEmpty(yerelHata))
                foreach (string sl in Sar(yerelHata, FAltKoyu, GENISLIK - 2 * KENAR, 2))
                    v.DurumSatirlari.Add(new Satir(sl, true, false));
            return v;
        }

        v.B1Oran = d.Oran;
        v.B1Buyuk = "%" + Arac.Sayi(d.harcanan);
        v.B1Kucuk = " / %" + Arac.Sayi(d.tavan);
        double b5 = d.son5s ?? 0.0, b7 = d.son7g ?? 0.0;
        v.B2Oran = b5 / 100.0;
        v.B3Oran = b7 / 100.0;
        v.B2Deger = "%" + Arac.Sayi(Math.Round(b5 * 10.0) / 10.0);
        v.B3Deger = "%" + Arac.Sayi(Math.Round(b7 * 10.0) / 10.0);

        v.B1Alt = d.harcanan >= d.tavan
            ? "tavan aşıldı"
            : "kalan %" + Arac.Sayi(d.kalan) + " · gece yarısı sıfırlanır";
        string k5 = Arac.KalanSure(d.reset5);
        if (k5 != null) v.B2Alt = k5 + " sıfırlanır";
        string k7 = Arac.KalanSure(d.reset7);
        if (k7 != null) v.B3Alt = k7 + " sıfırlanır";

        if (!d.aktif && !string.IsNullOrEmpty(d.baslangic))
        {
            DateTime bt;
            if (DateTime.TryParseExact(d.baslangic, "yyyy-MM-dd", Arac.ISO, DateTimeStyles.None, out bt))
                v.DurumSatirlari.Add(new Satir("Engel " + bt.ToString("dd.MM", Arac.TR) + " itibarıyla devrede", false, false));
        }
        if (d.engel) v.DurumSatirlari.Add(new Satir("ENGEL AÇIK · devam için \"kota devam\" yaz", true, true));
        if (d.bypass) v.DurumSatirlari.Add(new Satir("Bugün için engel kaldırıldı", false, false));
        if (d.kaynak == "bayat")
        {
            string g = Arac.GecenSure(d.olcumZamani);
            v.DurumSatirlari.Add(new Satir("Son ölçüm " + (g ?? "bilinmiyor"), false, false));
        }
        string h = string.IsNullOrEmpty(d.hata) ? yerelHata : d.hata;
        if (!string.IsNullOrEmpty(h))
            foreach (string sl in Sar(h, FAlt, GENISLIK - 2 * KENAR, 2))
                v.DurumSatirlari.Add(new Satir(sl, true, false));

        foreach (KeyValuePair<string, double> gg in d.gecmis)
        {
            if (v.SonGunler.Count >= 7) break;
            DateTime gt;
            if (!DateTime.TryParseExact(gg.Key, "yyyy-MM-dd", Arac.ISO, DateTimeStyles.None, out gt)) continue;
            GecmisGunu o = new GecmisGunu();
            o.Etiket = gt.ToString("dd.MM", Arac.TR);
            o.Deger = "%" + Arac.Sayi(gg.Value);
            v.SonGunler.Add(o);
        }
        return v;
    }

    // Panelin mantiksal (96 dpi) yuksekligi; Ciz() ile ayni aritmetik.
    public static float Yukseklik(PanelVeri v)
    {
        float capH = SatirYuk(FBaslik), altH = SatirYuk(FAlt), gunH = SatirYuk(FGun);
        if (v.D == null)
        {
            float h = UST + SatirYuk(FOrta) + ALT;
            if (v.DurumSatirlari.Count > 0) h += 6f + v.DurumSatirlari.Count * SatirYuk(FAltKoyu);
            return h;
        }
        float buyukH = SatirYuk(FBuyuk), ortaH = SatirYuk(FOrta);
        float h2 = UST + (capH + 3 + buyukH + 5 + 5 + 6 + altH)        // blok 1
                 + ARA + (capH + 3 + ortaH + 4 + 5 + 6 + altH)        // blok 2
                 + ARA + (capH + 3 + ortaH + 4 + 5 + 6 + altH);       // blok 3
        if (v.DurumSatirlari.Count > 0) h2 += 10f + v.DurumSatirlari.Count * altH + 4f;
        if (v.SonGunler.Count > 0) h2 += 8f + capH + 5f + v.SonGunler.Count * gunH + 6f;
        h2 += 10f + DugmeYuksekligi(olcuG, v.Dugmeler, 1f) + ALT;
        return h2;
    }

    // Ana cizim. dugmeler listesine dugme dikdortgenleri birakir (isabet testi icin).
    public static void Ciz(Graphics g, PanelVeri v, bool acikTema, float olcek, int vurgu, List<RectangleF> dugmeler)
    {
        float w = GENISLIK * olcek;
        float h = Yukseklik(v) * olcek;
        float capH = Ms(g, FBaslik), buyukH = Ms(g, FBuyuk), ortaH = Ms(g, FOrta), altH = Ms(g, FAlt), gunH = Ms(g, FGun);
        float sol = KENAR * olcek, sag = w - KENAR * olcek;

        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

        using (GraphicsPath kart = Yuvarlak(new RectangleF(0f, 0f, w, h), 12f * olcek))
        {
            using (SolidBrush bg = new SolidBrush(Palet.Bg(acikTema))) g.FillPath(bg, kart);
            using (Pen cp = new Pen(Palet.Kenar(acikTema))) g.DrawPath(cp, kart);
        }

        if (v.D == null)
        {
            float y0 = UST * olcek;
            using (SolidBrush b = new SolidBrush(Palet.Ikincil(acikTema)))
                g.DrawString("Sayaç okunamadı", FOrta, b, sol, y0, TY);
            y0 += ortaH + 6f * olcek;
            foreach (Satir s in v.DurumSatirlari)
            {
                using (SolidBrush b = new SolidBrush(s.Kirmizi ? Palet.Kirmizi : Palet.Ikincil(acikTema)))
                    g.DrawString(s.Metin, FAltKoyu, b, sol, y0, TY);
                y0 += Ms(g, FAltKoyu);
            }
            return;
        }

        float y = UST * olcek;

        // --- Blok 1: BUGUN (ana metrik)
        BaslikCiz(g, "BUGÜN", y, olcek, Palet.Ikincil(acikTema));
        y += capH + 3f * olcek;
        SizeF mb = g.MeasureString(v.B1Buyuk, FBuyuk, int.MaxValue, TY);
        SizeF mk = g.MeasureString(v.B1Kucuk, FBuyukKucuk, int.MaxValue, TY);
        using (SolidBrush bb = new SolidBrush(Palet.DurumRengi(v.B1Oran, acikTema)))
            g.DrawString(v.B1Buyuk, FBuyuk, bb, sag - mb.Width - mk.Width, y, TY);
        using (SolidBrush bk = new SolidBrush(Palet.Ikincil(acikTema)))
            g.DrawString(v.B1Kucuk, FBuyukKucuk, bk, sag - mk.Width, y + mb.Height - mk.Height - 2f * olcek, TY);
        y += buyukH + 5f * olcek;
        BarCiz(g, y, v.B1Oran, Palet.DurumRengi(v.B1Oran, acikTema), Palet.Dorduncul(acikTema), olcek);
        y += 5f * olcek + 6f * olcek;
        AltSatirCiz(g, v.B1Alt, y, olcek, acikTema);
        y += altH + ARA * olcek;

        // --- Blok 2: 5 SAATLIK
        BaslikCiz(g, "5 SAATLİK", y, olcek, Palet.Ucuncul(acikTema));
        y += capH + 3f * olcek;
        Color b2r = Palet.PencereRengi(v.B2Oran * 100.0);
        if (b2r == Color.Empty) b2r = Palet.Ucuncul(acikTema);
        DegerCiz(g, v.B2Deger, FOrta, y, sag, Palet.Etiket(acikTema));
        y += ortaH + 4f * olcek;
        BarCiz(g, y, v.B2Oran, b2r, Palet.Dorduncul(acikTema), olcek);
        y += 5f * olcek + 6f * olcek;
        AltSatirCiz(g, v.B2Alt, y, olcek, acikTema);
        y += altH + ARA * olcek;

        // --- Blok 3: HAFTALIK
        BaslikCiz(g, "HAFTALIK", y, olcek, Palet.Ucuncul(acikTema));
        y += capH + 3f * olcek;
        Color b3r = Palet.PencereRengi(v.B3Oran * 100.0);
        if (b3r == Color.Empty) b3r = Palet.Ucuncul(acikTema);
        DegerCiz(g, v.B3Deger, FOrta, y, sag, Palet.Etiket(acikTema));
        y += ortaH + 4f * olcek;
        BarCiz(g, y, v.B3Oran, b3r, Palet.Dorduncul(acikTema), olcek);
        y += 5f * olcek + 6f * olcek;
        AltSatirCiz(g, v.B3Alt, y, olcek, acikTema);
        y += altH;

        // --- durum satirlari
        if (v.DurumSatirlari.Count > 0)
        {
            y += 10f * olcek;
            foreach (Satir s in v.DurumSatirlari)
            {
                Font fs = s.Koyu ? FAltKoyu : FAlt;
                using (SolidBrush b = new SolidBrush(s.Kirmizi ? Palet.Kirmizi : Palet.Ikincil(acikTema)))
                    g.DrawString(s.Metin, fs, b, sol, y, TY);
                y += Ms(g, fs);
            }
            y += 4f * olcek;
        }

        // --- son gunler
        if (v.SonGunler.Count > 0)
        {
            y += 8f * olcek;
            BaslikCiz(g, "SON GÜNLER", y, olcek, Palet.Ucuncul(acikTema));
            y += capH + 5f * olcek;
            foreach (GecmisGunu gg in v.SonGunler)
            {
                using (SolidBrush bd = new SolidBrush(Palet.Ucuncul(acikTema)))
                    g.DrawString(gg.Etiket, FGun, bd, sol, y, TY);
                SizeF mv = g.MeasureString(gg.Deger, FGun, int.MaxValue, TY);
                using (SolidBrush bv = new SolidBrush(Palet.Etiket(acikTema)))
                    g.DrawString(gg.Deger, FGun, bv, sag - mv.Width, y, TY);
                y += gunH;
            }
            y += 6f * olcek;
        }

        // --- ayirici + dugmeler
        y += 10f * olcek;
        using (Pen ay = new Pen(Palet.Dorduncul(acikTema)))
            g.DrawLine(ay, sol, y, sag, y);
        y += 10f * olcek;
        dugmeler.Clear();
        List<RectangleF> kutular = DugmeYerlesim(g, v.Dugmeler, olcek);
        for (int i = 0; i < kutular.Count; i++)
        {
            RectangleF r = kutular[i];
            r.Y = y + r.Y;                                      // Yerlesim satir bazli Y birakir
            if (vurgu == i)
            {
                using (GraphicsPath ph = Yuvarlak(r, 6f * olcek))
                using (SolidBrush pb = new SolidBrush(Color.FromArgb(30, Palet.Vurgu(acikTema))))
                    g.FillPath(pb, ph);
            }
            SizeF mm = g.MeasureString(v.Dugmeler[i], FDugme, int.MaxValue, TY);
            using (SolidBrush tb = new SolidBrush(Palet.Vurgu(acikTema)))
                g.DrawString(v.Dugmeler[i], FDugme, tb, r.X + 9f * olcek, r.Y + (r.Height - mm.Height) / 2f, TY);
            dugmeler.Add(r);
        }
    }

    private static void BaslikCiz(Graphics g, string s, float y, float olcek, Color c)
    {
        // Mac tarafindaki kern 0.9'u taklit eden harf harf cizim.
        float iz = 0.9f * olcek;
        float x = KENAR * olcek;
        using (SolidBrush b = new SolidBrush(c))
        {
            // Tipografik olcum boslugu sifir genislikte verir ("5SAATLİK"
            // hatasi); bosluk genisligi "a a" ile "aa" farkindan alinir.
            float bosluk = g.MeasureString("a a", FBaslik, int.MaxValue, TY).Width
                - g.MeasureString("aa", FBaslik, int.MaxValue, TY).Width;
            foreach (char ch in s)
            {
                string h = ch.ToString();
                if (ch == ' ') { x += bosluk + iz; continue; }
                g.DrawString(h, FBaslik, b, x, y, TY);
                x += g.MeasureString(h, FBaslik, int.MaxValue, TY).Width + iz;
            }
        }
    }

    private static void AltSatirCiz(Graphics g, string m, float y, float olcek, bool acik)
    {
        if (string.IsNullOrEmpty(m)) return;
        using (SolidBrush b = new SolidBrush(Palet.Ucuncul(acik)))
            g.DrawString(m, FAlt, b, KENAR * olcek, y, TY);
    }

    private static void DegerCiz(Graphics g, string m, Font f, float y, float sag, Color c)
    {
        SizeF mm = g.MeasureString(m, f, int.MaxValue, TY);
        using (SolidBrush b = new SolidBrush(c)) g.DrawString(m, f, b, sag - mm.Width, y, TY);
    }

    private static void BarCiz(Graphics g, float y, double oran, Color renk, Color zemin, float olcek)
    {
        float sol = KENAR * olcek, sag = GENISLIK * olcek - KENAR * olcek, h = 5f * olcek;
        using (GraphicsPath pz = Yuvarlak(new RectangleF(sol, y, sag - sol, h), h / 2f))
        using (SolidBrush bz = new SolidBrush(zemin)) g.FillPath(bz, pz);
        float dolu = (float)Math.Max(0.0, Math.Min(1.0, oran)) * (sag - sol);
        if (dolu > 0.5f)
        {
            using (GraphicsPath pd = Yuvarlak(new RectangleF(sol, y, Math.Max(h, dolu), h), h / 2f))
            using (SolidBrush bd = new SolidBrush(renk)) g.FillPath(bd, pd);
        }
    }

    public static GraphicsPath Yuvarlak(RectangleF r, float yaricap)
    {
        GraphicsPath p = new GraphicsPath();
        if (yaricap < 0.5f || r.Width < 2f * yaricap || r.Height < 2f * yaricap)
        {
            p.AddRectangle(r);
            return p;
        }
        float d = 2f * yaricap;
        p.AddArc(r.X, r.Y, d, d, 180f, 90f);
        p.AddArc(r.Right - d, r.Y, d, d, 270f, 90f);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0f, 90f);
        p.AddArc(r.X, r.Bottom - d, d, d, 90f, 90f);
        p.CloseFigure();
        return p;
    }

    public static Region YuvarlakAlan(RectangleF r, float yaricap)
    {
        GraphicsPath p = Yuvarlak(r, yaricap);
        Region bolge = new Region(p);                             // Region yolu kopyalar
        p.Dispose();
        return bolge;
    }

    // Dugme satirlari: sigarsa tek satir, sigmazsa 2+1. Y degerleri satir bazlidir.
    private static bool DugmeTekSatir(Graphics g, string[] dugmeler, float olcek)
    {
        float padX = 9f * olcek, gap = 12f * olcek;
        float kullanilabilir = (GENISLIK - 2f * KENAR) * olcek;
        float toplam = 0f;
        for (int i = 0; i < dugmeler.Length; i++)
            toplam += g.MeasureString(dugmeler[i], FDugme, int.MaxValue, TY).Width + 2f * padX;
        return toplam + (dugmeler.Length - 1) * gap <= kullanilabilir;
    }

    private static float DugmeYuksekligi(Graphics g, string[] dugmeler, float olcek)
    {
        if (DugmeTekSatir(g, dugmeler, olcek)) return DUGME_H * olcek;
        return 2f * DUGME_H * olcek + 6f * olcek;
    }

    private static List<RectangleF> DugmeYerlesim(Graphics g, string[] dugmeler, float olcek)
    {
        float padX = 9f * olcek, gap = 12f * olcek, bh = DUGME_H * olcek;
        float x = KENAR * olcek;
        float yA = 0f;
        bool tek = DugmeTekSatir(g, dugmeler, olcek);
        List<RectangleF> kutular = new List<RectangleF>();
        for (int i = 0; i < dugmeler.Length; i++)
        {
            float gw = g.MeasureString(dugmeler[i], FDugme, int.MaxValue, TY).Width + 2f * padX;
            kutular.Add(new RectangleF(x, yA, gw, bh));
            x += gw + gap;
            if (!tek && i == 1) { x = KENAR * olcek; yA += bh + 6f * olcek; }
        }
        return kutular;
    }

    // Basit kelime sarma (hata metni icin, en fazla maksSatir satir).
    public static List<string> Sar(string metin, Font f, float maksGenislik, int maksSatir)
    {
        List<string> satirlar = new List<string>();
        string[] kelimeler = metin.Split(' ');
        string suanki = "";
        bool tasti = false;
        foreach (string kel in kelimeler)
        {
            if (kel.Length == 0) continue;
            string deneme = suanki.Length == 0 ? kel : suanki + " " + kel;
            if (suanki.Length == 0 ||
                olcuG.MeasureString(deneme, f, int.MaxValue, TY).Width <= maksGenislik)
                suanki = deneme;
            else
            {
                if (satirlar.Count == maksSatir - 1) { tasti = true; break; }
                satirlar.Add(suanki);
                suanki = kel;
            }
        }
        if (suanki.Length > 0 && satirlar.Count < maksSatir) satirlar.Add(suanki);
        if (tasti && satirlar.Count > 0)
            satirlar[satirlar.Count - 1] = satirlar[satirlar.Count - 1] + " …";
        return satirlar;
    }
}
// ---------------------------------------------------------------------------
// PanelForm: tepsi simgesine sol tiklayinca acilan kenarliksiz, her zaman
// ustte panel. Odak kaybolunca kapanir; cizim PanelCizici.Ciz ile ortak.
// ---------------------------------------------------------------------------
class PanelForm : Form
{
    private PanelCizici.PanelVeri veri;
    private readonly float olcek;
    private readonly Gosterge sahibi;
    private readonly List<RectangleF> dugmeler = new List<RectangleF>();
    private readonly Rectangle ekranAlani;
    private int vurgu = -1;

    public PanelForm(Gosterge s, PanelCizici.PanelVeri v, float dpiOlcek)
    {
        sahibi = s;
        veri = v;
        olcek = dpiOlcek;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                 ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        ekranAlani = Screen.FromPoint(Cursor.Position).WorkingArea;   // gorev cubugu hangi kenardaysa saygi duyar
        Boyutla();
    }

    private void Boyutla()
    {
        float h = PanelCizici.Yukseklik(veri);
        ClientSize = new Size((int)Math.Round(PanelCizici.GENISLIK * olcek), (int)Math.Round(h * olcek));
        Region = PanelCizici.YuvarlakAlan(new RectangleF(0f, 0f, (float)Width, (float)Height), 12f * olcek);
        Location = new Point(ekranAlani.Right - Width - 10, ekranAlani.Bottom - Height - 10);
    }

    public void Guncelle(PanelCizici.PanelVeri yeniVeri)
    {
        veri = yeniVeri;
        Boyutla();
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        PanelCizici.Ciz(e.Graphics, veri, Arac.AcikUygulama(), olcek, vurgu, dugmeler);
    }

    protected override void OnDeactivate(EventArgs e)
    {
        base.OnDeactivate(e);
        Close();                                                    // odak kaybolunca kapan
    }

    private int VurguBul(Point p)
    {
        for (int i = 0; i < dugmeler.Count; i++)
            if (dugmeler[i].Contains((float)p.X, (float)p.Y)) return i;
        return -1;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        int yeni = VurguBul(e.Location);
        if (yeni != vurgu) { vurgu = yeni; Invalidate(); }
        Cursor = yeni >= 0 ? Cursors.Hand : Cursors.Default;
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        if (vurgu != -1) { vurgu = -1; Invalidate(); }
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (e.Button != MouseButtons.Left) return;
        int i = VurguBul(e.Location);
        if (i >= 0) { Close(); sahibi.DugmeEylem(i); }
    }
}

// ---------------------------------------------------------------------------
// Gosterge: tek ornekli tepsi uygulamasi. 60 saniyede bir (ve ilk acilista
// hemen) arka planda node kota.mjs olc --json calistirir, durumu cizer.
// ---------------------------------------------------------------------------
class Gosterge : ApplicationContext
{
    private readonly Form sahip = new Form();      // gorunmez: marshal kaynagi + panel sahibi
    private float dpiOlcek = 1f;
    private NotifyIcon tepsi;
    private System.Windows.Forms.Timer zamanlayici;
    private IntPtr eskiHicon = IntPtr.Zero;
    private PanelForm panel;
    private Durum durum;
    private string yerelHata;
    private bool engelEski;
    private readonly object pollKilidi = new object();
    private bool pollSuruyor;
    private ContextMenuStrip menu;
    private ToolStripMenuItem engelOge, sonGunlerOge, baslatOge;

    public Gosterge()
    {
        sahip.ShowInTaskbar = false;
        sahip.WindowState = FormWindowState.Minimized;
        sahip.Visible = false;
        IntPtr tutamac = sahip.Handle;             // arka plandan UI'ya gecis icin tutamac sart
        using (Graphics g = sahip.CreateGraphics())
        {
            dpiOlcek = g.DpiX / 96f;               // mantiksal birimler 96 dpi; carpanla gercege cevrilir
            if (dpiOlcek < 0.5f) dpiOlcek = 1f;
        }

        tepsi = new NotifyIcon();
        tepsi.Text = "Günlük kota";
        tepsi.MouseUp += new MouseEventHandler(TepsiFare);
        menu = MenuYap();
        tepsi.ContextMenuStrip = menu;
        SimgeYenile();                             // once simge, sonra gorunur
        tepsi.Visible = true;

        zamanlayici = new System.Windows.Forms.Timer();
        zamanlayici.Interval = 60000;
        zamanlayici.Tick += new EventHandler(delegate(object s, EventArgs e) { Poll(); });
        zamanlayici.Start();

        Arac.Log("gösterge başladı · KOK=" + Arac.KOK);
        Poll();
    }

    // ------------------------------------------------------------------ menü
    private ContextMenuStrip MenuYap()
    {
        ContextMenuStrip m = new ContextMenuStrip();
        m.Font = new Font("Segoe UI", 9.75f);
        ToolStripMenuItem oSimdi = new ToolStripMenuItem("Şimdi ölç", null,
            new EventHandler(delegate(object s, EventArgs e) { Poll(); }));
        engelOge = new ToolStripMenuItem("Bugünlük engeli aç", null,
            new EventHandler(delegate(object s, EventArgs e) { EngelAnahtari(); }));
        ToolStripMenuItem oSifirla = new ToolStripMenuItem("Bugünkü sayacı sıfırla", null,
            new EventHandler(delegate(object s, EventArgs e) { Eylem("sifirla", "sayacı sıfırla"); }));
        sonGunlerOge = new ToolStripMenuItem("Son günler");
        baslatOge = new ToolStripMenuItem("Windows açılışında başlat", null,
            new EventHandler(delegate(object s, EventArgs e) { BaslatAnahtari(); }));
        ToolStripMenuItem oCik = new ToolStripMenuItem("Çık", null,
            new EventHandler(delegate(object s, EventArgs e) { Cik(); }));
        m.Items.Add(oSimdi);
        m.Items.Add(engelOge);
        m.Items.Add(oSifirla);
        m.Items.Add(sonGunlerOge);
        m.Items.Add(new ToolStripSeparator());
        m.Items.Add(baslatOge);
        m.Items.Add(new ToolStripSeparator());
        m.Items.Add(oCik);
        m.Opening += new System.ComponentModel.CancelEventHandler(
            delegate(object s, System.ComponentModel.CancelEventArgs e) { MenuTazele(); });
        return m;
    }

    private void MenuTazele()
    {
        engelOge.Text = durum != null && durum.bypass ? "Engeli geri koy" : "Bugünlük engeli aç";
        sonGunlerOge.DropDownItems.Clear();
        bool var = false;
        if (durum != null)
        {
            foreach (KeyValuePair<string, double> gg in durum.gecmis)
            {
                if (sonGunlerOge.DropDownItems.Count >= 7) break;
                DateTime gt;
                if (!DateTime.TryParseExact(gg.Key, "yyyy-MM-dd", Arac.ISO, DateTimeStyles.None, out gt)) continue;
                ToolStripMenuItem o = new ToolStripMenuItem(gt.ToString("dd.MM", Arac.TR) + "  %" + Arac.Sayi(gg.Value));
                o.Enabled = false;
                sonGunlerOge.DropDownItems.Add(o);
                var = true;
            }
        }
        sonGunlerOge.Visible = var;
        baslatOge.Checked = RunDegeri() != null;
    }

    private static string RunDegeri()
    {
        try
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
            {
                if (k == null) return null;
                object v = k.GetValue("ClaudeGunlukKota");
                return v == null ? null : v.ToString();
            }
        }
        catch { return null; }
    }

    private static void RunYaz(string deger)
    {
        try
        {
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
            {
                if (deger == null) k.DeleteValue("ClaudeGunlukKota", false);
                else k.SetValue("ClaudeGunlukKota", deger, RegistryValueKind.String);
            }
        }
        catch (Exception ex) { Arac.Log("Run anahtarı yazılamadı: " + ex.Message); }
    }

    private void BaslatAnahtari()
    {
        if (RunDegeri() != null) RunYaz(null);
        else RunYaz("\"" + Application.ExecutablePath + "\"");
    }

    // --------------------------------------------------------------- eylemler
    public void DugmeEylem(int i)
    {
        if (i == 0) Poll();
        else if (i == 1) EngelAnahtari();
        else if (i == 2) Eylem("sifirla", "sayacı sıfırla");
    }

    private void EngelAnahtari()
    {
        bool acik = durum != null && durum.bypass;
        Eylem(acik ? "kapat" : "ac", acik ? "engeli geri koyma" : "bugünlük engeli açma");
    }

    private void Eylem(string arg, string ad)
    {
        Arac.Log("eylem: " + ad);
        Thread t = new Thread(new ThreadStart(delegate
        {
            Arac.NodeCalistir(arg, 15000);
            try { sahip.BeginInvoke((MethodInvoker)delegate { Poll(); }); }
            catch { }
        }));
        t.IsBackground = true;
        t.Start();
    }

    // ------------------------------------------------------------------ poll
    private void Poll()
    {
        lock (pollKilidi)
        {
            if (pollSuruyor) return;              // ayni anda iki olcum olmaz
            pollSuruyor = true;
        }
        Thread t = new Thread(new ThreadStart(PollGovde));
        t.IsBackground = true;
        t.Start();
    }

    private void PollGovde()
    {
        string cikti = Arac.NodeCalistir("olc --json", 30000);
        Durum d = null;
        string hata = null;
        if (cikti == null) hata = "Ölçüm alınamadı (node çalıştırılamadı)";
        else
        {
            string satir = Arac.SonSatir(cikti);
            Dictionary<string, object> j = null;
            if (satir != null)
            {
                try { j = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(satir); }
                catch { }
            }
            if (j != null) d = DurumYapici.Parse(j);
            else hata = "Ölçüm okunamadı (JSON çözümlenemedi)";
        }
        Durum dSon = d;
        string hSon = hata;
        try { sahip.BeginInvoke((MethodInvoker)delegate { Uygula(dSon, hSon); }); }
        catch { }                                                   // cikis anina denk gelirse
        lock (pollKilidi) { pollSuruyor = false; }
    }

    private void Uygula(Durum d, string hata)
    {
        if (d != null) durum = d;                  // cozumleme hatasi onceki durumu korur
        yerelHata = hata;
        SimgeYenile();
        IpucuYenile();
        EsikKontrol(durum);
        EngelBildirimi(durum);
        if (panel != null && !panel.IsDisposed)
            panel.Guncelle(PanelCizici.VeriYap(durum, yerelHata));
    }

    // ------------------------------------------------------------------ simge
    private void SimgeYenile()
    {
        try
        {
            Size ts = SystemInformation.SmallIconSize;
            int kenar = Math.Max(Math.Max(ts.Width, ts.Height), 8);
            IntPtr yeniH = IntPtr.Zero;
            using (Bitmap b = new Bitmap(kenar, kenar))
            {
                using (Graphics g = Graphics.FromImage(b))
                {
                    double oran = durum != null ? durum.Oran : 0.0;
                    bool engel = durum != null && durum.engel;
                    Color dolu, soluk;
                    LogoYolu.SimgeRenkleri(oran, engel, Arac.AcikGorevCubugu(), out dolu, out soluk);
                    LogoYolu.BurstCiz(g, new RectangleF(0f, 0f, (float)kenar, (float)kenar), oran, dolu, soluk);
                }
                yeniH = b.GetHicon();
            }
            tepsi.Icon = Icon.FromHandle(yeniH);   // once yeni simge ata...
            if (eskiHicon != IntPtr.Zero) { try { Win32.DestroyIcon(eskiHicon); } catch { } }
            eskiHicon = yeniH;                     // ...sonra eskisini yok et (GDI sizmasi olmaz)
        }
        catch (Exception ex) { Arac.Log("simge yenilenemedi: " + ex.Message); }
    }

    private void IpucuYenile()
    {
        string m;
        if (durum == null) m = "Kota sayacı okunamadı";
        else
        {
            m = "Claude bugün %" + Arac.Sayi(durum.harcanan) + " / %" + Arac.Sayi(durum.tavan);
            if (durum.son7g != null) m += " · hafta %" + Arac.Sayi(durum.son7g.Value);
        }
        if (m.Length > 63) m = m.Substring(0, 60) + "…";           // NotifyIcon 63 karakter siniri
        try { tepsi.Text = m; } catch { }
    }

    // -------------------------------------------------------------- bildirim
    // Esik gecis mantigi main.swift esihKontrol ile ayni: gunun ilk okumasi
    // mevcut degerle tohullanir ki acilista uc bildirim yagmasin.
    private void EsikKontrol(Durum d)
    {
        if (d == null) return;
        try
        {
            string bugun = DateTime.Now.ToString("yyyy-MM-dd", Arac.ISO);
            string defterYolu = Path.Combine(Arac.KOK, "bildirim.json");
            Dictionary<string, object> kayit = Arac.JsonOku(defterYolu);
            double onceki = -1;
            if (kayit != null)
            {
                string kg = Arac.Metin(kayit, "gun");
                object ov;
                if (kg == bugun && kayit.TryGetValue("onceki", out ov) && ov != null)
                {
                    try { onceki = Convert.ToDouble(ov, Arac.ISO); } catch { }
                }
            }
            double taban = onceki < 0 ? d.harcanan : onceki;
            foreach (double e in Arac.Esikler())
            {
                if (taban < e && d.harcanan >= e)
                {
                    double kalan = Math.Max(0.0, d.tavan - d.harcanan);
                    string not = e >= 13 ? " Tavana çok az kaldı." : "";
                    tepsi.ShowBalloonTip(6000, "Kota: %" + Arac.Sayi(e) + " doldu",
                        "Bugün %" + Arac.Sayi(d.harcanan) + " / %" + Arac.Sayi(d.tavan) +
                        " · %" + Arac.Sayi(kalan) + " kaldı." + not, ToolTipIcon.Warning);
                    Arac.Log("eşik bildirimi -> %" + Arac.Sayi(e) + " · bugün %" + Arac.Sayi(d.harcanan));
                }
            }
            Dictionary<string, object> yeni = new Dictionary<string, object>();
            yeni["gun"] = bugun;
            yeni["onceki"] = d.harcanan;
            Arac.JsonYaz(defterYolu, yeni);
        }
        catch (Exception ex) { Arac.Log("eşik kontrolü hatası: " + ex.Message); }
    }

    private void EngelBildirimi(Durum d)
    {
        bool engel = d != null && d.engel;
        if (engel && !engelEski)
        {
            tepsi.ShowBalloonTip(6000, "Günlük kota doldu",
                "Bugün %" + Arac.Sayi(d.harcanan) + " / %" + Arac.Sayi(d.tavan) +
                " harcandı · engel açık. Bugün devam etmek için \"kota devam\" yaz.",
                ToolTipIcon.Error);
            Arac.Log("engel bildirimi gönderildi");
        }
        engelEski = engel;
    }

    // ------------------------------------------------------------------ tepsi
    private void TepsiFare(object s, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        if (panel != null && !panel.IsDisposed) { panel.Close(); return; }
        PanelAc();
    }

    private void PanelAc()
    {
        PanelCizici.PanelVeri v = PanelCizici.VeriYap(durum, yerelHata);
        panel = new PanelForm(this, v, dpiOlcek);
        panel.Show(sahip);
        panel.Activate();
    }

    private void Cik()
    {
        try
        {
            if (zamanlayici != null) zamanlayici.Stop();
            if (panel != null && !panel.IsDisposed) panel.Close();
            if (tepsi != null) { tepsi.Visible = false; tepsi.Dispose(); }
        }
        catch { }
        if (eskiHicon != IntPtr.Zero) { try { Win32.DestroyIcon(eskiHicon); } catch { } eskiHicon = IntPtr.Zero; }
        try { sahip.Close(); } catch { }
        Arac.Log("çıkış");
        ExitThread();
    }
}

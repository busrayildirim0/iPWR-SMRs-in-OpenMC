# OpenMC SMR Nötronik Simülasyon Platformu: Proje Detayları ve Mimari Rapor

Bu doküman, Small Modular Reactor (SMR - Küçük Modüler Reaktör) yakıt demetlerinin parametrik olarak modellenmesi, OpenMC Monte Carlo koduyla simüle edilmesi ve analiz çıktılarının görselleştirilmesini sağlayan web tabanlı mühendislik platformunun teknik detaylarını açıklamaktadır.

---

## 1. Kullanılan Teknolojiler (Technology Stack)

Platform, yüksek performanslı bilimsel hesaplamaları modern ve akıcı bir kullanıcı arayüzüyle buluşturmak için hibrit bir mimariyle geliştirilmiştir:

### Backend (Arka Ofis / Hesaplama Katmanı)
- **Python 3:** Bilimsel kütüphaneler ve OpenMC API entegrasyonu için temel dil.
- **FastAPI:** Yüksek performanslı, asenkron (async/await destekli), otomatik OpenAPI/Swagger dökümantasyonlu modern Python web framework'ü. Simülasyon loglarının canlı akışı ve API endpoints için kullanılmıştır.
- **OpenMC:** MIT tarafından geliştirilen, açık kaynaklı, Monte Carlo tabanlı nötron transport kodu. WSL (Windows Subsystem for Linux) üzerinde Conda ortamında kurulu olup hesaplama motoru olarak görev yapar.
- **NumPy & Pandas:** HDF5 (statepoint) çıktılarının matris manipülasyonları, 2D pin güçlerinin yeniden şekillendirilmesi ve veri seti tarama/parametre süpürme (parameter sweep) kayıtlarının CSV olarak loglanması için kullanılmıştır.
- **Uvicorn:** FastAPI uygulamasını çalıştıran hızlı ASGI web sunucusu.

### Frontend (Kullanıcı Arayüzü Katmanı)
- **React (v19):** Bileşen tabanlı, dinamik ve hızlı arayüz geliştirme kütüphanesi.
- **Vite:** React projesini anında derleyen ve optimize edilmiş statik çıktılar (dist) üreten yeni nesil frontend derleme aracı.
- **Plotly.js:** Nötronsal enerji spektrumları, k-etkin yakınsamaları ve Shannon entropi grafikleri gibi bilimsel verileri etkileşimli (zoom, hover, export özellikli) grafiklere dönüştüren güçlü kütüphane. CDN üzerinden yüklenir.
- **Pure (Vanilla) CSS:** Platformun premium, koyu temalı (dark-mode), camgöbeği (glassmorphic) mühendislik yazılımı görünümü kazanması için özel olarak yazılmış CSS tasarımı (Tailwind CSS gibi harici kütüphane bağımlılıkları olmadan doğrudan `index.css` ile).
- **Lucide React:** Arayüzdeki modern mühendislik ikonları için kullanılır.

---

## 2. Proje Dizin Yapısı (Project Directory Structure)

Projenin dizin yapısı backend ve frontend kodlarının modüler kalmasını sağlayacak şekilde düzenlenmiştir:

```text
📁 SMR_Analysis_Platform/
│
├── 📁 platform/                   (Analiz ve Görselleştirme Platformu)
│   ├── 📁 backend/                (FastAPI API Sunucusu)
│   │   ├── main.py                (Uygulama ve API Endpoint'leri)
│   │   ├── model_generator.py     (Girdi Üretimi: OpenMC XML & Geant4 Makroları)
│   │   └── results_parser.py      (Çıktı İşleme ve Veri Normalizasyonu)
│   │
│   └── 📁 frontend/               (React & Plotly.js Arayüzü)
│       └── 📁 src/
│           ├── 📁 components/     (Dashboard, AssemblyVisualizer, PlotlyChart)
│           ├── App.jsx            (Ana Uygulama Bileşeni)
│           └── main.jsx           (Entry Point)
│
├── 📁 geant4/                     (Geant4 Fizik ve Navigasyon Çekirdeği)
│   ├── 📁 include/                (Header Dosyaları)
│   └── 📁 src/                    (C++ Fizik ve Skorlama Katmanı)
│       ├── DetectorConstruction.cc(Geometri Tanımları)
│       ├── SteppingAction.cc      (Skorlama ve Yansıtıcı Sınır Koşulları)
│       ├── RunAction.cc           (İstatistiksel Veri Toplama)
│       ├── FissionBank.cc         (Eigenvalue İterasyon ve Entropi)
│       ├── Materials.cc           (Nükleer Malzeme Kütüphanesi)
│       └── ReactorConfig.cc       (SMR Konfigürasyon Yönetimi)
│
├── 📁 benchmark_notebooks/        (Validasyon ve Referans Çalışmaları)
│   ├── NuScale.ipynb
│   ├── CAREM-25.ipynb
│   ├── SMR-160.ipynb
│   ├── mPower.ipynb
│   └── BEAVRS.ipynb
│
└── 📁 scripts/                    (Otomasyon ve Veri İşleme Betikleri)
```

---

## 3. Simülasyon Tam Olarak Nasıl Oluşuyor? (OpenMC Entegrasyonu)

Kullanıcı arayüzünde "Generate & Run Simulation" butonuna tıkladığında arka planda şu adımlar sırasıyla yürütülür:

## Simülasyon Çalışma Akış Şeması (OpenMC & Geant4 Entegrasyonu)

Kullanıcı arayüzünde **"Generate & Run Simulation"** butonuna tıklandığında arka planda yürütülen süreçlerin ve veri akışının şematik gösterimi aşağıda sunulmuştur:

```mermaid
sequenceDiagram
    autonumber
    actor Kullanıcı as React Frontend (Arayüz)
    participant Backend as FastAPI Backend (Sunucu)
    participant ModelGen as Python Model Generator
    participant OpenMC as OpenMC Solver (WSL)
    participant Geant4 as Geant4 C++ Solver (WSL)
    participant Parser as Python Results Parser

    Kullanıcı->>Backend: POST /api/simulate (Parametreler JSON)
    Note over Backend: Eşsiz Job ID (UUID) üretilir ve arka plan iş parçacığı (thread) tetiklenir
    Backend-->>Kullanıcı: 202 Accepted (Job ID döner)

    alt OpenMC Çalıştırılacaksa
        Backend->>ModelGen: generate_smr_model() çağrısı
        Note over ModelGen: Malzeme, Geometri, Ayarlar ve Tally XML dosyaları oluşturulur (materials.xml, geometry.xml vb.)
        Backend->>OpenMC: subprocess.run('openmc')
        Note over OpenMC: Monte Carlo Nötron Taşıma Simülasyonu
        OpenMC-->>Backend: Simülasyon tamamlanır (statepoint.100.h5 oluşur)
    end

    alt Geant4 Çalıştırılacaksa
        Backend->>ModelGen: generate_geant4_macro() çağrısı
        Note over ModelGen: Parametrik Geant4 .mac dosyası oluşturulur (geant4_run.mac)
        Backend->>Geant4: subprocess.run('./beavrs_assembly -m ...')
        Note over Geant4: C++ Monte Carlo Nötron Taşıma Simülasyonu
        Geant4-->>Backend: Simülasyon tamamlanır (ham CSV ve TXT dosyaları oluşur)
    end

    opt Gelişmiş Seçenekler Aktifse (Kinetics, Safety Coefs vb.)
        Note over Backend, OpenMC: Pertürbasyon modelleri kurulur ve yardımcı simülasyonlar (FTC, MTC, Void, Rod Worth) ardışık koşturulur
    end

    Backend->>Parser: parse_openmc_results() / parse_geant4_results()
    Note over Parser: H5 verileri ve CSV/TXT dosyaları parse edilir, eksenel gürültü filtreleri uygulanır
    Parser-->>Backend: JSON formatında sonuç veri seti

    loop Her 1 Saniyede Bir (Polling)
        Kullanıcı->>Backend: GET /api/job/{job_id}/status & /logs
        Backend-->>Kullanıcı: Güncel durum (running/parsing/completed) ve loglar
    end

    Kullanıcı->>Backend: GET /api/job/{job_id}/results
    Backend-->>Kullanıcı: Nihai simülasyon verileri (k-eff, 2B/3B güç haritaları, grafikler)
    Note over Kullanıcı: Sonuçlar Plotly grafikleri ve 2B harita olarak ekranda güncellenir


### Adım 1: Parametrik XML Giriş Dosyalarının Oluşturulması (`model_generator.py`)
Kullanıcının girdiği reaktör parametreleri (zenginleştirme, bor konsantrasyonu, pin adımı vb.) Python nesnelerine dönüştürülür. OpenMC API kullanılarak şu 4 kritik XML dosyası oluşturulur:
1. **`materials.xml`:** Yakıt (UO₂ veya Gd₂O₃ zehirli yakıt), kaplama (Zircaloy4, M5), helyum gazı boşluğu, kontrol çubuğu yutucuları (Ag-In-Cd, B₄C, Hafniyum) ve borlanmış su soğutucusu gibi malzemelerin atomik/ağırlık oranları ve sıcaklığa bağlı yoğunlukları tanımlanır.
2. **`geometry.xml`:** Silindir yüzeyler kullanılarak yakıt pini, gaz boşluğu ve kaplama katmanları oluşturulur. Kare veya Hexagonal örgü yapısı (lattice matrix) kurulur. Demet etrafına yansıtıcı (reflective) sınırlar eklenerek sonsuz demet modeli kurulur.
3. **`settings.xml`:** Başlangıç kaynağı dağılımı (source point), aktif/inaktif batch sayıları, particle sayısı ve sıcaklık ayarları işlenir.
4. **`tallies.xml`:** Nötronların yakıt demeti içindeki davranışını izlemek için "tally" (skor kaydedici) tanımlanır. İki boyutlu güç dağılımları için `kappa-fission`, uzaysal akı dağılımı için `flux`, `absorption` ve enerji spektrumu için 500 enerji grubuna bölünmüş filtreler tanımlanır.

### Adım 2: WSL Üzerinde OpenMC Sürecinin Çalıştırılması
FastAPI arka plan görevlisi (Background Tasks), Windows işletim sistemindeyken WSL (Windows Subsystem for Linux) üzerinde kurulu olan OpenMC ortamını asenkron bir alt süreç (subprocess) olarak tetikler:
- WSL ortamına geçiş yapılır.
- `openmc` conda ortamı aktifleştirilir.
- Nötron tesir kesiti veri kütüphanesinin yolu tanımlanır: `export OPENMC_CROSS_SECTIONS=/home/busra/openmc_project/endfb-vii.1-hdf5/cross_sections.xml`
- Simülasyonun koşturulacağı dizine girilerek `openmc` komutu yürütülür.

### Adım 3: Canlı Log Akışı
FastAPI sunucusu, WSL alt sürecinin standart çıktısını (stdout) satır satır okur. Kullanıcı arayüzü belirli aralıklarla (`polling`) `/api/job/{id}/logs` ucundan bu veriyi çekerek **Simulation Live Logs** ekranında canlı olarak simülasyon ilerlemesini gösterir.

### Adım 4: Sonuçların Ayrıştırılması (`results_parser.py`)
Simülasyon bittiğinde reaktör fizik verilerini içeren `statepoint.XX.h5` dosyası oluşur. Python'ın HDF5 okuyucu kütüphaneleri ve OpenMC API'si yardımıyla bu ikili (binary) dosya çözümlenerek web arayüzünün anlayacağı JSON formatına dönüştürülür.

---

## 4. Nötronik Analiz Çıktıları ve Anlamları

Platform simülasyon sonrasında kullanıcıya şu nötronsal sonuçları sunar:

### 1. k-Etkin Değeri (k-Effective)
Reaktörün kritiklik durumunu belirten en temel çarpım faktörüdür:
- **$k = 1$ (Kritik):** Nötron üretimi ile nötron kaybı dengededir. Reaktör kararlı güçtedir.
- **$k < 1$ (Alt-kritik):** Reaksiyon sönümlenir. Reaktör durma eğilimindedir.
- **$k > 1$ (Üst-kritik):** Reaksiyon katlanarak artar. Reaktör gücü yükselir.
- Arayüzde standart sapmasıyla birlikte (örneğin: $1.01452 \pm 0.00104$) sunulur.

### 2. Reaktivite ($\rho$)
k-Etkin değerinin kritiklikten sapma miktarıdır:
$$\rho = \frac{k - 1}{k}$$
Mühendislik birimi olarak **pcm** (percent mille, $10^{-5}$) cinsinden gösterilir. Kontrol çubuklarının veya bor miktarının reaktörü ne kadar alt-kritik yapabildiğini doğrulamak için kullanılır.

### 3. Shannon Entropisi (Shannon Entropy)
Monte Carlo simülasyonunun başlangıç kaynağının (fission source distribution) geometrik olarak ne kadar yakınsadığını ölçen istatistiki bir veridir. Shannon entropi grafiği yatay çizgiye ulaştığında inaktif batch'lerin bittiği ve reaktörün gerçek nötron dağılımının yakalandığı doğrulanmış olur.

### 4. 2D Pin Güç Dağılım Haritası (Pin-by-Pin Power Map)
Demet içerisindeki yakıt çubuklarının ürettiği bağıl güç dağılımını gösteren ısı haritasıdır:
- Her çubuktaki fisyon enerjisi salınımı (`kappa-fission`) hesaplanır ve ortalama güce bölünerek bağıl güç faktörü bulunur.
- En yüksek güce sahip yakıt çubuğu tespit edilerek **Hot Channel Factor (Peak Power Factor)** değeri hesaplanır. Bu değerin güvenlik sınırları altında olması (genelde < 1.5) yakıtın erimesini önlemek için kritik önemdedir.

### 5. Uzaysal Nötron Akısı ve Yutulum Haritaları (Flux, Absorption, Scattering Maps)
Demetin 2D kesitinde (170x170 çözünürlükte çok ince bir mesh üzerinde) nötronların hareket yoğunluğunu gösterir:
- **Flux (Akı):** Nötronların en yoğun olduğu bölgeleri (genellikle su kılavuz tüplerinin yakınlarındaki termal nötron tepe noktalarını) gösterir.
- **Absorption (Yutulum):** Kontrol çubuklarında veya yanabilir zehirlerde (Gd) nötron yutulma yoğunluğunu doğrular.
- **Scattering (Saçılma):** Moderatör olan su içerisindeki nötron yavaşlatma etkinliğini görselleştirir.

### 6. Enerji Spektrumu (Energy Spectrum)
Nötronların sahip olduğu kinetik enerjiye göre ($10^{-5}\text{ eV}$ termal bölgeden $20\text{ MeV}$ hızlı fisyon nötronlarına kadar) dağılımını logaritmik olarak Plotly.js üzerinde çizdirir. Termal reaktörlerde termal bölgedeki ($< 0.625\text{ eV}$) tepe noktasının büyüklüğü moderasyonun kalitesini ortaya koyar.

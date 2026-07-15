
"""
BEAVRS parametrik veri seti üretici (arkadaşın OpenMC sweep'iyle aynı mantık).

Sabit: geometri (BEAVRS 17x17, pitch 1.25984, height 365.76), yansıtıcı sınır,
istatistik (10000 nötron/jenerasyon x 200 jenerasyon = 50 pasif + 150 aktif).
Rastgele örneklenen: enrichment [1.5-5.3 wt%], boron [0-1000 ppm],
yakıt sıcaklığı (Doppler) [600-1200 K].

Her örnek bir tam k-eigenvalue koşusu; sonuç tek satır olarak CSV'ye yazılır:
    sample, enrichment_wt, boron_ppm, fuel_temp_K, k_eff, k_eff_sem, entropy_bits

Kullanım (build/ klasöründen):
    python3 ../scripts/sweep_beavrs.py 100
    python3 ../scripts/sweep_beavrs.py 100 --both-temp   # yakıt+moderatör aynı T

Çıktı: beavrs_dataset.csv (satır satır, kesintiye dayanıklı — her koşudan sonra yazar).
"""
import csv, os, re, sys, random, subprocess, tempfile, time

ENR_MIN, ENR_MAX   = 0.015, 0.053
BOR_MIN, BOR_MAX   = 0.0,   1000.0
TEMP_MIN, TEMP_MAX = 600.0, 1200.0

BIN = "./beavrs_assembly"
CSV = "beavrs_dataset.csv"

STATS = {"full": (1250, 50, 150), "fast": (300, 20, 40)}

def make_macro(enr, boron, tfuel, both_temp, seed1, seed2, mode):
    hist, inact, act = STATS[mode]
    lines = [
        f"/random/setSeeds {seed1} {seed2}",
        "/smr/reactor/preset BEAVRS",
        f"/smr/reactor/enrichment {enr:.5f}",
        f"/smr/reactor/boronPPM {boron:.2f}",
        f"/smr/reactor/fuelTemperature {tfuel:.1f} kelvin",
    ]
    if both_temp:
        lines.append(f"/smr/reactor/moderatorTemperature {tfuel:.1f} kelvin")
    lines += [
        "/run/initialize",
        "/beavrs/output/fileName beavrs_sweep_tmp",
        "/beavrs/geom/reflectRadial true",
        "/beavrs/geom/reflectAxial  true",
        "/beavrs/gun/neutronsPerEvent 8",
        "/run/printProgress 1000000",
        f"/beavrs/eigen/inactive  {inact}",
        f"/beavrs/eigen/active    {act}",
        f"/beavrs/eigen/histories {hist}",
        "/beavrs/eigen/run",
    ]
    return "\n".join(lines) + "\n"

K_RE = re.compile(r"k_eff\s*=\s*([\d.]+)\s*\+/-\s*([\d.]+)")
H_RE = re.compile(r"H\s*=\s*([\d.]+)\s*bits")

def run_one(macro_text):
    with tempfile.NamedTemporaryFile("w", suffix=".mac", dir=".", delete=False) as fh:
        fh.write(macro_text); path = fh.name
    try:
        out = subprocess.run([BIN, "-m", path], capture_output=True, text=True).stdout
    finally:
        os.remove(path)
    ks = K_RE.findall(out)
    hs = H_RE.findall(out)
    if not ks:
        return None
    keff, sem = float(ks[-1][0]), float(ks[-1][1])
    ent = float(hs[-1]) if hs else float("nan")
    return keff, sem, ent

def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    both = "--both-temp" in sys.argv
    mode = "full" if "--full" in sys.argv else "fast"
    print(f"istatistik modu: {mode}  ({STATS[mode]})")
    if not os.path.exists(BIN):
        sys.exit(f"'{BIN}' bulunamadı — bu scripti build/ klasöründen çalıştır.")
    new = not os.path.exists(CSV)
    fh = open(CSV, "a", newline=""); w = csv.writer(fh)
    if new:
        w.writerow(["sample","enrichment_wt","boron_ppm","fuel_temp_K",
                    "k_eff","k_eff_sem","entropy_bits"]); fh.flush()

    done = sum(1 for _ in open(CSV)) - 1 if not new else 0
    print(f"{n} örnek üretilecek (mevcut: {done}). both_temp={both}")
    for i in range(done + 1, done + n + 1):
        enr = random.uniform(ENR_MIN, ENR_MAX)
        bor = random.uniform(BOR_MIN, BOR_MAX)
        tf  = random.uniform(TEMP_MIN, TEMP_MAX)
        s1, s2 = random.randint(1, 2**31-1), random.randint(1, 2**31-1)
        t0 = time.time()
        res = run_one(make_macro(enr, bor, tf, both, s1, s2, mode))
        dt = time.time() - t0
        if res is None:
            print(f"[{i}] HATA — atlanıyor"); continue
        keff, sem, ent = res
        w.writerow([i, f"{enr:.5f}", f"{bor:.2f}", f"{tf:.1f}",
                    f"{keff:.5f}", f"{sem:.5f}", f"{ent:.4f}"]); fh.flush()
        print(f"[{i}/{done+n}] enr={enr*100:.2f}%  B={bor:.0f}ppm  Tf={tf:.0f}K"
              f"  ->  k_eff={keff:.5f} +/- {sem:.5f}  H={ent:.3f}  ({dt:.0f}s)")
    fh.close()
    print(f"Bitti -> {os.path.abspath(CSV)}")

if __name__ == "__main__":
    main()

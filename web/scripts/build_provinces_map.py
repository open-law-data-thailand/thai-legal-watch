"""Turn Natural Earth's admin-1 boundaries into the province map the site draws.

Source: Natural Earth 1:10m Admin 1 – States, Provinces (public domain, no restrictions)
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson

    python3 scripts/build_provinces_map.py ne_10m_admin_1_states_provinces.geojson public/map/thailand-provinces.json

The output is a plain dict of Thai province name -> one SVG path, already projected into a
fixed viewBox, so the page needs no projection library and no runtime geometry work.
Re-run it only when the boundaries change; the output is committed.
"""
import json
import math
import sys

WIDTH = 460.0   # viewBox width; the height follows from Thailand's aspect ratio
PAD = 6.0
TOLERANCE = 0.006      # degrees, ~600 m — the shape stays honest at this size
MIN_RING_AREA = 0.0015  # square degrees; drops specks that render as a single pixel

# Natural Earth's `name_local` is wrong for six Thai provinces — Bangkok is labelled
# จังหวัดเชียงใหม่, Bueng Kan จังหวัดหนองคาย, Chaiyaphum จังหวัดชัยนาท, and three more carry a
# district name — so the English `name`, which is reliable, is mapped here instead.
THAI = {
    "Amnat Charoen": "อำนาจเจริญ", "Ang Thong": "อ่างทอง", "Bangkok Metropolis": "กรุงเทพมหานคร",
    "Bueng Kan": "บึงกาฬ", "Buri Ram": "บุรีรัมย์", "Chachoengsao": "ฉะเชิงเทรา",
    "Chai Nat": "ชัยนาท", "Chaiyaphum": "ชัยภูมิ", "Chanthaburi": "จันทบุรี",
    "Chiang Mai": "เชียงใหม่", "Chiang Rai": "เชียงราย", "Chon Buri": "ชลบุรี",
    "Chumphon": "ชุมพร", "Kalasin": "กาฬสินธุ์", "Kamphaeng Phet": "กำแพงเพชร",
    "Kanchanaburi": "กาญจนบุรี", "Khon Kaen": "ขอนแก่น", "Krabi": "กระบี่",
    "Lampang": "ลำปาง", "Lamphun": "ลำพูน", "Loei": "เลย", "Lop Buri": "ลพบุรี",
    "Mae Hong Son": "แม่ฮ่องสอน", "Maha Sarakham": "มหาสารคาม", "Mukdahan": "มุกดาหาร",
    "Nakhon Nayok": "นครนายก", "Nakhon Pathom": "นครปฐม", "Nakhon Phanom": "นครพนม",
    "Nakhon Ratchasima": "นครราชสีมา", "Nakhon Sawan": "นครสวรรค์",
    "Nakhon Si Thammarat": "นครศรีธรรมราช", "Nan": "น่าน", "Narathiwat": "นราธิวาส",
    "Nong Bua Lam Phu": "หนองบัวลำภู", "Nong Khai": "หนองคาย", "Nonthaburi": "นนทบุรี",
    "Pathum Thani": "ปทุมธานี", "Pattani": "ปัตตานี", "Phangnga": "พังงา",
    "Phatthalung": "พัทลุง", "Phayao": "พะเยา", "Phetchabun": "เพชรบูรณ์",
    "Phetchaburi": "เพชรบุรี", "Phichit": "พิจิตร", "Phitsanulok": "พิษณุโลก",
    "Phra Nakhon Si Ayutthaya": "พระนครศรีอยุธยา", "Phrae": "แพร่", "Phuket": "ภูเก็ต",
    "Prachin Buri": "ปราจีนบุรี", "Prachuap Khiri Khan": "ประจวบคีรีขันธ์",
    "Ranong": "ระนอง", "Ratchaburi": "ราชบุรี", "Rayong": "ระยอง", "Roi Et": "ร้อยเอ็ด",
    "Sa Kaeo": "สระแก้ว", "Sakon Nakhon": "สกลนคร", "Samut Prakan": "สมุทรปราการ",
    "Samut Sakhon": "สมุทรสาคร", "Samut Songkhram": "สมุทรสงคราม", "Saraburi": "สระบุรี",
    "Satun": "สตูล", "Si Sa Ket": "ศรีสะเกษ", "Sing Buri": "สิงห์บุรี", "Songkhla": "สงขลา",
    "Sukhothai": "สุโขทัย", "Suphan Buri": "สุพรรณบุรี", "Surat Thani": "สุราษฎร์ธานี",
    "Surin": "สุรินทร์", "Tak": "ตาก", "Trang": "ตรัง", "Trat": "ตราด",
    "Ubon Ratchathani": "อุบลราชธานี", "Udon Thani": "อุดรธานี", "Uthai Thani": "อุทัยธานี",
    "Uttaradit": "อุตรดิตถ์", "Yala": "ยะลา", "Yasothon": "ยโสธร",
}


def thai_name(props: dict) -> str:
    name = (props.get("name") or "").strip()
    if name not in THAI:
        raise SystemExit(f"no Thai name for {name!r} — update THAI in this script")
    return THAI[name]


def perp(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def simplify(points, tol):
    """Douglas-Peucker, iterative so a long coastline cannot blow the stack."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        worst, at = tol, -1
        for k in range(i + 1, j):
            d = perp(points[k], points[i], points[j])
            if d > worst:
                worst, at = d, k
        if at >= 0:
            keep[at] = True
            stack.append((i, at))
            stack.append((at, j))
    return [p for p, k in zip(points, keep) if k]


def ring_area(ring):
    s = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def rings_of(geom):
    if geom["type"] == "Polygon":
        return list(geom["coordinates"])
    return [ring for poly in geom["coordinates"] for ring in poly]


def main(src: str, out: str) -> int:
    data = json.load(open(src, encoding="utf-8"))
    feats = [f for f in data["features"] if f["properties"].get("adm0_a3") == "THA"]
    if len(feats) != 77:
        print(f"expected 77 provinces, got {len(feats)}", file=sys.stderr)
        return 1

    kept = {}
    for f in feats:
        rings = [r for r in rings_of(f["geometry"]) if ring_area(r) >= MIN_RING_AREA]
        if not rings:  # a province that is all small islands keeps its largest ring
            rings = [max(rings_of(f["geometry"]), key=ring_area)]
        kept[thai_name(f["properties"])] = [simplify([tuple(p[:2]) for p in r], TOLERANCE) for r in rings]

    xs = [x for rs in kept.values() for r in rs for x, _ in r]
    ys = [y for rs in kept.values() for r in rs for _, y in r]
    lon0, lon1, lat0, lat1 = min(xs), max(xs), min(ys), max(ys)
    k = math.cos(math.radians((lat0 + lat1) / 2))
    scale = (WIDTH - 2 * PAD) / ((lon1 - lon0) * k)
    height = (lat1 - lat0) * scale + 2 * PAD

    def xy(lon, lat):
        return (
            round(PAD + (lon - lon0) * k * scale, 1),
            round(PAD + (lat1 - lat) * scale, 1),
        )

    paths = {}
    for name, rings in sorted(kept.items()):
        d = []
        for ring in rings:
            pts = [xy(lon, lat) for lon, lat in ring]
            # drop consecutive duplicates left behind by rounding
            dedup = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
            if len(dedup) < 3:
                continue
            d.append("M" + "L".join(f"{x} {y}" for x, y in dedup) + "Z")
        paths[name] = "".join(d)

    doc = {
        "source": "Natural Earth 1:10m Admin 1 — States, Provinces (public domain)",
        "width": WIDTH,
        "height": round(height, 1),
        "bbox": [round(lon0, 4), round(lat0, 4), round(lon1, 4), round(lat1, 4)],
        "provinces": paths,
    }
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(paths)} provinces → {out} ({len(json.dumps(doc, ensure_ascii=False)) / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1], sys.argv[2]))

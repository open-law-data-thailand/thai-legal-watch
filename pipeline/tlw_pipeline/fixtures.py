"""Synthetic dataset in the real layout — for tests and for the web app's e2e fixtures.

    python -m tlw_pipeline.fixtures --out ../web/public/data
"""
import json
import os
import random
import sys

TAXONOMY = {
    "topics": {"environment": {"thai": "สิ่งแวดล้อม", "parent": None},
               "pollution": {"thai": "มลพิษ", "parent": "environment"},
               "pollution_waste": {"thai": "ขยะ", "parent": "pollution"},
               "bankruptcy": {"thai": "ล้มละลาย", "parent": None},
               "public_admin": {"thai": "บริหารราชการ", "parent": None}},
    "actions": {"rulemaking": "ออกกฎ", "court_order": "คำสั่งศาล", "appointment": "แต่งตั้ง"},
    "govlevels": {"central": "ส่วนกลาง", "local": "ท้องถิ่น", "judiciary": "ศาล"},
}
AGENCIES = [("กระทรวงสาธารณสุข", "ministry", None), ("องค์การบริหารส่วนตำบลนาโยงเหนือ", "local", "ตรัง"),
            ("ศาลล้มละลายกลาง", "court", None), ("จังหวัดเชียงใหม่", "province", "เชียงใหม่")]


def make_dataset(root: str, years=("2023", "2024"), per_month=40, seed=1) -> None:
    rnd = random.Random(seed)
    os.makedirs(os.path.join(root, "taxonomy"), exist_ok=True)
    json.dump(TAXONOMY, open(os.path.join(root, "taxonomy", "taxonomy.json"), "w", encoding="utf-8"), ensure_ascii=False)
    n = 0
    for y in years:
        for mo in ("01", "02"):
            month = f"{y}-{mo}"
            os.makedirs(os.path.join(root, "meta", y), exist_ok=True)
            os.makedirs(os.path.join(root, "taxonomy", y), exist_ok=True)
            mf = open(os.path.join(root, "meta", y, f"{month}.jsonl"), "w", encoding="utf-8")
            tf = open(os.path.join(root, "taxonomy", y, f"{month}.jsonl"), "w", encoding="utf-8")
            for i in range(per_month):
                n += 1
                did = f"{y}-{n:06d}"
                ag, atype, prov = rnd.choice(AGENCIES)
                kind = rnd.choice(["waste", "bankrupt", "appoint"])
                day = f"{month}-{rnd.randint(1, 28):02d}"
                if kind == "waste":
                    title, topic, action, gov, dtype = "ข้อบัญญัติ เรื่อง การจัดการมูลฝอย", "pollution_waste", "rulemaking", "local", "ข้อบัญญัติ"
                    ag, atype, prov = AGENCIES[1]
                elif kind == "bankrupt":
                    title, topic, action, gov, dtype = "ประกาศเจ้าพนักงานพิทักษ์ทรัพย์ เรื่อง คำสั่งพิทักษ์ทรัพย์เด็ดขาด", "bankruptcy", "court_order", "judiciary", "ประกาศ"
                    ag, atype, prov = AGENCIES[2]
                else:
                    title, topic, action, gov, dtype = "ประกาศสำนักนายกรัฐมนตรี เรื่อง แต่งตั้งข้าราชการ", "public_admin", "appointment", "central", "ประกาศ"
                    ag, atype, prov = AGENCIES[0]
                corr = rnd.random() < 0.8
                # upstream is adding source_url year by year, so half the fixture carries it and
                # half does not — the absent half is the path most of the archive is still on
                mrec = {"no": str(n), "doctitle": f"  {title}  [{did}] ", "bookNo": "141", "section": "17",
                        "category": "ง พิเศษ" if kind == "waste" else "ง", "publishDate": day, "pageNo": str(i + 1),
                        "pdf_file": f"{did}.pdf"}
                if i % 2 == 0:
                    mrec["source_url"] = f"https://ratchakitcha.soc.go.th/documents/{900000 + n}.pdf"
                mf.write(json.dumps(mrec, ensure_ascii=False) + "\n")
                rec = {"pdf_file": f"{did}.pdf", "doc_id": did, "year": y, "month": month, "volume": 141, "part": "17 ง",
                       "part_class": "ง", "publish_date": day, "doc_type": dtype, "agency": ag, "agency_type": atype,
                       "province": prov, "topic": topic, "action": action, "govlevel": gov,
                       "topic_corroborated": corr, "action_corroborated": True, "govlevel_corroborated": corr,
                       "labels": [{"slug": topic, "thai": "x", "axis": "topic", "weight": 0.9, "matched_by": ["auth", "title"], "corroborated": corr},
                                  {"slug": action, "thai": "y", "axis": "action", "weight": 0.9, "matched_by": ["dtype"], "corroborated": True}],
                       "extracted": {"stage": "absolute_receivership", "court": ag, "case_number": f"ล.{i}/2567"} if kind == "bankrupt" else {},
                       "sieve_version": "v6"}
                tf.write(json.dumps(rec, ensure_ascii=False) + "\n")
            mf.close()
            tf.close()




def main(argv=None) -> int:
    import argparse
    import shutil
    import tempfile

    from .cli import build
    ap = argparse.ArgumentParser(prog="tlw-fixtures")
    ap.add_argument("--out", required=True, help="dist-data folder to write (e.g. web/public/data)")
    ap.add_argument("--per-month", type=int, default=40)
    # the web e2e asks for more years than the unit tests need: the whole-archive view reads a few
    # month files at a time and offers a per-year breakdown for what it cannot reach, and that
    # branch only exists once there are more months than the reader fetches in one go
    ap.add_argument("--years", default="", help="comma-separated, e.g. 2021,2022,2023,2024")
    a = ap.parse_args(argv)
    root = tempfile.mkdtemp(prefix="tlw-fixture-")
    try:
        years = tuple(y.strip() for y in a.years.split(",") if y.strip())
        make_dataset(root, per_month=a.per_month, **({"years": years} if years else {}))
        if os.path.isdir(a.out):
            shutil.rmtree(a.out)
        build(root, a.out, site="http://127.0.0.1:4173")
    finally:
        shutil.rmtree(root, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

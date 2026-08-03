#!/usr/bin/env python3
"""Convert one GitHub Issue event into the public, unverified GeoJSON layer.

Only the ``submitted`` layer is automated.  A feature produced by this script is
not verified, not CC0 data, and must never be copied to ``data/verified`` without
a separate content and rights review.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

YOKOZE_BOUNDS = {"west": 139.03, "south": 35.94, "east": 139.19, "north": 36.04}

ALIASES = {
    "情報提供の種類": "submission_type",
    "希望する更新経路": "submission_destination",
    "更新経路": "submission_destination",
    "OSM ID": "source_osm_id",
    "OSM上の名称": "source_osm_name",
    "施設名": "name",
    "確認後の施設名": "name",
    "施設種別": "category",
    "提供者が確認した緯度": "latitude",
    "確認した緯度": "latitude",
    "緯度": "latitude",
    "提供者が確認した経度": "longitude",
    "確認した経度": "longitude",
    "経度": "longitude",
    "トイレの存在": "toilet_exists",
    "一般利用": "access",
    "一般利用の可否": "access",
    "購入・施設利用": "purchase_note",
    "商品購入・施設利用の必要性": "purchase_note",
    "声掛け": "permission_note",
    "職員や店員への声掛けの必要性": "permission_note",
    "利用可能時間": "toilet_opening_hours",
    "トイレの利用可能時間・営業時間": "toilet_opening_hours",
    "外観・入口": "exterior_note",
    "外観・入口の特徴": "exterior_note",
    "水洗方式": "flush_type",
    "便器の形式": "toilet_style",
    "その他の設備・特徴": "equipment_note",
    "車いす対応": "wheelchair",
    "おむつ交換台": "changing_table",
    "オストメイト設備": "ostomy",
    "男女区分": "gender",
    "男女別・共用": "gender",
    "確認日": "verification_date",
    "情報を確認した日": "verification_date",
    "確認方法": "verification_method",
    "情報源": "source_name",
    "備考": "notes",
    "CC0 1.0での公開に同意": "cc0_consent",
    "CC0での公開に同意します": "cc0_consent",
}

ENUM_MAPS = {
    "category": {
        "公衆トイレ": "public_toilet", "公園": "park", "駅": "station",
        "公共施設": "public_facility", "観光施設": "tourism", "コンビニ": "convenience",
        "カフェ": "cafe", "飲食店": "restaurant", "その他": "other",
    },
    "toilet_exists": {"存在を確認": "yes", "はい": "yes", "存在しないことを確認": "no", "いいえ": "no"},
    "access": {
        "誰でも利用可": "public", "利用者・購入者向け": "customers",
        "声掛け・許可が必要": "permission", "制限あり": "restricted",
    },
    "flush_type": {"水洗": "flush", "非水洗": "non_flush", "その他": "other"},
    "toilet_style": {"洋式": "western", "和式": "japanese", "洋式・和式あり": "both", "その他": "other"},
    "wheelchair": {"あり": "yes", "利用しやすい": "yes", "限定的": "limited", "一部利用可・要確認": "limited", "なし": "no"},
    "changing_table": {"あり": "yes", "なし": "no"},
    "ostomy": {"あり": "yes", "なし": "no"},
    "gender": {"男性用": "male", "女性用": "female", "共用": "unisex", "男女別あり": "mixed"},
    "verification_method": {
        "自分で確認": "user_submission", "現地調査": "field_survey", "電話": "phone",
        "メール": "email", "公式Web": "official_web", "未確認": "unknown",
    },
}


class IntakeError(ValueError):
    pass


def clean(value: Any, limit: int = 1000) -> str:
    text = re.sub(r"[\x00-\x1f\x7f]", " ", str(value or ""))
    return re.sub(r"\s+", " ", text).strip()[:limit]


def parse_issue_body(body: str) -> dict[str, str]:
    """Parse both GitHub Issue Forms and the website-generated bullet list."""
    result: dict[str, str] = {}
    lines = body.replace("\r\n", "\n").split("\n")

    for index, line in enumerate(lines):
        heading = re.match(r"^###\s+(.+?)\s*$", line)
        if heading:
            label = clean(heading.group(1), 100)
            values: list[str] = []
            for following in lines[index + 1:]:
                if following.startswith("### ") or following.startswith("## "):
                    break
                stripped = following.strip()
                if stripped and stripped != "_No response_":
                    values.append(stripped.removeprefix("- [x] ").removeprefix("- [X] "))
            if label in ALIASES and values:
                result[ALIASES[label]] = clean(" ".join(values), 1000)

        bullet = re.match(r"^\s*-\s+([^:：]+)[:：]\s*(.*?)\s*$", line)
        if bullet:
            label = clean(bullet.group(1), 100)
            if label in ALIASES:
                result[ALIASES[label]] = clean(bullet.group(2), 1000)

    return result


def normalized(field: str, value: str, default: str = "unknown") -> str:
    value = clean(value, 320)
    if not value or value.lower() in {"unknown", "未確認", "_no response_"}:
        return default
    return ENUM_MAPS.get(field, {}).get(value, value)


def has_cc0_consent(fields: dict[str, str], body: str) -> bool:
    value = fields.get("cc0_consent", "").lower()
    if value in {"はい", "yes", "true", "同意", "同意します"}:
        return True
    lowered = body.lower()
    return (
        "cc0 1.0での公開に同意: はい" in lowered
        or "cc0での公開に同意します" in lowered
        or "cc0 1.0 universalで公開することに同意します" in lowered
    )


def coordinate(fields: dict[str, str], key: str) -> float:
    raw = clean(fields.get(key), 80).replace("`", "")
    try:
        return float(raw)
    except (TypeError, ValueError) as exc:
        raise IntakeError(f"{key} を数値として読み取れません。") from exc


def validate(fields: dict[str, str], body: str) -> tuple[float, float]:
    if not clean(fields.get("name"), 80):
        raise IntakeError("施設名がありません。")
    lat = coordinate(fields, "latitude")
    lng = coordinate(fields, "longitude")
    if not (YOKOZE_BOUNDS["south"] <= lat <= YOKOZE_BOUNDS["north"] and
            YOKOZE_BOUNDS["west"] <= lng <= YOKOZE_BOUNDS["east"]):
        raise IntakeError("座標が横瀬町周辺の受付範囲外です。")
    if not has_cc0_consent(fields, body):
        raise IntakeError("CC0公開への同意を確認できません。")
    return lat, lng


def make_feature(issue: dict[str, Any], fields: dict[str, str], lat: float, lng: float) -> dict[str, Any]:
    number = int(issue["number"])
    issue_url = clean(issue.get("html_url"), 500)
    purchase = normalized("purchase_note", fields.get("purchase_note", ""))
    permission = normalized("permission_note", fields.get("permission_note", ""))
    return {
        "type": "Feature",
        "id": f"submitted-issue-{number}",
        "geometry": {"type": "Point", "coordinates": [round(lng, 6), round(lat, 6)]},
        "properties": {
            "id": f"submitted-issue-{number}",
            "name": clean(fields.get("name"), 80),
            "category": normalized("category", fields.get("category", ""), "other"),
            "longitude": round(lng, 6),
            "latitude": round(lat, 6),
            "toilet_exists": normalized("toilet_exists", fields.get("toilet_exists", "")),
            "access": normalized("access", fields.get("access", "")),
            "access_note": f"購入・施設利用: {purchase}; 声掛け: {permission}",
            "facility_opening_hours": "unknown",
            "toilet_opening_hours": normalized("toilet_opening_hours", fields.get("toilet_opening_hours", "")),
            "fee": "unknown",
            "exterior_note": normalized("exterior_note", fields.get("exterior_note", "")),
            "flush_type": normalized("flush_type", fields.get("flush_type", "")),
            "toilet_style": normalized("toilet_style", fields.get("toilet_style", "")),
            "equipment_note": normalized("equipment_note", fields.get("equipment_note", "")),
            "wheelchair": normalized("wheelchair", fields.get("wheelchair", "")),
            "changing_table": normalized("changing_table", fields.get("changing_table", "")),
            "ostomy": normalized("ostomy", fields.get("ostomy", "")),
            "gender": normalized("gender", fields.get("gender", "")),
            "verification_status": "submitted",
            "submission_type": normalized("submission_type", fields.get("submission_type", ""), "new"),
            "submission_destination": normalized("submission_destination", fields.get("submission_destination", ""), "atlas"),
            "source_osm_id": normalized("source_osm_id", fields.get("source_osm_id", ""), "unknown"),
            "source_osm_name": normalized("source_osm_name", fields.get("source_osm_name", ""), "unknown"),
            "verification_method": normalized("verification_method", fields.get("verification_method", ""), "user_submission"),
            "verification_date": normalized("verification_date", fields.get("verification_date", "")),
            "source_name": normalized("source_name", fields.get("source_name", ""), "user_submission"),
            "source_url": issue_url,
            "source_license": "user_submission; pending verification",
            "coordinate_source": "GitHub Issue submission",
            "data_license": "pending verification; not published as CC0",
            "cc0_eligible": False,
            "cc0_publication_consent": True,
            "automated_intake": True,
            "source_issue_number": number,
            "source_issue_url": issue_url,
            "source_issue_author": clean((issue.get("user") or {}).get("login"), 120),
            "source_issue_state": clean(issue.get("state"), 30),
            "source_issue_created_at": clean(issue.get("created_at"), 40),
            "source_issue_updated_at": clean(issue.get("updated_at"), 40),
            "automation_updated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "notes": normalized("notes", fields.get("notes", "")),
        },
    }


def read_collection(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"type": "FeatureCollection", "features": []}
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise IntakeError("出力先がFeatureCollectionではありません。")
    return data


def write_collection(path: Path, collection: dict[str, Any]) -> None:
    collection["features"] = sorted(
        collection["features"], key=lambda feature: int(feature["properties"]["source_issue_number"])
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(collection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def remove_issue(collection: dict[str, Any], number: int) -> bool:
    before = len(collection["features"])
    collection["features"] = [
        feature for feature in collection["features"]
        if feature.get("properties", {}).get("source_issue_number") != number
    ]
    return len(collection["features"]) != before


def apply_event(event: dict[str, Any], output: Path) -> str:
    issue = event.get("issue") or {}
    action = clean(event.get("action"), 30)
    number = int(issue.get("number", 0))
    if not number:
        raise IntakeError("Issue番号を取得できません。")
    collection = read_collection(output)

    if action == "closed" or issue.get("state") == "closed":
        removed = remove_issue(collection, number)
        write_collection(output, collection)
        return f"Issue #{number} を確認待ちレイヤーから{'削除しました' if removed else '削除済みです'}。"

    body = str(issue.get("body") or "")
    fields = parse_issue_body(body)
    try:
        lat, lng = validate(fields, body)
    except IntakeError:
        remove_issue(collection, number)
        write_collection(output, collection)
        raise

    feature = make_feature(issue, fields, lat, lng)
    remove_issue(collection, number)
    collection["features"].append(feature)
    write_collection(output, collection)
    return f"Issue #{number} を青い確認待ちピンとして自動反映しました。CC0確認済みデータには未収録です。"


def self_test() -> None:
    import tempfile

    issue_form = """### 施設名\nテストトイレ\n\n### 緯度\n35.986\n\n### 経度\n139.106\n\n### CC0での公開に同意します\n同意します\n"""
    website = """## 基本情報\n- 施設名: Webフォームトイレ\n- 提供者が確認した緯度: 35.987000\n- 提供者が確認した経度: 139.107000\n## 設備\n- 水洗方式: flush\n## ライセンス同意\n- CC0 1.0での公開に同意: はい\n"""
    with tempfile.TemporaryDirectory() as tmp:
        output = Path(tmp) / "submitted.geojson"
        base = {"html_url": "https://github.example/issues/1", "user": {"login": "tester"}, "state": "open"}
        apply_event({"action": "opened", "issue": {**base, "number": 1, "body": issue_form}}, output)
        apply_event({"action": "opened", "issue": {**base, "number": 2, "body": website}}, output)
        data = read_collection(output)
        assert len(data["features"]) == 2
        assert data["features"][1]["properties"]["flush_type"] == "flush"
        bad = website.replace("139.107000", "140.000000")
        try:
            apply_event({"action": "edited", "issue": {**base, "number": 2, "body": bad}}, output)
        except IntakeError:
            pass
        else:
            raise AssertionError("invalid coordinates were accepted")
        assert len(read_collection(output)["features"]) == 1
        apply_event({"action": "closed", "issue": {**base, "number": 1, "state": "closed", "body": issue_form}}, output)
        assert not read_collection(output)["features"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event", type=Path)
    parser.add_argument("--output", type=Path, default=Path("data/submitted/submitted_toilets.geojson"))
    parser.add_argument("--message-out", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        print("self-test: ok")
        return 0
    if not args.event:
        parser.error("--event is required unless --self-test is used")

    try:
        message = apply_event(json.loads(args.event.read_text(encoding="utf-8")), args.output)
        code = 0
    except (IntakeError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        message = f"自動反映できませんでした: {exc} 入力内容を修正すると再検査されます。"
        code = 2

    if args.message_out:
        args.message_out.write_text(message + "\n", encoding="utf-8")
    print(message)
    return code


if __name__ == "__main__":
    sys.exit(main())

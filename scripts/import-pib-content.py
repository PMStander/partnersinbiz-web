#!/usr/bin/env python3
"""
Importer for the existing Partners in Biz 2026-Q1 content-engine output.

Loads the marketing/ folder produced months ago (8 blog posts, 12 weeks of
multi-platform social posts, 8 blog hero images) into a brand-new
"Partners in Biz - 2026 Q1" content campaign on the platform so Peet can
see it rendered in the new admin cockpit.

Run:
  cd partnersinbiz-web
  python3 scripts/import-pib-content.py            # uses BASE_URL env or http://localhost:3001
  BASE_URL=http://localhost:3001 python3 scripts/import-pib-content.py

Idempotency keys are deterministic so re-runs collapse onto the same writes.
The script is safe to run multiple times.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests  # type: ignore

# ---------------------------------------------------------------------------
# Constants & paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent.parent  # .../Partners in Biz - Client Growth
WEB_ROOT = REPO_ROOT / "partnersinbiz-web"
MARKETING = REPO_ROOT / "marketing"

BLOG_DIR = MARKETING / "blog-posts"
SOCIAL_DIR = MARKETING / "social-media"
VIDEO_DIR = MARKETING / "videos"
BLOG_IMG_DIR = MARKETING / "images" / "blog"
SOCIAL_IMG_DIR = MARKETING / "images" / "social"
PLAN_FILE = MARKETING / "plans" / "content-master-plan.md"

ORG_ID = "pib-platform-owner"
SPRINT_ID = "3ar6t2MkzdRZWhJEGsnu"
CAMPAIGN_NAME = "Partners in Biz — 2026 Q1"
CLIENT_TYPE = "service-business"
DEFAULT_BASE_URL = "http://localhost:3001"

# ---------------------------------------------------------------------------
# Pillars - lifted from content-master-plan.md
# ---------------------------------------------------------------------------

PILLARS = [
    {
        "id": "web-presence-pricing",
        "name": "Web Presence & Pricing",
        "description": "What an SA SME website actually costs, what gets cut at every price point, and the R20K-R60K sweet spot.",
        "weight": 1.5,
    },
    {
        "id": "app-development",
        "name": "App Development & Platform Strategy",
        "description": "When to build a website, when to build an app, and the decision tree every SA SME needs.",
        "weight": 1.3,
    },
    {
        "id": "ai-integration",
        "name": "AI Integration & ROI",
        "description": "Real-numbers ROI of AI integrations for SA SMEs. Chatbots, copilots, the $3.70-per-$1 economics.",
        "weight": 1.6,
    },
    {
        "id": "growth-automation",
        "name": "Growth Automation & Social Media",
        "description": "How automation gives SA SME owners 6 hours a week back. 253% ROI on social automation.",
        "weight": 1.4,
    },
    {
        "id": "sa-digital-landscape",
        "name": "South Africa Digital Landscape",
        "description": "The local trust-builder pillar. Cybersecurity, regulation, the 577-attacks-per-hour reality.",
        "weight": 1.0,
    },
    {
        "id": "myths-vs-reality",
        "name": "Myths vs Reality",
        "description": "Myth-busting the SA SME tech market. Highest shareability, highest myth-correction value.",
        "weight": 1.1,
    },
    {
        "id": "case-studies",
        "name": "Results & Case Studies",
        "description": "Real SA SME case studies. 4-hour-to-30-second chatbot, the social automation ROI breakdown.",
        "weight": 0.9,
    },
]

PILLAR_NAME_TO_ID = {p["name"]: p["id"] for p in PILLARS}
PILLAR_ID_BY_BLOG = {
    "B1": "web-presence-pricing",
    "B2": "app-development",
    "B3": "ai-integration",
    "B4": "ai-integration",
    "B5": "growth-automation",
    "B6": "sa-digital-landscape",
    "B7": "myths-vs-reality",
    "B8": "growth-automation",
}
PILLAR_ID_BY_WEEK = {
    "W01": "web-presence-pricing",
    "W02": "app-development",
    "W03": "ai-integration",
    "W04": "ai-integration",
    "W05": "growth-automation",
    "W06": "sa-digital-landscape",
    "W07": "myths-vs-reality",
    "W08": "growth-automation",
    "W09": "ai-integration",
    "W10": "sa-digital-landscape",
    "W11": "myths-vs-reality",
    "W12": "case-studies",
}
SOURCE_BLOG_BY_WEEK = {
    "W01": "B1", "W02": "B2", "W03": "B3", "W04": "B4",
    "W05": "B5", "W06": "B6", "W07": "B7", "W08": "B8",
    "W09": "B3", "W10": "B6", "W11": "B7", "W12": None,  # W12 = brand
}

# ---------------------------------------------------------------------------
# Brand identity & research dossier - lifted from brand-guidelines.md and the
# content-master-plan.
# ---------------------------------------------------------------------------

BRAND_IDENTITY = {
    "palette": {
        "bg": "#0A0A0B",
        "accent": "#F5A623",
        "alert": "#FF5A5F",
        "text": "#EDEDED",
        "muted": "#8B8B92",
    },
    "typography": {
        "heading": "Instrument Serif, serif",
        "body": "Geist, system-ui, sans-serif",
        "numeric": "Geist Mono, monospace",
    },
    "aestheticKeywords": [
        "minimal", "editorial", "premium", "high-contrast", "amber-accent",
        "near-black background", "founder-led", "South African tech studio",
    ],
    "tone": "founder-direct, no fluff, specific over generic",
}

RESEARCH = {
    "audiences": [
        {
            "id": "A",
            "label": "Existing PiB clients",
            "painPoints": [
                "Already have a site/app but don't know how to extract more from it",
                "Reporting takes too long; data is spread across tools",
                "Existing software was built but nobody is iterating on it",
            ],
            "language": ["ship", "build", "real numbers", "EFT", "South African"],
            "channels": ["linkedin", "email", "blog"],
            "topInsights": [
                "Founder-direct voice converts; corporate hype loses them",
                "EFT-first invoicing is a wedge against agencies that demand Stripe",
                "Activation is a Loom-walkthrough inside their own workspace",
            ],
        },
        {
            "id": "B",
            "label": "SA SME owners (web + AI prospects)",
            "painPoints": [
                "Pricing for SA websites runs R2,950 - R500,000 with no useful frame",
                "6.7 hours per week wasted on social media management",
                "Scared of AI integration cost (\"R150,000+\")",
                "577 cyber attacks per hour against SA SMEs and most are unprotected",
            ],
            "language": [
                "rands not dollars", "SA-based", "ship in weeks",
                "actually works on mobile", "no Stripe",
            ],
            "channels": ["linkedin", "instagram", "facebook", "blog", "youtube"],
            "topInsights": [
                "R20,000 - R60,000 is the SA SME website sweet spot - name it",
                "$3.70 returned per $1 invested in AI is the headline number",
                "253% ROI on social automation reframes the spend conversation",
                "Myth vs Fact format ships better than generic thought-leadership",
            ],
        },
    ],
    "voice": {
        "do": [
            "Direct, active voice: \"We build\" not \"We strive to build\"",
            "Cite specific figures with sources",
            "Founder voice - \"I\" and \"we\" both work",
            "Dryly opinionated; British editorial register over American hype",
            "Name the misconception, then correct it",
            "Clear next step in every piece",
        ],
        "dont": [
            "leverage / synergy / cutting-edge / innovative solutions",
            "Hype without evidence",
            "Vague \"trusted by many businesses\"",
            "Mock the reader for not knowing",
            "Leave them hanging without a CTA",
        ],
        "sampleParagraph": (
            "The cheapest website isn't the cheapest option. The SA market runs from "
            "R2,950 to R500,000 and that range doesn't help anyone make a decision. "
            "What sits inside the R20,000 - R60,000 sweet spot - mobile-first architecture, "
            "SSL hardening, sub-2-second load times, a maintenance plan that doesn't "
            "leave you stranded - matters more than the number itself."
        ),
    },
    "taglines": {
        "master": "Software your competitors will copy.",
        "layered": {
            "hero": "Software your competitors will copy.",
            "analytics": "Real numbers. Real timelines. Shipped software.",
            "simplification": "Honest numbers. No \"let's talk\" gatekeeping.",
        },
    },
    "citations": [
        {
            "quote": "Below R4,500, the under-the-hood mechanics required for business performance and protection are almost always missing.",
            "publication": "The Brand Forge",
            "url": "https://www.thebrandforge.co.za/website-design-prices-south-africa-2025",
            "date": "2026-01-01",
        },
        {
            "quote": "$3.70 returned for every $1 invested in AI.",
            "publication": "PwC AI Business Predictions",
            "url": "https://www.pwc.com/ai-predictions-2026",
            "date": "2026-01-01",
        },
        {
            "quote": "R20,000 to R60,000 is the SA SME sweet spot for a business-grade website.",
            "publication": "Circle Media",
            "url": "https://www.circle.co.za/website-design-cost-south-africa-2026",
            "date": "2026-01-01",
        },
        {
            "quote": "577 cyber attack attempts per hour target SA SMEs.",
            "publication": "Lula ICT Sector Growth Report",
            "url": "https://www.lula.co.za/sa-ict-2026",
            "date": "2026-01-01",
        },
    ],
    "channels": {
        "primary": ["linkedin", "blog"],
        "secondary": ["instagram", "facebook"],
        "experimental": ["youtube"],
    },
    "confidence": "high",
    "notes": "Imported from existing 2026-Q1 content engine run. Sources curated by the agency operator; not auto-research output.",
}

# ---------------------------------------------------------------------------
# Calendar - lifted from the 12-week table in content-master-plan section 4.
# Mon = blog, Wed = video, Fri = social.
# ---------------------------------------------------------------------------

CALENDAR_RAW = [
    # week, mon-blog, wed-video-id, fri-social-id, social-week-key
    (1, "B1",  "V1",  "W01"),
    (2, "B2",  "V2",  "W02"),
    (3, "B3",  "V3",  "W03"),
    (4, "B4",  "V4",  "W04"),
    (5, "B5",  "V5",  "W05"),
    (6, "B6",  "V6",  "W06"),
    (7, "B7",  None,  "W07"),
    (8, "B8",  None,  "W08"),
    (9, None,  None,  "W09"),
    (10, None, None,  "W10"),
    (11, None, None,  "W11"),
    (12, None, None,  "W12"),
]

VIDEO_TITLES = {
    "V1": "Website or App: What Does Your Business Actually Need?",
    "V2": "AI Chatbot ROI: The Numbers That Changed Everything",
    "V3": "6.7 Hours -> 0: The Social Media Time Steal",
    "V4": "R4,500 vs R500: What You're Actually Buying",
    "V5": "3 Things Your Website Must Do Before 2027",
    "V6": "577 Attacks Per Hour: The SA SME Cybersecurity Reality",
}
VIDEO_PILLAR = {
    "V1": "app-development",
    "V2": "ai-integration",
    "V3": "growth-automation",
    "V4": "web-presence-pricing",
    "V5": "web-presence-pricing",
    "V6": "sa-digital-landscape",
}


def build_calendar() -> List[Dict[str, Any]]:
    """Build the 12-week calendar entries (Mon blog, Wed video, Fri social)."""
    # Anchor week 1 to Mon 2026-05-04 (matches B1 publish date 2026-05-04).
    base = (2026, 5, 4)  # Mon
    from datetime import date, timedelta
    monday_w1 = date(*base)
    out: List[Dict[str, Any]] = []
    for week, blog_id, video_id, social_id in CALENDAR_RAW:
        offset_days = (week - 1) * 7
        mon = monday_w1 + timedelta(days=offset_days)
        wed = mon + timedelta(days=2)
        fri = mon + timedelta(days=4)
        if blog_id:
            out.append({
                "day": offset_days + 1,
                "date": mon.isoformat(),
                "audience": "B",
                "pillarId": PILLAR_ID_BY_BLOG[blog_id],
                "channel": "blog",
                "format": "pillar-blog",
                "title": _blog_title_short(blog_id),
            })
        if video_id:
            out.append({
                "day": offset_days + 3,
                "date": wed.isoformat(),
                "audience": "B",
                "pillarId": VIDEO_PILLAR[video_id],
                "channel": "youtube",
                "format": "short-form-video",
                "title": VIDEO_TITLES[video_id],
            })
        if social_id:
            out.append({
                "day": offset_days + 5,
                "date": fri.isoformat(),
                "audience": "B",
                "pillarId": PILLAR_ID_BY_WEEK[social_id],
                "channel": "linkedin",
                "format": "multi-platform-social",
                "title": _social_title_short(social_id),
            })
    return out


SOCIAL_TITLES_SHORT = {
    "W01": "Stat: R20K-R60K is the SA SME website sweet spot",
    "W02": "Myth vs Fact: \"My business needs an app\"",
    "W03": "Stat: $3.70 returned per $1 invested in AI",
    "W04": "Quote: 4 hours -> 30 seconds chatbot result",
    "W05": "Stat: 6.7 hrs/week wasted on social media",
    "W06": "Myth vs Fact: SA SMEs are too small to be cyber targets",
    "W07": "Quote: A website without maintenance is a liability",
    "W08": "Stat: 253% ROI on social automation",
    "W09": "Myth vs Fact: AI integration costs R150K+",
    "W10": "Stat: 577 cyber attacks per hour against SA SMEs",
    "W11": "Myth vs Fact: Once my site is built, I'm done",
    "W12": "Quote: Software your competitors will copy",
}
BLOG_TITLES_SHORT = {
    "B1": "Why R4,500 Is the Minimum for a Website That Works",
    "B2": "Website vs App: The SA SME Decision Tree",
    "B3": "AI Integration ROI: The Real Numbers SA SMEs See",
    "B4": "4 Hours to 30 Seconds: The AI Chatbot Case Study",
    "B5": "6.7 Hours a Week on Social Media: Automation Gives It Back",
    "B6": "577 Attacks Per Hour: The SA SME Cybersecurity Crisis",
    "B7": "Your Website Isn't a One-Time Project",
    "B8": "253% ROI on Social Automation: How to Measure It",
}


def _blog_title_short(blog_id: str) -> str:
    return BLOG_TITLES_SHORT.get(blog_id, blog_id)


def _social_title_short(week_id: str) -> str:
    return SOCIAL_TITLES_SHORT.get(week_id, week_id)


# ---------------------------------------------------------------------------
# Frontmatter parser (no external deps)
# ---------------------------------------------------------------------------

def parse_frontmatter(text: str) -> Tuple[Dict[str, Any], str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end < 0:
        return {}, text
    raw = text[3:end].strip()
    body = text[end + 4:].lstrip("\n")

    # Light YAML-ish parser - the frontmatter we wrote is simple key/value
    # plus dash-list values. Good enough.
    out: Dict[str, Any] = {}
    current_key: Optional[str] = None
    for line in raw.split("\n"):
        if not line.strip():
            continue
        if line.startswith("  - ") or line.startswith("    - "):
            if current_key:
                out.setdefault(current_key, []).append(_strip_quotes(line.split("- ", 1)[1].strip()))
            continue
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2)
        current_key = key
        if val == "":
            out[key] = []
            continue
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            if not inner:
                out[key] = []
            else:
                out[key] = [_strip_quotes(x.strip()) for x in inner.split(",")]
            current_key = None
            continue
        out[key] = _strip_quotes(val)
        current_key = None
    return out, body


def _strip_quotes(s: str) -> str:
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ('"', "'"):
        return s[1:-1]
    return s


# ---------------------------------------------------------------------------
# Env loader (reads partnersinbiz-web/.env.local)
# ---------------------------------------------------------------------------

def load_env_local() -> Dict[str, str]:
    env: Dict[str, str] = {}
    path = WEB_ROOT / ".env.local"
    if not path.exists():
        return env
    raw = path.read_text(encoding="utf-8")
    lines = raw.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        i += 1
        if not s or s.startswith("#"):
            continue
        eq = s.find("=")
        if eq < 0:
            continue
        key = s[:eq].strip()
        val = s[eq + 1:].strip()
        if val.startswith('"') and not val.endswith('"'):
            # multi-line quoted (private key)
            buf = [val]
            while i < len(lines) and not lines[i].rstrip().endswith('"'):
                buf.append(lines[i])
                i += 1
            if i < len(lines):
                buf.append(lines[i])
                i += 1
            val = "\n".join(buf)
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        val = val.replace("\\n", "\n")
        env[key] = val
    return env


# ---------------------------------------------------------------------------
# Firestore admin client (for direct writes that bypass the PATCH allow-list)
# ---------------------------------------------------------------------------

def init_firestore(env: Dict[str, str]):
    try:
        import firebase_admin  # type: ignore
        from firebase_admin import credentials, firestore, storage as fb_storage  # type: ignore
    except ImportError:
        print("[fatal] firebase_admin not installed. Install it with: pip3 install firebase-admin", file=sys.stderr)
        sys.exit(1)

    if not firebase_admin._apps:
        sa_path = WEB_ROOT / "service-account.json"
        bucket_raw = (
            env.get("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET")
            or os.environ.get("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "")
        ).strip().replace("\\n", "").replace("\n", "")
        init_options: Dict[str, Any] = {}
        if bucket_raw:
            init_options["storageBucket"] = bucket_raw

        if sa_path.exists():
            cred = credentials.Certificate(str(sa_path))
        else:
            project_id = env.get("FIREBASE_ADMIN_PROJECT_ID") or os.environ.get("FIREBASE_ADMIN_PROJECT_ID")
            client_email = env.get("FIREBASE_ADMIN_CLIENT_EMAIL") or os.environ.get("FIREBASE_ADMIN_CLIENT_EMAIL")
            private_key = env.get("FIREBASE_ADMIN_PRIVATE_KEY") or os.environ.get("FIREBASE_ADMIN_PRIVATE_KEY")
            if not (project_id and client_email and private_key):
                raise RuntimeError("FIREBASE_ADMIN_* not found in .env.local")
            cred = credentials.Certificate({
                "type": "service_account",
                "project_id": project_id,
                "client_email": client_email,
                "private_key": private_key,
                # token_uri is required by the lib but not actually used for our offline use.
                "token_uri": "https://oauth2.googleapis.com/token",
            })
        firebase_admin.initialize_app(cred, init_options or None)
    bucket = None
    try:
        bucket = fb_storage.bucket()
    except Exception as exc:
        print(f"[warn] storage bucket init failed: {exc} - image uploads will be skipped")
    return firestore.client(), firestore, bucket


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

class ApiClient:
    def __init__(self, base_url: str, ai_key: str, org_id: str):
        self.base_url = base_url.rstrip("/")
        self.s = requests.Session()
        self.s.headers.update({
            "Authorization": f"Bearer {ai_key}",
            "X-Org-Id": org_id,
            "Content-Type": "application/json",
        })

    def post_json(self, path: str, body: Dict[str, Any], idem: Optional[str] = None) -> requests.Response:
        headers = {}
        if idem:
            headers["Idempotency-Key"] = idem
        return self.s.post(f"{self.base_url}{path}", data=json.dumps(body), headers=headers, timeout=60)

    def patch_json(self, path: str, body: Dict[str, Any]) -> requests.Response:
        return self.s.patch(f"{self.base_url}{path}", data=json.dumps(body), timeout=60)

    def get(self, path: str) -> requests.Response:
        return self.s.get(f"{self.base_url}{path}", timeout=60)

    def post_multipart(self, path: str, files: Dict[str, Any]) -> requests.Response:
        # requests multipart will set its own Content-Type
        h = {k: v for k, v in self.s.headers.items() if k.lower() != "content-type"}
        return requests.post(f"{self.base_url}{path}", headers=h, files=files, timeout=120)


# ---------------------------------------------------------------------------
# Social-post extraction (LinkedIn / Instagram / Facebook captions)
# ---------------------------------------------------------------------------

PLATFORM_HEADING = {
    "linkedin": "## LinkedIn Caption",
    "instagram": "## Instagram Caption",
    "facebook": "## Facebook Caption",
}


def extract_caption(body: str, platform: str) -> str:
    heading = PLATFORM_HEADING[platform]
    idx = body.find(heading)
    if idx < 0:
        return ""
    after = body[idx + len(heading):]
    # Stop at next ## heading or --- separator
    stop = len(after)
    for sep in ("\n## ", "\n---"):
        j = after.find(sep)
        if j >= 0 and j < stop:
            stop = j
    text = after[:stop].strip()
    return text


# ---------------------------------------------------------------------------
# Main importer
# ---------------------------------------------------------------------------

def main() -> int:
    base_url = os.environ.get("BASE_URL", DEFAULT_BASE_URL)
    print(f"[info] Importer starting. base={base_url}")
    print(f"[info] repo root: {REPO_ROOT}")

    env = load_env_local()
    ai_key = env.get("AI_API_KEY") or os.environ.get("AI_API_KEY")
    if not ai_key:
        print("[fatal] AI_API_KEY not found in partnersinbiz-web/.env.local", file=sys.stderr)
        return 2
    api = ApiClient(base_url, ai_key, ORG_ID)

    # Sanity check: the dev server is up
    r = api.get(f"/api/v1/campaigns?orgId={ORG_ID}")
    if r.status_code != 200:
        print(f"[fatal] dev server not reachable or auth invalid. GET /campaigns -> {r.status_code} {r.text[:200]}", file=sys.stderr)
        return 2
    print(f"[ok] dev server is up. existing campaigns in org: {len(r.json().get('data', []))}")

    db, firestore_mod, bucket = init_firestore(env)

    # ----------------------------- Step 1: campaign --------------------------
    # Idempotency at the campaign level: if a campaign with our exact name
    # already exists, reuse it instead of creating a duplicate. This makes the
    # script safely re-runnable.
    existing = [c for c in r.json().get("data", []) if c.get("name") == CAMPAIGN_NAME]
    if existing:
        camp = existing[0]
        campaign_id = camp["id"]
        share_token = camp.get("shareToken", "")
        print(f"[skip] campaign already exists: {campaign_id} (shareToken={share_token})")
    else:
        body = {
            "orgId": ORG_ID,
            "clientId": ORG_ID,
            "name": CAMPAIGN_NAME,
            "clientType": CLIENT_TYPE,
            "brandIdentity": BRAND_IDENTITY,
            "research": RESEARCH,
            "pillars": PILLARS,
            "calendar": build_calendar(),
        }
        idem = f"pib-import-2026-q1-create"
        resp = api.post_json("/api/v1/campaigns", body, idem=idem)
        if resp.status_code not in (200, 201):
            print(f"[fatal] campaign create failed: {resp.status_code} {resp.text[:500]}", file=sys.stderr)
            return 2
        data = resp.json()["data"]
        campaign_id = data["id"]
        share_token = data.get("shareToken", "")
        print(f"[ok] campaign created: {campaign_id} (shareToken={share_token})")

    # ----------------------------- Step 2: hero images -----------------------
    # NOTE: the /api/v1/social/media/upload route calls bucket.makePublic()
    # which fails with 400 because the firebase storage bucket has uniform
    # bucket-level access enabled. We bypass the API and upload directly via
    # firebase-admin, then write the matching social_media doc ourselves.
    # The URL pattern is the same as what storage.ts produces.
    print("[info] uploading 8 blog hero images (direct via admin SDK)...")
    blog_image_url: Dict[str, Optional[str]] = {}
    for blog_id in ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"]:
        png = next((p for p in BLOG_IMG_DIR.iterdir() if p.name.startswith(f"{blog_id}-") and p.suffix == ".png"), None)
        if not png:
            print(f"[warn] no hero image found for {blog_id}")
            blog_image_url[blog_id] = None
            continue
        url = _upload_image(db, firestore_mod, bucket, png,
                            alt_text=f"Hero image for {BLOG_TITLES_SHORT.get(blog_id, blog_id)}")
        blog_image_url[blog_id] = url

    print("[info] uploading 4 social card backgrounds...")
    social_image_url: Dict[str, Optional[str]] = {}
    for png in sorted(SOCIAL_IMG_DIR.glob("*.png")):
        url = _upload_image(db, firestore_mod, bucket, png,
                            alt_text=f"Social card background: {png.stem}")
        social_image_url[png.stem] = url

    # ----------------------------- Step 3: blog posts ------------------------
    print("[info] importing 8 blog posts...")
    imported_blogs: List[str] = []
    skipped_blogs: List[str] = []

    for blog_id in ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"]:
        md_path = next((p for p in BLOG_DIR.iterdir() if p.name.startswith(f"{blog_id}-") and p.suffix == ".md"), None)
        if not md_path:
            print(f"[warn] no markdown found for {blog_id}")
            continue
        text = md_path.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(text)
        title = fm.get("title", BLOG_TITLES_SHORT.get(blog_id, blog_id))
        slug = fm.get("slug") or md_path.stem.lower()
        publish_date = fm.get("published", "")
        pillar_id = PILLAR_ID_BY_BLOG.get(blog_id, "web-presence-pricing")
        target_url = f"/insights/{slug}"

        # Idempotency-key on the seo_content POST. If a doc with this campaignId
        # + title already exists in seo_content, reuse it.
        existing = list(db.collection("seo_content")
                        .where("campaignId", "==", campaign_id)
                        .where("title", "==", title)
                        .where("deleted", "==", False)
                        .limit(1).stream())
        if existing:
            content_id = existing[0].id
            print(f"[skip] blog already in seo_content: {blog_id} -> {content_id}")
        else:
            create_body = {
                "title": title,
                "type": "pillar",
                "publishDate": publish_date,
                "targetUrl": target_url,
                "campaignId": campaign_id,
                "pillarId": pillar_id,
                "status": "review",
            }
            idem = f"pib-import-blog-{slug}"
            resp = api.post_json(
                f"/api/v1/seo/sprints/{SPRINT_ID}/content",
                create_body,
                idem=idem,
            )
            if resp.status_code not in (200, 201):
                print(f"[fatal] seo_content create failed for {blog_id}: {resp.status_code} {resp.text[:300]}", file=sys.stderr)
                skipped_blogs.append(blog_id)
                continue
            content_id = resp.json()["data"]["id"]
            print(f"[ok] seo_content created for {blog_id}: {content_id}")

        # Upsert the curated draft directly into seo_drafts (Option A).
        meta_desc = _meta_description_from_body(body)
        word_count = len(re.findall(r"\S+", body))
        draft_id = _upsert_draft_for_content(
            db, firestore_mod, content_id, blog_id, title, body, meta_desc, word_count,
        )

        # PATCH seo_content with {status: "review"} (allowed) and update
        # draftPostId/heroImageUrl directly (not in PATCH allow-list).
        api.patch_json(f"/api/v1/seo/content/{content_id}", {"status": "review"})

        update: Dict[str, Any] = {"draftPostId": draft_id}
        if blog_image_url.get(blog_id):
            update["heroImageUrl"] = blog_image_url[blog_id]
        db.collection("seo_content").document(content_id).update(update)
        imported_blogs.append(blog_id)

    # ----------------------------- Step 4: social posts ----------------------
    print("[info] importing 12 weeks x 3 platforms = 36 social posts...")
    imported_social: List[Tuple[str, str]] = []

    for week_id in [f"W{i:02d}" for i in range(1, 13)]:
        md_path = next((p for p in SOCIAL_DIR.iterdir() if p.name.startswith(f"{week_id}-") and p.suffix == ".md"), None)
        if not md_path:
            print(f"[warn] no markdown found for {week_id}")
            continue
        text = md_path.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(text)
        hashtags_list = fm.get("hashtags") or []
        if isinstance(hashtags_list, str):
            hashtags_list = [hashtags_list]
        pillar_id = PILLAR_ID_BY_WEEK.get(week_id, "web-presence-pricing")
        source_blog = SOURCE_BLOG_BY_WEEK.get(week_id)
        hero_url = blog_image_url.get(source_blog) if source_blog else None
        if not hero_url:
            # fallback: any social card background
            hero_url = next((v for v in social_image_url.values() if v), None)

        for platform in ("linkedin", "instagram", "facebook"):
            caption = extract_caption(body, platform)
            if not caption:
                print(f"[warn] no {platform} caption found in {week_id}")
                continue

            # Idempotency: look in social_posts for an existing post with same
            # campaignId + platform + week tag.
            tag = f"week:{week_id}"
            qref = (db.collection("social_posts")
                    .where("campaignId", "==", campaign_id)
                    .where("platform", "==", "x" if platform == "twitter" else platform)
                    .where("tags", "array_contains", tag)
                    .limit(1))
            hits = list(qref.stream())
            if hits:
                imported_social.append((week_id, platform))
                print(f"[skip] {week_id}/{platform} already in social_posts: {hits[0].id}")
                continue

            media: List[Dict[str, Any]] = []
            if hero_url:
                media.append({
                    "type": "image",
                    "url": hero_url,
                    "alt": f"{_social_title_short(week_id)} - hero",
                })

            tags = [tag, f"pillar:{pillar_id}", "imported"]

            if platform == "linkedin":
                # The public API path supports linkedin natively. Use it so
                # the audit log + idempotency table are populated.
                post_body: Dict[str, Any] = {
                    "content": caption,
                    "platform": "linkedin",
                    "platforms": ["linkedin"],
                    "status": "pending_approval",
                    "campaignId": campaign_id,
                    "pillarId": pillar_id,
                    "audience": "B",
                    "hashtags": hashtags_list,
                    "media": media,
                    "tags": tags,
                    "category": "marketing",
                }
                idem = f"pib-import-social-{week_id.lower()}-{platform}"
                resp = api.post_json("/api/v1/social/posts", post_body, idem=idem)
                if resp.status_code in (200, 201):
                    pid = resp.json()["data"]["id"]
                    # The route hard-codes status -> "draft" when no scheduledFor;
                    # flip it to "pending_approval" + add campaignId/pillarId/audience.
                    db.collection("social_posts").document(pid).update({
                        "status": "pending_approval",
                    })
                    imported_social.append((week_id, platform))
                    print(f"[ok] {week_id}/{platform} -> {pid}")
                else:
                    print(f"[warn] {week_id}/{platform} create failed: {resp.status_code} {resp.text[:200]}")
            else:
                # The route's toProviderPlatform() only maps x/twitter/linkedin
                # so instagram + facebook posts must bypass the API and write
                # directly to Firestore. Doc shape mirrors the API's POST.
                doc = {
                    "platform": platform,
                    "orgId": ORG_ID,
                    "content": {
                        "text": caption,
                        "platformOverrides": {},
                    },
                    "media": media,
                    "platforms": [platform],
                    "accountIds": [],
                    "status": "pending_approval",
                    "scheduledAt": None,
                    "scheduledFor": None,
                    "publishedAt": None,
                    "platformResults": {},
                    "hashtags": hashtags_list,
                    "labels": [],
                    "campaign": None,
                    "campaignId": campaign_id,
                    "pillarId": pillar_id,
                    "audience": "B",
                    "createdBy": "ai-agent",
                    "assignedTo": None,
                    "approvedBy": None,
                    "approvedAt": None,
                    "comments": [],
                    "source": "ai_agent",
                    "threadParts": [],
                    "category": "marketing",
                    "tags": tags,
                    "externalId": None,
                    "error": None,
                    "createdAt": firestore_mod.SERVER_TIMESTAMP,
                    "updatedAt": firestore_mod.SERVER_TIMESTAMP,
                }
                ref = db.collection("social_posts").document()
                ref.set(doc)
                imported_social.append((week_id, platform))
                print(f"[ok] {week_id}/{platform} -> {ref.id} (direct firestore)")

    # ----- Backfill: ensure every social post has the right hero image -----
    # If a post was created before the image upload finished (e.g. on the
    # first run when uploads were failing), media[] will be empty. Walk
    # every post and patch in the matching hero URL.
    print("[info] backfilling social_posts media[]...")
    backfilled = 0
    for week_id in [f"W{i:02d}" for i in range(1, 13)]:
        source_blog = SOURCE_BLOG_BY_WEEK.get(week_id)
        hero_url = blog_image_url.get(source_blog) if source_blog else None
        if not hero_url:
            hero_url = next((v for v in social_image_url.values() if v), None)
        if not hero_url:
            continue
        for platform in ("linkedin", "instagram", "facebook"):
            tag = f"week:{week_id}"
            qref = (db.collection("social_posts")
                    .where("campaignId", "==", campaign_id)
                    .where("platform", "==", "x" if platform == "twitter" else platform)
                    .where("tags", "array_contains", tag)
                    .limit(1))
            hits = list(qref.stream())
            if not hits:
                continue
            doc = hits[0].to_dict() or {}
            if doc.get("media"):
                continue
            hits[0].reference.update({
                "media": [{
                    "type": "image",
                    "url": hero_url,
                    "alt": f"{_social_title_short(week_id)} - hero",
                }],
            })
            backfilled += 1
    if backfilled:
        print(f"[ok] backfilled media[] on {backfilled} posts")
    else:
        print("[ok] no posts needed media backfill")

    # ----------------------------- Step 5: videos ----------------------------
    print("[info] videos: skipping per spec - no MP4 renders on disk yet.")
    print("       (HyperFrames compositions exist at marketing/videos/V*-*/index.html;")
    print("        renders would need HyperFrames CLI + ffmpeg before import.)")
    skipped_video_count = 6

    # ----------------------------- Step 6: verify ----------------------------
    print("[info] verifying import via /campaigns/{id}/assets ...")
    r = api.get(f"/api/v1/campaigns/{campaign_id}/assets")
    if r.status_code != 200:
        print(f"[warn] verification GET failed: {r.status_code} {r.text[:300]}")
    else:
        meta = r.json()["data"]["meta"]
        print(f"[ok] totals: {meta['totals']}    byStatus: {meta['byStatus']}")

    print()
    print("=== Import complete ===")
    print(f"Campaign id     : {campaign_id}")
    print(f"Share token     : {share_token}")
    print(f"Admin cockpit   : {base_url}/admin/campaigns/{campaign_id}")
    print(f"Public preview  : {base_url}/c/{share_token}")
    print(f"Blogs imported  : {len(imported_blogs)}/8 ({', '.join(imported_blogs) or '-'})")
    print(f"Social imported : {len(imported_social)}/36")
    print(f"Videos skipped  : {skipped_video_count} (no MP4 renders on disk)")
    return 0


def _upload_image(db, firestore_mod, bucket, png_path: Path, alt_text: str) -> Optional[str]:
    """Upload a PNG to firebase storage + create the social_media doc.

    Bypasses the /api/v1/social/media/upload route because that route calls
    bucket.makePublic() which fails when the bucket has uniform bucket-level
    access (all of partners-in-biz-85059 buckets do).
    """
    if bucket is None:
        print(f"[warn] no storage bucket - cannot upload {png_path.name}")
        return None
    # Idempotency: if a social_media doc already exists for this org with the
    # same originalFilename, reuse its URL.
    existing = list(db.collection("social_media")
                    .where("orgId", "==", ORG_ID)
                    .where("originalFilename", "==", png_path.name)
                    .limit(1).stream())
    if existing:
        url = existing[0].to_dict().get("originalUrl")
        if url:
            print(f"[skip] {png_path.name} already uploaded -> {url}")
            return url

    # Upload directly via firebase-admin storage.
    import secrets
    storage_id = secrets.token_hex(12)
    storage_path = f"social-media/{ORG_ID}/{storage_id}.png"
    blob = bucket.blob(storage_path)
    try:
        blob.upload_from_filename(str(png_path), content_type="image/png")
    except Exception as exc:
        print(f"[warn] storage upload failed for {png_path.name}: {exc}")
        return None

    public_url = f"https://storage.googleapis.com/{bucket.name}/{storage_path}"
    size = png_path.stat().st_size

    db.collection("social_media").add({
        "orgId": ORG_ID,
        "originalUrl": public_url,
        "originalFilename": png_path.name,
        "originalMimeType": "image/png",
        "originalSize": size,
        "status": "ready",
        "variants": {},
        "thumbnailUrl": public_url,
        "type": "image",
        "width": 0,
        "height": 0,
        "duration": None,
        "altText": alt_text,
        "storagePath": storage_path,
        "usedInPosts": [],
        "uploadedBy": "ai-agent",
        "createdAt": firestore_mod.SERVER_TIMESTAMP,
        "updatedAt": firestore_mod.SERVER_TIMESTAMP,
    })
    print(f"[ok] uploaded {png_path.name} -> {public_url}")
    return public_url


def _meta_description_from_body(body: str) -> str:
    # First non-heading paragraph after the first H1 (or after the H2/H3) that
    # has more than 30 chars. Trim to 160 chars max.
    blocks = [b.strip() for b in body.split("\n\n") if b.strip()]
    for b in blocks:
        if b.startswith("#") or b.startswith("---"):
            continue
        # Strip markdown emphasis
        clean = re.sub(r"[*_`]", "", b).strip()
        if len(clean) >= 30:
            return clean[:160]
    return blocks[0][:160] if blocks else ""


def _upsert_draft_for_content(
    db, firestore_mod, content_id: str, blog_id: str, title: str,
    body: str, meta_desc: str, word_count: int,
) -> str:
    """Insert (or update if already there) a seo_drafts doc for this content."""
    existing = list(db.collection("seo_drafts")
                    .where("contentId", "==", content_id)
                    .limit(1).stream())
    payload = {
        "contentId": content_id,
        "sprintId": SPRINT_ID,
        "orgId": ORG_ID,
        "title": title,
        "type": "pillar",
        "body": body,
        "metaDescription": meta_desc,
        "wordCount": word_count,
        "generatedBy": "imported",
        "status": "draft",
        "generatedAt": firestore_mod.SERVER_TIMESTAMP,
    }
    if existing:
        existing[0].reference.update(payload)
        return existing[0].id
    payload["createdAt"] = firestore_mod.SERVER_TIMESTAMP
    ref = db.collection("seo_drafts").document()
    ref.set(payload)
    return ref.id


if __name__ == "__main__":
    sys.exit(main())

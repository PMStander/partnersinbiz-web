# Phase 5 — Video Production

After the parallel writing wave, the 6 video composers each produced an `index.html` HyperFrames composition. This phase renders them to MP4, adds custom music, and produces the multi-format cuts.

## Step 1 — Lint and patch each composition

The video-composer agents will sometimes produce HTML that fails HyperFrames lint. Fix proactively before rendering:

```bash
cd <workspace>/marketing/videos
for d in V1-* V2-* V3-* V4-* V5-* V6-*; do
  # Rename composition.html → index.html if needed
  [ -f "$d/composition.html" ] && mv "$d/composition.html" "$d/index.html"

  # Add class="scene clip" to scenes (the clip class enables timing-based visibility)
  python3 -c "
s = open('$d/index.html').read()
if 'class=\"scene clip\"' not in s:
    s = s.replace('<div class=\"scene\"', '<div class=\"scene clip\"')
open('$d/index.html','w').write(s)
"

  # If the root composition is missing data-start/data-duration, add them
  # (lint will flag this — check `hyperframes lint $d` and patch if needed)

  hyperframes lint "$d" | tail -3
done
```

## Step 2 — Render in parallel

```bash
cd <workspace>/marketing/videos

mix() {
  v=$1
  hyperframes render "$v" -o "$v/$v.mp4" -w 2 --quiet
}

mix V1-... &
mix V2-... &
mix V3-... &
mix V4-... &
mix V5-... &
mix V6-... &
wait
```

Each render takes ~30–60 seconds. With `-w 2` (two workers per render) and 6 renders in parallel, the whole batch completes in ~2–3 minutes.

## Step 3 — Generate the music

```bash
cd <workspace>/marketing/videos
mkdir -p audio
cp ~/.claude/skills/client-content-engine/scripts/generate-underscore.py audio/
cd audio
python3 generate-underscore.py
ffmpeg -y -i ahs-underscore.wav -c:a libmp3lame -b:a 192k ahs-underscore.mp3
```

The default track is **Cmaj7 → Am7 → Fmaj7 → G7sus4 → Cmaj7** at 90 BPM with piano arpeggio. It's deliberately neutral / corporate-warm so it works for any service business. If the user wants a different mood:

| Mood request | Adjust generate-underscore.py |
|---|---|
| "More somber" / "more serious" | Change PROGRESSION to use Am7 → Fmaj7 → Em7 → Am7 (minor key) |
| "More upbeat" | Increase BPM to 110, double the arpeggio density |
| "Less busy" | Halve the arpeggio note count (use quarter notes instead of eighths) |
| "More cinematic" | Slow BPM to 70, lengthen LFO period to 0.05 Hz |

The script is fully parameterised at the top — change the chord progression, BPM, or instrument mix and re-run.

## Step 4 — Mux music into videos

```bash
cd <workspace>/marketing/videos

mix() {
  v=$1; total=$2; fade_start=$((total - 2))
  ffmpeg -y -i "$v/$v.mp4" -i audio/ahs-underscore.mp3 \
    -filter_complex "[1:a]volume=0.4,afade=t=in:st=0:d=2,afade=t=out:st=${fade_start}:d=2[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "$v/$v-music.mp4"
}
# Pass each video's exact duration (from the composition's data-duration)
mix V1-landlord-cant-do 32 &
mix V2-police-stop 35 &
mix V3-debt-jail-myth 30 &
mix V4-earnings-threshold 30 &
mix V5-both-parents-pay 32 &
mix V6-popia-permissions 35 &
wait

# Promote music versions to primary, keep silent as backup
for v in V1-* V2-* V3-* V4-* V5-* V6-*; do
  mv "$v/${v##*/}.mp4" "$v/${v##*/}-silent.mp4"
  mv "$v/${v##*/}-music.mp4" "$v/${v##*/}.mp4"
done
```

Music sits at -8dB (`volume=0.4`) — quiet enough to leave room for any future voiceover. 2-second fade-in and fade-out at the start/end of each video avoid abrupt cuts.

## Step 5 — Multi-format cuts

For each video, produce two extra formats: 16:9 horizontal for YouTube and 15s vertical for Stories.

```bash
cd <workspace>/marketing/videos
mkdir -p youtube stories

yt() {
  v=$1
  ffmpeg -y -i "$v/$v.mp4" -filter_complex "
    [0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=25:5,setsar=1[bg];
    [0:v]scale=-2:1080[fg];
    [bg][fg]overlay=(W-w)/2:0,format=yuv420p[v]
  " -map "[v]" -map 0:a -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k "youtube/$v-youtube-16x9.mp4"
}

story() {
  v=$1
  ffmpeg -y -i "$v/$v.mp4" -t 15 \
    -vf "fade=t=out:st=14:d=1" \
    -af "afade=t=out:st=14:d=1" \
    -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k "stories/$v-stories-15s.mp4"
}

for v in V1-* V2-* V3-* V4-* V5-* V6-*; do
  yt "$v" &
  story "$v" &
done
wait
```

The YouTube version uses a **blurred-background fill** trick — the vertical content sits centered on a 1920×1080 canvas with a blurred copy of itself filling the sides. Looks intentional, not letterboxed. Same trick Instagram uses for portrait posts on the feed.

The Stories version is the first 15 seconds with a 1-second fade-out at the end so the next slide loads cleanly.

## Format use cases (tell the user)

| Format | File | Use for |
|---|---|---|
| Vertical full | `V*/V*.mp4` (1080×1920, 30–35s) | Reels, TikTok, Facebook Reels, YouTube Shorts |
| Horizontal | `youtube/V*-youtube-16x9.mp4` (1920×1080, full length) | YouTube main feed, LinkedIn feed, website embed |
| Stories | `stories/V*-stories-15s.mp4` (1080×1920, 15s) | Instagram Stories, Facebook Stories, WhatsApp Status |

Same clip, three formats — every distribution channel covered without re-laying out the composition.

## Common HyperFrames gotchas (from real production)

| Symptom | Cause | Fix |
|---|---|---|
| Lint: "no composition found" | File named `composition.html` | Rename to `index.html` |
| Scenes visible all the time | Missing `class="clip"` | Use `class="scene clip"` not `class="scene"` |
| "root composition missing data-start" warning | Root div has no timing | Add `data-start="0" data-duration="N"` |
| Render fails / black screen | Tween timing exceeds composition duration | Check the GSAP timeline doesn't reference times beyond `data-duration` |
| Doctor warns "memory low" | Mac with 8GB RAM | Render with `-w 2` instead of `-w auto` (caps Chrome workers) |

## Time budget

Phase 5 should take **30–45 minutes**:
- Lint + patch: 5 min
- Render: 5 min wall-clock (parallel)
- Music gen: 1 min
- Music mux: 5 min wall-clock (parallel)
- Multi-format cuts: 10 min wall-clock (parallel)
- Promote files + verify: 5 min

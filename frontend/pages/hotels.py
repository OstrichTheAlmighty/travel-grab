import streamlit as st
import streamlit.components.v1 as components

from analytics import posthog_client_script


_TABLER = "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"

_HTML = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="{tabler}">
<style>
html,body{{margin:0;padding:0;background:#07090f;}}
*{{box-sizing:border-box;margin:0;padding:0}}
.hotels{{background:#07090f;color:#e4e6f0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif;padding:28px 32px 56px}}
.eyebrow{{font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:8px}}
.title{{font-size:28px;font-weight:800;letter-spacing:-.8px;color:#fff;margin-bottom:6px}}
.meta{{display:flex;gap:10px;flex-wrap:wrap;color:rgba(255,255,255,.4);font-size:13px;margin-bottom:28px}}
.section-label{{font-size:12px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:rgba(255,255,255,.3);margin:26px 0 14px;display:flex;align-items:center;gap:8px}}
.section-label::after{{content:'';flex:1;height:.5px;background:rgba(255,255,255,.07)}}
.grid{{display:flex;flex-direction:column;gap:12px}}
.card{{border-radius:16px;border:.5px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);overflow:hidden;transition:border-color .15s,background .15s}}
.card:hover{{border-color:rgba(99,102,241,.28);background:rgba(99,102,241,.035)}}
.card.selected{{border-color:rgba(99,102,241,.45);background:rgba(99,102,241,.06)}}
.inner{{display:flex;gap:0}}
.image{{width:150px;min-height:168px;flex-shrink:0;position:relative;background-size:cover;background-position:center}}
.image::after{{content:'';position:absolute;inset:0;background:linear-gradient(to right,transparent 55%,rgba(7,9,15,.45))}}
.tier{{position:absolute;top:12px;left:12px;font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:4px 9px;border-radius:6px;z-index:1}}
.body{{flex:1;padding:18px;min-width:0}}
.top{{display:flex;justify-content:space-between;gap:14px;margin-bottom:8px}}
.name{{font-size:16px;font-weight:800;color:#fff;line-height:1.25}}
.area{{font-size:12px;color:rgba(255,255,255,.38);margin-top:3px}}
.price{{text-align:right;flex-shrink:0}}
.amount{{font-size:22px;font-weight:850;color:#fff;letter-spacing:-.6px}}
.sub{{font-size:10px;color:rgba(255,255,255,.32);margin-top:2px}}
.tags{{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}}
.tag{{font-size:10px;font-weight:600;padding:3px 8px;border-radius:5px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.55)}}
.note{{font-size:12px;line-height:1.55;color:rgba(255,255,255,.42);margin-top:8px}}
.footer{{display:flex;justify-content:space-between;align-items:center;border-top:.5px solid rgba(255,255,255,.06);padding-top:10px;margin-top:12px}}
.ai{{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#a5b4fc}}
.dot{{width:5px;height:5px;border-radius:50%;background:#6366f1}}
.btn{{font-size:11px;font-weight:700;padding:7px 13px;border-radius:8px;border:.5px solid rgba(99,102,241,.35);background:rgba(99,102,241,.10);color:#a5b4fc}}
.verify{{margin-top:20px;padding:14px 16px;border-radius:13px;border:.5px solid rgba(251,191,36,.18);background:rgba(251,191,36,.045);color:rgba(255,255,255,.55);font-size:12px;line-height:1.55}}
@media(max-width:720px){{.inner{{flex-direction:column}}.image{{width:100%;min-height:150px}}.top{{flex-direction:column}}.price{{text-align:left}}}}
</style>
</head>
<body>
<div class="hotels">
  <div class="eyebrow">Hotels</div>
  <div class="title">Where to stay</div>
  <div class="meta">
    <span><i class="ti ti-calendar"></i> Oct 14 – Oct 24, 2025</span>
    <span>·</span>
    <span><i class="ti ti-users"></i> 3 travelers</span>
    <span>·</span>
    <span><i class="ti ti-map-pin"></i> Tokyo + Kyoto</span>
  </div>

  <div class="section-label">Tokyo stays</div>
  <div class="grid">
    <div class="card">
      <div class="inner">
        <div class="image" style="background:linear-gradient(135deg,#0d2818 0%,#1a4a2e 50%,#0a3020 100%)"><div class="tier" style="background:rgba(52,211,153,.18);color:#6ee7b7">Budget</div></div>
        <div class="body">
          <div class="top"><div><div class="name">Book and Bed Tokyo Shinjuku</div><div class="area">Shinjuku · capsule concept hotel</div></div><div class="price"><div class="amount">$58</div><div class="sub">per night</div></div></div>
          <div class="tags"><span class="tag">Capsule</span><span class="tag">Central</span><span class="tag">Unique</span></div>
          <div class="note">A memorable low-cost option for travelers who want location and design more than room size.</div>
          <div class="footer"><div class="ai"><div class="dot"></div>Best budget swap</div><div class="btn">Select</div></div>
        </div>
      </div>
    </div>
    <div class="card selected">
      <div class="inner">
        <div class="image" style="background:linear-gradient(135deg,#0f1a35 0%,#1a2550 50%,#0d1535 100%)"><div class="tier" style="background:rgba(99,102,241,.22);color:#c7d2fe">Standard</div></div>
        <div class="body">
          <div class="top"><div><div class="name">Andaz Tokyo Toranomon Hills</div><div class="area">Toranomon · skyline views</div></div><div class="price"><div class="amount">$455</div><div class="sub">per night</div></div></div>
          <div class="tags"><span class="tag">5-star</span><span class="tag">Transit access</span><span class="tag">City view</span></div>
          <div class="note">Premium but practical for the Tokyo portion: central, polished, and easy to route from.</div>
          <div class="footer"><div class="ai"><div class="dot"></div>Selected stay</div><div class="btn">Selected</div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="section-label">Kyoto stays</div>
  <div class="grid">
    <div class="card selected">
      <div class="inner">
        <div class="image" style="background:linear-gradient(135deg,#0a1a10 0%,#1a3020 50%,#0d2018 100%)"><div class="tier" style="background:rgba(99,102,241,.22);color:#c7d2fe">Standard</div></div>
        <div class="body">
          <div class="top"><div><div class="name">Ryokan-style stay near Gion</div><div class="area">Gion / Higashiyama · walkable temples</div></div><div class="price"><div class="amount">$235</div><div class="sub">per night</div></div></div>
          <div class="tags"><span class="tag">Ryokan feel</span><span class="tag">Breakfast</span><span class="tag">Walkable</span></div>
          <div class="note">Balances atmosphere and cost without jumping to ultra-luxury ryokan pricing.</div>
          <div class="footer"><div class="ai"><div class="dot"></div>Best Kyoto fit</div><div class="btn">Selected</div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="verify">Hotel prices are planning placeholders. Verify live nightly rates before booking.</div>
</div>
</body>
</html>"""


def render():
    html = _HTML.format(tabler=_TABLER)
    html = html.replace(
        "</body>",
        posthog_client_script("hotels")
        + """
<script>
document.addEventListener('click', function(event) {
  var button = event.target.closest('.btn');
  if (!button) return;
  var card = button.closest('.card');
  byableTrack('hotel_selected', {
    hotel: card && card.querySelector('.name') ? card.querySelector('.name').textContent.trim() : 'Unknown hotel',
    price: card && card.querySelector('.amount') ? card.querySelector('.amount').textContent.trim() : null,
    page_name: 'hotels'
  });
});
</script>
</body>""",
    )
    components.html(html, height=1350, scrolling=True)

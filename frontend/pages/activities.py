import streamlit as st
import streamlit.components.v1 as components

from analytics import posthog_client_script

_TABLER = "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"

_HTML = r"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="{tabler}">
<style>
html,body{margin:0;padding:0;background:#07090f;}
*{box-sizing:border-box;margin:0;padding:0}
.ac-root{background:#07090f;color:#e4e6f0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif;padding:0 0 60px}
.ac-header{padding:28px 28px 0}
.ac-eyebrow{font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:8px}
.ac-title{font-size:28px;font-weight:800;letter-spacing:-.8px;color:#fff;margin-bottom:6px}
.ac-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:20px}
.ac-meta-item{display:flex;align-items:center;gap:5px;font-size:13px;color:rgba(255,255,255,.4)}
.filters-bar{padding:0 28px;margin-bottom:20px}
.filter-row{display:flex;gap:7px;overflow-x:auto;padding-bottom:4px}
.filter-row::-webkit-scrollbar{display:none}
.f-chip{flex-shrink:0;display:flex;align-items:center;gap:5px;padding:7px 14px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;border:0.5px solid rgba(255,255,255,.08);color:rgba(255,255,255,.45);background:transparent;transition:all .15s}
.f-chip:hover{border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.75)}
.f-chip.active{background:rgba(99,102,241,.15);border-color:rgba(99,102,241,.45);color:#c7d2fe}
.f-chip i{font-size:13px}
.f-chip.cat-food.active{background:rgba(251,146,60,.12);border-color:rgba(251,146,60,.35);color:#fdba74}
.f-chip.cat-night.active{background:rgba(139,92,246,.12);border-color:rgba(139,92,246,.35);color:#c4b5fd}
.f-chip.cat-culture.active{background:rgba(99,102,241,.15);border-color:rgba(99,102,241,.4);color:#c7d2fe}
.f-chip.cat-adventure.active{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.3);color:#fca5a5}
.f-chip.cat-nature.active{background:rgba(52,211,153,.1);border-color:rgba(52,211,153,.3);color:#6ee7b7}
.f-chip.cat-luxury.active{background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.3);color:#fde68a}
.sort-row{display:flex;align-items:center;justify-content:space-between;padding:0 28px;margin-bottom:16px}
.sort-label{font-size:12px;color:rgba(255,255,255,.3)}
.sort-pills{display:flex;gap:6px}
.sort-pill{font-size:11px;font-weight:500;padding:5px 11px;border-radius:7px;cursor:pointer;border:0.5px solid rgba(255,255,255,.08);color:rgba(255,255,255,.4)}
.sort-pill.active{background:rgba(99,102,241,.12);border-color:rgba(99,102,241,.35);color:#a5b4fc}
.masonry{padding:0 28px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.acard{border-radius:16px;overflow:hidden;border:0.5px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);cursor:pointer;transition:border-color .15s}
.acard:hover{border-color:rgba(99,102,241,.3)}
.acard.span2{grid-column:1/-1}
.acard-img{position:relative;overflow:hidden}
.img-bg{width:100%;display:block;background-size:cover;background-position:center}
.img-gradient{position:absolute;inset:0;background:linear-gradient(to top,rgba(7,9,15,.9) 0%,rgba(7,9,15,.2) 50%,transparent 100%)}
.img-top-badges{position:absolute;top:10px;left:10px;display:flex;gap:5px;flex-wrap:wrap}
.img-top-right{position:absolute;top:10px;right:10px;display:flex;gap:5px}
.badge{font-size:9px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:3px 8px;border-radius:5px}
.badge-gem{background:rgba(52,211,153,.2);color:#34d399;border:0.5px solid rgba(52,211,153,.3)}
.badge-splurge{background:rgba(251,191,36,.18);color:#fbbf24;border:0.5px solid rgba(251,191,36,.3)}
.badge-ai{background:rgba(99,102,241,.2);color:#a5b4fc;border:0.5px solid rgba(99,102,241,.3)}
.badge-pop{background:rgba(239,68,68,.15);color:#fca5a5;border:0.5px solid rgba(239,68,68,.25)}
.badge-free{background:rgba(52,211,153,.12);color:#34d399}
.save-btn{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(7,9,15,.6);border:0.5px solid rgba(255,255,255,.15);color:rgba(255,255,255,.5);font-size:14px;cursor:pointer;transition:all .15s}
.save-btn:hover,.save-btn.saved{background:rgba(239,68,68,.2);border-color:rgba(239,68,68,.4);color:#f87171}
.acard-body{padding:12px 14px 14px}
.ac-cat-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}
.ac-cat{font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase}
.ac-match{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600}
.match-ring{width:28px;height:28px;flex-shrink:0}
.ac-name{font-size:14px;font-weight:700;line-height:1.3;margin-bottom:5px}
.ac-name-lg{font-size:16px;font-weight:800;letter-spacing:-.2px}
.ac-sub{font-size:12px;color:rgba(255,255,255,.38);line-height:1.5;margin-bottom:8px}
.ac-details-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}
.ac-detail{display:flex;align-items:center;gap:4px;font-size:11px;color:rgba(255,255,255,.4)}
.ac-detail i{font-size:12px}
.ac-price{font-size:14px;font-weight:700}
.ac-chips{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}
.ac-chip{font-size:10px;padding:2px 7px;border-radius:4px;font-weight:500}
.ai-snip{background:rgba(99,102,241,.06);border:0.5px solid rgba(99,102,241,.18);border-radius:8px;padding:8px 10px;margin-top:8px;display:none}
.ai-snip.visible{display:block}
.ai-snip-top{display:flex;align-items:center;gap:5px;margin-bottom:4px}
.ai-snip-dot{width:5px;height:5px;border-radius:50%;background:#6366f1;animation:blink 1.8s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
.ai-snip-label{font-size:10px;font-weight:600;color:#818cf8;letter-spacing:.4px;text-transform:uppercase}
.ai-snip-text{font-size:11px;color:rgba(255,255,255,.4);line-height:1.6}
.ac-footer{display:flex;align-items:center;justify-content:space-between;border-top:0.5px solid rgba(255,255,255,.06);padding-top:8px;margin-top:2px}
.ac-add-btn{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:6px 12px;border-radius:7px;border:0.5px solid rgba(99,102,241,.35);background:rgba(99,102,241,.1);color:#a5b4fc;cursor:pointer}
.ac-add-btn:hover{background:rgba(99,102,241,.2)}
.ac-add-btn.added{background:rgba(52,211,153,.1);border-color:rgba(52,211,153,.3);color:#34d399}
.ac-expand-btn{font-size:11px;color:rgba(255,255,255,.3);cursor:pointer;display:flex;align-items:center;gap:3px}
.ac-expand-btn:hover{color:rgba(255,255,255,.6)}
.map-strip{margin:20px 28px 0;border-radius:14px;height:80px;background:linear-gradient(135deg,#0d1a2e 0%,#0f2040 60%,#0a1520 100%);border:0.5px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer}
.map-strip:hover{border-color:rgba(99,102,241,.3)}
.map-strip i{font-size:18px;color:rgba(255,255,255,.2)}
.map-strip-text{font-size:13px;color:rgba(255,255,255,.25)}
.map-strip-count{font-size:11px;padding:3px 9px;border-radius:6px;background:rgba(99,102,241,.15);border:0.5px solid rgba(99,102,241,.25);color:#a5b4fc}
.chip-food{background:rgba(251,146,60,.1);color:#fdba74}
.chip-night{background:rgba(139,92,246,.1);color:#c4b5fd}
.chip-culture{background:rgba(99,102,241,.1);color:#c7d2fe}
.chip-adv{background:rgba(239,68,68,.08);color:#fca5a5}
.chip-nature{background:rgba(52,211,153,.08);color:#6ee7b7}
.chip-luxury{background:rgba(251,191,36,.08);color:#fde68a}
.chip-free{background:rgba(52,211,153,.1);color:#34d399}
.chip-ai{background:rgba(99,102,241,.15);color:#a5b4fc}
</style>
</head>
<body>
<div class="ac-root">

<div class="ac-header">
  <div class="ac-eyebrow">Activities</div>
  <div class="ac-title">Things to do in Tokyo</div>
  <div class="ac-meta">
    <div class="ac-meta-item"><i class="ti ti-sparkles" aria-hidden="true"></i>140 experiences curated for you</div>
    <div class="ac-meta-item" style="color:rgba(255,255,255,.2)">·</div>
    <div class="ac-meta-item"><i class="ti ti-calendar" aria-hidden="true"></i>Oct 14 – 18 in Tokyo</div>
    <div class="ac-meta-item" style="color:rgba(255,255,255,.2)">·</div>
    <div class="ac-meta-item"><i class="ti ti-users" aria-hidden="true"></i>3 travelers</div>
  </div>
</div>

<div class="filters-bar">
  <div class="filter-row">
    <div class="f-chip active" onclick="setFilter(this)"><i class="ti ti-adjustments-horizontal" aria-hidden="true"></i>All</div>
    <div class="f-chip cat-food" onclick="setFilter(this)"><i class="ti ti-tools-kitchen-2" aria-hidden="true"></i>Food</div>
    <div class="f-chip cat-night" onclick="setFilter(this)"><i class="ti ti-moon" aria-hidden="true"></i>Nightlife</div>
    <div class="f-chip cat-culture" onclick="setFilter(this)"><i class="ti ti-building-arch" aria-hidden="true"></i>Culture</div>
    <div class="f-chip cat-adventure" onclick="setFilter(this)"><i class="ti ti-ripple" aria-hidden="true"></i>Adventure</div>
    <div class="f-chip cat-nature" onclick="setFilter(this)"><i class="ti ti-tree" aria-hidden="true"></i>Nature</div>
    <div class="f-chip cat-luxury" onclick="setFilter(this)"><i class="ti ti-crown" aria-hidden="true"></i>Luxury</div>
    <div class="f-chip" onclick="setFilter(this)" style="border-color:rgba(52,211,153,.2);color:rgba(52,211,153,.6)"><i class="ti ti-map-pin" aria-hidden="true"></i>Hidden gems</div>
    <div class="f-chip" onclick="setFilter(this)"><i class="ti ti-coin" aria-hidden="true"></i>Free</div>
  </div>
</div>

<div class="sort-row">
  <span class="sort-label">18 results · sorted by</span>
  <div class="sort-pills">
    <div class="sort-pill active">Match score</div>
    <div class="sort-pill" onclick="setSortPill(this)">Price</div>
    <div class="sort-pill" onclick="setSortPill(this)">Duration</div>
    <div class="sort-pill" onclick="setSortPill(this)">Distance</div>
  </div>
</div>

<div class="masonry">

  <div class="acard span2">
    <div class="acard-img">
      <div class="img-bg" style="height:190px;background:linear-gradient(135deg,#1a0a30 0%,#2d1060 40%,#0f2040 80%,#1a0520 100%)">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:64px;opacity:.25">🌌</div>
      </div>
      <div class="img-gradient"></div>
      <div class="img-top-badges">
        <span class="badge badge-splurge">Worth the splurge</span>
        <span class="badge badge-ai">AI #1 pick</span>
      </div>
      <div class="img-top-right">
        <div class="save-btn" onclick="toggleSave(this)"><i class="ti ti-heart" aria-hidden="true"></i></div>
      </div>
    </div>
    <div class="acard-body">
      <div class="ac-cat-row">
        <span class="ac-cat" style="color:#c4b5fd">Culture · Art</span>
        <div class="ac-match">
          <svg class="match-ring" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="3"/><circle cx="14" cy="14" r="11" fill="none" stroke="#818cf8" stroke-width="3" stroke-dasharray="69.1" stroke-dashoffset="6.9" stroke-linecap="round" transform="rotate(-90 14 14)"/><text x="14" y="18" text-anchor="middle" font-size="8" font-weight="700" fill="#a5b4fc">98</text></svg>
          <span style="font-size:11px;color:#a5b4fc">match</span>
        </div>
      </div>
      <div class="ac-name ac-name-lg">TeamLab Planets · Toyosu</div>
      <div class="ac-sub">Walk through rooms of infinite light, wade through mirror-still water gardens, and become part of digital art that reacts to your movement. The most memorable 2 hours in Tokyo.</div>
      <div class="ac-details-row">
        <div class="ac-detail"><i class="ti ti-clock" aria-hidden="true"></i>2 – 2.5 hours</div>
        <div class="ac-detail"><i class="ti ti-map-pin" aria-hidden="true"></i>Toyosu · 18 min from Shinjuku</div>
        <div class="ac-detail"><i class="ti ti-users" aria-hidden="true"></i>Pre-booking required</div>
      </div>
      <div class="ac-chips">
        <span class="ac-chip chip-culture">Immersive art</span>
        <span class="ac-chip chip-luxury">Premium</span>
        <span class="ac-chip chip-ai">Sells out fast</span>
      </div>
      <div class="ai-snip visible">
        <div class="ai-snip-top"><div class="ai-snip-dot"></div><span class="ai-snip-label">Why Byable picked this</span></div>
        <div class="ai-snip-text">Based on your interest in design and photography, TeamLab scores highest of any Tokyo experience. The water rooms are uniquely photogenic — go at opening (9am) to have them nearly to yourself.</div>
      </div>
      <div class="ac-footer">
        <div class="ac-price" style="color:#fff">¥3,200 <span style="font-size:11px;color:rgba(255,255,255,.35);font-weight:400">pp · ~$22</span></div>
        <div style="display:flex;gap:7px">
          <div class="ac-expand-btn" onclick="toggleSnip(this)"><i class="ti ti-chevron-up" aria-hidden="true"></i>Less</div>
          <div class="ac-add-btn" onclick="toggleAdd(this)"><i class="ti ti-plus" aria-hidden="true"></i>Add to day 2</div>
        </div>
      </div>
    </div>
  </div>

  <div class="acard">
    <div class="acard-img">
      <div class="img-bg" style="height:130px;background:linear-gradient(135deg,#1a0a08 0%,#3a1a10 50%,#5a2a18 100%)">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:48px;opacity:.3">🍣</div>
      </div>
      <div class="img-gradient"></div>
      <div class="img-top-badges"><span class="badge badge-splurge">Worth the splurge</span></div>
      <div class="img-top-right"><div class="save-btn saved" onclick="toggleSave(this)"><i class="ti ti-heart" aria-hidden="true"></i></div></div>
    </div>
    <div class="acard-body">
      <div class="ac-cat-row">
        <span class="ac-cat" style="color:#fdba74">Food</span>
        <div class="ac-match">
          <svg class="match-ring" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="3"/><circle cx="14" cy="14" r="11" fill="none" stroke="#f59e0b" stroke-width="3" stroke-dasharray="69.1" stroke-dashoffset="7.6" stroke-linecap="round" transform="rotate(-90 14 14)"/><text x="14" y="18" text-anchor="middle" font-size="8" font-weight="700" fill="#fbbf24">97</text></svg>
        </div>
      </div>
      <div class="ac-name">Tsukiji Outer Market at dawn</div>
      <div class="ac-sub">Tuna breakfast, fresh uni on rice, tamagoyaki sticks. Arrive before 7am.</div>
      <div class="ac-details-row">
        <div class="ac-detail"><i class="ti ti-clock" aria-hidden="true"></i>1.5 hrs</div>
        <div class="ac-detail"><i class="ti ti-coin" aria-hidden="true"></i>~¥3,000</div>
      </div>
      <div class="ac-chips">
        <span class="ac-chip chip-food">Market</span>
        <span class="ac-chip chip-ai">AI top pick</span>
      </div>
      <div class="ai-snip">
        <div class="ai-snip-top"><div class="ai-snip-dot"></div><span class="ai-snip-label">AI reasoning</span></div>
        <div class="ai-snip-text">Tsukiji is where Tokyo chefs shop. The outer market stays lively year-round. Go early — stalls start closing by 10am.</div>
      </div>
      <div class="ac-footer">
        <div class="ac-price" style="color:#34d399">~$20 <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,.3)">pp</span></div>
        <div style="display:flex;gap:6px">
          <div class="ac-expand-btn" onclick="toggleSnip(this)"><i class="ti ti-chevron-down" aria-hidden="true"></i>Why</div>
          <div class="ac-add-btn" onclick="toggleAdd(this)"><i class="ti ti-plus" aria-hidden="true"></i>Add</div>
        </div>
      </div>
    </div>
  </div>

  <div class="acard">
    <div class="acard-img">
      <div class="img-bg" style="height:130px;background:linear-gradient(135deg,#0a1a08 0%,#1a3010 50%,#2a4818 100%)">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:48px;opacity:.3">⛩️</div>
      </div>
      <div class="img-gradient"></div>
      <div class="img-top-badges">
        <span class="badge badge-gem">Hidden gem</span>
        <span class="badge badge-free">Free</span>
      </div>
      <div class="img-top-right"><div class="save-btn" onclick="toggleSave(this)"><i class="ti ti-heart" aria-hidden="true"></i></div></div>
    </div>
    <div class="acard-body">
      <div class="ac-cat-row">
        <span class="ac-cat" style="color:#6ee7b7">Nature · Culture</span>
        <div class="ac-match">
          <svg class="match-ring" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="3"/><circle cx="14" cy="14" r="11" fill="none" stroke="#34d399" stroke-width="3" stroke-dasharray="69.1" stroke-dashoffset="10.4" stroke-linecap="round" transform="rotate(-90 14 14)"/><text x="14" y="18" text-anchor="middle" font-size="8" font-weight="700" fill="#34d399">85</text></svg>
        </div>
      </div>
      <div class="ac-name">Meiji Shrine at sunrise</div>
      <div class="ac-sub">Ancient cedar forest path. Empty before 7am — a completely different experience.</div>
      <div class="ac-details-row">
        <div class="ac-detail"><i class="ti ti-clock" aria-hidden="true"></i>1 – 2 hrs</div>
        <div class="ac-detail"><i class="ti ti-sun" aria-hidden="true"></i>Best at 6am</div>
      </div>
      <div class="ac-chips">
        <span class="ac-chip chip-free">Free entry</span>
        <span class="ac-chip chip-nature">Shrine</span>
      </div>
      <div class="ai-snip">
        <div class="ai-snip-top"><div class="ai-snip-dot"></div><span class="ai-snip-label">AI reasoning</span></div>
        <div class="ai-snip-text">Most visitors come at 10am+. Before 7am, you share the forested path with almost no one. The light through the cedars is cinematic.</div>
      </div>
      <div class="ac-footer">
        <div class="ac-price" style="color:#34d399">Free</div>
        <div style="display:flex;gap:6px">
          <div class="ac-expand-btn" onclick="toggleSnip(this)"><i class="ti ti-chevron-down" aria-hidden="true"></i>Why</div>
          <div class="ac-add-btn" onclick="toggleAdd(this)"><i class="ti ti-plus" aria-hidden="true"></i>Add</div>
        </div>
      </div>
    </div>
  </div>

  <div class="acard span2">
    <div class="acard-img">
      <div class="img-bg" style="height:160px;background:linear-gradient(135deg,#1a0825 0%,#2d0a3a 40%,#150518 80%)">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:56px;opacity:.25">🥃</div>
      </div>
      <div class="img-gradient"></div>
      <div class="img-top-badges">
        <span class="badge badge-gem">Hidden gem</span>
        <span class="badge" style="background:rgba(139,92,246,.2);color:#c4b5fd;border:0.5px solid rgba(139,92,246,.3)">Local only</span>
      </div>
      <div class="img-top-right"><div class="save-btn" onclick="toggleSave(this)"><i class="ti ti-heart" aria-hidden="true"></i></div></div>
    </div>
    <div class="acard-body">
      <div class="ac-cat-row">
        <span class="ac-cat" style="color:#c4b5fd">Nightlife</span>
        <div class="ac-match">
          <svg class="match-ring" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="3"/><circle cx="14" cy="14" r="11" fill="none" stroke="#8b5cf6" stroke-width="3" stroke-dasharray="69.1" stroke-dashoffset="8.3" stroke-linecap="round" transform="rotate(-90 14 14)"/><text x="14" y="18" text-anchor="middle" font-size="8" font-weight="700" fill="#c4b5fd">94</text></svg>
          <span style="font-size:11px;color:#c4b5fd">match</span>
        </div>
      </div>
      <div class="ac-name ac-name-lg">Golden Gai bar crawl · Shinjuku</div>
      <div class="ac-sub">200+ tiny bars packed into six alleyways, each with its own theme, owner, and 5-stool personality. Bar Benfiddich is the crown jewel — the bartender grows his own herbs on the roof.</div>
      <div class="ac-details-row">
        <div class="ac-detail"><i class="ti ti-clock" aria-hidden="true"></i>2 – 4 hours</div>
        <div class="ac-detail"><i class="ti ti-map-pin" aria-hidden="true"></i>Shinjuku · 5 min walk from station</div>
        <div class="ac-detail"><i class="ti ti-moon" aria-hidden="true"></i>Best after 9pm</div>
      </div>
      <div class="ac-chips">
        <span class="ac-chip chip-night">Bar crawl</span>
        <span class="ac-chip" style="background:rgba(139,92,246,.1);color:#c4b5fd">Cash only</span>
        <span class="ac-chip chip-ai">AI insider</span>
      </div>
      <div class="ai-snip visible">
        <div class="ai-snip-top"><div class="ai-snip-dot"></div><span class="ai-snip-label">Why Byable picked this</span></div>
        <div class="ai-snip-text">Golden Gai is the most authentic nightlife experience in Tokyo — zero tourist-trap energy. Tip: if a bar has an entrance fee listed on the door (¥500–1,000), it's usually the best one on that alley. Bar Benfiddich has no sign — look for the narrow staircase in alley 6.</div>
      </div>
      <div class="ac-footer">
        <div class="ac-price" style="color:#fff">~¥3,500 <span style="font-size:11px;color:rgba(255,255,255,.35);font-weight:400">per drink</span></div>
        <div style="display:flex;gap:7px">
          <div class="ac-expand-btn" onclick="toggleSnip(this)"><i class="ti ti-chevron-up" aria-hidden="true"></i>Less</div>
          <div class="ac-add-btn" onclick="toggleAdd(this)"><i class="ti ti-plus" aria-hidden="true"></i>Add to day 2</div>
        </div>
      </div>
    </div>
  </div>

  <div class="acard">
    <div class="acard-img">
      <div class="img-bg" style="height:120px;background:linear-gradient(135deg,#0d1525 0%,#1a2545 50%,#0f1a35 100%)">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:44px;opacity:.3">🏙</div>
      </div>
      <div class="img-gradient"></div>
      <div class="img-top-badges"><span class="badge badge-pop">Popular</span></div>
      <div class="img-top-right"><div class="save-btn" onclick="toggleSave(this)"><i class="ti ti-heart" aria-hidden="true"></i></div></div>
    </div>
    <div class="acard-body">
      <div class="ac-cat-row">
        <span class="ac-cat" style="color:#c7d2fe">Culture</span>
        <div class="ac-match">
          <svg class="match-ring" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="3"/><circle cx="14" cy="14" r="11" fill="none" stroke="#6366f1" stroke-width="3" stroke-dasharray="69.1" stroke-dashoffset="12.4" stroke-linecap="round" transform="rotate(-90 14 14)"/><text x="14" y="18" text-anchor="middle" font-size="8" font-weight="700" fill="#a5b4fc">82</text></svg>
        </div>
      </div>
      <div class="ac-name">Shibuya Sky observation deck</div>
      <div class="ac-sub">360° rooftop above the scramble crossing. Golden hour is peak.</div>
      <div class="ac-details-row">
        <div class="ac-detail"><i class="ti ti-clock" aria-hidden="true"></i>1 hr</div>
        <div class="ac-detail"><i class="ti ti-coin" aria-hidden="true"></i>¥2,000</div>
      </div>
      <div class="ac-chips"><span class="ac-chip chip-culture">Views</span></div>
      <div class="ai-snip">
        <div class="ai-snip-top"><div class="ai-snip-dot"></div><span class="ai-snip-label">AI reasoning</span></div>
        <div class="ai-snip-text">Combine with the scramble crossing below — see it from street level first, then ascend for the aerial perspective.</div>
      </div>
      <div class="ac-footer">
        <div class="ac-price" style="color:#a5b4fc">¥2,000</div>
        <div style="display:flex;gap:6px">
          <div class="ac-expand-btn" onclick="toggleSnip(this)"><i class="ti ti-chevron-down" aria-hidden="true"></i>Why</div>
          <div class="ac-add-btn" onclick="toggleAdd(this)"><i class="ti ti-plus" aria-hidden="true"></i>Add</div>
        </div>
      </div>
    </div>
  </div>

  <div class="acard">
    <div class="acard-img">
      <div class="img-bg" style="height:120px;background:linear-gradient(135deg,#200a08 0%,#401510 50%,#5a2018 100%)">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:44px;opacity:.3">♨️</div>
      </div>
      <div class="img-gradient"></div>
      <div class="img-top-badges"><span class="badge badge-splurge">Worth the splurge</span></div>
      <div class="img-top-right"><div class="save-btn" onclick="toggleSave(this)"><i class="ti ti-heart" aria-hidden="true"></i></div></div>
    </div>
    <div class="acard-body">
      <div class="ac-cat-row">
        <span class="ac-cat" style="color:#fde68a">Luxury</span>
        <div class="ac-match">
          <svg class="match-ring" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="3"/><circle cx="14" cy="14" r="11" fill="none" stroke="#f59e0b" stroke-width="3" stroke-dasharray="69.1" stroke-dashoffset="11.1" stroke-linecap="round" transform="rotate(-90 14 14)"/><text x="14" y="18" text-anchor="middle" font-size="8" font-weight="700" fill="#fbbf24">84</text></svg>
        </div>
      </div>
      <div class="ac-name">Hakone onsen day trip</div>
      <div class="ac-sub">Ryokan day-use hot springs with Mt. Fuji views. Takes a full day — worth it.</div>
      <div class="ac-details-row">
        <div class="ac-detail"><i class="ti ti-clock" aria-hidden="true"></i>Full day</div>
        <div class="ac-detail"><i class="ti ti-train" aria-hidden="true"></i>90 min from Shinjuku</div>
      </div>
      <div class="ac-chips">
        <span class="ac-chip chip-luxury">Onsen</span>
        <span class="ac-chip chip-nature">Mt. Fuji</span>
      </div>
      <div class="ai-snip">
        <div class="ai-snip-top"><div class="ai-snip-dot"></div><span class="ai-snip-label">AI reasoning</span></div>
        <div class="ai-snip-text">Hakone is the highest-rated single-day excursion from Tokyo. Book the Hakone Free Pass for unlimited transport.</div>
      </div>
      <div class="ac-footer">
        <div class="ac-price" style="color:#fbbf24">¥8,800</div>
        <div style="display:flex;gap:6px">
          <div class="ac-expand-btn" onclick="toggleSnip(this)"><i class="ti ti-chevron-down" aria-hidden="true"></i>Why</div>
          <div class="ac-add-btn" onclick="toggleAdd(this)"><i class="ti ti-plus" aria-hidden="true"></i>Add</div>
        </div>
      </div>
    </div>
  </div>

  <div class="acard span2">
    <div class="acard-img">
      <div class="img-bg" style="height:150px;background:linear-gradient(135deg,#0a1808 0%,#183020 50%,#0a2010 100%)">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:56px;opacity:.25">🎋</div>
      </div>
      <div class="img-gradient"></div>
      <div class="img-top-badges">
        <span class="badge badge-gem">Hidden gem</span>
        <span class="badge badge-free">Free</span>
      </div>
      <div class="img-top-right"><div class="save-btn" onclick="toggleSave(this)"><i class="ti ti-heart" aria-hidden="true"></i></div></div>
    </div>
    <div class="acard-body">
      <div class="ac-cat-row">
        <span class="ac-cat" style="color:#6ee7b7">Nature</span>
        <div class="ac-match">
          <svg class="match-ring" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="3"/><circle cx="14" cy="14" r="11" fill="none" stroke="#34d399" stroke-width="3" stroke-dasharray="69.1" stroke-dashoffset="9" stroke-linecap="round" transform="rotate(-90 14 14)"/><text x="14" y="18" text-anchor="middle" font-size="8" font-weight="700" fill="#34d399">91</text></svg>
          <span style="font-size:11px;color:#34d399">match</span>
        </div>
      </div>
      <div class="ac-name ac-name-lg">Arashiyama Bamboo Grove · Kyoto</div>
      <div class="ac-sub">Towering bamboo stalks filter the morning light into something otherworldly. The path to Okochi Sanso villa beyond the main grove is where it gets truly quiet.</div>
      <div class="ac-details-row">
        <div class="ac-detail"><i class="ti ti-clock" aria-hidden="true"></i>2 – 3 hours</div>
        <div class="ac-detail"><i class="ti ti-map-pin" aria-hidden="true"></i>Arashiyama · Kyoto</div>
        <div class="ac-detail"><i class="ti ti-sun" aria-hidden="true"></i>Best before 7:30am</div>
      </div>
      <div class="ac-chips">
        <span class="ac-chip chip-free">Free path</span>
        <span class="ac-chip chip-nature">Bamboo</span>
        <span class="ac-chip chip-ai">Morning only</span>
      </div>
      <div class="ai-snip visible">
        <div class="ai-snip-top"><div class="ai-snip-dot"></div><span class="ai-snip-label">Why Byable picked this</span></div>
        <div class="ai-snip-text">The main path gets extremely crowded by 9am. Going at sunrise transforms it completely — the light through the canopy is a photographer's dream, and you'll hear the bamboo creak in the wind rather than tourist chatter. Pair it with Tenryu-ji garden (¥500) directly adjacent.</div>
      </div>
      <div class="ac-footer">
        <div class="ac-price" style="color:#34d399">Free</div>
        <div style="display:flex;gap:7px">
          <div class="ac-expand-btn" onclick="toggleSnip(this)"><i class="ti ti-chevron-up" aria-hidden="true"></i>Less</div>
          <div class="ac-add-btn" onclick="toggleAdd(this)"><i class="ti ti-plus" aria-hidden="true"></i>Add to day 6</div>
        </div>
      </div>
    </div>
  </div>

</div>

<div class="map-strip">
  <i class="ti ti-map-2" aria-hidden="true"></i>
  <span class="map-strip-text">View all 18 saved activities on map</span>
  <span class="map-strip-count">18 pinned</span>
</div>

</div>

<script>
function setFilter(el){
  document.querySelectorAll('.f-chip').forEach(function(c){c.classList.remove('active')});
  el.classList.add('active');
}
function setSortPill(el){
  document.querySelectorAll('.sort-pill').forEach(function(c){c.classList.remove('active')});
  el.classList.add('active');
}
function toggleSave(btn){btn.classList.toggle('saved');}
function toggleSnip(btn){
  var card=btn.closest('.acard-body');
  var snip=card.querySelector('.ai-snip');
  var icon=btn.querySelector('i');
  var label=btn.childNodes[1];
  if(snip){
    snip.classList.toggle('visible');
    if(snip.classList.contains('visible')){
      icon.className='ti ti-chevron-up';
      if(label) label.textContent=' Less';
    } else {
      icon.className='ti ti-chevron-down';
      if(label) label.textContent=' Why';
    }
  }
}
function toggleAdd(btn){
  btn.classList.toggle('added');
  var icon=btn.querySelector('i');
  if(btn.classList.contains('added')){
    icon.className='ti ti-check';
    btn.childNodes[1].textContent=' Added';
  } else {
    icon.className='ti ti-plus';
    btn.childNodes[1].textContent=' Add';
  }
}
</script>
</body>
</html>"""


def render():
    html = _HTML.replace("{tabler}", _TABLER)
    html = html.replace(
        "</body>",
        posthog_client_script("activities")
        + """
<script>
document.addEventListener('click', function(event) {
  var button = event.target.closest('.ac-add-btn');
  if (!button) return;
  var card = button.closest('.acard');
  byableTrack('activity_selected', {
    activity: card && card.querySelector('.ac-name') ? card.querySelector('.ac-name').textContent.trim() : 'Unknown activity',
    price: card && card.querySelector('.ac-price') ? card.querySelector('.ac-price').textContent.trim() : null,
    page_name: 'activities'
  });
});
</script>
</body>""",
    )
    components.html(html, height=3200, scrolling=True)

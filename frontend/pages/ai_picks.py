import streamlit as st
import streamlit.components.v1 as components

_TABLER = "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"

_HTML = r"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="{tabler}">
<style>
html,body{margin:0;padding:0;background:#07090f;}
*{box-sizing:border-box;margin:0;padding:0}
.ap{background:#07090f;color:#e4e6f0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif;padding:0 0 40px}
.ap-header{padding:24px 24px 0;display:flex;align-items:flex-start;justify-content:space-between}
.ap-left .eyebrow{font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:6px}
.ap-left .title{font-size:24px;font-weight:800;letter-spacing:-.6px;color:#fff;margin-bottom:4px}
.ap-left .sub{font-size:13px;color:rgba(255,255,255,.35)}
.ai-live{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;background:rgba(99,102,241,.1);border:0.5px solid rgba(99,102,241,.25);font-size:11px;font-weight:600;color:#a5b4fc}
.ai-dot{width:6px;height:6px;border-radius:50%;background:#6366f1;animation:pulse 1.6s infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}
.mood-bar{padding:16px 24px 0;display:flex;gap:7px;overflow-x:auto}
.mood-bar::-webkit-scrollbar{display:none}
.mood-pill{flex-shrink:0;display:flex;align-items:center;gap:5px;padding:7px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:0.5px solid rgba(255,255,255,.08);color:rgba(255,255,255,.4);transition:all .2s}
.mood-pill.active{transform:scale(1.04)}
.mp-adv.active{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.35);color:#fca5a5}
.mp-relax.active{background:rgba(52,211,153,.1);border-color:rgba(52,211,153,.3);color:#6ee7b7}
.mp-food.active{background:rgba(251,146,60,.12);border-color:rgba(251,146,60,.35);color:#fdba74}
.mp-night.active{background:rgba(139,92,246,.12);border-color:rgba(139,92,246,.35);color:#c4b5fd}
.mp-lux.active{background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.3);color:#fde68a}
.deck-area{padding:20px 24px 0;position:relative}
.deck-label{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.deck-label-left{font-size:12px;color:rgba(255,255,255,.3)}
.deck-counter{font-size:12px;font-weight:600;color:rgba(255,255,255,.4)}
.card-stack{position:relative;height:420px;margin-bottom:16px}
.swipe-card{position:absolute;inset:0;border-radius:20px;overflow:hidden;cursor:grab;user-select:none;transition:transform .35s cubic-bezier(.34,1.56,.64,1),opacity .3s}
.swipe-card.behind1{transform:scale(.96) translateY(8px);z-index:1;pointer-events:none}
.swipe-card.behind2{transform:scale(.92) translateY(16px);z-index:0;pointer-events:none}
.swipe-card.front{z-index:3}
.swipe-card.exiting-right{transform:translateX(140%) rotate(18deg)!important;opacity:0;transition:transform .38s ease-in,opacity .3s}
.swipe-card.exiting-left{transform:translateX(-140%) rotate(-18deg)!important;opacity:0;transition:transform .38s ease-in,opacity .3s}
.card-bg{position:absolute;inset:0;background-size:cover;background-position:center}
.card-scrim{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.92) 0%,rgba(0,0,0,.4) 45%,rgba(0,0,0,.1) 100%)}
.card-top{position:absolute;top:0;left:0;right:0;padding:16px 16px 0;display:flex;align-items:flex-start;justify-content:space-between}
.card-body{position:absolute;bottom:0;left:0;right:0;padding:20px}
.match-ring-wrap{position:relative;width:52px;height:52px;flex-shrink:0}
.match-ring-wrap svg{width:52px;height:52px}
.match-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.match-pct{font-size:14px;font-weight:800;color:#fff;line-height:1}
.match-lbl{font-size:8px;color:rgba(255,255,255,.5);margin-top:1px}
.card-badges{display:flex;flex-direction:column;gap:5px;align-items:flex-end}
.cbadge{font-size:9px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:3px 8px;border-radius:5px}
.card-mood-pills{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}
.cmp{font-size:10px;font-weight:600;padding:3px 8px;border-radius:12px}
.card-name{font-size:22px;font-weight:800;letter-spacing:-.5px;color:#fff;line-height:1.15;margin-bottom:5px}
.card-loc{display:flex;align-items:center;gap:4px;font-size:12px;color:rgba(255,255,255,.5);margin-bottom:10px}
.card-loc i{font-size:13px}
.card-why{background:rgba(99,102,241,.15);border:0.5px solid rgba(99,102,241,.25);border-radius:10px;padding:10px 12px;margin-bottom:12px}
.cw-top{display:flex;align-items:center;gap:5px;margin-bottom:4px}
.cw-dot{width:5px;height:5px;border-radius:50%;background:#6366f1;animation:pulse 1.8s infinite}
.cw-label{font-size:10px;font-weight:600;color:#818cf8;letter-spacing:.4px;text-transform:uppercase}
.cw-text{font-size:12px;color:rgba(255,255,255,.55);line-height:1.55}
.card-stats{display:flex;gap:14px;margin-bottom:14px}
.cs-item{display:flex;align-items:center;gap:5px;font-size:12px;color:rgba(255,255,255,.45)}
.cs-item i{font-size:13px}
.cs-val{font-weight:600;color:rgba(255,255,255,.75)}
.budget-compat{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:9px;background:rgba(255,255,255,.04);border:0.5px solid rgba(255,255,255,.07)}
.bc-label{font-size:11px;color:rgba(255,255,255,.35);flex-shrink:0}
.bc-bar{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.08)}
.bc-fill{height:3px;border-radius:2px}
.bc-val{font-size:12px;font-weight:700;flex-shrink:0}
.action-row{display:flex;align-items:center;justify-content:center;gap:14px}
.act-btn{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer}
.act-circle{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;border:0.5px solid rgba(255,255,255,.12);transition:transform .15s,background .15s}
.act-circle:hover{transform:scale(1.1)}
.act-circle:active{transform:scale(.95)}
.act-label{font-size:10px;color:rgba(255,255,255,.3);font-weight:500}
.btn-skip{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.25);color:#f87171}
.btn-skip:hover{background:rgba(239,68,68,.18)}
.btn-save{background:rgba(99,102,241,.1);border-color:rgba(99,102,241,.3);color:#a5b4fc}
.btn-save:hover{background:rgba(99,102,241,.22)}
.btn-add{background:rgba(52,211,153,.1);border-color:rgba(52,211,153,.3);color:#34d399}
.btn-add:hover{background:rgba(52,211,153,.22)}
.btn-super{background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.3);color:#fbbf24}
.btn-super:hover{background:rgba(251,191,36,.2)}
.feed-section{padding:24px 24px 0}
.feed-label{font-size:12px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:rgba(255,255,255,.25);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.feed-label::after{content:'';flex:1;height:.5px;background:rgba(255,255,255,.07)}
.feed-items{display:flex;flex-direction:column;gap:8px}
.feed-card{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;border:0.5px solid rgba(255,255,255,.07);background:rgba(255,255,255,.02);cursor:pointer;transition:border-color .15s}
.feed-card:hover{border-color:rgba(99,102,241,.3);background:rgba(99,102,241,.04)}
.feed-img{width:52px;height:52px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px}
.feed-info{flex:1;min-width:0}
.feed-name{font-size:13px;font-weight:700;margin-bottom:2px}
.feed-sub{font-size:11px;color:rgba(255,255,255,.35);line-height:1.4}
.feed-right{display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.feed-match{font-size:12px;font-weight:700}
.feed-price{font-size:11px;color:rgba(255,255,255,.35)}
.feed-save{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:0.5px solid rgba(255,255,255,.1);color:rgba(255,255,255,.3);cursor:pointer;font-size:13px}
.feed-save:hover,.feed-save.saved{border-color:rgba(239,68,68,.4);color:#f87171;background:rgba(239,68,68,.1)}
.hint-row{display:flex;align-items:center;justify-content:center;gap:6px;padding:14px 0 0;font-size:11px;color:rgba(255,255,255,.2)}
.hint-row i{font-size:13px}
</style>
</head>
<body>

<div class="ap">

<div class="ap-header">
  <div class="ap-left">
    <div class="eyebrow">AI Picks</div>
    <div class="title">Your discovery feed</div>
    <div class="sub">Curated from 140 Tokyo experiences · updating live</div>
  </div>
  <div class="ai-live"><div class="ai-dot"></div>AI active</div>
</div>

<div class="mood-bar">
  <div class="mood-pill mp-adv active" onclick="setMood(this)"><i class="ti ti-bolt" style="font-size:13px" aria-hidden="true"></i>Adventurous</div>
  <div class="mood-pill mp-relax" onclick="setMood(this)"><i class="ti ti-leaf" style="font-size:13px" aria-hidden="true"></i>Relaxing</div>
  <div class="mood-pill mp-food" onclick="setMood(this)"><i class="ti ti-tools-kitchen-2" style="font-size:13px" aria-hidden="true"></i>Foodie</div>
  <div class="mood-pill mp-night" onclick="setMood(this)"><i class="ti ti-moon" style="font-size:13px" aria-hidden="true"></i>Nightlife</div>
  <div class="mood-pill mp-lux" onclick="setMood(this)"><i class="ti ti-crown" style="font-size:13px" aria-hidden="true"></i>Luxury</div>
</div>

<div class="deck-area">
  <div class="deck-label">
    <span class="deck-label-left">Swipe right to save · left to skip</span>
    <span class="deck-counter" id="deck-counter">6 remaining</span>
  </div>

  <div class="card-stack" id="card-stack">

    <div class="swipe-card behind2" id="sc3" style="z-index:1">
      <div class="card-bg" style="background:linear-gradient(135deg,#0a1a08 0%,#1a3a10 60%,#0d2810 100%)"></div>
      <div class="card-scrim"></div>
    </div>

    <div class="swipe-card behind1" id="sc2" style="z-index:2">
      <div class="card-bg" style="background:linear-gradient(135deg,#200818 0%,#3a1030 60%,#180820 100%)"></div>
      <div class="card-scrim"></div>
    </div>

    <div class="swipe-card front" id="sc1">
      <div class="card-bg" style="background:linear-gradient(135deg,#0d1525 0%,#1a2545 40%,#0a3040 80%,#101a30 100%)">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:120px;opacity:.15">🌌</div>
      </div>
      <div class="card-scrim"></div>

      <div class="card-top">
        <div class="match-ring-wrap">
          <svg viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="21" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="3.5"/>
            <circle cx="26" cy="26" r="21" fill="none" stroke="#818cf8" stroke-width="3.5" stroke-dasharray="131.9" stroke-dashoffset="5.3" stroke-linecap="round" transform="rotate(-90 26 26)"/>
          </svg>
          <div class="match-num"><span class="match-pct">98</span><span class="match-lbl">match</span></div>
        </div>
        <div class="card-badges">
          <span class="cbadge" style="background:rgba(99,102,241,.25);color:#c7d2fe;border:0.5px solid rgba(99,102,241,.4)">AI #1 pick</span>
          <span class="cbadge" style="background:rgba(251,191,36,.18);color:#fde68a;border:0.5px solid rgba(251,191,36,.35)">Worth the splurge</span>
        </div>
      </div>

      <div class="card-body">
        <div class="card-mood-pills">
          <span class="cmp" style="background:rgba(99,102,241,.2);color:#c7d2fe">Culture</span>
          <span class="cmp" style="background:rgba(56,189,248,.15);color:#7dd3fc">Immersive</span>
          <span class="cmp" style="background:rgba(139,92,246,.15);color:#c4b5fd">Night-worthy</span>
        </div>
        <div class="card-name">TeamLab Planets, Toyosu</div>
        <div class="card-loc"><i class="ti ti-map-pin" aria-hidden="true"></i>Toyosu · 18 min from Shinjuku</div>
        <div class="card-why">
          <div class="cw-top"><div class="cw-dot"></div><span class="cw-label">Why this matches you</span></div>
          <div class="cw-text">Your itinerary leans heavily toward visual experiences and photography. TeamLab is the highest-rated single experience in Tokyo for people with that profile — the water mirror rooms are unlike anything else on earth.</div>
        </div>
        <div class="card-stats">
          <div class="cs-item"><i class="ti ti-clock" aria-hidden="true"></i><span class="cs-val">2 hrs</span></div>
          <div class="cs-item"><i class="ti ti-users" aria-hidden="true"></i><span class="cs-val">Book ahead</span></div>
          <div class="cs-item"><i class="ti ti-star" aria-hidden="true"></i><span class="cs-val">4.9 / 5</span></div>
        </div>
        <div class="budget-compat">
          <span class="bc-label">Budget fit</span>
          <div class="bc-bar"><div class="bc-fill" style="width:92%;background:#34d399"></div></div>
          <span class="bc-val" style="color:#34d399">¥3,200 · $22</span>
        </div>
      </div>
    </div>

  </div>

  <div class="action-row">
    <div class="act-btn" onclick="swipeCard('left')">
      <div class="act-circle btn-skip"><i class="ti ti-x" aria-hidden="true"></i></div>
      <span class="act-label">Skip</span>
    </div>
    <div class="act-btn" onclick="swipeCard('save')">
      <div class="act-circle btn-save"><i class="ti ti-bookmark" aria-hidden="true"></i></div>
      <span class="act-label">Save</span>
    </div>
    <div class="act-btn" onclick="swipeCard('right')">
      <div class="act-circle btn-add"><i class="ti ti-calendar-plus" aria-hidden="true"></i></div>
      <span class="act-label">Add to trip</span>
    </div>
    <div class="act-btn" onclick="swipeCard('super')">
      <div class="act-circle btn-super"><i class="ti ti-star" aria-hidden="true"></i></div>
      <span class="act-label">Must-do</span>
    </div>
  </div>

  <div class="hint-row">
    <i class="ti ti-arrow-left" aria-hidden="true"></i>
    <span>skip</span>
    <span style="margin:0 12px;color:rgba(255,255,255,.1)">·</span>
    <span>add to trip</span>
    <i class="ti ti-arrow-right" aria-hidden="true"></i>
  </div>
</div>

<div class="feed-section">
  <div class="feed-label">Up next in your feed</div>
  <div class="feed-items">

    <div class="feed-card">
      <div class="feed-img" style="background:linear-gradient(135deg,#200818,#3a1030)"><span style="font-size:22px">🥃</span></div>
      <div class="feed-info">
        <div class="feed-name">Golden Gai bar crawl</div>
        <div class="feed-sub">Nightlife · Shinjuku · Hidden gem · 200+ tiny bars</div>
      </div>
      <div class="feed-right">
        <span class="feed-match" style="color:#c4b5fd">94%</span>
        <span class="feed-price">¥3,500/drink</span>
        <div class="feed-save" onclick="this.classList.toggle('saved')"><i class="ti ti-heart" aria-hidden="true"></i></div>
      </div>
    </div>

    <div class="feed-card">
      <div class="feed-img" style="background:linear-gradient(135deg,#1a0a08,#3a1a10)"><span style="font-size:22px">🍣</span></div>
      <div class="feed-info">
        <div class="feed-name">Sushi Saito omakase</div>
        <div class="feed-sub">Food · Toranomon · Michelin 3★ · 20-course</div>
      </div>
      <div class="feed-right">
        <span class="feed-match" style="color:#fdba74">97%</span>
        <span class="feed-price">¥33,000 pp</span>
        <div class="feed-save saved" onclick="this.classList.toggle('saved')"><i class="ti ti-heart" aria-hidden="true"></i></div>
      </div>
    </div>

    <div class="feed-card">
      <div class="feed-img" style="background:linear-gradient(135deg,#0a1a08,#1a3010)"><span style="font-size:22px">⛩️</span></div>
      <div class="feed-info">
        <div class="feed-name">Meiji Shrine at sunrise</div>
        <div class="feed-sub">Nature · Harajuku · Free · Hidden gem · Before 7am</div>
      </div>
      <div class="feed-right">
        <span class="feed-match" style="color:#6ee7b7">91%</span>
        <span class="feed-price">Free</span>
        <div class="feed-save" onclick="this.classList.toggle('saved')"><i class="ti ti-heart" aria-hidden="true"></i></div>
      </div>
    </div>

    <div class="feed-card">
      <div class="feed-img" style="background:linear-gradient(135deg,#200a00,#402010)"><span style="font-size:22px">♨️</span></div>
      <div class="feed-info">
        <div class="feed-name">Hakone onsen day trip</div>
        <div class="feed-sub">Luxury · Mt. Fuji views · Worth the splurge</div>
      </div>
      <div class="feed-right">
        <span class="feed-match" style="color:#fde68a">88%</span>
        <span class="feed-price">¥8,800 pp</span>
        <div class="feed-save" onclick="this.classList.toggle('saved')"><i class="ti ti-heart" aria-hidden="true"></i></div>
      </div>
    </div>

    <div class="feed-card">
      <div class="feed-img" style="background:linear-gradient(135deg,#0a1808,#183020)"><span style="font-size:22px">🎋</span></div>
      <div class="feed-info">
        <div class="feed-name">Arashiyama bamboo grove</div>
        <div class="feed-sub">Nature · Kyoto · Free · Most magical before 7:30am</div>
      </div>
      <div class="feed-right">
        <span class="feed-match" style="color:#6ee7b7">86%</span>
        <span class="feed-price">Free</span>
        <div class="feed-save" onclick="this.classList.toggle('saved')"><i class="ti ti-heart" aria-hidden="true"></i></div>
      </div>
    </div>

    <div class="feed-card">
      <div class="feed-img" style="background:linear-gradient(135deg,#151500,#2a2a00)"><span style="font-size:22px">🍜</span></div>
      <div class="feed-info">
        <div class="feed-name">Fuunji tsukemen · Shinjuku</div>
        <div class="feed-sub">Food · Local secret · Cash only · 20-min wait</div>
      </div>
      <div class="feed-right">
        <span class="feed-match" style="color:#fdba74">85%</span>
        <span class="feed-price">¥1,200</span>
        <div class="feed-save" onclick="this.classList.toggle('saved')"><i class="ti ti-heart" aria-hidden="true"></i></div>
      </div>
    </div>

  </div>
</div>

</div>

<script>
var cards=[
  {bg:'linear-gradient(135deg,#200818 0%,#3a1030 60%,#180820 100%)',icon:'🥃',name:'Golden Gai bar crawl',loc:'Shinjuku · 5 min from station',mood1:'Nightlife',mood1c:'rgba(139,92,246,.2)',mood1tc:'#c4b5fd',mood2:'Local only',mood2c:'rgba(255,255,255,.08)',mood2tc:'rgba(255,255,255,.5)',badge1:'Hidden gem',badge1c:'rgba(52,211,153,.2)',badge1tc:'#34d399',badge1b:'rgba(52,211,153,.3)',why:'Your trip has two free evenings in Shinjuku. Golden Gai is the highest-density authentic bar experience in Japan — 200 bars in an area the size of a city block.',pct:94,ring:'#8b5cf6',dur:'2–4 hrs',rating:'4.8 / 5',book:'Walk-in',price:'¥3,500/drink',compat:88,compatc:'#fbbf24',compatv:'¥3,500 · $24'},
  {bg:'linear-gradient(135deg,#0a1a08 0%,#1a3a10 60%,#0d2810 100%)',icon:'⛩️',name:'Meiji Shrine at sunrise',loc:'Harajuku · 15 min from Toranomon',mood1:'Nature',mood1c:'rgba(52,211,153,.15)',mood1tc:'#6ee7b7',mood2:'Free',mood2c:'rgba(52,211,153,.1)',mood2tc:'#34d399',badge1:'Hidden gem',badge1c:'rgba(52,211,153,.2)',badge1tc:'#34d399',badge1b:'rgba(52,211,153,.3)',why:'You mentioned wanting quieter cultural moments. The shrine path before 7am is one of the most peaceful places in all of Tokyo — ancient cedar forest, almost no people.',pct:91,ring:'#34d399',dur:'1–2 hrs',rating:'4.7 / 5',book:'No booking',price:'Free',compat:100,compatc:'#34d399',compatv:'Free · $0'},
  {bg:'linear-gradient(135deg,#1a0a08 0%,#3a1a10 60%,#5a2818 100%)',icon:'🍣',name:'Tsukiji Outer Market',loc:'Tsukiji · 20 min from Shinjuku',mood1:'Foodie',mood1c:'rgba(251,146,60,.15)',mood1tc:'#fdba74',mood2:'Morning only',mood2c:'rgba(251,191,36,.1)',mood2tc:'#fde68a',badge1:'AI top pick',badge1c:'rgba(99,102,241,.2)',badge1tc:'#a5b4fc',badge1b:'rgba(99,102,241,.3)',why:'Three of your saved activities involve food. Tsukiji is the most authentic way to eat like a Tokyo chef — fresh uni, otoro, and tamagoyaki for under $20.',pct:95,ring:'#f97316',dur:'1.5 hrs',rating:'4.6 / 5',book:'No booking',price:'~¥3,000',compat:96,compatc:'#34d399',compatv:'~¥3,000 · $20'},
];
var ci=0;
var swipeCount=6;

function buildFrontCard(d){
  var s=document.getElementById('sc1');
  s.innerHTML='<div class="card-bg" style="background:'+d.bg+'"><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:110px;opacity:.15">'+d.icon+'</div></div><div class="card-scrim"></div><div class="card-top"><div class="match-ring-wrap"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="21" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="3.5"/><circle cx="26" cy="26" r="21" fill="none" stroke="'+d.ring+'" stroke-width="3.5" stroke-dasharray="131.9" stroke-dashoffset="'+Math.round(131.9*(1-d.pct/100))+'" stroke-linecap="round" transform="rotate(-90 26 26)"/></svg><div class="match-num"><span class="match-pct">'+d.pct+'</span><span class="match-lbl">match</span></div></div><div class="card-badges"><span class="cbadge" style="background:'+d.badge1c+';color:'+d.badge1tc+';border:0.5px solid '+d.badge1b+'">'+d.badge1+'</span></div></div><div class="card-body"><div class="card-mood-pills"><span class="cmp" style="background:'+d.mood1c+';color:'+d.mood1tc+'">'+d.mood1+'</span><span class="cmp" style="background:'+d.mood2c+';color:'+d.mood2tc+'">'+d.mood2+'</span></div><div class="card-name">'+d.name+'</div><div class="card-loc"><i class="ti ti-map-pin"></i>'+d.loc+'</div><div class="card-why"><div class="cw-top"><div class="cw-dot"></div><span class="cw-label">Why this matches you</span></div><div class="cw-text">'+d.why+'</div></div><div class="card-stats"><div class="cs-item"><i class="ti ti-clock"></i><span class="cs-val">'+d.dur+'</span></div><div class="cs-item"><i class="ti ti-users"></i><span class="cs-val">'+d.book+'</span></div><div class="cs-item"><i class="ti ti-star"></i><span class="cs-val">'+d.rating+'</span></div></div><div class="budget-compat"><span class="bc-label">Budget fit</span><div class="bc-bar"><div class="bc-fill" style="width:'+d.compat+'%;background:'+d.compatc+'"></div></div><span class="bc-val" style="color:'+d.compatc+'">'+d.compatv+'</span></div></div>';
}

function swipeCard(dir){
  var front=document.getElementById('sc1');
  var mid=document.getElementById('sc2');
  var back=document.getElementById('sc3');
  if(swipeCount<=0) return;
  swipeCount--;
  document.getElementById('deck-counter').textContent=swipeCount+' remaining';
  front.classList.remove('front');
  front.classList.add(dir==='left'?'exiting-left':'exiting-right');
  mid.classList.remove('behind1');
  mid.classList.add('front');
  back.classList.remove('behind2');
  back.classList.add('behind1');
  var newBack=document.createElement('div');
  newBack.className='swipe-card behind2';
  newBack.id='sc3';
  newBack.style.zIndex='0';
  newBack.innerHTML='<div class="card-bg" style="background:linear-gradient(135deg,#0a1020 0%,#101828 100%)"></div><div class="card-scrim"></div>';
  document.getElementById('card-stack').appendChild(newBack);
  document.getElementById('sc1').id='old';
  document.getElementById('sc2').id='sc1';
  document.getElementById('sc3').id='sc2';
  newBack.id='sc3';
  ci=(ci+1)%cards.length;
  setTimeout(function(){
    var old=document.querySelector('.exiting-left,.exiting-right');
    if(old) old.remove();
    buildFrontCard(cards[ci]);
  },420);
}

function setMood(el){
  document.querySelectorAll('.mood-pill').forEach(function(p){p.classList.remove('active')});
  el.classList.add('active');
}

document.addEventListener('keydown',function(e){
  if(e.key==='ArrowLeft') swipeCard('left');
  if(e.key==='ArrowRight') swipeCard('right');
});
</script>
</body>
</html>"""


def render():
    html = _HTML.replace("{tabler}", _TABLER)
    components.html(html, height=1900, scrolling=True)

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
.it{background:#07090f;color:#e4e6f0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif;padding:0 0 60px}
.it-header{padding:28px 32px 0;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px}
.it-eyebrow{font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:8px}
.it-title{font-size:28px;font-weight:800;letter-spacing:-0.8px;color:#fff;margin-bottom:6px}
.it-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.it-meta-item{display:flex;align-items:center;gap:5px;font-size:13px;color:rgba(255,255,255,0.4)}
.it-meta-sep{color:rgba(255,255,255,0.12)}
.it-header-right{display:flex;gap:8px;flex-shrink:0;margin-top:4px;align-items:center}
.it-btn{display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;border:0.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.55)}
.it-btn:hover{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.8)}
.it-btn-ai{background:rgba(99,102,241,0.12);border-color:rgba(99,102,241,0.3);color:#a5b4fc}
.edit-mode-badge{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;background:rgba(99,102,241,0.15);border:0.5px solid rgba(99,102,241,0.4);color:#a5b4fc}
.edit-dot{width:6px;height:6px;border-radius:50%;background:#6366f1;animation:blink 1.5s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
.day-nav{display:flex;gap:6px;padding:20px 32px 0;overflow-x:auto}
.dn-pill{flex-shrink:0;padding:7px 16px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;border:0.5px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.4)}
.dn-pill.active{background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.4);color:#c7d2fe}
.timeline{padding:24px 32px 0;display:flex;flex-direction:column;gap:16px}
.day-card{border-radius:16px;border:0.5px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.025);overflow:hidden;transition:border-color 0.15s}
.day-card.expanded{border-color:rgba(99,102,241,0.2)}
.day-card-header{display:flex;align-items:center;padding:16px 20px;cursor:pointer;gap:14px}
.day-card-header:hover{background:rgba(255,255,255,0.02)}
.dcn-badge{display:flex;flex-direction:column;align-items:center;justify-content:center;width:46px;height:46px;border-radius:11px;flex-shrink:0}
.dcn-num{font-size:19px;font-weight:800;line-height:1;color:#fff}
.dcn-day{font-size:9px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-top:2px;opacity:0.7}
.day-card-header-info{flex:1;min-width:0}
.dch-title{font-size:15px;font-weight:700;margin-bottom:3px}
.dch-tags{display:flex;gap:5px;flex-wrap:wrap}
.dch-tag{font-size:10px;padding:2px 7px;border-radius:4px;font-weight:500}
.day-card-header-right{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0}
.dcr-cost{font-size:17px;font-weight:700;letter-spacing:-0.3px}
.dcr-label{font-size:10px;color:rgba(255,255,255,0.3)}
.dcr-chevron{font-size:15px;color:rgba(255,255,255,0.2);margin-top:4px;transition:transform 0.2s}
.expanded .dcr-chevron{transform:rotate(180deg)}
.day-body{border-top:0.5px solid rgba(255,255,255,0.06);padding:0 20px 20px}
.period{margin-top:18px}
.period-label{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.period-icon{width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0}
.period-name{font-size:10px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:rgba(255,255,255,0.3)}
.period-line{flex:1;height:0.5px;background:rgba(255,255,255,0.06)}
.items{display:flex;flex-direction:column;gap:6px}
.event{display:flex;gap:10px;align-items:flex-start}
.event-time-col{width:42px;flex-shrink:0;padding-top:2px}
.event-time{font-size:11px;color:rgba(255,255,255,0.25);font-weight:500}
.event-dot-col{display:flex;flex-direction:column;align-items:center;padding-top:5px;width:14px;flex-shrink:0}
.event-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.event-line{width:1px;flex:1;min-height:18px;background:rgba(255,255,255,0.06);margin-top:4px}
.event-card{flex:1;min-width:0;border-radius:10px;padding:11px 13px;border:0.5px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);position:relative}
.event-card:hover .ev-edit-bar{opacity:1}
.event-card.highlight{border-color:rgba(99,102,241,0.25);background:rgba(99,102,241,0.05)}
.event-card.food{border-color:rgba(251,146,60,0.2);background:rgba(251,146,60,0.04)}
.event-card.transit{border-color:rgba(56,189,248,0.15);background:rgba(56,189,248,0.03)}
.event-card.optional{border-color:rgba(255,255,255,0.05);background:transparent}
.event-card.editing{border-color:rgba(99,102,241,0.5);background:rgba(99,102,241,0.06)}
.ev-edit-bar{opacity:0;position:absolute;top:8px;right:8px;display:flex;gap:4px;transition:opacity 0.15s}
.ev-edit-btn{width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;border:0.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.4)}
.ev-edit-btn:hover{background:rgba(255,255,255,0.12);color:#fff}
.ev-edit-btn.danger:hover{background:rgba(239,68,68,0.15);color:#f87171;border-color:rgba(239,68,68,0.3)}
.ev-edit-btn.drag-handle{cursor:grab;color:rgba(255,255,255,0.2)}
.ev-top{display:flex;align-items:flex-start;gap:8px;margin-bottom:3px;padding-right:72px}
.ev-name{font-size:13px;font-weight:600;line-height:1.3;flex:1}
.ev-price{font-size:12px;font-weight:600;flex-shrink:0}
.ev-sub{font-size:12px;color:rgba(255,255,255,0.38);line-height:1.5;margin-bottom:5px}
.ev-chips{display:flex;gap:4px;flex-wrap:wrap}
.ev-chip{font-size:10px;padding:2px 6px;border-radius:4px;font-weight:500}
.ev-edit-actions{display:flex;gap:6px;margin-top:8px}
.ev-save-btn{flex:1;padding:6px;border-radius:7px;font-size:11px;font-weight:600;text-align:center;cursor:pointer;background:rgba(99,102,241,0.2);border:0.5px solid rgba(99,102,241,0.4);color:#a5b4fc}
.ev-save-btn:hover{background:rgba(99,102,241,0.3)}
.ev-cancel-btn{flex:1;padding:6px;border-radius:7px;font-size:11px;font-weight:500;text-align:center;cursor:pointer;background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.4)}
.add-event-btn{display:flex;align-items:center;gap:7px;padding:9px 12px;border-radius:9px;border:0.5px dashed rgba(255,255,255,0.1);color:rgba(255,255,255,0.25);font-size:12px;cursor:pointer;margin-top:6px;transition:all 0.15s}
.add-event-btn:hover{border-color:rgba(99,102,241,0.4);color:#818cf8;background:rgba(99,102,241,0.05)}
.add-event-btn i{font-size:14px}
.transit-bar{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:rgba(56,189,248,0.06);border:0.5px solid rgba(56,189,248,0.12)}
.tb-icon{font-size:14px;color:#38bdf8}
.tb-text{font-size:12px;color:rgba(255,255,255,0.5);flex:1}
.tb-time{font-size:11px;color:#38bdf8;font-weight:500}
.neighborhood-transition{display:flex;align-items:center;gap:8px;padding:9px 12px;margin:10px 0;border-radius:8px;background:rgba(255,255,255,0.02);border:0.5px solid rgba(255,255,255,0.06)}
.nt-from{font-size:12px;color:rgba(255,255,255,0.35)}
.nt-arrow{font-size:12px;color:rgba(255,255,255,0.15)}
.nt-to{font-size:12px;font-weight:600;color:rgba(255,255,255,0.6)}
.nt-note{margin-left:auto;font-size:11px;color:rgba(255,255,255,0.2)}
.note-box{margin-top:10px;padding:11px 13px;border-radius:10px;background:rgba(251,191,36,0.04);border:0.5px solid rgba(251,191,36,0.15)}
.nb-top{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.nb-icon{font-size:13px;color:#fbbf24}
.nb-label{font-size:11px;font-weight:600;color:rgba(251,191,36,0.8)}
.nb-text{font-size:12px;color:rgba(255,255,255,0.38);line-height:1.6}
.map-placeholder{border-radius:10px;height:72px;background:linear-gradient(135deg,#0d1a2e 0%,#0f2040 50%,#0a1520 100%);border:0.5px solid rgba(255,255,255,0.06);margin-top:10px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}
.mp-icon{font-size:15px;color:rgba(255,255,255,0.18)}
.mp-text{font-size:12px;color:rgba(255,255,255,0.18)}
.day-card.collapsed .day-body{display:none}
.chip-culture{background:rgba(99,102,241,0.12);color:#c7d2fe}
.chip-food{background:rgba(251,146,60,0.12);color:#fdba74}
.chip-ai{background:rgba(99,102,241,0.18);color:#a5b4fc}
.chip-free{background:rgba(52,211,153,0.1);color:#6ee7b7}
.chip-opt{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.4)}
.chip-luxury{background:rgba(251,191,36,0.1);color:#fcd34d}
.chip-night{background:rgba(139,92,246,0.12);color:#c4b5fd}
.col-purple{background:rgba(99,102,241,0.15)}
.col-amber{background:rgba(251,191,36,0.12)}
.col-green{background:rgba(52,211,153,0.12)}
.col-blue{background:rgba(56,189,248,0.12)}
.col-pink{background:rgba(244,114,182,0.12)}
.dot-purple{background:#818cf8}
.dot-amber{background:#f59e0b}
.dot-green{background:#34d399}
.dot-blue{background:#38bdf8}
.dot-pink{background:#f472b6}
.dot-red{background:#f87171}
</style>
</head>
<body>
<div class="it">

  <div class="it-header">
    <div>
      <div class="it-eyebrow">Itinerary</div>
      <div class="it-title">Tokyo &amp; Kyoto</div>
      <div class="it-meta">
        <div class="it-meta-item"><i class="ti ti-calendar" aria-hidden="true"></i>Oct 14 – Oct 24, 2025</div>
        <span class="it-meta-sep">·</span>
        <div class="it-meta-item"><i class="ti ti-users" aria-hidden="true"></i>3 travelers</div>
        <span class="it-meta-sep">·</span>
        <div class="it-meta-item"><i class="ti ti-currency-dollar" aria-hidden="true"></i>$8,420 total</div>
      </div>
    </div>
    <div class="it-header-right">
      <div class="edit-mode-badge"><div class="edit-dot"></div>Editing</div>
      <div class="it-btn it-btn-ai"><i class="ti ti-sparkles" style="font-size:12px" aria-hidden="true"></i>AI suggestions ↗</div>
      <div class="it-btn" id="done-btn" onclick="toggleEditMode()"><i class="ti ti-check" style="font-size:12px" aria-hidden="true"></i>Done</div>
    </div>
  </div>

  <div class="day-nav">
    <div class="dn-pill active">All days</div>
    <div class="dn-pill">Oct 14</div>
    <div class="dn-pill">Oct 15</div>
    <div class="dn-pill">Oct 16–17</div>
    <div class="dn-pill">Oct 18</div>
    <div class="dn-pill">Oct 19–20</div>
    <div class="dn-pill">Oct 24</div>
  </div>

  <div class="timeline">

    <!-- DAY 1 -->
    <div class="day-card expanded" id="d1">
      <div class="day-card-header" onclick="toggleDay('d1')">
        <div class="dcn-badge col-purple">
          <div class="dcn-num">1</div>
          <div class="dcn-day" style="color:#a5b4fc">MON</div>
        </div>
        <div class="day-card-header-info">
          <div class="dch-title">Arrival · Shinjuku &amp; Toranomon</div>
          <div class="dch-tags" style="margin-top:4px">
            <span class="dch-tag chip-culture">Arrival day</span>
            <span class="dch-tag chip-luxury">Michelin dinner</span>
          </div>
        </div>
        <div class="day-card-header-right">
          <div class="dcr-cost" style="color:#a5b4fc">$620</div>
          <div class="dcr-label">est. daily spend</div>
          <i class="ti ti-chevron-down dcr-chevron" aria-hidden="true"></i>
        </div>
      </div>

      <div class="day-body">
        <div class="period">
          <div class="period-label">
            <div class="period-icon col-amber"><i class="ti ti-sun" style="color:#fbbf24;font-size:11px" aria-hidden="true"></i></div>
            <span class="period-name">Morning</span>
            <div class="period-line"></div>
          </div>
          <div class="items" id="d1-morning">
            <div class="event" id="ev-d1-1">
              <div class="event-time-col"><div class="event-time">07:30</div></div>
              <div class="event-dot-col"><div class="event-dot dot-purple"></div><div class="event-line"></div></div>
              <div class="event-card highlight" onmouseenter="showEditBar(this)">
                <div class="ev-edit-bar">
                  <div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn" onclick="editEvent(this)"><i class="ti ti-pencil" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash" aria-hidden="true"></i></div>
                </div>
                <div class="ev-top">
                  <div class="ev-name">JAL 61 departs SFO</div>
                  <div class="ev-price" style="color:#a5b4fc">$1,240 RT</div>
                </div>
                <div class="ev-sub">Non-stop to Narita · 11h 40m · Business class · Seat 4A window recommended</div>
                <div class="ev-chips">
                  <span class="ev-chip chip-luxury">Business class</span>
                  <span class="ev-chip chip-ai">AI pick</span>
                </div>
              </div>
            </div>
          </div>
          <div class="add-event-btn" onclick="addEvent('d1-morning')">
            <i class="ti ti-plus" aria-hidden="true"></i>Add morning activity
          </div>
        </div>

        <div class="period">
          <div class="period-label">
            <div class="period-icon col-blue"><i class="ti ti-cloud" style="color:#38bdf8;font-size:11px" aria-hidden="true"></i></div>
            <span class="period-name">Afternoon</span>
            <div class="period-line"></div>
          </div>
          <div class="items" id="d1-afternoon">
            <div class="event">
              <div class="event-time-col"><div class="event-time">14:10</div></div>
              <div class="event-dot-col"><div class="event-dot dot-blue"></div><div class="event-line"></div></div>
              <div class="event-card transit" onmouseenter="showEditBar(this)">
                <div class="ev-edit-bar">
                  <div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn" onclick="editEvent(this)"><i class="ti ti-pencil" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash" aria-hidden="true"></i></div>
                </div>
                <div class="transit-bar">
                  <i class="ti ti-train tb-icon" aria-hidden="true"></i>
                  <div class="tb-text">Narita Express → Shinjuku Station</div>
                  <div class="tb-time">90 min · ¥3,070</div>
                </div>
              </div>
            </div>
            <div class="event">
              <div class="event-time-col"><div class="event-time">16:00</div></div>
              <div class="event-dot-col"><div class="event-dot dot-amber"></div><div class="event-line"></div></div>
              <div class="event-card" onmouseenter="showEditBar(this)">
                <div class="ev-edit-bar">
                  <div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn" onclick="editEvent(this)"><i class="ti ti-pencil" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash" aria-hidden="true"></i></div>
                </div>
                <div class="ev-top">
                  <div class="ev-name">Check in — Andaz Tokyo Toranomon Hills</div>
                  <div class="ev-price" style="color:#fbbf24">¥68,000/night</div>
                </div>
                <div class="ev-sub">52nd floor · panoramic city views · request a Mt. Fuji-facing room</div>
                <div class="ev-chips">
                  <span class="ev-chip chip-luxury">5-star</span>
                  <span class="ev-chip" style="background:rgba(52,211,153,0.1);color:#6ee7b7">3 nights</span>
                </div>
              </div>
            </div>
          </div>
          <div class="add-event-btn" onclick="addEvent('d1-afternoon')">
            <i class="ti ti-plus" aria-hidden="true"></i>Add afternoon activity
          </div>
        </div>

        <div class="neighborhood-transition">
          <i class="ti ti-map-pin" style="font-size:12px;color:rgba(255,255,255,0.2)" aria-hidden="true"></i>
          <span class="nt-from">Toranomon</span>
          <i class="ti ti-arrow-right nt-arrow" aria-hidden="true"></i>
          <span class="nt-to">Minato · 8 min walk</span>
          <span class="nt-note">Evening dinner district</span>
        </div>

        <div class="period">
          <div class="period-label">
            <div class="period-icon col-pink"><i class="ti ti-moon" style="color:#f472b6;font-size:11px" aria-hidden="true"></i></div>
            <span class="period-name">Evening</span>
            <div class="period-line"></div>
          </div>
          <div class="items" id="d1-evening">
            <div class="event">
              <div class="event-time-col"><div class="event-time">20:00</div></div>
              <div class="event-dot-col"><div class="event-dot dot-red"></div></div>
              <div class="event-card food" onmouseenter="showEditBar(this)">
                <div class="ev-edit-bar">
                  <div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn" onclick="editEvent(this)"><i class="ti ti-pencil" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash" aria-hidden="true"></i></div>
                </div>
                <div class="ev-top">
                  <div class="ev-name">Sushi Saito · Toranomon</div>
                  <div class="ev-price" style="color:#fb923c">¥33,000 pp</div>
                </div>
                <div class="ev-sub">20-course omakase · 3-Michelin-star · reservation confirmed for 3 · arrive 10 min early</div>
                <div class="ev-chips">
                  <span class="ev-chip chip-food">Omakase</span>
                  <span class="ev-chip chip-luxury">Michelin 3★</span>
                  <span class="ev-chip" style="background:rgba(52,211,153,0.1);color:#6ee7b7">Confirmed</span>
                </div>
              </div>
            </div>
          </div>
          <div class="add-event-btn" onclick="addEvent('d1-evening')">
            <i class="ti ti-plus" aria-hidden="true"></i>Add evening activity
          </div>
        </div>

        <div class="note-box">
          <div class="nb-top"><i class="ti ti-bulb nb-icon" aria-hidden="true"></i><span class="nb-label">Travel note</span></div>
          <div class="nb-text">Jet lag hits hardest on day 1. Keep tonight light — Sushi Saito is a perfect low-energy, high-reward first meal. Get to sleep by 11pm to reset for day 2.</div>
        </div>

        <div class="map-placeholder">
          <i class="ti ti-map-2 mp-icon" aria-hidden="true"></i>
          <span class="mp-text">Day 1 route · NRT → Shinjuku → Toranomon</span>
        </div>
      </div>
    </div>

    <!-- DAY 2 -->
    <div class="day-card expanded" id="d2">
      <div class="day-card-header" onclick="toggleDay('d2')">
        <div class="dcn-badge col-green">
          <div class="dcn-num">2</div>
          <div class="dcn-day" style="color:#34d399">TUE</div>
        </div>
        <div class="day-card-header-info">
          <div class="dch-title">Shibuya, Harajuku &amp; Omotesando</div>
          <div class="dch-tags" style="margin-top:4px">
            <span class="dch-tag chip-culture">Culture</span>
            <span class="dch-tag chip-food">Street food</span>
            <span class="dch-tag chip-night">Nightlife</span>
          </div>
        </div>
        <div class="day-card-header-right">
          <div class="dcr-cost" style="color:#34d399">$185</div>
          <div class="dcr-label">est. daily spend</div>
          <i class="ti ti-chevron-down dcr-chevron" aria-hidden="true"></i>
        </div>
      </div>

      <div class="day-body">
        <div class="period">
          <div class="period-label">
            <div class="period-icon col-amber"><i class="ti ti-sun" style="color:#fbbf24;font-size:11px" aria-hidden="true"></i></div>
            <span class="period-name">Morning</span>
            <div class="period-line"></div>
          </div>
          <div class="items" id="d2-morning">
            <div class="event">
              <div class="event-time-col"><div class="event-time">07:00</div></div>
              <div class="event-dot-col"><div class="event-dot dot-amber"></div><div class="event-line"></div></div>
              <div class="event-card food" onmouseenter="showEditBar(this)">
                <div class="ev-edit-bar">
                  <div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn" onclick="editEvent(this)"><i class="ti ti-pencil" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash" aria-hidden="true"></i></div>
                </div>
                <div class="ev-top">
                  <div class="ev-name">Tsukiji Outer Market breakfast</div>
                  <div class="ev-price" style="color:#fb923c">~¥3,000</div>
                </div>
                <div class="ev-sub">Fresh uni, otoro tuna, tamagoyaki on sticks — arrive by 7am before crowds build</div>
                <div class="ev-chips">
                  <span class="ev-chip chip-food">Market</span>
                  <span class="ev-chip chip-ai">AI top pick</span>
                </div>
              </div>
            </div>
            <div class="event">
              <div class="event-time-col"><div class="event-time">09:30</div></div>
              <div class="event-dot-col"><div class="event-dot dot-green"></div></div>
              <div class="event-card transit" onmouseenter="showEditBar(this)">
                <div class="ev-edit-bar">
                  <div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn" onclick="editEvent(this)"><i class="ti ti-pencil" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash" aria-hidden="true"></i></div>
                </div>
                <div class="transit-bar">
                  <i class="ti ti-train tb-icon" aria-hidden="true"></i>
                  <div class="tb-text">Hibiya Line → Meiji-Jingumae · IC Card</div>
                  <div class="tb-time">22 min · ¥210</div>
                </div>
              </div>
            </div>
          </div>
          <div class="add-event-btn" onclick="addEvent('d2-morning')">
            <i class="ti ti-plus" aria-hidden="true"></i>Add morning activity
          </div>
        </div>

        <div class="period">
          <div class="period-label">
            <div class="period-icon col-blue"><i class="ti ti-cloud" style="color:#38bdf8;font-size:11px" aria-hidden="true"></i></div>
            <span class="period-name">Afternoon</span>
            <div class="period-line"></div>
          </div>
          <div class="items" id="d2-afternoon">
            <div class="event">
              <div class="event-time-col"><div class="event-time">10:00</div></div>
              <div class="event-dot-col"><div class="event-dot dot-green"></div><div class="event-line"></div></div>
              <div class="event-card highlight" onmouseenter="showEditBar(this)">
                <div class="ev-edit-bar">
                  <div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn" onclick="editEvent(this)"><i class="ti ti-pencil" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash" aria-hidden="true"></i></div>
                </div>
                <div class="ev-top">
                  <div class="ev-name">Meiji Shrine + Yoyogi Park</div>
                  <div class="ev-price" style="color:#34d399">Free</div>
                </div>
                <div class="ev-sub">Walk the forested path to the inner shrine · 90 min at a relaxed pace · peaceful in the morning</div>
                <div class="ev-chips">
                  <span class="ev-chip chip-culture">Shrine</span>
                  <span class="ev-chip chip-free">Free entry</span>
                </div>
              </div>
            </div>
            <div class="event">
              <div class="event-time-col"><div class="event-time">14:30</div></div>
              <div class="event-dot-col"><div class="event-dot dot-purple"></div><div class="event-line"></div></div>
              <div class="event-card highlight" onmouseenter="showEditBar(this)">
                <div class="ev-edit-bar">
                  <div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn" onclick="editEvent(this)"><i class="ti ti-pencil" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash" aria-hidden="true"></i></div>
                </div>
                <div class="ev-top">
                  <div class="ev-name">Shibuya Crossing + Sky observation deck</div>
                  <div class="ev-price" style="color:#a5b4fc">¥2,000</div>
                </div>
                <div class="ev-sub">Watch the scramble from Mag's Park above Starbucks · then Shibuya Sky for the rooftop panorama</div>
                <div class="ev-chips">
                  <span class="ev-chip chip-culture">Iconic</span>
                </div>
              </div>
            </div>
            <div class="event">
              <div class="event-time-col"><div class="event-time">16:00</div></div>
              <div class="event-dot-col"><div class="event-dot" style="background:rgba(255,255,255,0.2)"></div></div>
              <div class="event-card optional" onmouseenter="showEditBar(this)">
                <div class="ev-edit-bar">
                  <div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn" onclick="editEvent(this)"><i class="ti ti-pencil" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash" aria-hidden="true"></i></div>
                </div>
                <div class="ev-top">
                  <div class="ev-name">Optional — TeamLab Borderless</div>
                  <div class="ev-price" style="color:rgba(255,255,255,0.35)">¥3,200</div>
                </div>
                <div class="ev-sub">Immersive digital art museum · pre-booking required · can move to day 4 if pressed for time</div>
                <div class="ev-chips">
                  <span class="ev-chip chip-opt">Optional</span>
                  <span class="ev-chip chip-culture">Art</span>
                </div>
              </div>
            </div>
          </div>
          <div class="add-event-btn" onclick="addEvent('d2-afternoon')">
            <i class="ti ti-plus" aria-hidden="true"></i>Add afternoon activity
          </div>
        </div>

        <div class="period">
          <div class="period-label">
            <div class="period-icon col-pink"><i class="ti ti-moon" style="color:#f472b6;font-size:11px" aria-hidden="true"></i></div>
            <span class="period-name">Evening</span>
            <div class="period-line"></div>
          </div>
          <div class="items" id="d2-evening">
            <div class="event">
              <div class="event-time-col"><div class="event-time">19:30</div></div>
              <div class="event-dot-col"><div class="event-dot dot-pink"></div><div class="event-line"></div></div>
              <div class="event-card food" onmouseenter="showEditBar(this)">
                <div class="ev-edit-bar">
                  <div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn" onclick="editEvent(this)"><i class="ti ti-pencil" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash" aria-hidden="true"></i></div>
                </div>
                <div class="ev-top">
                  <div class="ev-name">Fuunji Tsukemen · Shinjuku</div>
                  <div class="ev-price" style="color:#fb923c">¥1,200</div>
                </div>
                <div class="ev-sub">Tokyo's most obsessed-over dipping ramen — thick noodles, rich broth concentrate · 20-min wait typical · cash only</div>
                <div class="ev-chips">
                  <span class="ev-chip chip-food">Ramen</span>
                  <span class="ev-chip chip-ai">Local secret</span>
                </div>
              </div>
            </div>
            <div class="event">
              <div class="event-time-col"><div class="event-time">21:30</div></div>
              <div class="event-dot-col"><div class="event-dot dot-purple"></div></div>
              <div class="event-card highlight" onmouseenter="showEditBar(this)">
                <div class="ev-edit-bar">
                  <div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn" onclick="editEvent(this)"><i class="ti ti-pencil" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash" aria-hidden="true"></i></div>
                </div>
                <div class="ev-top">
                  <div class="ev-name">Bar Benfiddich · Golden Gai</div>
                  <div class="ev-price" style="color:#a5b4fc">~¥3,500/drink</div>
                </div>
                <div class="ev-sub">Hidden single-owner cocktail bar · 6 seats · bartender grows his own herbs · no sign outside · narrow staircase in alley 6</div>
                <div class="ev-chips">
                  <span class="ev-chip chip-night">Hidden bar</span>
                  <span class="ev-chip chip-ai">AI insider</span>
                </div>
              </div>
            </div>
          </div>
          <div class="add-event-btn" onclick="addEvent('d2-evening')">
            <i class="ti ti-plus" aria-hidden="true"></i>Add evening activity
          </div>
        </div>

        <div class="map-placeholder">
          <i class="ti ti-map-2 mp-icon" aria-hidden="true"></i>
          <span class="mp-text">Day 2 route · Tsukiji → Harajuku → Shibuya → Golden Gai</span>
        </div>
      </div>
    </div>

    <!-- DAY 5 COLLAPSED -->
    <div class="day-card collapsed" id="d5">
      <div class="day-card-header" onclick="toggleDay('d5')">
        <div class="dcn-badge col-amber">
          <div class="dcn-num">5</div>
          <div class="dcn-day" style="color:#fbbf24">FRI</div>
        </div>
        <div class="day-card-header-info">
          <div class="dch-title">Tokyo → Kyoto · Fushimi Inari</div>
          <div class="dch-tags" style="margin-top:4px">
            <span class="dch-tag chip-culture">Shinkansen day</span>
            <span class="dch-tag chip-ai">Must-see</span>
          </div>
        </div>
        <div class="day-card-header-right">
          <div class="dcr-cost" style="color:#fbbf24">$310</div>
          <div class="dcr-label">est. daily spend</div>
          <i class="ti ti-chevron-down dcr-chevron" style="transform:rotate(0deg)" aria-hidden="true"></i>
        </div>
      </div>
      <div class="day-body">
        <div class="period">
          <div class="period-label">
            <div class="period-icon col-amber"><i class="ti ti-sun" style="color:#fbbf24;font-size:11px" aria-hidden="true"></i></div>
            <span class="period-name">Morning</span><div class="period-line"></div>
          </div>
          <div class="items" id="d5-morning">
            <div class="event">
              <div class="event-time-col"><div class="event-time">08:20</div></div>
              <div class="event-dot-col"><div class="event-dot dot-purple"></div></div>
              <div class="event-card highlight" onmouseenter="showEditBar(this)">
                <div class="ev-edit-bar">
                  <div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn" onclick="editEvent(this)"><i class="ti ti-pencil" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash" aria-hidden="true"></i></div>
                </div>
                <div class="ev-top">
                  <div class="ev-name">Nozomi Shinkansen · Tokyo → Kyoto</div>
                  <div class="ev-price" style="color:#a5b4fc">¥13,850 pp</div>
                </div>
                <div class="ev-sub">2h 15m · reserved seat car 3 recommended · Mt. Fuji visible on clear days from right side</div>
                <div class="ev-chips"><span class="ev-chip chip-culture">Bullet train</span></div>
              </div>
            </div>
          </div>
          <div class="add-event-btn" onclick="addEvent('d5-morning')"><i class="ti ti-plus" aria-hidden="true"></i>Add morning activity</div>
        </div>
        <div class="period">
          <div class="period-label">
            <div class="period-icon col-blue"><i class="ti ti-cloud" style="color:#38bdf8;font-size:11px" aria-hidden="true"></i></div>
            <span class="period-name">Afternoon</span><div class="period-line"></div>
          </div>
          <div class="items" id="d5-afternoon">
            <div class="event">
              <div class="event-time-col"><div class="event-time">13:00</div></div>
              <div class="event-dot-col"><div class="event-dot dot-green"></div></div>
              <div class="event-card highlight" onmouseenter="showEditBar(this)">
                <div class="ev-edit-bar">
                  <div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn" onclick="editEvent(this)"><i class="ti ti-pencil" aria-hidden="true"></i></div>
                  <div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash" aria-hidden="true"></i></div>
                </div>
                <div class="ev-top">
                  <div class="ev-name">Fushimi Inari torii gate trail</div>
                  <div class="ev-price" style="color:#34d399">Free</div>
                </div>
                <div class="ev-sub">Thousands of vermilion gates up the mountain · full loop 2–3 hrs · most tourists turn back at first summit — don't</div>
                <div class="ev-chips"><span class="ev-chip chip-free">Free</span><span class="ev-chip chip-ai">AI top pick</span></div>
              </div>
            </div>
          </div>
          <div class="add-event-btn" onclick="addEvent('d5-afternoon')"><i class="ti ti-plus" aria-hidden="true"></i>Add afternoon activity</div>
        </div>
      </div>
    </div>

  </div>
</div>

<script>
function toggleDay(id){
  var c=document.getElementById(id);
  c.classList.toggle('expanded');
  c.classList.toggle('collapsed');
}

function showEditBar(card){
  var bar=card.querySelector('.ev-edit-bar');
  if(bar) bar.style.opacity='1';
  card.addEventListener('mouseleave',function hide(){
    if(bar) bar.style.opacity='0';
    card.removeEventListener('mouseleave',hide);
  });
}

function editEvent(btn){
  var card=btn.closest('.event-card');
  if(card.classList.contains('editing')) return;
  card.classList.add('editing');
  var nameEl=card.querySelector('.ev-name');
  var subEl=card.querySelector('.ev-sub');
  var priceEl=card.querySelector('.ev-price');
  if(nameEl){nameEl.contentEditable='true';nameEl.style.outline='none';nameEl.style.borderBottom='1px solid rgba(99,102,241,0.5)';nameEl.focus();}
  if(subEl){subEl.contentEditable='true';subEl.style.outline='none';}
  if(priceEl){priceEl.contentEditable='true';priceEl.style.outline='none';priceEl.style.borderBottom='1px solid rgba(99,102,241,0.3)';}
  var actions=document.createElement('div');
  actions.className='ev-edit-actions';
  actions.innerHTML='<div class="ev-save-btn" onclick="saveEvent(this)">Save changes</div><div class="ev-cancel-btn" onclick="cancelEdit(this)">Cancel</div>';
  card.appendChild(actions);
  var editBar=card.querySelector('.ev-edit-bar');
  if(editBar) editBar.style.opacity='0';
}

function saveEvent(btn){finishEdit(btn.closest('.event-card'));}
function cancelEdit(btn){finishEdit(btn.closest('.event-card'));}

function finishEdit(card){
  card.classList.remove('editing');
  card.querySelectorAll('[contenteditable="true"]').forEach(function(el){
    el.contentEditable='false';
    el.style.borderBottom='none';
  });
  var actions=card.querySelector('.ev-edit-actions');
  if(actions) actions.remove();
}

function removeEvent(btn){
  var eventRow=btn.closest('.event');
  if(eventRow){
    eventRow.style.opacity='0';
    eventRow.style.transition='opacity 0.2s';
    setTimeout(function(){eventRow.remove();},200);
  }
}

function addEvent(containerId){
  var container=document.getElementById(containerId);
  if(!container) return;
  var newEvent=document.createElement('div');
  newEvent.className='event';
  newEvent.innerHTML='<div class="event-time-col"><div class="event-time" contenteditable="true" spellcheck="false" style="outline:none;border-bottom:1px solid rgba(99,102,241,0.4);color:rgba(255,255,255,0.5)">00:00</div></div><div class="event-dot-col"><div class="event-dot" style="background:rgba(99,102,241,0.4)"></div></div><div class="event-card editing" onmouseenter="showEditBar(this)"><div class="ev-edit-bar"><div class="ev-edit-btn drag-handle"><i class="ti ti-grip-vertical"></i></div><div class="ev-edit-btn danger" onclick="removeEvent(this)"><i class="ti ti-trash"></i></div></div><div class="ev-top"><div class="ev-name" contenteditable="true" spellcheck="false" style="outline:none;border-bottom:1px solid rgba(99,102,241,0.5);color:#fff;min-width:80px">New activity</div><div class="ev-price" contenteditable="true" spellcheck="false" style="outline:none;border-bottom:1px solid rgba(99,102,241,0.3);color:rgba(255,255,255,0.4);min-width:40px">¥0</div></div><div class="ev-sub" contenteditable="true" spellcheck="false" style="outline:none;color:rgba(255,255,255,0.3)">Add a description...</div><div class="ev-edit-actions"><div class="ev-save-btn" onclick="saveEvent(this)">Save</div><div class="ev-cancel-btn" onclick="removeEvent(this)">Remove</div></div></div>';
  container.appendChild(newEvent);
  var nameEl=newEvent.querySelector('.ev-name');
  if(nameEl){
    nameEl.focus();
    var range=document.createRange();
    range.selectNodeContents(nameEl);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }
}

function toggleEditMode(){
  var badge=document.querySelector('.edit-mode-badge');
  var doneBtn=document.getElementById('done-btn');
  if(badge.style.display==='none'){
    badge.style.display='flex';
    doneBtn.innerHTML='<i class="ti ti-check" style="font-size:12px"></i>Done';
  } else {
    badge.style.display='none';
    doneBtn.innerHTML='<i class="ti ti-edit" style="font-size:12px"></i>Edit';
  }
}
</script>
</body>
</html>"""


def render():
    st.write("ENTRYPOINT TEST: frontend/pages/itinerary.py")
    html = _HTML.replace("{tabler}", _TABLER)
    components.html(html, height=2600, scrolling=False)

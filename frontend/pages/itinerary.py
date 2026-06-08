import streamlit as st
import streamlit.components.v1 as components
import html as _html
import math
from datetime import datetime, time as _time, timedelta

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
                  <div class="ev-name">Selected flight departs SFO</div>
                  <div class="ev-price" style="color:#a5b4fc">Live fare required</div>
                </div>
                <div class="ev-sub">Confirm live fare, airport, cabin, and seat details before booking</div>
                <div class="ev-chips">
                  <span class="ev-chip chip-luxury">Live Duffel fare</span>
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


def _day_sort_key(day_label):
    digits = "".join(ch for ch in str(day_label or "") if ch.isdigit())
    return int(digits or 999)


def _itinerary_days_with_items():
    itinerary_days = st.session_state.get("itinerary_days") or {}
    return {
        day: list(items or [])
        for day, items in sorted(itinerary_days.items(), key=lambda item: _day_sort_key(item[0]))
        if items
    }


def _remove_itinerary_activity(day_label, activity_id):
    itinerary_days = st.session_state.get("itinerary_days") or {}
    items = itinerary_days.get(day_label) or []
    itinerary_days[day_label] = [
        item for item in items if str(item.get("id")) != str(activity_id)
    ]
    st.session_state["itinerary_days"] = itinerary_days


def _move_activity(day_label, activity_id, direction):
    itinerary_days = st.session_state.get("itinerary_days") or {}
    items = list(itinerary_days.get(day_label) or [])
    index = next((idx for idx, item in enumerate(items) if str(item.get("id")) == str(activity_id)), None)
    if index is None:
        return
    new_index = index + direction
    if new_index < 0 or new_index >= len(items):
        return
    items[index], items[new_index] = items[new_index], items[index]
    itinerary_days[day_label] = items
    st.session_state["itinerary_days"] = itinerary_days


def _change_activity_day(current_day, activity_id, new_day):
    if current_day == new_day:
        return
    itinerary_days = st.session_state.get("itinerary_days") or {}
    current_items = list(itinerary_days.get(current_day) or [])
    moving = None
    remaining = []
    for item in current_items:
        if str(item.get("id")) == str(activity_id) and moving is None:
            moving = item
        else:
            remaining.append(item)
    if moving is None:
        return
    itinerary_days[current_day] = remaining
    itinerary_days.setdefault(new_day, []).append(moving)
    st.session_state["itinerary_days"] = itinerary_days


def _parse_duration_minutes(duration):
    text = str(duration or "").lower().replace("–", "-")
    numbers = []
    current = ""
    for char in text:
        if char.isdigit() or char == ".":
            current += char
        elif current:
            try:
                numbers.append(float(current))
            except ValueError:
                pass
            current = ""
    if current:
        try:
            numbers.append(float(current))
        except ValueError:
            pass
    if not numbers:
        return 90
    value = sum(numbers[:2]) / min(len(numbers), 2) if len(numbers) > 1 else numbers[0]
    if "min" in text:
        return max(20, int(value))
    return max(30, int(value * 60))


def _format_dt(dt):
    return dt.strftime("%-I:%M %p")


def _haversine_km(a, b):
    try:
        lat1, lon1 = float(a.get("lat")), float(a.get("lng"))
        lat2, lon2 = float(b.get("lat")), float(b.get("lng"))
    except (TypeError, ValueError):
        return None
    radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    x = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def _estimate_travel(previous, current):
    distance_km = _haversine_km(previous or {}, current or {})
    if distance_km is None:
        return {"label": "~18 min transit", "minutes": 18, "distance_km": None}
    if distance_km <= 0.8:
        return {"label": "~10 min walk", "minutes": 10, "distance_km": distance_km}
    if distance_km <= 2.2:
        return {"label": "~18 min walk/transit", "minutes": 18, "distance_km": distance_km}
    return {"label": f"~{max(18, min(55, int(distance_km * 7)))} min transit", "minutes": max(18, min(55, int(distance_km * 7))), "distance_km": distance_km}


def _activity_sort_bucket(item):
    category = str(item.get("category") or "").lower()
    name = str(item.get("name") or "").lower()
    if "food" in category or any(word in name for word in ("restaurant", "market", "coffee", "cafe")):
        return 2
    if "nightlife" in category or any(word in name for word in ("bar", "jazz", "club", "night")):
        return 4
    if "nature" in category or "adventure" in category:
        return 1
    return 0


def _hotel_base():
    hotel = st.session_state.get("selected_hotel") or st.session_state.get("active_hotel") or {}
    neighborhood = hotel.get("neighborhood") or st.session_state.get("selected_neighborhood_name") or ""
    base = {"lat": hotel.get("lat"), "lng": hotel.get("lng")}
    return neighborhood, base


def _smart_sort_bucket(item):
    category = str(item.get("category") or "").lower()
    name = str(item.get("name") or "").lower()
    if "nightlife" in category or any(w in name for w in ("bar", "club", "jazz", "izakaya", "golden gai")):
        return 60
    if any(w in name for w in ("dinner", "omakase", "kappo", "kaiseki")) and "food" in category:
        return 52
    if any(w in name for w in ("skytree", "sky tree", "tower", "observation", "rooftop", "sky deck")):
        return 45
    if "food" in category or any(w in name for w in ("restaurant", "ramen", "sushi", "lunch", "brunch")):
        return 30
    if any(w in category for w in ("culture", "museum", "temple", "shrine", "historic", "history")):
        return 10
    if any(w in name for w in ("temple", "shrine", "museum", "garden", "castle", "palace", "jinja")):
        return 10
    if "market" in name or "market" in category:
        return 15
    if "nature" in category or any(w in name for w in ("park", "garden", "hike", "trail", "forest")):
        return 20
    return 35


def _nearest_neighbor_order(group, start_point):
    if not group:
        return []
    remaining = list(group)
    ordered = []
    current = start_point
    while remaining:
        candidates = [(i, _haversine_km(current, item)) for i, item in enumerate(remaining)]
        with_dist = [(i, d) for i, d in candidates if d is not None]
        next_i = min(with_dist, key=lambda x: x[1])[0] if with_dist else 0
        item = remaining.pop(next_i)
        ordered.append(item)
        current = item
    return ordered


def _smart_optimize_day(day_label):
    itinerary_days = st.session_state.get("itinerary_days") or {}
    items = list(itinerary_days.get(day_label) or [])
    if len(items) < 2:
        return
    _, base = _hotel_base()
    buckets = {}
    for item in items:
        b = _smart_sort_bucket(item)
        buckets.setdefault(b, []).append(item)
    ordered = []
    current = base
    for b in sorted(buckets):
        group = _nearest_neighbor_order(buckets[b], current)
        ordered.extend(group)
        if group:
            current = group[-1]
    itinerary_days[day_label] = ordered
    st.session_state["itinerary_days"] = itinerary_days


def _optimize_trip():
    for day_label in list(st.session_state.get("itinerary_days") or {}):
        _smart_optimize_day(day_label)
    st.session_state["itinerary_optimize_notice"] = (
        "All days reordered: temples and markets early, observation decks before sunset, nightlife last."
    )


def _day_name_from_items(day_label, items):
    areas = []
    for item in items:
        raw = str(item.get("neighborhood") or item.get("address") or "")
        area = raw.split(",")[0].strip()
        if area and area not in areas and len(area) < 28:
            areas.append(area)
    has_nightlife = any(
        "nightlife" in str(i.get("category", "")).lower()
        or any(w in str(i.get("name", "")).lower() for w in ("bar", "jazz", "club", "golden gai"))
        for i in items
    )
    has_culture = any(
        any(w in str(i.get("category", "")).lower() for w in ("culture", "museum", "temple", "shrine"))
        or any(w in str(i.get("name", "")).lower() for w in ("temple", "shrine", "museum", "castle"))
        for i in items
    )
    has_observation = any(
        any(w in str(i.get("name", "")).lower() for w in ("tower", "sky", "observation", "deck", "skytree"))
        for i in items
    )
    has_nature = any("nature" in str(i.get("category", "")).lower() for i in items)
    area_part = " + ".join(a.split()[0] for a in areas[:2]) if areas else "City"
    if has_nightlife:
        return f"{area_part} · Nightlife"
    if has_observation and has_culture:
        return f"{area_part} · Views & Culture"
    if has_culture and has_nature:
        return f"{area_part} · Culture & Nature"
    if has_culture:
        return f"{area_part} · Culture"
    if has_observation:
        return f"{area_part} · Views"
    if has_nature:
        return f"{area_part} · Nature"
    return area_part or day_label


def _day_summary_sentence(items, scheduled_items):
    if not items:
        return ""
    cats = [str(i.get("category", "")).lower() for i in items]
    names = [str(i.get("name", "")).lower() for i in items]
    has_nature = any("nature" in c or "park" in c for c in cats)
    has_culture = any(w in c for c in cats for w in ("culture", "museum", "temple", "shrine", "historic"))
    has_nightlife = any("nightlife" in c for c in cats)
    has_food = any("food" in c for c in cats)
    has_obs = any(w in n for n in names for w in ("tower", "sky", "observation", "deck", "skytree"))
    first = str(items[0].get("name") or "").split("·")[0].strip() if items else ""
    parts = []
    if has_obs:
        parts.append("views from above")
    elif has_culture:
        parts.append("cultural sights")
    elif has_nature:
        parts.append("outdoor walks")
    if has_culture and has_obs:
        parts.append("historic streets")
    if has_nightlife:
        parts.append("evening nightlife")
    elif has_food:
        parts.append("local food")
    if not parts:
        return f"A full city day — {len(items)} stop{'s' if len(items) != 1 else ''}." if items else ""
    if len(parts) == 1:
        return f"A day focused on {parts[0]}."
    if len(parts) == 2:
        return f"Move from {parts[0]} to {parts[1]}."
    return f"Start with {parts[0]}, explore {parts[1]}, end with {parts[2]}."


def _day_stats(scheduled_items):
    real = [s for s in scheduled_items if not s.get("_meal_gap")]
    if not real:
        return {"total_hrs": 0, "transit_mins": 0, "pacing": "Relaxed"}
    first = real[0]["start"]
    last = real[-1]["end"]
    total_mins = max(0, int((last - first).total_seconds() / 60))
    transit_mins = sum((s.get("travel_before") or {}).get("minutes", 0) for s in real)
    n = len(real)
    hrs = total_mins / 60
    if hrs < 7 or n <= 2:
        pacing = "Relaxed"
    elif hrs < 10 or n <= 4:
        pacing = "Balanced"
    else:
        pacing = "Packed"
    return {"total_hrs": round(hrs, 1), "transit_mins": int(transit_mins), "pacing": pacing}


def _enrich_with_meal_gaps(scheduled_items):
    _FOOD = ("restaurant", "lunch", "dinner", "breakfast", "café", "cafe", "sushi", "ramen", "market", "izakaya")

    def _is_food(s):
        item = s["item"]
        return "food" in str(item.get("category", "")).lower() or any(
            w in str(item.get("name", "")).lower() for w in _FOOD
        )

    has_lunch = any(_is_food(s) and 10 <= s["start"].hour < 15 for s in scheduled_items)
    has_dinner = any(_is_food(s) and 17 <= s["start"].hour < 22 for s in scheduled_items)
    base = datetime.combine(datetime.today(), _time(9, 0))
    gaps = []
    if not has_lunch:
        t = base.replace(hour=12, minute=30)
        gaps.append({
            "_meal_gap": "lunch",
            "start": t,
            "end": t + timedelta(minutes=60),
            "travel_before": None,
            "warnings": [],
            "item": {"name": "🍱 Lunch break", "category": "food", "_is_placeholder": True},
        })
    if not has_dinner:
        t = base.replace(hour=18, minute=30)
        gaps.append({
            "_meal_gap": "dinner",
            "start": t,
            "end": t + timedelta(minutes=90),
            "travel_before": None,
            "warnings": [],
            "item": {"name": "🍽 Dinner", "category": "food", "_is_placeholder": True},
        })
    return sorted(scheduled_items + gaps, key=lambda s: s["start"])


def _schedule_items(day_label, items, start_time, end_time):
    current = datetime.combine(datetime.today(), start_time)
    day_end = datetime.combine(datetime.today(), end_time)
    scheduled = []
    previous = None
    warnings = []
    for index, item in enumerate(items):
        travel = _estimate_travel(previous, item) if previous else None
        if travel:
            current += timedelta(minutes=travel["minutes"])
        duration_minutes = _parse_duration_minutes(item.get("duration"))
        start = current
        end = start + timedelta(minutes=duration_minutes)
        item_warnings = []
        opening_status = str(item.get("opening_status") or "").lower()
        if "closed" in opening_status:
            item_warnings.append("This stop may be closed at this time.")
        category = str(item.get("category") or "").lower()
        if "nightlife" in category and start.hour < 18:
            item_warnings.append("Nightlife stop is scheduled early.")
        if "food" in category and start.hour not in (11, 12, 13, 18, 19, 20):
            item_warnings.append("Meal timing may be awkward.")
        if travel and travel.get("distance_km") and travel["distance_km"] > 8:
            item_warnings.append("Backtracking detected.")
        scheduled.append(
            {
                "item": item,
                "start": start,
                "end": end,
                "travel_before": travel,
                "warnings": item_warnings,
            }
        )
        warnings.extend(item_warnings)
        current = end + timedelta(minutes=15)
        previous = item
    if scheduled and scheduled[-1]["end"] > day_end:
        warnings.append("This day may be too packed.")
    return scheduled, list(dict.fromkeys(warnings))


def _timeline_html(enriched, base_neighborhood, start_time):
    rows = []
    start_label = _format_dt(datetime.combine(datetime.today(), start_time))
    hotel_name = _html.escape(base_neighborhood) if base_neighborhood else "your hotel"
    rows.append(
        f'<div class="itn-row">'
        f'<div class="itn-row-time">{start_label}</div>'
        f'<div class="itn-row-spine"><div class="itn-row-dot itn-start-dot"></div><div class="itn-row-line"></div></div>'
        f'<div class="itn-row-content"><div class="itn-start-name">Start from {hotel_name}</div></div>'
        f'</div>'
    )
    total = len(enriched)
    for i, sched in enumerate(enriched):
        item = sched["item"]
        is_placeholder = item.get("_is_placeholder", False)
        is_meal = bool(sched.get("_meal_gap"))
        is_last = i == total - 1
        name = str(item.get("name") or "Activity")
        description = str(item.get("description") or "")
        address = str(item.get("address") or item.get("neighborhood") or "")
        duration_raw = str(item.get("duration") or "")
        cost = str(item.get("estimated_cost") or "")
        warnings = sched.get("warnings") or []
        travel = sched.get("travel_before")
        ts = _format_dt(sched["start"])
        if travel:
            rows.append(
                f'<div class="itn-row itn-travel-row">'
                f'<div class="itn-row-time"></div>'
                f'<div class="itn-row-spine"><div class="itn-row-line" style="min-height:28px"></div></div>'
                f'<div class="itn-row-content itn-travel-content">'
                f'<div class="itn-travel-label">→ {_html.escape(travel["label"])}</div>'
                f'</div></div>'
            )
        meta_parts = []
        if address and not is_placeholder:
            area = address.split(",")[0].strip()
            if area:
                meta_parts.append(_html.escape(area))
        if duration_raw and not is_placeholder:
            meta_parts.append(_html.escape(duration_raw))
        if cost and not is_placeholder:
            meta_parts.append(_html.escape(cost))
        meta_html = f'<div class="itn-row-meta">{" · ".join(meta_parts)}</div>' if meta_parts else ""
        note_html = f'<div class="itn-row-note">{_html.escape(description)}</div>' if description and not is_placeholder else ""
        warn_html = f'<div class="itn-row-warn">⚠ {_html.escape(warnings[0])}</div>' if warnings else ""
        line_html = "" if is_last else '<div class="itn-row-line"></div>'
        if is_meal:
            dot_c = "itn-row-dot itn-meal-dot"
            name_html = f'<div class="itn-meal-name">{_html.escape(name)}</div>'
            note_html = '<div class="itn-meal-note">No restaurant added — keep flexible or add one from Activities.</div>'
        else:
            dot_c = "itn-row-dot"
            name_html = f'<div class="itn-row-name">{_html.escape(name)}</div>'
        rows.append(
            f'<div class="itn-row">'
            f'<div class="itn-row-time">{_html.escape(ts)}</div>'
            f'<div class="itn-row-spine"><div class="{dot_c}"></div>{line_html}</div>'
            f'<div class="itn-row-content">{name_html}{meta_html}{note_html}{warn_html}</div>'
            f'</div>'
        )
    return f'<div class="itn-tl">{"".join(rows)}</div>'


_ITN_CSS = """
<style>
.itn-kicker{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.34);margin-bottom:4px;}
.itn-title{font-size:22px;font-weight:800;letter-spacing:-.5px;color:#fff;margin-bottom:16px;}
.itn-day-hdr{margin-bottom:14px;}
.itn-day-eyebrow{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.28);margin-bottom:3px;}
.itn-day-name{font-size:17px;font-weight:800;letter-spacing:-.3px;color:#fff;margin-bottom:5px;}
.itn-day-sentence{font-size:13px;color:rgba(255,255,255,.46);margin-bottom:10px;line-height:1.5;}
.itn-pills{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:4px;}
.itn-pill{font-size:11px;padding:3px 9px;border-radius:20px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.45);border:.5px solid rgba(255,255,255,.09);}
.itn-pacing-relaxed{color:#34d399 !important;border-color:rgba(52,211,153,.25) !important;background:rgba(52,211,153,.08) !important;}
.itn-pacing-balanced{color:#38bdf8 !important;border-color:rgba(56,189,248,.25) !important;background:rgba(56,189,248,.08) !important;}
.itn-pacing-packed{color:#fb923c !important;border-color:rgba(251,146,60,.25) !important;background:rgba(251,146,60,.08) !important;}
.itn-issues{font-size:12px;color:rgba(254,243,199,.85);background:rgba(251,191,36,.055);border:1px solid rgba(251,191,36,.18);border-radius:8px;padding:7px 11px;margin:6px 0 10px;}
.itn-tl{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif;padding:4px 0 8px;}
.itn-row{display:grid;grid-template-columns:70px 18px 1fr;min-height:0;}
.itn-row-time{font-size:11px;font-weight:700;color:#a5b4fc;text-align:right;padding:3px 10px 0 0;white-space:nowrap;line-height:1;}
.itn-row-spine{display:flex;flex-direction:column;align-items:center;}
.itn-row-dot{width:8px;height:8px;border-radius:50%;background:#6366f1;flex-shrink:0;margin-top:3px;}
.itn-row-line{width:1px;flex:1;min-height:20px;background:rgba(255,255,255,.09);}
.itn-row-content{padding:1px 0 16px 12px;}
.itn-row-name{font-size:14px;font-weight:700;color:#f8fafc;line-height:1.3;margin-bottom:2px;}
.itn-row-meta{font-size:11px;color:rgba(255,255,255,.4);margin-bottom:3px;}
.itn-row-note{font-size:12px;color:rgba(255,255,255,.34);line-height:1.45;}
.itn-row-warn{font-size:11px;color:#fbbf24;margin-top:3px;}
.itn-travel-row .itn-row-time{color:transparent !important;}
.itn-travel-content{padding:0 0 2px 12px;}
.itn-travel-label{font-size:11px;color:rgba(147,197,253,.42);padding:2px 0;}
.itn-start-dot{background:#818cf8 !important;width:10px !important;height:10px !important;margin-top:2px !important;}
.itn-start-name{font-size:13px;font-weight:600;color:rgba(165,180,252,.8);}
.itn-meal-dot{background:transparent !important;border:1.5px dashed rgba(251,191,36,.45) !important;width:10px !important;height:10px !important;margin-top:2px !important;}
.itn-meal-name{font-size:13px;font-weight:600;color:rgba(251,191,36,.72);}
.itn-meal-note{font-size:11px;color:rgba(255,255,255,.28);}
.itn-edit-name{font-size:13px;color:#e4e6f0;padding:5px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
div[data-testid="stButton"] > button{border-radius:8px !important;font-weight:600 !important;}
</style>
"""


def _render_dynamic_itinerary(itinerary_days):
    st.markdown(_ITN_CSS, unsafe_allow_html=True)

    # ── Global header ──────────────────────────────────────────────────────
    hdr1, hdr2 = st.columns([4, 1])
    with hdr1:
        destination = str(st.session_state.get("trip_destination") or "Your trip")
        st.markdown(
            f'<div class="itn-kicker">Itinerary</div>'
            f'<div class="itn-title">{_html.escape(destination)}</div>',
            unsafe_allow_html=True,
        )
    with hdr2:
        if st.button(
            "✦ Optimize trip", key="itn_opt_all", use_container_width=True,
            help="Temples and markets early · observation decks before sunset · nightlife last · nearest-neighbor routing"
        ):
            _optimize_trip()
            st.rerun()

    notice = st.session_state.pop("itinerary_optimize_notice", "")
    if notice:
        st.success(notice)

    base_neighborhood, _ = _hotel_base()
    all_day_labels = list(itinerary_days.keys())
    day_settings = st.session_state.setdefault("itinerary_day_settings", {})

    for day_label, items in itinerary_days.items():
        settings = day_settings.setdefault(day_label, {})
        start_time = settings.get("start_time") or _time(9, 0)
        end_time = settings.get("end_time") or _time(21, 0)

        scheduled_items, day_warnings = _schedule_items(day_label, items, start_time, end_time)
        enriched = _enrich_with_meal_gaps(scheduled_items)
        stats = _day_stats(scheduled_items)
        day_name = _day_name_from_items(day_label, items)
        day_sentence = _day_summary_sentence(items, scheduled_items)

        pacing_class = {"Relaxed": "itn-pacing-relaxed", "Balanced": "itn-pacing-balanced", "Packed": "itn-pacing-packed"}.get(
            stats["pacing"], ""
        )

        with st.container(border=True):
            # ── Day header ─────────────────────────────────────────────────
            dh1, dh2 = st.columns([3, 1])
            with dh1:
                time_pill = f'<span class="itn-pill">⏱ {stats["total_hrs"]} hrs</span>' if stats["total_hrs"] else ""
                transit_pill = (
                    f'<span class="itn-pill">🚇 ~{stats["transit_mins"]} min transit</span>'
                    if stats["transit_mins"] else ""
                )
                pacing_pill = f'<span class="itn-pill {pacing_class}">◆ {_html.escape(stats["pacing"])}</span>'
                st.markdown(
                    f'<div class="itn-day-hdr">'
                    f'<div class="itn-day-eyebrow">{_html.escape(day_label)}</div>'
                    f'<div class="itn-day-name">{_html.escape(day_name)}</div>'
                    f'<div class="itn-day-sentence">{_html.escape(day_sentence)}</div>'
                    f'<div class="itn-pills">{time_pill}{transit_pill}{pacing_pill}</div>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
            with dh2:
                st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
                if st.button(
                    "Optimize day", key=f"itn_optday_{day_label}", use_container_width=True,
                    help="Reorder this day: temples early, observation decks before sunset, nightlife last"
                ):
                    _smart_optimize_day(day_label)
                    st.session_state["itinerary_optimize_notice"] = f"{day_label} reordered."
                    st.rerun()

            # ── Warnings ───────────────────────────────────────────────────
            if day_warnings:
                unique_w = list(dict.fromkeys(day_warnings))[:3]
                st.markdown(
                    f'<div class="itn-issues">⚠ {_html.escape(" · ".join(unique_w))}</div>',
                    unsafe_allow_html=True,
                )

            # ── Timeline ───────────────────────────────────────────────────
            st.markdown(_timeline_html(enriched, base_neighborhood, start_time), unsafe_allow_html=True)

            # ── Meal gap buttons ───────────────────────────────────────────
            meal_gaps = [(s["_meal_gap"], s) for s in enriched if s.get("_meal_gap")]
            if meal_gaps:
                btn_cols = st.columns(len(meal_gaps))
                for col, (gap_type, _) in zip(btn_cols, meal_gaps):
                    label = "+ Add lunch restaurant" if gap_type == "lunch" else "+ Add dinner restaurant"
                    with col:
                        if st.button(label, key=f"itn_meal_{day_label}_{gap_type}", use_container_width=True):
                            st.info("Go to the Activities page and add a restaurant — it will appear here automatically.")

            # ── Edit activities ────────────────────────────────────────────
            with st.expander("✏ Edit activities", expanded=False):
                for idx, item in enumerate(items):
                    name = str(item.get("name") or "Activity")
                    activity_id = str(item.get("id") or f"{day_label}_{name}")
                    ec = st.columns([4, 1, 1, 2, 1])
                    with ec[0]:
                        st.markdown(f'<div class="itn-edit-name">{_html.escape(name)}</div>', unsafe_allow_html=True)
                    with ec[1]:
                        if st.button("↑", key=f"itn_up_{day_label}_{activity_id}_{idx}",
                                     disabled=idx == 0, use_container_width=True):
                            _move_activity(day_label, activity_id, -1)
                            st.rerun()
                    with ec[2]:
                        if st.button("↓", key=f"itn_dn_{day_label}_{activity_id}_{idx}",
                                     disabled=idx >= len(items) - 1, use_container_width=True):
                            _move_activity(day_label, activity_id, 1)
                            st.rerun()
                    with ec[3]:
                        new_day = st.selectbox(
                            "Move to",
                            all_day_labels,
                            index=all_day_labels.index(day_label) if day_label in all_day_labels else 0,
                            key=f"itn_cd_{day_label}_{activity_id}_{idx}",
                            label_visibility="collapsed",
                        )
                        if new_day != day_label:
                            _change_activity_day(day_label, activity_id, new_day)
                            st.rerun()
                    with ec[4]:
                        if st.button("✕", key=f"itn_rm_{day_label}_{activity_id}_{idx}",
                                     use_container_width=True):
                            _remove_itinerary_activity(day_label, activity_id)
                            st.rerun()

            # ── Day settings ───────────────────────────────────────────────
            with st.expander("⚙ Day settings", expanded=False):
                sc1, sc2 = st.columns(2)
                with sc1:
                    new_start = st.time_input("Day start", value=start_time, key=f"itn_ts_{day_label}")
                with sc2:
                    new_end = st.time_input("Day end", value=end_time, key=f"itn_te_{day_label}")
                day_settings[day_label] = {"start_time": new_start, "end_time": new_end}
                st.session_state["itinerary_day_settings"] = day_settings


def render():
    itinerary_days = _itinerary_days_with_items()
    if itinerary_days:
        _render_dynamic_itinerary(itinerary_days)
        return

    html = _HTML.replace("{tabler}", _TABLER)
    html = html.replace(
        "</body>",
        posthog_client_script("itinerary")
        + """
<script>
document.addEventListener('click', function(event) {
  var action = null;
  if (event.target.closest('.add-event-btn')) action = 'add_activity';
  if (event.target.closest('.ev-save-btn')) action = 'save_activity';
  if (event.target.closest('.ev-edit-btn.danger')) action = 'remove_activity';
  if (event.target.closest('#done-btn')) action = 'toggle_edit_mode';
  if (!action) return;
  byableTrack('itinerary_modified', {
    action: action,
    page_name: 'itinerary'
  });
});
</script>
</body>""",
    )
    components.html(html, height=2600, scrolling=True)

import streamlit as st
import streamlit.components.v1 as components
import html as _html
import math
import re

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
.it{min-height:100vh;background:
  radial-gradient(circle at 12% 0%,rgba(139,92,246,.12),transparent 28%),
  radial-gradient(circle at 92% 10%,rgba(52,211,153,.08),transparent 26%),
  linear-gradient(180deg,#080a12 0%,#07090f 38%,#05060a 100%);
  color:#e4e6f0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif;padding:0 0 72px}
.it-shell{max-width:1160px;margin:0 auto;padding:28px 24px 0}
.it-header{padding:0;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.62fr);gap:18px;align-items:stretch}
.it-hero{border:1px solid rgba(255,255,255,.09);border-radius:22px;background:
  linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.018)),
  rgba(8,11,19,.88);box-shadow:0 24px 70px rgba(0,0,0,.28);padding:22px}
.it-eyebrow{font-size:11px;font-weight:700;letter-spacing:0.9px;text-transform:uppercase;color:rgba(196,181,253,.72);margin-bottom:8px}
.it-title{font-size:34px;font-weight:850;letter-spacing:-1.1px;color:#fff;margin-bottom:8px}
.it-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.it-meta-item{display:flex;align-items:center;gap:5px;font-size:13px;color:rgba(255,255,255,0.52)}
.it-meta-sep{color:rgba(255,255,255,0.12)}
.it-trip-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:16px}
.it-trip-chip{font-size:11px;font-weight:650;color:rgba(255,255,255,.66);padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08)}
.it-side-card{border:1px solid rgba(255,255,255,.08);border-radius:22px;background:rgba(255,255,255,.035);padding:18px;display:flex;flex-direction:column;justify-content:space-between;gap:16px}
.it-side-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.34);font-weight:700;margin-bottom:8px}
.it-side-route{font-size:14px;font-weight:750;color:#fff;line-height:1.35}
.it-side-sub{font-size:12px;color:rgba(255,255,255,.44);line-height:1.45;margin-top:5px}
.it-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.it-summary-tile{border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(0,0,0,.14);padding:10px}
.it-summary-num{font-size:18px;font-weight:800;color:#fff;line-height:1}
.it-summary-cap{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.34);margin-top:5px}
.it-header-right{display:flex;gap:8px;flex-shrink:0;align-items:center}
.it-btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 13px;border-radius:10px;font-size:12px;font-weight:650;cursor:pointer;border:0.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.65)}
.it-btn:hover{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.8)}
.it-btn-ai{background:rgba(99,102,241,0.12);border-color:rgba(99,102,241,0.3);color:#a5b4fc}
.edit-mode-badge{display:none;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;background:rgba(99,102,241,0.15);border:0.5px solid rgba(99,102,241,0.4);color:#a5b4fc}
.edit-dot{width:6px;height:6px;border-radius:50%;background:#6366f1;animation:blink 1.5s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
.day-nav{display:flex;gap:7px;margin:20px 0 0;padding:4px;overflow-x:auto;border:1px solid rgba(255,255,255,.07);border-radius:16px;background:rgba(255,255,255,.025)}
.dn-pill{flex-shrink:0;padding:8px 15px;border-radius:12px;font-size:12px;font-weight:650;cursor:pointer;border:0.5px solid transparent;color:rgba(255,255,255,0.45)}
.dn-pill.active{background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.4);color:#c7d2fe}
.timeline{padding:22px 0 0;display:flex;flex-direction:column;gap:18px}
.day-card{border-radius:20px;border:1px solid rgba(255,255,255,0.08);background:
  linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.014)),
  rgba(8,10,17,.90);overflow:hidden;transition:border-color 0.15s,transform .15s;box-shadow:0 18px 60px rgba(0,0,0,.20)}
.day-card.expanded{border-color:rgba(196,181,253,0.24)}
.day-card-header{display:flex;align-items:center;padding:18px 20px;cursor:pointer;gap:14px}
.day-card-header:hover{background:rgba(255,255,255,0.02)}
.dcn-badge{display:flex;flex-direction:column;align-items:center;justify-content:center;width:48px;height:48px;border-radius:14px;flex-shrink:0;border:1px solid rgba(255,255,255,.06)}
.dcn-num{font-size:19px;font-weight:800;line-height:1;color:#fff}
.dcn-day{font-size:9px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-top:2px;opacity:0.7}
.day-card-header-info{flex:1;min-width:0}
.dch-title{font-size:16px;font-weight:780;margin-bottom:5px;color:#fff}
.dch-tags{display:flex;gap:5px;flex-wrap:wrap}
.dch-tag{font-size:10px;padding:2px 7px;border-radius:4px;font-weight:500}
.day-card-header-right{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0}
.dcr-cost{font-size:19px;font-weight:800;letter-spacing:-0.3px}
.dcr-label{font-size:10px;color:rgba(255,255,255,0.3)}
.dcr-chevron{font-size:15px;color:rgba(255,255,255,0.2);margin-top:4px;transition:transform 0.2s}
.expanded .dcr-chevron{transform:rotate(180deg)}
.day-body{border-top:0.5px solid rgba(255,255,255,0.06);padding:0 20px 20px}
.period{margin-top:18px}
.period-label{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.period-icon{width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0}
.period-name{font-size:11px;font-weight:800;letter-spacing:0.7px;text-transform:uppercase;color:rgba(255,255,255,0.44)}
.period-line{flex:1;height:0.5px;background:rgba(255,255,255,0.06)}
.items{display:flex;flex-direction:column;gap:6px}
.event{display:flex;gap:10px;align-items:flex-start}
.event-time-col{width:42px;flex-shrink:0;padding-top:2px}
.event-time{font-size:11px;color:rgba(255,255,255,0.25);font-weight:500}
.event-dot-col{display:flex;flex-direction:column;align-items:center;padding-top:5px;width:14px;flex-shrink:0}
.event-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.event-line{width:1px;flex:1;min-height:18px;background:rgba(255,255,255,0.06);margin-top:4px}
.event-card{flex:1;min-width:0;border-radius:13px;padding:12px 14px;border:0.5px solid rgba(255,255,255,0.075);background:rgba(255,255,255,0.025);position:relative}
.it.editing .event-card:hover .ev-edit-bar{opacity:1}
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
.ev-top{display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;padding-right:72px}
.ev-name{font-size:14px;font-weight:740;line-height:1.3;flex:1;color:#fff}
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
.transit-bar{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:rgba(56,189,248,0.055);border:0.5px solid rgba(56,189,248,0.14)}
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
.it:not(.editing) .ev-edit-bar{display:none}
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
@media(max-width:780px){
  .it-shell{padding:18px 12px 0}
  .it-header{grid-template-columns:1fr}
  .it-title{font-size:27px}
  .it-hero,.it-side-card{border-radius:18px;padding:16px}
  .day-card-header{align-items:flex-start}
  .day-card-header-right{align-items:flex-start}
  .event-time-col{width:38px}
  .ev-top{padding-right:0;flex-direction:column}
}
</style>
</head>
<body>
<div class="it" id="itineraryRoot">
<div class="it-shell">

  <div class="it-header">
    <div class="it-hero">
      <div class="it-eyebrow">Itinerary</div>
      <div class="it-title">Tokyo &amp; Kyoto</div>
      <div class="it-meta">
        <div class="it-meta-item"><i class="ti ti-calendar" aria-hidden="true"></i>Oct 14 – Oct 24, 2025</div>
        <span class="it-meta-sep">·</span>
        <div class="it-meta-item"><i class="ti ti-users" aria-hidden="true"></i>3 travelers</div>
        <span class="it-meta-sep">·</span>
        <div class="it-meta-item"><i class="ti ti-currency-dollar" aria-hidden="true"></i>$8,420 total</div>
      </div>
      <div class="it-trip-chips">
        <span class="it-trip-chip">Food-first routing</span>
        <span class="it-trip-chip">Low backtracking</span>
        <span class="it-trip-chip">Transit grouped by area</span>
      </div>
    </div>
    <div class="it-side-card">
      <div>
        <div class="it-side-label">Plan quality</div>
        <div class="it-side-route">Balanced daily rhythm</div>
        <div class="it-side-sub">Mornings are lighter, neighborhoods are grouped, and dinner plans stay close to evening areas.</div>
      </div>
      <div class="it-summary-grid">
        <div class="it-summary-tile"><div class="it-summary-num">6</div><div class="it-summary-cap">planned days</div></div>
        <div class="it-summary-tile"><div class="it-summary-num">$1.1k</div><div class="it-summary-cap">activities</div></div>
      </div>
      <div class="it-header-right">
        <div class="edit-mode-badge"><div class="edit-dot"></div>Editing</div>
        <div class="it-btn it-btn-ai"><i class="ti ti-sparkles" style="font-size:12px" aria-hidden="true"></i>AI suggestions</div>
        <div class="it-btn" id="done-btn" onclick="toggleEditMode()"><i class="ti ti-edit" style="font-size:12px" aria-hidden="true"></i>Edit</div>
      </div>
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
  var root=document.getElementById('itineraryRoot');
  var badge=document.querySelector('.edit-mode-badge');
  var doneBtn=document.getElementById('done-btn');
  var isEditing=root && root.classList.toggle('editing');
  if(isEditing){
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


def _available_trip_days():
    # Keep the first version simple and predictable: arrival, full day, departure.
    return ["Day 1", "Day 2", "Day 3"]


def _first_present(*values):
    for value in values:
        if value not in (None, ""):
            return value
    return None


def _clock_minutes(value):
    if not value:
        return None
    text = str(value).strip().lower()
    try:
        suffix = None
        if text.endswith("am") or text.endswith("pm"):
            suffix = text[-2:]
            text = text[:-2].strip()
        if ":" in text:
            hour_text, minute_text = text.split(":", 1)
            hour = int(hour_text)
            minute = int("".join(ch for ch in minute_text if ch.isdigit())[:2] or "0")
        else:
            hour = int("".join(ch for ch in text if ch.isdigit()) or "0")
            minute = 0
        if suffix == "pm" and hour != 12:
            hour += 12
        if suffix == "am" and hour == 12:
            hour = 0
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return hour * 60 + minute
    except (TypeError, ValueError):
        return None
    return None


def _period_from_clock(value, default="Afternoon"):
    minutes = _clock_minutes(value)
    if minutes is None:
        return default
    if minutes < 12 * 60:
        return "Morning"
    if minutes < 17 * 60:
        return "Afternoon"
    return "Evening"


def _selected_hotel_context():
    hotel = (
        st.session_state.get("selected_hotel")
        or st.session_state.get("trip_hotel")
        or st.session_state.get("active_hotel")
        or {}
    )
    return hotel if isinstance(hotel, dict) else {}


def _selected_flight_context():
    flight = st.session_state.get("selected_flight") or {}
    return flight if isinstance(flight, dict) else {}


def _travel_context():
    flight = _selected_flight_context()
    hotel = _selected_hotel_context()
    search = st.session_state.get("flight_search") or {}
    search = search if isinstance(search, dict) else {}

    destination_city = _first_present(
        search.get("destination_city"),
        st.session_state.get("trip_destination"),
        flight.get("destination_city"),
        "destination",
    )
    origin_city = _first_present(search.get("origin_city"), flight.get("origin_city"), "origin")
    return_origin_city = _first_present(search.get("return_origin_city"), destination_city)
    hotel_name = _first_present(hotel.get("name"), "Selected hotel")
    hotel_area = _first_present(hotel.get("neighborhood"), hotel.get("area"), hotel.get("address"), destination_city)
    arrival_airport = _first_present(flight.get("destination"), search.get("destination_airport"))
    departure_airport = _first_present(flight.get("destination"), search.get("return_origin_airport"), arrival_airport)
    return {
        "has_flight": bool(flight),
        "has_hotel": bool(hotel),
        "airline": _first_present(flight.get("airline"), "Selected flight"),
        "flight_number": _first_present(flight.get("flight_number"), ""),
        "arrival_airport": arrival_airport,
        "arrival_time": _first_present(flight.get("arrive_time"), ""),
        "departure_airport": departure_airport,
        "departure_time": _first_present(flight.get("return_depart_time"), flight.get("return_departure_time"), ""),
        "destination_city": destination_city,
        "origin_city": origin_city,
        "return_origin_city": return_origin_city,
        "hotel_name": hotel_name,
        "hotel_area": hotel_area,
        "hotel_address": _first_present(hotel.get("address"), hotel_area),
        "hotel_lat": hotel.get("lat"),
        "hotel_lng": hotel.get("lng"),
    }


def _has_travel_context(context=None):
    context = context or _travel_context()
    return bool(context.get("has_flight") or context.get("has_hotel"))


def _transfer_duration_label(airport):
    code = str(airport or "").upper()
    if code in {"HND", "LGA", "LCY", "ITM"}:
        return "~35-55 min"
    if code in {"NRT", "KIX", "EWR", "STN", "LTN", "PKX"}:
        return "~60-90 min"
    return "~45-70 min"


def _fixed_day_blocks(day, context=None):
    context = context or _travel_context()
    blocks = []
    hotel_name = context.get("hotel_name") or "Selected hotel"
    hotel_area = context.get("hotel_area") or context.get("destination_city") or "hotel area"
    airport = context.get("arrival_airport") or context.get("departure_airport") or "airport"
    transfer_duration = _transfer_duration_label(airport)

    if day == "Day 1":
        arrival_period = _period_from_clock(context.get("arrival_time"), default="Afternoon")
        if context.get("has_flight"):
            flight_label = " ".join(
                part for part in (context.get("airline"), context.get("flight_number")) if part
            )
            note = f"{flight_label} · {context.get('arrival_time')}" if context.get("arrival_time") else flight_label
            blocks.append(
                {
                    "id": "arrival_airport",
                    "name": f"Arrive at {airport}",
                    "duration": context.get("arrival_time") or "Arrival",
                    "category": "Flight",
                    "estimated_cost": "",
                    "neighborhood": airport,
                    "period": arrival_period,
                    "fixed": True,
                    "note": note or "Airport arrival",
                }
            )
            blocks.append(
                {
                    "id": "arrival_transfer",
                    "name": "Transfer from airport to hotel",
                    "duration": transfer_duration,
                    "category": "Transit",
                    "estimated_cost": "",
                    "neighborhood": hotel_area,
                    "period": arrival_period,
                    "fixed": True,
                    "note": f"{airport} to {hotel_area}",
                }
            )
        if context.get("has_hotel"):
            checkin_period = "Afternoon" if arrival_period in ("Morning", "Afternoon") else "Evening"
            blocks.append(
                {
                    "id": "hotel_checkin",
                    "name": f"Check in - {hotel_name}",
                    "duration": "30-45 min",
                    "category": "Hotel",
                    "estimated_cost": "",
                    "neighborhood": hotel_area,
                    "lat": context.get("hotel_lat"),
                    "lng": context.get("hotel_lng"),
                    "period": checkin_period,
                    "fixed": True,
                    "note": context.get("hotel_address") or hotel_area,
                }
            )
    elif day == "Day 3":
        if context.get("has_hotel"):
            blocks.append(
                {
                    "id": "hotel_checkout",
                    "name": f"Check out - {hotel_name}",
                    "duration": "30 min",
                    "category": "Hotel",
                    "estimated_cost": "",
                    "neighborhood": hotel_area,
                    "lat": context.get("hotel_lat"),
                    "lng": context.get("hotel_lng"),
                    "period": "Morning",
                    "fixed": True,
                    "note": context.get("hotel_address") or hotel_area,
                }
            )
        if context.get("has_flight"):
            departure_period = _period_from_clock(context.get("departure_time"), default="Afternoon")
            blocks.append(
                {
                    "id": "departure_transfer",
                    "name": "Transfer to airport",
                    "duration": transfer_duration,
                    "category": "Transit",
                    "estimated_cost": "",
                    "neighborhood": airport,
                    "period": departure_period,
                    "fixed": True,
                    "note": f"{hotel_area} to {airport}",
                }
            )
            blocks.append(
                {
                    "id": "airport_buffer",
                    "name": "Airport buffer before departure",
                    "duration": "2.5-3 hrs",
                    "category": "Flight",
                    "estimated_cost": "",
                    "neighborhood": airport,
                    "period": departure_period,
                    "fixed": True,
                    "note": "Check bags, security, and boarding time",
                }
            )
    return blocks


def _activity_location_key(activity):
    destination = str(activity.get("destination") or "").strip().lower()
    neighborhood = str(activity.get("neighborhood") or activity.get("address") or "").strip().lower()
    return f"{destination}|{neighborhood}"


def _group_nearby_activities(activities):
    remaining = list(activities or [])
    groups = []
    while remaining:
        seed = remaining.pop(0)
        group = [seed]
        keep = []
        for candidate in remaining:
            same_area = _activity_location_key(candidate) == _activity_location_key(seed)
            distance = _haversine_km(seed, candidate)
            if same_area or (distance is not None and distance <= 2.5):
                group.append(candidate)
            else:
                keep.append(candidate)
        remaining = keep
        groups.append(group)
    return groups


def _activity_text(activity):
    parts = [
        activity.get("name"),
        activity.get("category"),
        activity.get("subcategory"),
        activity.get("neighborhood"),
        " ".join(str(tag) for tag in activity.get("tags", []) or []),
    ]
    return " ".join(str(part or "") for part in parts).lower()


def _meal_slot(activity):
    text = _activity_text(activity)
    category = str(activity.get("category") or "").lower()
    if "nightlife" in category or any(word in text for word in ("bar", "jazz", "club", "cocktail", "nightlife", "pub")):
        return "nightlife"
    is_food = "food" in category or any(
        word in text
        for word in (
            "restaurant",
            "food",
            "coffee",
            "cafe",
            "café",
            "bakery",
            "market",
            "ramen",
            "sushi",
            "izakaya",
            "dining",
            "brunch",
            "breakfast",
            "lunch",
            "dinner",
        )
    )
    if not is_food:
        return ""
    if any(word in text for word in ("breakfast", "brunch", "coffee", "cafe", "café", "bakery", "pastry")):
        return "breakfast"
    if any(word in text for word in ("dinner", "izakaya", "omakase", "wine", "cocktail", "steak")):
        return "dinner"
    if any(word in text for word in ("lunch", "market", "ramen", "sushi", "restaurant", "food")):
        return "lunch"
    return "lunch"


def _activity_sort_weight(activity):
    slot = _meal_slot(activity)
    if slot == "breakfast":
        return 5
    if slot == "lunch":
        return 45
    if slot == "dinner":
        return 82
    if slot == "nightlife":
        return 95
    category = str(activity.get("category") or "").lower()
    if "nature" in category or "adventure" in category:
        return 20
    if "culture" in category:
        return 30
    if "shopping" in category or "luxury" in category:
        return 62
    return 50


def _order_day_activities(items):
    ordered = sorted(items or [], key=lambda item: (_activity_sort_weight(item), item.get("name") or ""))
    non_meal = [item for item in ordered if not _meal_slot(item)]
    meals = [item for item in ordered if _meal_slot(item)]
    if not non_meal:
        return ordered
    output = list(non_meal)
    for meal in meals:
        slot = _meal_slot(meal)
        if slot == "breakfast":
            insert_at = 0
        elif slot == "lunch":
            insert_at = max(1, len(output) // 2)
        elif slot == "dinner":
            insert_at = len(output)
        else:
            insert_at = len(output)
        best_index = insert_at
        best_distance = None
        for idx, candidate in enumerate(output):
            distance = _haversine_km(meal, candidate)
            if distance is None:
                continue
            if best_distance is None or distance < best_distance:
                best_distance = distance
                if slot == "breakfast":
                    best_index = max(0, idx)
                elif slot == "lunch":
                    best_index = min(len(output), idx + 1)
                else:
                    best_index = min(len(output), idx + 1)
        output.insert(best_index, meal)
    return output


def _day_proximity_score(day_items, activity):
    distances = [
        _haversine_km(existing, activity)
        for existing in day_items or []
    ]
    distances = [distance for distance in distances if distance is not None]
    if not distances:
        return 999
    return min(distances)


def _assign_activities_to_days(activities):
    days = _available_trip_days()
    assigned = {day: [] for day in days}
    groups = _group_nearby_activities(activities)
    context = _travel_context()
    if _has_travel_context(context):
        # Arrival and departure anchors reduce realistic sightseeing capacity.
        capacities = {"Day 1": 1, "Day 2": 4, "Day 3": 1}
    else:
        capacities = {"Day 1": 2, "Day 2": 4, "Day 3": 2}

    for group in groups:
        group_has_meal = any(_meal_slot(activity) for activity in group)
        candidate_days = sorted(
            days,
            key=lambda day: (
                _day_proximity_score(assigned[day], group[0]) if group_has_meal else 0,
                len(assigned[day]) + len(group) > capacities.get(day, 3),
                len(assigned[day]),
                0 if day == "Day 2" else 1,
            ),
        )
        assigned[candidate_days[0]].extend(group)
    return {day: _order_day_activities(items) for day, items in assigned.items()}


def _itinerary_item_key(item):
    raw_key = _first_present(item.get("id"), item.get("place_id"), item.get("name"), "activity")
    return "".join(ch.lower() if ch.isalnum() else "_" for ch in str(raw_key)).strip("_")[:80] or "activity"


def _ensure_itinerary_shape(days_data):
    days = _available_trip_days()
    output = {day: [] for day in days}
    if isinstance(days_data, dict):
        for day in days:
            output[day] = list(days_data.get(day) or [])
    return output


def _save_itinerary_days(days_data):
    st.session_state["itinerary_days"] = _ensure_itinerary_shape(days_data)


def _auto_assign_itinerary():
    existing = st.session_state.get("itinerary_days")
    if existing:
        return _ensure_itinerary_shape(existing)

    unscheduled = list(st.session_state.get("itinerary_unscheduled_activities") or [])
    if not unscheduled:
        if _has_travel_context():
            return {day: [] for day in _available_trip_days()}
        return {}
    assigned = _assign_activities_to_days(unscheduled)
    _save_itinerary_days(assigned)
    return assigned


def _find_activity_day(days_data, item_key):
    for day, items in _ensure_itinerary_shape(days_data).items():
        for item in items:
            if _itinerary_item_key(item) == item_key:
                return day
    return None


def _move_activity_to_day(item_key, target_day):
    days_data = _ensure_itinerary_shape(st.session_state.get("itinerary_days"))
    current_day = _find_activity_day(days_data, item_key)
    if not current_day or target_day not in days_data or current_day == target_day:
        return
    moving_item = None
    remaining = []
    for item in days_data[current_day]:
        if _itinerary_item_key(item) == item_key and moving_item is None:
            moving_item = item
        else:
            remaining.append(item)
    if not moving_item:
        return
    days_data[current_day] = remaining
    days_data[target_day].append(moving_item)
    _save_itinerary_days(days_data)


def _move_activity_to_period(item_key, target_period):
    if target_period not in {"Morning", "Afternoon", "Evening"}:
        return
    days_data = _ensure_itinerary_shape(st.session_state.get("itinerary_days"))
    for day, items in days_data.items():
        for item in items:
            if _itinerary_item_key(item) == item_key:
                item["period"] = target_period
                item["manual_period"] = True
                _save_itinerary_days(days_data)
                return


def _delete_activity(item_key):
    days_data = _ensure_itinerary_shape(st.session_state.get("itinerary_days"))
    changed = False
    for day, items in days_data.items():
        filtered = [item for item in items if _itinerary_item_key(item) != item_key]
        if len(filtered) != len(items):
            changed = True
            days_data[day] = filtered
    if changed:
        _save_itinerary_days(days_data)
    st.session_state["itinerary_unscheduled_activities"] = [
        item
        for item in list(st.session_state.get("itinerary_unscheduled_activities") or [])
        if _itinerary_item_key(item) != item_key
    ]


def _toggle_activity_lock(item_key, current_period=None):
    days_data = _ensure_itinerary_shape(st.session_state.get("itinerary_days"))
    for day, items in days_data.items():
        for item in items:
            if _itinerary_item_key(item) == item_key:
                should_lock = not bool(item.get("locked"))
                item["locked"] = should_lock
                if should_lock and current_period in {"Morning", "Afternoon", "Evening"}:
                    item["period"] = current_period
                _save_itinerary_days(days_data)
                return


def _regenerate_day(day):
    days_data = _ensure_itinerary_shape(st.session_state.get("itinerary_days"))
    if day not in days_data:
        return
    locked = [item for item in days_data[day] if item.get("locked")]
    unlocked = [item for item in days_data[day] if not item.get("locked")]
    for item in unlocked:
        item.pop("period", None)
        item.pop("manual_period", None)
    days_data[day] = locked + _order_day_activities(unlocked)
    _save_itinerary_days(days_data)


def _is_full_itinerary_day(day, context):
    return not _fixed_day_blocks(day, context)


def _meal_key(day, meal_type):
    clean_day = "".join(ch.lower() if ch.isalnum() else "_" for ch in str(day)).strip("_")
    return f"{clean_day}_{meal_type}"


def _meal_state(day, meal_type):
    state = st.session_state.setdefault("itinerary_meal_blocks", {})
    return state.setdefault(_meal_key(day, meal_type), {"removed": False, "variant": 0})


def _remove_meal_block(day, meal_type):
    _meal_state(day, meal_type)["removed"] = True


def _restore_meal_block(day, meal_type):
    _meal_state(day, meal_type)["removed"] = False


def _replace_meal_block(day, meal_type):
    state = _meal_state(day, meal_type)
    state["variant"] = int(state.get("variant") or 0) + 1


def _period_for_item(item, index, total):
    explicit_period = item.get("period")
    if explicit_period in {"Morning", "Afternoon", "Evening"}:
        return explicit_period
    slot = _meal_slot(item)
    if slot == "breakfast":
        return "Morning"
    if slot == "lunch":
        return "Afternoon"
    if slot in ("dinner", "nightlife"):
        return "Evening"
    if total <= 2:
        return "Morning" if index == 0 else "Afternoon"
    if index == 0:
        return "Morning"
    if index >= total - 1:
        return "Evening"
    return "Afternoon"


def _period_for_activity_on_day(item, day, index, total, context):
    if day == "Day 1" and _fixed_day_blocks(day, context):
        arrival_period = _period_from_clock(context.get("arrival_time"), default="Afternoon")
        if arrival_period == "Morning":
            return "Afternoon" if index == 0 else "Evening"
        return "Evening"
    if day == "Day 3" and _fixed_day_blocks(day, context):
        return "Morning"
    return _period_for_item(item, index, total)


def _period_probe_minutes(period):
    return {
        "Morning": 10 * 60,
        "Afternoon": 13 * 60,
        "Evening": 18 * 60 + 30,
    }.get(period, 13 * 60)


def _parse_time_to_minutes(time_text):
    text = str(time_text or "").strip().lower().replace(".", "")
    match = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", text)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    suffix = match.group(3)
    if suffix == "pm" and hour != 12:
        hour += 12
    if suffix == "am" and hour == 12:
        hour = 0
    if 0 <= hour <= 23 and 0 <= minute <= 59:
        return hour * 60 + minute
    return None


def _hours_text_for_item(item):
    values = []
    if item.get("opening_status"):
        values.append(str(item.get("opening_status")))
    hours_summary = item.get("hours_summary") or item.get("opening_hours") or []
    if isinstance(hours_summary, str):
        values.append(hours_summary)
    elif isinstance(hours_summary, list):
        values.extend(str(value) for value in hours_summary if value)
    values.extend(str(tag) for tag in item.get("tags", []) or [] if tag)
    return " ".join(values).strip()


def _opening_ranges_for_item(item):
    text = _hours_text_for_item(item).lower()
    if not text:
        return None
    if "24 hours" in text or "open 24" in text:
        return [(0, 24 * 60)]
    if "closed" in text and not re.search(r"\d{1,2}(?::\d{2})?\s*(?:am|pm)", text):
        return []
    times = [
        _parse_time_to_minutes(match.group(0))
        for match in re.finditer(r"\d{1,2}(?::\d{2})?\s*(?:am|pm)", text)
    ]
    times = [value for value in times if value is not None]
    if len(times) < 2:
        return None
    ranges = []
    for start, end in zip(times[0::2], times[1::2]):
        if end <= start:
            ranges.append((start, 24 * 60))
            ranges.append((0, end))
        else:
            ranges.append((start, end))
    return ranges or None


def _hours_check_for_period(item, period):
    if item.get("fixed") or item.get("meal_block"):
        return {"verified": False, "open": True, "label": ""}
    hours_text = _hours_text_for_item(item)
    if not hours_text:
        return {"verified": False, "open": None, "label": "Hours not verified"}
    ranges = _opening_ranges_for_item(item)
    if ranges is None:
        return {"verified": True, "open": True, "label": "Hours checked"}
    if not ranges:
        return {"verified": True, "open": False, "label": "Closed at planned time"}
    probe = _period_probe_minutes(period)
    is_open = any(start <= probe <= end for start, end in ranges)
    return {
        "verified": True,
        "open": is_open,
        "label": "Hours checked" if is_open else "Closed at planned time",
    }


def _valid_periods_for_item(item):
    ranges = _opening_ranges_for_item(item)
    if ranges is None or not ranges:
        return []
    periods = []
    for period in ("Morning", "Afternoon", "Evening"):
        probe = _period_probe_minutes(period)
        if any(start <= probe <= end for start, end in ranges):
            periods.append(period)
    return periods


def _normalize_crowd_level(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        if value >= 70:
            return "High"
        if value >= 35:
            return "Medium"
        return "Low"
    text = str(value).strip().lower()
    if any(word in text for word in ("high", "busy", "peak", "crowded", "very busy")):
        return "High"
    if any(word in text for word in ("medium", "moderate", "normal")):
        return "Medium"
    if any(word in text for word in ("low", "quiet", "light", "not busy")):
        return "Low"
    return None


def _period_crowd_from_busy_data(item, period):
    busy = item.get("busy_hours") or item.get("popular_times") or item.get("crowd_by_period") or {}
    if isinstance(busy, dict):
        candidates = [
            period,
            period.lower(),
            period.upper(),
            period[:3].lower(),
            _period_probe_minutes(period),
        ]
        for key in candidates:
            if key in busy:
                level = _normalize_crowd_level(busy.get(key))
                if level:
                    return level
        for key, value in busy.items():
            if str(key).strip().lower() == period.lower():
                level = _normalize_crowd_level(value)
                if level:
                    return level
    elif isinstance(busy, list):
        for entry in busy:
            if isinstance(entry, dict) and str(entry.get("period") or "").lower() == period.lower():
                level = _normalize_crowd_level(entry.get("level") or entry.get("crowd") or entry.get("busy"))
                if level:
                    return level
    return None


def _major_attraction(item):
    text = _activity_text(item)
    category = str(item.get("category") or "").lower()
    if category in {"culture", "free"} and any(
        word in text
        for word in (
            "tourist attraction",
            "museum",
            "landmark",
            "tower",
            "palace",
            "castle",
            "cathedral",
            "temple",
            "monument",
            "gallery",
            "popular",
        )
    ):
        return True
    return any(
        word in text
        for word in (
            "eiffel tower",
            "louvre",
            "tower of london",
            "tokyo tower",
            "sagrada familia",
            "colosseum",
            "notre dame",
        )
    )


def _fallback_crowd_level(item, period):
    slot = _meal_slot(item)
    category = str(item.get("category") or "").lower()
    text = _activity_text(item)
    if slot == "nightlife":
        return "High" if period == "Evening" else "Low"
    if slot in {"lunch", "dinner"} or "restaurant" in text or "food" in category:
        return "High" if (slot == "lunch" and period == "Afternoon") or (slot == "dinner" and period == "Evening") else "Medium"
    if _major_attraction(item):
        if period == "Afternoon":
            return "High"
        if period == "Morning":
            return "Medium"
        return "Low"
    if "shopping" in category:
        return "High" if period == "Afternoon" else "Medium"
    if "nature" in category or "adventure" in category:
        return "Low" if period == "Morning" else "Medium"
    if "hidden" in category:
        return "Low"
    return "Medium" if period == "Afternoon" else "Low"


def _crowd_level_for_period(item, period):
    if item.get("fixed"):
        return ""
    explicit = _normalize_crowd_level(item.get("crowd_level"))
    if explicit:
        return explicit
    from_busy_data = _period_crowd_from_busy_data(item, period)
    if from_busy_data:
        return from_busy_data
    return _fallback_crowd_level(item, period)


def _crowd_rank(level):
    return {"Low": 0, "Medium": 1, "High": 2}.get(level, 1)


def _best_crowd_period(item):
    valid_periods = _valid_periods_for_item(item) or ["Morning", "Afternoon", "Evening"]
    return min(
        valid_periods,
        key=lambda period: (
            _crowd_rank(_crowd_level_for_period(item, period)),
            {"Morning": 0, "Afternoon": 1, "Evening": 2}.get(period, 1),
        ),
    )


def _apply_schedule_validation(assigned, context):
    days_data = _ensure_itinerary_shape(assigned)
    changed = False
    for day, items in days_data.items():
        for idx, item in enumerate(items):
            if item.get("fixed") or item.get("meal_block") or item.get("locked"):
                continue
            current_period = _period_for_activity_on_day(item, day, idx, len(items), context)
            check = _hours_check_for_period(item, current_period)
            if check.get("open") is False:
                valid_periods = _valid_periods_for_item(item)
                if valid_periods:
                    item["period"] = valid_periods[0]
                    changed = True
                    continue

            if not item.get("manual_period") and _major_attraction(item):
                crowd_level = _crowd_level_for_period(item, current_period)
                if crowd_level == "High":
                    better_period = _best_crowd_period(item)
                    if better_period and better_period != current_period:
                        item["period"] = better_period
                        changed = True
    if changed:
        _save_itinerary_days(days_data)
    return days_data


def _location_text(item):
    return str(item.get("address") or item.get("neighborhood") or item.get("note") or "").strip().lower()


def _transit_estimate_between(previous_item, next_item):
    if not previous_item or not next_item:
        return None
    if str(previous_item.get("category") or "").lower() == "transit":
        return None
    if str(next_item.get("category") or "").lower() == "transit":
        return None

    distance = _haversine_km(previous_item, next_item)
    if distance is None:
        previous_location = _location_text(previous_item)
        next_location = _location_text(next_item)
        if previous_location and next_location and previous_location == next_location:
            return "8 min walk"
        return "18 min by subway"

    if distance <= 0.45:
        minutes = max(5, round(distance / 4.8 * 60))
        return f"{minutes} min walk"
    if distance <= 1.4:
        minutes = max(10, round(distance / 4.6 * 60))
        return f"{minutes} min walk"
    if distance <= 5:
        minutes = max(14, round(distance / 18 * 60) + 8)
        return f"{minutes} min by subway"
    if distance <= 12:
        minutes = max(24, round(distance / 22 * 60) + 12)
        return f"{minutes} min by subway"
    minutes = max(28, round(distance / 28 * 60) + 10)
    return f"{minutes} min by taxi"


def _is_restaurant_like(item):
    text = _activity_text(item)
    category = str(item.get("category") or "").lower()
    return "food" in category or any(
        word in text
        for word in (
            "restaurant",
            "ramen",
            "sushi",
            "izakaya",
            "bistro",
            "cafe",
            "café",
            "coffee",
            "bakery",
            "dining",
            "market",
            "food",
        )
    )


def _display_name(item):
    return str(item.get("name") or item.get("title") or "Nearby restaurant")


def _day_anchor_items(day_items):
    return [
        item for item in day_items or []
        if not item.get("fixed") and not item.get("meal_block") and str(item.get("category") or "").lower() != "transit"
    ]


def _restaurant_suggestions_for_day(day, day_items, context, meal_type):
    anchors = _day_anchor_items(day_items)
    destination = str(context.get("destination_city") or st.session_state.get("trip_destination") or "").strip()
    fallback_area = _first_present(
        *(item.get("neighborhood") or item.get("address") for item in anchors[:3]),
        context.get("hotel_area"),
        destination,
        "this area",
    )
    activities = list(st.session_state.get("activities_results") or [])
    candidates = [activity for activity in activities if _is_restaurant_like(activity)]

    scored = []
    for candidate in candidates:
        distances = [_haversine_km(candidate, anchor) for anchor in anchors]
        distances = [distance for distance in distances if distance is not None]
        same_area = any(_location_text(candidate) and _location_text(candidate) == _location_text(anchor) for anchor in anchors)
        score = min(distances) if distances else (0 if same_area else 999)
        scored.append((score, _display_name(candidate)))
    scored.sort(key=lambda item: (item[0], item[1]))

    names = []
    for _score, name in scored:
        if name not in names:
            names.append(name)
        if len(names) >= 6:
            break

    if not names:
        meal_label = "lunch" if meal_type == "lunch" else "dinner"
        names = [
            f"{meal_label.title()} near {fallback_area}",
            f"Local restaurant around {fallback_area}",
            f"Easy walk-in option in {fallback_area}",
        ]

    variant = int(_meal_state(day, meal_type).get("variant") or 0)
    if names:
        shift = variant % len(names)
        names = names[shift:] + names[:shift]
    return names[:3]


def _meal_blocks_for_day(day, activity_items, fixed_blocks, context):
    if not _is_full_itinerary_day(day, context):
        return []
    blocks = []
    combined_context_items = list(activity_items or []) + list(fixed_blocks or [])
    definitions = {
        "lunch": {
            "name": "Lunch",
            "duration": "11:30 AM-2:00 PM",
            "period": "Afternoon",
        },
        "dinner": {
            "name": "Dinner",
            "duration": "5:30 PM-8:00 PM",
            "period": "Evening",
        },
    }
    for meal_type, definition in definitions.items():
        state = _meal_state(day, meal_type)
        if state.get("removed"):
            continue
        suggestions = _restaurant_suggestions_for_day(day, combined_context_items, context, meal_type)
        anchor = (_day_anchor_items(combined_context_items) or [{}])[0]
        blocks.append(
            {
                "id": f"meal_{_meal_key(day, meal_type)}",
                "name": definition["name"],
                "duration": definition["duration"],
                "category": "Meal",
                "estimated_cost": "Meal stop",
                "neighborhood": anchor.get("neighborhood") or context.get("hotel_area") or context.get("destination_city"),
                "lat": anchor.get("lat"),
                "lng": anchor.get("lng"),
                "period": definition["period"],
                "meal_block": True,
                "meal_type": meal_type,
                "note": "Try: " + ", ".join(suggestions),
            }
        )
    return blocks


def _render_removed_meal_controls(day, context):
    if not _is_full_itinerary_day(day, context):
        return
    removed = [meal_type for meal_type in ("lunch", "dinner") if _meal_state(day, meal_type).get("removed")]
    if not removed:
        return
    cols = st.columns(len(removed))
    for col, meal_type in zip(cols, removed):
        with col:
            if st.button(f"Restore {meal_type}", key=f"it_restore_{_meal_key(day, meal_type)}", use_container_width=True):
                _restore_meal_block(day, meal_type)
                _safe_rerun()


def _safe_rerun():
    if hasattr(st, "rerun"):
        st.rerun()
    elif hasattr(st, "experimental_rerun"):
        st.experimental_rerun()


def _render_activity_edit_controls(item, day, current_period):
    if item.get("fixed"):
        return
    if item.get("meal_block"):
        meal_type = item.get("meal_type") or "meal"
        with st.expander(f"Edit {item.get('name') or 'meal'}", expanded=False):
            col_replace, col_remove = st.columns(2)
            with col_replace:
                if st.button("Replace suggestions", key=f"it_replace_{_meal_key(day, meal_type)}", use_container_width=True):
                    _replace_meal_block(day, meal_type)
                    _safe_rerun()
            with col_remove:
                if st.button("Remove meal block", key=f"it_remove_{_meal_key(day, meal_type)}", use_container_width=True):
                    _remove_meal_block(day, meal_type)
                    _safe_rerun()
        return
    item_key = _itinerary_item_key(item)
    day_key = "".join(ch.lower() if ch.isalnum() else "_" for ch in str(day)).strip("_")
    period_key = "".join(ch.lower() if ch.isalnum() else "_" for ch in str(current_period)).strip("_")
    lock_label = "Unlock activity" if item.get("locked") else "Lock activity"
    lock_help = "Locked activities stay fixed when regenerating this day."
    with st.expander(f"Edit {item.get('name') or 'activity'}", expanded=False):
        day_options = _available_trip_days()
        period_options = ["Morning", "Afternoon", "Evening"]
        col_day, col_period = st.columns(2)
        with col_day:
            selected_day = st.selectbox(
                "Move to another day",
                day_options,
                index=day_options.index(day) if day in day_options else 0,
                key=f"it_move_day_select_{item_key}_{day_key}",
            )
            if st.button("Move day", key=f"it_move_day_btn_{item_key}", use_container_width=True):
                _move_activity_to_day(item_key, selected_day)
                _safe_rerun()
        with col_period:
            selected_period = st.selectbox(
                "Move to time of day",
                period_options,
                index=period_options.index(current_period) if current_period in period_options else 1,
                key=f"it_move_period_select_{item_key}_{period_key}",
            )
            if st.button("Move time", key=f"it_move_period_btn_{item_key}", use_container_width=True):
                _move_activity_to_period(item_key, selected_period)
                _safe_rerun()

        col_lock, col_delete = st.columns(2)
        with col_lock:
            if st.button(lock_label, key=f"it_lock_btn_{item_key}", help=lock_help, use_container_width=True):
                _toggle_activity_lock(item_key, current_period)
                _safe_rerun()
        with col_delete:
            if st.button("Delete activity", key=f"it_delete_btn_{item_key}", use_container_width=True):
                _delete_activity(item_key)
                _safe_rerun()


def _dynamic_itinerary_css():
    return """
    <style>
    .auto-it { color:#e4e6f0; font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif; }
    .auto-hero {
        border:1px solid rgba(255,255,255,.09); border-radius:22px;
        background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.018)),rgba(8,11,19,.9);
        padding:22px; margin-bottom:18px;
    }
    .auto-kicker {font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#c4b5fd;margin-bottom:8px;}
    .auto-title {font-size:30px;font-weight:850;letter-spacing:-.9px;color:#fff;margin-bottom:6px;}
    .auto-sub {font-size:13px;color:rgba(255,255,255,.50);line-height:1.5;}
    .auto-day {
        border:1px solid rgba(255,255,255,.08); border-radius:18px;
        background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.014)),rgba(8,10,17,.92);
        padding:16px; margin-bottom:14px;
    }
    .auto-day-head {display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:12px;}
    .auto-day-title {font-size:18px;font-weight:820;color:#fff;}
    .auto-day-note {font-size:12px;color:rgba(255,255,255,.43);margin-top:3px;}
    .auto-pill {font-size:11px;font-weight:750;color:#c4b5fd;background:rgba(139,92,246,.12);border:1px solid rgba(196,181,253,.18);border-radius:999px;padding:6px 9px;white-space:nowrap;}
    .auto-period {margin-top:14px;}
    .auto-period-title {display:flex;align-items:center;gap:8px;font-size:11px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.45);margin-bottom:8px;}
    .auto-period-title:after {content:"";height:1px;background:rgba(255,255,255,.07);flex:1;}
    .auto-item {display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;}
    .auto-time {width:58px;flex-shrink:0;color:rgba(255,255,255,.34);font-size:11px;font-weight:700;padding-top:8px;}
    .auto-card {flex:1;border:1px solid rgba(255,255,255,.075);border-radius:13px;background:rgba(255,255,255,.026);padding:12px 14px;}
    .auto-card.fixed {border-color:rgba(167,139,250,.20);background:linear-gradient(135deg,rgba(139,92,246,.11),rgba(16,185,129,.045)),rgba(255,255,255,.026);}
    .auto-card.meal {border-color:rgba(251,146,60,.18);background:linear-gradient(135deg,rgba(251,146,60,.10),rgba(255,255,255,.018)),rgba(255,255,255,.026);}
    .auto-name {font-size:14px;font-weight:780;color:#fff;line-height:1.3;margin-bottom:4px;}
    .auto-meta {font-size:12px;color:rgba(255,255,255,.46);line-height:1.45;}
    .auto-tags {display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;}
    .auto-tag {font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#a5b4fc;background:rgba(99,102,241,.13);border-radius:5px;padding:3px 7px;}
    .auto-tag.fixed {color:#bbf7d0;background:rgba(34,197,94,.12);}
    .auto-tag.warn {color:#fde68a;background:rgba(245,158,11,.13);}
    .auto-tag.danger {color:#fecaca;background:rgba(239,68,68,.13);}
    .auto-transit {display:flex;gap:10px;align-items:center;margin:-2px 0 6px;}
    .auto-transit-spacer {width:58px;flex-shrink:0;}
    .auto-transit-line {flex:1;display:flex;align-items:center;gap:8px;color:rgba(125,211,252,.72);font-size:11px;font-weight:700;}
    .auto-transit-line:before {content:"";width:18px;height:1px;background:rgba(125,211,252,.28);}
    .auto-transit-line:after {content:"";height:1px;background:rgba(125,211,252,.12);flex:1;}
    .auto-empty {color:rgba(255,255,255,.38);font-size:12px;border:1px dashed rgba(255,255,255,.10);border-radius:12px;padding:12px;}
    </style>
    """


def _render_auto_itinerary(assigned):
    st.markdown(_dynamic_itinerary_css(), unsafe_allow_html=True)
    context = _travel_context()
    assigned = _apply_schedule_validation(assigned, context)
    total = sum(len(items) for items in assigned.values())
    fixed_count = sum(len(_fixed_day_blocks(day, context)) for day in assigned)
    anchor_copy = " Flight and hotel anchors are reserved first." if fixed_count else ""
    st.markdown(
        f"""
        <div class="auto-it">
          <div class="auto-hero">
            <div class="auto-kicker">Itinerary</div>
            <div class="auto-title">Automatically planned days</div>
            <div class="auto-sub">Byable assigned {total} activit{'y' if total == 1 else 'ies'} across available trip days by city, neighborhood, and proximity.{anchor_copy} Arrival and departure days stay lighter.</div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    for day, items in assigned.items():
        fixed_blocks = _fixed_day_blocks(day, context)
        meal_blocks = _meal_blocks_for_day(day, list(items or []), fixed_blocks, context)
        day_items = fixed_blocks + meal_blocks + list(items or [])
        day_note = "Arrival / lighter day" if day == "Day 1" else "Departure / lighter day" if day == "Day 3" else "Main exploration day"
        activity_count = len(items or [])
        fixed_label = f" + {len(fixed_blocks)} trip event{'s' if len(fixed_blocks) != 1 else ''}" if fixed_blocks else ""
        st.markdown(
            f"""
            <div class="auto-day">
              <div class="auto-day-head">
                <div>
                  <div class="auto-day-title">{_html.escape(day)}</div>
                  <div class="auto-day-note">{_html.escape(day_note)}</div>
                </div>
                <div class="auto-pill">{activity_count} activity{'ies' if activity_count != 1 else ''}{_html.escape(fixed_label)}</div>
              </div>
            """,
            unsafe_allow_html=True,
        )
        if st.button("Regenerate Day", key=f"it_regenerate_{day.replace(' ', '_').lower()}"):
            _regenerate_day(day)
            _safe_rerun()
        _render_removed_meal_controls(day, context)
        if not day_items:
            st.markdown('<div class="auto-empty">No activities assigned yet.</div>', unsafe_allow_html=True)
            st.markdown("</div>", unsafe_allow_html=True)
            continue
        previous_visible_item = None
        for period in ("Morning", "Afternoon", "Evening"):
            activity_periods = {
                id(item): _period_for_activity_on_day(item, day, idx, len(items or []), context)
                for idx, item in enumerate(items or [])
            }
            period_items = [
                item for idx, item in enumerate(day_items)
                if (item.get("period") or activity_periods.get(id(item))) == period
            ]
            if not period_items:
                continue
            st.markdown(f'<div class="auto-period"><div class="auto-period-title">{period}</div>', unsafe_allow_html=True)
            for item in period_items:
                transit_label = _transit_estimate_between(previous_visible_item, item)
                if transit_label:
                    st.markdown(
                        f"""
                        <div class="auto-transit">
                          <div class="auto-transit-spacer"></div>
                          <div class="auto-transit-line">{_html.escape(transit_label)}</div>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )
                name = item.get("name") or "Activity"
                duration = item.get("duration") or "Duration flexible"
                location = item.get("note") or item.get("address") or item.get("neighborhood") or "Location to confirm"
                category = item.get("category") or "Activity"
                cost = item.get("estimated_cost") or "Cost varies"
                meal_slot = _meal_slot(item)
                slot_label = {
                    "breakfast": "Breakfast slot",
                    "lunch": "Lunch slot",
                    "dinner": "Dinner slot",
                    "nightlife": "Nightlife slot",
                }.get(meal_slot, "Meal window" if item.get("meal_block") else "Fixed trip event" if item.get("fixed") else "Auto assigned")
                fixed_class = " fixed" if item.get("fixed") else ""
                meal_class = " meal" if item.get("meal_block") else ""
                card_class = f"{fixed_class}{meal_class}"
                cost_text = f" · {_html.escape(str(cost))}" if cost and not item.get("fixed") else ""
                locked_tag = '<span class="auto-tag fixed">Locked</span>' if item.get("locked") else ""
                hours_check = _hours_check_for_period(item, period)
                hours_label = hours_check.get("label") or ""
                hours_class = (
                    "danger"
                    if hours_check.get("open") is False
                    else "warn"
                    if not hours_check.get("verified") and hours_label
                    else "fixed"
                )
                hours_tag = (
                    f'<span class="auto-tag {hours_class}">{_html.escape(str(hours_label))}</span>'
                    if hours_label else ""
                )
                crowd_level = _crowd_level_for_period(item, period)
                crowd_class = "danger" if crowd_level == "High" else "warn" if crowd_level == "Medium" else "fixed"
                crowd_tag = (
                    f'<span class="auto-tag {crowd_class}">Crowd level: {_html.escape(str(crowd_level))}</span>'
                    if crowd_level else ""
                )
                st.markdown(
                    f"""
                    <div class="auto-item">
                      <div class="auto-time">{_html.escape(duration)}</div>
                      <div class="auto-card{card_class}">
                        <div class="auto-name">{_html.escape(str(name))}</div>
                        <div class="auto-meta">{_html.escape(str(location))}{cost_text}</div>
                        <div class="auto-tags"><span class="auto-tag">{_html.escape(str(category))}</span><span class="auto-tag{fixed_class}">{_html.escape(slot_label)}</span>{hours_tag}{crowd_tag}{locked_tag}</div>
                      </div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
                _render_activity_edit_controls(item, day, period)
                previous_visible_item = item
            st.markdown("</div>", unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)


def render():
    assigned = _auto_assign_itinerary()
    if assigned:
        _render_auto_itinerary(assigned)
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

import html
import json
import os
from datetime import date, datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

import streamlit as st
import streamlit.components.v1 as components

_TABLER = "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"
BACKEND_URL = os.environ.get("BYABLE_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
ISO_DATE_FORMAT = "%Y-%m-%d"

# byable_flights_stay.html wrapped in a full document
_HTML = r"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="{tabler}">
<style>
html,body{margin:0;padding:0;background:#07090f;}
*{box-sizing:border-box;margin:0;padding:0}
.fs{background:#07090f;color:#e4e6f0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif;padding:0 0 60px}
.fs-header{padding:28px 32px 0}
.fs-eyebrow{font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:8px}
.fs-title{font-size:28px;font-weight:800;letter-spacing:-0.8px;color:#fff;margin-bottom:6px}
.fs-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.fs-meta-item{display:flex;align-items:center;gap:5px;font-size:13px;color:rgba(255,255,255,0.4)}
.fs-meta-sep{color:rgba(255,255,255,0.12)}
.section{padding:28px 32px 0}
.sec-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.sec-title{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700}
.sec-title i{font-size:16px}
.sec-sub{font-size:12px;color:rgba(255,255,255,0.35);margin-top:2px}
.sec-link{font-size:12px;color:#6366f1;cursor:pointer}
.route-vis{display:flex;align-items:center;gap:0;padding:16px 20px;border-radius:14px;background:rgba(255,255,255,0.02);border:0.5px solid rgba(255,255,255,0.07);margin-bottom:20px}
.rv-city{min-width:0}
.rv-code{font-size:28px;font-weight:800;letter-spacing:-1px;color:#fff}
.rv-name{font-size:12px;color:rgba(255,255,255,0.35);margin-top:2px}
.rv-date{font-size:11px;color:rgba(255,255,255,0.25);margin-top:1px}
.rv-mid{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:0 16px}
.rv-line{width:100%;height:1px;background:rgba(255,255,255,0.1);position:relative}
.rv-plane{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#07090f;padding:0 6px;font-size:14px;color:#818cf8}
.rv-dur{font-size:11px;color:rgba(255,255,255,0.3)}
.rv-stops{font-size:10px;color:rgba(255,255,255,0.2)}
.rv-badges{display:flex;gap:6px;margin-left:auto;align-items:center;flex-wrap:wrap}
.rv-badge{font-size:11px;font-weight:500;padding:4px 10px;border-radius:6px}
.flights-scroll{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}
.flights-scroll::-webkit-scrollbar{height:3px}
.flights-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,0.04);border-radius:2px}
.flights-scroll::-webkit-scrollbar-thumb{background:rgba(99,102,241,0.4);border-radius:2px}
.flight-card{flex:0 0 280px;border-radius:14px;border:0.5px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.025);padding:16px;cursor:pointer;transition:border-color 0.15s,background 0.15s;position:relative}
.flight-card:hover{border-color:rgba(99,102,241,0.3);background:rgba(99,102,241,0.04)}
.flight-card.selected{border-color:rgba(99,102,241,0.5);background:rgba(99,102,241,0.07)}
.fc-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.fc-label{font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:3px 8px;border-radius:5px}
.fc-label-cheap{background:rgba(52,211,153,0.12);color:#34d399}
.fc-label-fast{background:rgba(56,189,248,0.12);color:#38bdf8}
.fc-label-best{background:rgba(99,102,241,0.15);color:#a5b4fc}
.fc-confidence{display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,0.3)}
.fc-confidence i{font-size:11px}
.airline-row{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.airline-logo{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;letter-spacing:0.3px;flex-shrink:0}
.al-jal{background:#8b0000;color:#fca5a5}
.al-ana{background:#003087;color:#93c5fd}
.al-ua{background:#162b5c;color:#bfdbfe}
.airline-info{flex:1;min-width:0}
.airline-name{font-size:13px;font-weight:600}
.airline-flight{font-size:11px;color:rgba(255,255,255,0.3)}
.fc-times{display:flex;align-items:center;gap:0;margin-bottom:10px}
.fc-t{font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#fff}
.fc-ap{font-size:11px;color:rgba(255,255,255,0.3);margin-top:1px}
.fc-arrow{flex:1;display:flex;flex-direction:column;align-items:center;padding:0 10px;padding-top:4px}
.fc-arr-line{width:100%;height:0.5px;background:rgba(255,255,255,0.1)}
.fc-arr-dur{font-size:10px;color:rgba(255,255,255,0.25);margin-top:3px;white-space:nowrap}
.fc-arr-stop{font-size:10px;color:rgba(56,189,248,0.7)}
.fc-details{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.fc-detail{font-size:10px;padding:2px 7px;border-radius:4px;font-weight:500}
.fc-bottom{display:flex;align-items:flex-end;justify-content:space-between;border-top:0.5px solid rgba(255,255,255,0.06);padding-top:10px}
.fc-price-label{font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:2px}
.fc-price{font-size:22px;font-weight:800;letter-spacing:-0.5px}
.fc-price-pp{font-size:11px;color:rgba(255,255,255,0.3);margin-left:2px}
.fc-select-btn{font-size:11px;font-weight:600;padding:7px 14px;border-radius:8px;cursor:pointer;border:0.5px solid rgba(99,102,241,0.4);background:rgba(99,102,241,0.12);color:#a5b4fc}
.fc-select-btn:hover{background:rgba(99,102,241,0.22)}
.baggage-note{display:flex;align-items:center;gap:6px;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,0.02);border:0.5px solid rgba(255,255,255,0.06);margin-top:12px}
.bn-icon{font-size:14px;color:rgba(255,255,255,0.25)}
.bn-text{font-size:12px;color:rgba(255,255,255,0.35)}
.bn-text span{color:rgba(255,255,255,0.6);font-weight:500}
.section-divider{height:0.5px;background:rgba(255,255,255,0.06);margin:32px 32px 0}
.hotels-grid{display:flex;flex-direction:column;gap:12px}
.hotel-card{border-radius:14px;border:0.5px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.025);overflow:hidden;cursor:pointer;transition:border-color 0.15s}
.hotel-card:hover{border-color:rgba(99,102,241,0.25);background:rgba(99,102,241,0.03)}
.hotel-card.selected{border-color:rgba(99,102,241,0.45);background:rgba(99,102,241,0.06)}
.hotel-inner{display:flex;gap:0}
.hotel-img{width:130px;flex-shrink:0;position:relative;overflow:hidden;border-radius:0}
.hotel-img-bg{position:absolute;inset:0;background-size:cover;background-position:center}
.hotel-img-overlay{position:absolute;inset:0;background:linear-gradient(to right,transparent 60%,rgba(7,9,15,0.4))}
.hotel-tier-badge{position:absolute;top:10px;left:10px;font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:3px 8px;border-radius:5px}
.tier-budget{background:rgba(52,211,153,0.2);color:#34d399}
.tier-std{background:rgba(99,102,241,0.2);color:#a5b4fc}
.tier-lux{background:rgba(251,191,36,0.2);color:#fcd34d}
.hotel-body{flex:1;padding:16px 18px;min-width:0}
.hb-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px}
.hb-name{font-size:15px;font-weight:700;line-height:1.2}
.hb-neighborhood{font-size:12px;color:rgba(255,255,255,0.35);margin-top:2px;display:flex;align-items:center;gap:4px}
.hb-neighborhood i{font-size:11px}
.hb-price-block{text-align:right;flex-shrink:0}
.hb-price{font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#fff}
.hb-price-sub{font-size:10px;color:rgba(255,255,255,0.3);margin-top:1px}
.hb-rating{display:flex;align-items:center;gap:4px;margin-top:4px;justify-content:flex-end}
.hb-stars{color:#fbbf24;font-size:11px}
.hb-rating-num{font-size:11px;color:rgba(255,255,255,0.4)}
.hb-tags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px}
.hb-tag{font-size:10px;padding:2px 7px;border-radius:4px;font-weight:500}
.hb-transit{display:flex;align-items:center;gap:5px;font-size:11px;color:rgba(255,255,255,0.35);margin-bottom:8px}
.hb-transit i{font-size:12px}
.hb-bottom{display:flex;align-items:center;justify-content:space-between;border-top:0.5px solid rgba(255,255,255,0.06);padding-top:8px}
.hb-ai-badge{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:500;color:#a5b4fc}
.hb-ai-pulse{width:5px;height:5px;border-radius:50%;background:#6366f1;animation:blink 1.8s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
.hb-select{font-size:11px;font-weight:600;padding:6px 12px;border-radius:7px;border:0.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.5);cursor:pointer}
.hb-select:hover{border-color:rgba(99,102,241,0.4);background:rgba(99,102,241,0.1);color:#a5b4fc}
.combo-strip{display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:12px;background:rgba(52,211,153,0.05);border:0.5px solid rgba(52,211,153,0.2);margin:20px 32px 0}
.cs-icon{font-size:18px;color:#34d399}
.cs-body{flex:1;min-width:0}
.cs-title{font-size:13px;font-weight:600;color:#6ee7b7;margin-bottom:2px}
.cs-sub{font-size:12px;color:rgba(255,255,255,0.35)}
.cs-amount{font-size:18px;font-weight:800;color:#34d399;flex-shrink:0}
.tag-amenity{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5)}
.tag-wifi{background:rgba(56,189,248,0.08);color:#7dd3fc}
.tag-pool{background:rgba(99,102,241,0.08);color:#c7d2fe}
.tag-spa{background:rgba(244,114,182,0.08);color:#f9a8d4}
.tag-gym{background:rgba(52,211,153,0.08);color:#6ee7b7}
.tag-concierge{background:rgba(251,191,36,0.08);color:#fde68a}
.tag-free-cancel{background:rgba(52,211,153,0.1);color:#34d399}
.detail-chip{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.45)}
.detail-chip-biz{background:rgba(251,191,36,0.1);color:#fde68a}
.detail-chip-eco{background:rgba(52,211,153,0.08);color:#6ee7b7}
.detail-chip-prem{background:rgba(99,102,241,0.1);color:#c7d2fe}
</style>
</head>
<body>
<div class="fs">

  <div class="fs-header">
    <div class="fs-eyebrow">Flights &amp; Stay</div>
    <div class="fs-title">Getting there &amp; where to sleep</div>
    <div class="fs-meta">
      <div class="fs-meta-item"><i class="ti ti-calendar" aria-hidden="true"></i>Oct 14 – Oct 24, 2025</div>
      <span class="fs-meta-sep">·</span>
      <div class="fs-meta-item"><i class="ti ti-users" aria-hidden="true"></i>3 travelers</div>
      <span class="fs-meta-sep">·</span>
      <div class="fs-meta-item"><i class="ti ti-map-pin" aria-hidden="true"></i>SFO → NRT → KIX</div>
    </div>
  </div>

  <div class="section">
    <div class="sec-header">
      <div>
        <div class="sec-title" style="color:#fff"><i class="ti ti-plane" style="color:#818cf8" aria-hidden="true"></i>Outbound flight</div>
        <div class="sec-sub">San Francisco → Tokyo Narita · Oct 14, 2025</div>
      </div>
      <span class="sec-link">See all 14 options</span>
    </div>

    <div class="route-vis">
      <div class="rv-city">
        <div class="rv-code">SFO</div>
        <div class="rv-name">San Francisco</div>
        <div class="rv-date">Oct 14</div>
      </div>
      <div class="rv-mid">
        <div class="rv-line"><div class="rv-plane"><i class="ti ti-plane" aria-hidden="true"></i></div></div>
        <div class="rv-dur" style="margin-top:10px">11h 40m – 14h 20m</div>
        <div class="rv-stops">Non-stop or 1 stop available</div>
      </div>
      <div class="rv-city" style="text-align:right">
        <div class="rv-code">NRT</div>
        <div class="rv-name">Tokyo Narita</div>
        <div class="rv-date">Oct 15 +1</div>
      </div>
      <div class="rv-badges" style="margin-left:20px">
        <div class="rv-badge" style="background:rgba(52,211,153,0.1);border:0.5px solid rgba(52,211,153,0.2);color:#34d399">
          <i class="ti ti-sparkles" style="font-size:10px;margin-right:4px" aria-hidden="true"></i>Prices drop 18% if you fly Oct 7
        </div>
      </div>
    </div>

    <div class="flights-scroll">

      <div class="flight-card selected" onclick="selectCard(this,'flight')">
        <div class="fc-top">
          <span class="fc-label fc-label-best">Best value</span>
          <div class="fc-confidence"><i class="ti ti-shield-check" aria-hidden="true"></i>High confidence</div>
        </div>
        <div class="airline-row">
          <div class="airline-logo al-jal">JAL</div>
          <div class="airline-info">
            <div class="airline-name">Japan Airlines</div>
            <div class="airline-flight">JL 061 · Boeing 777-300ER</div>
          </div>
        </div>
        <div class="fc-times">
          <div class="fc-time-block">
            <div class="fc-t">07:30</div>
            <div class="fc-ap">SFO T1</div>
          </div>
          <div class="fc-arrow">
            <div class="fc-arr-line"></div>
            <div class="fc-arr-dur">11h 40m</div>
            <div class="fc-arr-stop" style="color:rgba(52,211,153,0.7)">Non-stop</div>
          </div>
          <div class="fc-time-block" style="text-align:right">
            <div class="fc-t">13:10<span style="font-size:12px;color:rgba(255,255,255,0.4)">+1</span></div>
            <div class="fc-ap">NRT T2</div>
          </div>
        </div>
        <div class="fc-details">
          <span class="fc-detail detail-chip-biz">Business class</span>
          <span class="fc-detail detail-chip">1 checked bag</span>
          <span class="fc-detail detail-chip">Lie-flat seat</span>
          <span class="fc-detail" style="background:rgba(99,102,241,0.1);color:#a5b4fc">AI pick</span>
        </div>
        <div class="fc-bottom">
          <div>
            <div class="fc-price-label">per person</div>
            <div><span class="fc-price" style="color:#a5b4fc">$1,240</span><span class="fc-price-pp">RT</span></div>
          </div>
          <div class="fc-select-btn">Selected</div>
        </div>
      </div>

      <div class="flight-card" onclick="selectCard(this,'flight')">
        <div class="fc-top">
          <span class="fc-label fc-label-cheap">Cheapest</span>
          <div class="fc-confidence"><i class="ti ti-shield-check" aria-hidden="true"></i>High confidence</div>
        </div>
        <div class="airline-row">
          <div class="airline-logo al-ua">UAL</div>
          <div class="airline-info">
            <div class="airline-name">United Airlines</div>
            <div class="airline-flight">UA 837 · Boeing 787-9</div>
          </div>
        </div>
        <div class="fc-times">
          <div class="fc-time-block">
            <div class="fc-t">09:55</div>
            <div class="fc-ap">SFO T3</div>
          </div>
          <div class="fc-arrow">
            <div class="fc-arr-line"></div>
            <div class="fc-arr-dur">14h 20m</div>
            <div class="fc-arr-stop">1 stop · ORD</div>
          </div>
          <div class="fc-time-block" style="text-align:right">
            <div class="fc-t">18:15<span style="font-size:12px;color:rgba(255,255,255,0.4)">+1</span></div>
            <div class="fc-ap">NRT T1</div>
          </div>
        </div>
        <div class="fc-details">
          <span class="fc-detail detail-chip-eco">Economy</span>
          <span class="fc-detail detail-chip">1 checked bag</span>
          <span class="fc-detail detail-chip">Standard seat</span>
        </div>
        <div class="fc-bottom">
          <div>
            <div class="fc-price-label">per person</div>
            <div><span class="fc-price" style="color:#34d399">$680</span><span class="fc-price-pp">RT</span></div>
          </div>
          <div class="fc-select-btn">Select</div>
        </div>
      </div>

      <div class="flight-card" onclick="selectCard(this,'flight')">
        <div class="fc-top">
          <span class="fc-label fc-label-fast">Fastest</span>
          <div class="fc-confidence"><i class="ti ti-shield-half" aria-hidden="true"></i>Med confidence</div>
        </div>
        <div class="airline-row">
          <div class="airline-logo al-ana">ANA</div>
          <div class="airline-info">
            <div class="airline-name">ANA</div>
            <div class="airline-flight">NH 008 · Boeing 777-300ER</div>
          </div>
        </div>
        <div class="fc-times">
          <div class="fc-time-block">
            <div class="fc-t">11:05</div>
            <div class="fc-ap">SFO T3</div>
          </div>
          <div class="fc-arrow">
            <div class="fc-arr-line"></div>
            <div class="fc-arr-dur">11h 05m</div>
            <div class="fc-arr-stop" style="color:rgba(52,211,153,0.7)">Non-stop</div>
          </div>
          <div class="fc-time-block" style="text-align:right">
            <div class="fc-t">15:10<span style="font-size:12px;color:rgba(255,255,255,0.4)">+1</span></div>
            <div class="fc-ap">NRT T1</div>
          </div>
        </div>
        <div class="fc-details">
          <span class="fc-detail detail-chip-prem">Premium Eco</span>
          <span class="fc-detail detail-chip">1 checked bag</span>
          <span class="fc-detail detail-chip">Extra legroom</span>
        </div>
        <div class="fc-bottom">
          <div>
            <div class="fc-price-label">per person</div>
            <div><span class="fc-price" style="color:#fbbf24">$940</span><span class="fc-price-pp">RT</span></div>
          </div>
          <div class="fc-select-btn">Select</div>
        </div>
      </div>

      <div class="flight-card" onclick="selectCard(this,'flight')">
        <div class="fc-top">
          <span class="fc-label" style="background:rgba(251,191,36,0.1);color:#fcd34d">First class</span>
          <div class="fc-confidence"><i class="ti ti-shield-check" aria-hidden="true"></i>High confidence</div>
        </div>
        <div class="airline-row">
          <div class="airline-logo al-ana">ANA</div>
          <div class="airline-info">
            <div class="airline-name">ANA</div>
            <div class="airline-flight">NH 008 · Boeing 777-300ER</div>
          </div>
        </div>
        <div class="fc-times">
          <div class="fc-time-block">
            <div class="fc-t">11:05</div>
            <div class="fc-ap">SFO T3</div>
          </div>
          <div class="fc-arrow">
            <div class="fc-arr-line"></div>
            <div class="fc-arr-dur">11h 05m</div>
            <div class="fc-arr-stop" style="color:rgba(52,211,153,0.7)">Non-stop</div>
          </div>
          <div class="fc-time-block" style="text-align:right">
            <div class="fc-t">15:10<span style="font-size:12px;color:rgba(255,255,255,0.4)">+1</span></div>
            <div class="fc-ap">NRT T1</div>
          </div>
        </div>
        <div class="fc-details">
          <span class="fc-detail" style="background:rgba(251,191,36,0.12);color:#fde68a">The Room Suite</span>
          <span class="fc-detail detail-chip">2 checked bags</span>
          <span class="fc-detail detail-chip">Lounge access</span>
        </div>
        <div class="fc-bottom">
          <div>
            <div class="fc-price-label">per person</div>
            <div><span class="fc-price" style="color:#fbbf24">$4,200</span><span class="fc-price-pp">RT</span></div>
          </div>
          <div class="fc-select-btn">Select</div>
        </div>
      </div>

    </div>

    <div class="baggage-note">
      <i class="ti ti-luggage bn-icon" aria-hidden="true"></i>
      <div class="bn-text">Baggage assumptions: <span>1 checked bag + 1 carry-on per traveler.</span> Business class includes checked bag on all airlines.</div>
    </div>
  </div>

  <div class="section-divider"></div>

  <div class="section">
    <div class="sec-header">
      <div>
        <div class="sec-title" style="color:#fff"><i class="ti ti-plane-departure" style="color:#f472b6" aria-hidden="true"></i>Return flight</div>
        <div class="sec-sub">Tokyo Narita → San Francisco · Oct 24, 2025</div>
      </div>
      <span class="sec-link">See all 11 options</span>
    </div>

    <div class="flights-scroll">
      <div class="flight-card selected" onclick="selectCard(this,'return')">
        <div class="fc-top">
          <span class="fc-label fc-label-best">Best value</span>
          <div class="fc-confidence"><i class="ti ti-shield-check" aria-hidden="true"></i>High confidence</div>
        </div>
        <div class="airline-row">
          <div class="airline-logo al-jal">JAL</div>
          <div class="airline-info">
            <div class="airline-name">Japan Airlines</div>
            <div class="airline-flight">JL 062 · Boeing 777-300ER</div>
          </div>
        </div>
        <div class="fc-times">
          <div class="fc-time-block">
            <div class="fc-t">17:30</div>
            <div class="fc-ap">NRT T2</div>
          </div>
          <div class="fc-arrow">
            <div class="fc-arr-line"></div>
            <div class="fc-arr-dur">10h 05m</div>
            <div class="fc-arr-stop" style="color:rgba(52,211,153,0.7)">Non-stop</div>
          </div>
          <div class="fc-time-block" style="text-align:right">
            <div class="fc-t">11:35</div>
            <div class="fc-ap">SFO T1</div>
          </div>
        </div>
        <div class="fc-details">
          <span class="fc-detail detail-chip-biz">Business class</span>
          <span class="fc-detail detail-chip">1 checked bag</span>
          <span class="fc-detail" style="background:rgba(99,102,241,0.1);color:#a5b4fc">Included in RT fare</span>
        </div>
        <div class="fc-bottom">
          <div>
            <div class="fc-price-label">included in RT</div>
            <div><span class="fc-price" style="color:#34d399;font-size:16px">$0 extra</span></div>
          </div>
          <div class="fc-select-btn">Selected</div>
        </div>
      </div>

      <div class="flight-card" onclick="selectCard(this,'return')">
        <div class="fc-top">
          <span class="fc-label fc-label-fast">Fastest</span>
          <div class="fc-confidence"><i class="ti ti-shield-check" aria-hidden="true"></i>High confidence</div>
        </div>
        <div class="airline-row">
          <div class="airline-logo al-ana">ANA</div>
          <div class="airline-info">
            <div class="airline-name">ANA</div>
            <div class="airline-flight">NH 007 · Boeing 787-9</div>
          </div>
        </div>
        <div class="fc-times">
          <div class="fc-time-block">
            <div class="fc-t">09:00</div>
            <div class="fc-ap">NRT T1</div>
          </div>
          <div class="fc-arrow">
            <div class="fc-arr-line"></div>
            <div class="fc-arr-dur">9h 50m</div>
            <div class="fc-arr-stop" style="color:rgba(52,211,153,0.7)">Non-stop</div>
          </div>
          <div class="fc-time-block" style="text-align:right">
            <div class="fc-t">04:50</div>
            <div class="fc-ap">SFO T3</div>
          </div>
        </div>
        <div class="fc-details">
          <span class="fc-detail detail-chip-prem">Premium Eco</span>
          <span class="fc-detail detail-chip">1 checked bag</span>
        </div>
        <div class="fc-bottom">
          <div>
            <div class="fc-price-label">per person</div>
            <div><span class="fc-price" style="color:#fbbf24">$820</span><span class="fc-price-pp">OW</span></div>
          </div>
          <div class="fc-select-btn">Select</div>
        </div>
      </div>
    </div>
  </div>

  <div class="section-divider"></div>

  <div class="section">
    <div class="sec-header">
      <div>
        <div class="sec-title" style="color:#fff"><i class="ti ti-bed" style="color:#f472b6" aria-hidden="true"></i>Hotels in Tokyo</div>
        <div class="sec-sub">Oct 14 – Oct 18 · 4 nights · Toranomon &amp; Shinjuku areas</div>
      </div>
      <span class="sec-link">Browse 23 options</span>
    </div>

    <div class="hotels-grid">

      <div class="hotel-card" onclick="selectCard(this,'hotel')">
        <div class="hotel-inner">
          <div class="hotel-img" style="min-height:170px">
            <div class="hotel-img-bg" style="background:linear-gradient(135deg,#0d2818 0%,#1a4a2e 50%,#0a3020 100%)"></div>
            <div class="hotel-img-overlay"></div>
            <div class="hotel-tier-badge tier-budget">Budget</div>
            <div style="position:absolute;bottom:12px;left:12px;font-size:28px">🏨</div>
          </div>
          <div class="hotel-body">
            <div class="hb-top">
              <div>
                <div class="hb-name">Book and Bed Tokyo</div>
                <div class="hb-neighborhood"><i class="ti ti-map-pin" aria-hidden="true"></i>Shinjuku · Kabukicho</div>
              </div>
              <div class="hb-price-block">
                <div class="hb-price">¥6,800</div>
                <div class="hb-price-sub">per night</div>
                <div class="hb-rating">
                  <span class="hb-stars">★★★★</span>
                  <span class="hb-rating-num">4.2</span>
                </div>
              </div>
            </div>
            <div class="hb-tags">
              <span class="hb-tag tag-wifi">Free WiFi</span>
              <span class="hb-tag tag-amenity">Bookshelf capsule</span>
              <span class="hb-tag tag-free-cancel">Free cancellation</span>
            </div>
            <div class="hb-transit"><i class="ti ti-train" aria-hidden="true"></i>3 min walk to Shinjuku Station · JR &amp; 8 metro lines</div>
            <div class="hb-bottom">
              <div style="font-size:12px;color:rgba(255,255,255,0.35)">~$46/night · saves $180 vs Standard</div>
              <div class="hb-select">Select</div>
            </div>
          </div>
        </div>
      </div>

      <div class="hotel-card selected" onclick="selectCard(this,'hotel')">
        <div class="hotel-inner">
          <div class="hotel-img" style="min-height:190px">
            <div class="hotel-img-bg" style="background:linear-gradient(135deg,#0f1a35 0%,#1a2550 50%,#0d1535 100%)"></div>
            <div class="hotel-img-overlay"></div>
            <div class="hotel-tier-badge tier-std">Standard</div>
            <div style="position:absolute;bottom:12px;left:12px;font-size:28px">🏙</div>
          </div>
          <div class="hotel-body">
            <div class="hb-top">
              <div>
                <div class="hb-name">Andaz Tokyo Toranomon Hills</div>
                <div class="hb-neighborhood"><i class="ti ti-map-pin" aria-hidden="true"></i>Toranomon · Minato-ku</div>
              </div>
              <div class="hb-price-block">
                <div class="hb-price">¥68,000</div>
                <div class="hb-price-sub">per night</div>
                <div class="hb-rating">
                  <span class="hb-stars">★★★★★</span>
                  <span class="hb-rating-num">4.8</span>
                </div>
              </div>
            </div>
            <div class="hb-tags">
              <span class="hb-tag tag-wifi">Free WiFi</span>
              <span class="hb-tag tag-pool">Rooftop bar</span>
              <span class="hb-tag tag-spa">Spa</span>
              <span class="hb-tag tag-gym">Fitness center</span>
              <span class="hb-tag tag-concierge">Concierge</span>
            </div>
            <div class="hb-transit"><i class="ti ti-train" aria-hidden="true"></i>5 min walk to Toranomon Hills Station · Hibiya Line direct</div>
            <div class="hb-bottom">
              <div class="hb-ai-badge"><div class="hb-ai-pulse"></div>AI recommended · best location score</div>
              <div class="hb-select" style="background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.4);color:#a5b4fc">Selected</div>
            </div>
          </div>
        </div>
      </div>

      <div class="hotel-card" onclick="selectCard(this,'hotel')">
        <div class="hotel-inner">
          <div class="hotel-img" style="min-height:190px">
            <div class="hotel-img-bg" style="background:linear-gradient(135deg,#1a1000 0%,#3a2800 50%,#2a1a00 100%)"></div>
            <div class="hotel-img-overlay"></div>
            <div class="hotel-tier-badge tier-lux">Luxury</div>
            <div style="position:absolute;bottom:12px;left:12px;font-size:28px">✨</div>
          </div>
          <div class="hotel-body">
            <div class="hb-top">
              <div>
                <div class="hb-name">Aman Tokyo</div>
                <div class="hb-neighborhood"><i class="ti ti-map-pin" aria-hidden="true"></i>Otemachi · Chiyoda-ku</div>
              </div>
              <div class="hb-price-block">
                <div class="hb-price" style="color:#fbbf24">¥145,000</div>
                <div class="hb-price-sub">per night</div>
                <div class="hb-rating">
                  <span class="hb-stars">★★★★★</span>
                  <span class="hb-rating-num">4.97</span>
                </div>
              </div>
            </div>
            <div class="hb-tags">
              <span class="hb-tag tag-spa">Onsen spa</span>
              <span class="hb-tag tag-pool">25m pool</span>
              <span class="hb-tag tag-concierge">24hr butler</span>
              <span class="hb-tag" style="background:rgba(251,191,36,0.1);color:#fde68a">Imperial Palace views</span>
              <span class="hb-tag tag-free-cancel">Free cancel</span>
            </div>
            <div class="hb-transit"><i class="ti ti-train" aria-hidden="true"></i>Direct access to Otemachi Station · 9 metro lines</div>
            <div class="hb-bottom">
              <div style="font-size:12px;color:rgba(255,255,255,0.35)">~$975/night · luxury mode</div>
              <div class="hb-select">Select</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <div class="section-divider"></div>

  <div class="section">
    <div class="sec-header">
      <div>
        <div class="sec-title" style="color:#fff"><i class="ti ti-torii" style="color:#34d399" aria-hidden="true"></i>Hotels in Kyoto</div>
        <div class="sec-sub">Oct 18 – Oct 22 · 4 nights · Higashiyama &amp; Gion areas</div>
      </div>
      <span class="sec-link">Browse 18 options</span>
    </div>

    <div class="hotels-grid">

      <div class="hotel-card" onclick="selectCard(this,'hotelk')">
        <div class="hotel-inner">
          <div class="hotel-img" style="min-height:170px">
            <div class="hotel-img-bg" style="background:linear-gradient(135deg,#1a0a08 0%,#3a1a10 50%,#2a1208 100%)"></div>
            <div class="hotel-img-overlay"></div>
            <div class="hotel-tier-badge tier-budget">Budget</div>
            <div style="position:absolute;bottom:12px;left:12px;font-size:28px">🏯</div>
          </div>
          <div class="hotel-body">
            <div class="hb-top">
              <div>
                <div class="hb-name">Piece Hostel Kyoto</div>
                <div class="hb-neighborhood"><i class="ti ti-map-pin" aria-hidden="true"></i>Fushimi · South Kyoto</div>
              </div>
              <div class="hb-price-block">
                <div class="hb-price">¥5,200</div>
                <div class="hb-price-sub">per night</div>
                <div class="hb-rating">
                  <span class="hb-stars">★★★★</span>
                  <span class="hb-rating-num">4.1</span>
                </div>
              </div>
            </div>
            <div class="hb-tags">
              <span class="hb-tag tag-wifi">Free WiFi</span>
              <span class="hb-tag tag-amenity">Common kitchen</span>
              <span class="hb-tag tag-free-cancel">Free cancellation</span>
            </div>
            <div class="hb-transit"><i class="ti ti-train" aria-hidden="true"></i>8 min walk to Fushimi-Inari Station · Kintetsu Line</div>
            <div class="hb-bottom">
              <div style="font-size:12px;color:rgba(255,255,255,0.35)">~$35/night · great Fushimi access</div>
              <div class="hb-select">Select</div>
            </div>
          </div>
        </div>
      </div>

      <div class="hotel-card selected" onclick="selectCard(this,'hotelk')">
        <div class="hotel-inner">
          <div class="hotel-img" style="min-height:190px">
            <div class="hotel-img-bg" style="background:linear-gradient(135deg,#0a1a10 0%,#1a3020 50%,#0d2018 100%)"></div>
            <div class="hotel-img-overlay"></div>
            <div class="hotel-tier-badge tier-std">Standard</div>
            <div style="position:absolute;bottom:12px;left:12px;font-size:28px">🌸</div>
          </div>
          <div class="hotel-body">
            <div class="hb-top">
              <div>
                <div class="hb-name">Mitsui Garden Hotel Kyoto Sanjo</div>
                <div class="hb-neighborhood"><i class="ti ti-map-pin" aria-hidden="true"></i>Sanjo · Central Kyoto</div>
              </div>
              <div class="hb-price-block">
                <div class="hb-price">¥28,000</div>
                <div class="hb-price-sub">per night</div>
                <div class="hb-rating">
                  <span class="hb-stars">★★★★</span>
                  <span class="hb-rating-num">4.5</span>
                </div>
              </div>
            </div>
            <div class="hb-tags">
              <span class="hb-tag tag-wifi">Free WiFi</span>
              <span class="hb-tag tag-amenity">Traditional bath</span>
              <span class="hb-tag tag-gym">Fitness</span>
              <span class="hb-tag tag-free-cancel">Free cancel</span>
            </div>
            <div class="hb-transit"><i class="ti ti-train" aria-hidden="true"></i>2 min walk to Kyoto-Sanjo Station · Keihan Line · Gion 10 min</div>
            <div class="hb-bottom">
              <div class="hb-ai-badge"><div class="hb-ai-pulse"></div>AI recommended · central location</div>
              <div class="hb-select" style="background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.4);color:#a5b4fc">Selected</div>
            </div>
          </div>
        </div>
      </div>

      <div class="hotel-card" onclick="selectCard(this,'hotelk')">
        <div class="hotel-inner">
          <div class="hotel-img" style="min-height:190px">
            <div class="hotel-img-bg" style="background:linear-gradient(135deg,#150510 0%,#2a0a1a 50%,#1a0810 100%)"></div>
            <div class="hotel-img-overlay"></div>
            <div class="hotel-tier-badge tier-lux">Luxury</div>
            <div style="position:absolute;bottom:12px;left:12px;font-size:28px">🎋</div>
          </div>
          <div class="hotel-body">
            <div class="hb-top">
              <div>
                <div class="hb-name">Suiran, a Luxury Collection Hotel</div>
                <div class="hb-neighborhood"><i class="ti ti-map-pin" aria-hidden="true"></i>Arashiyama · West Kyoto</div>
              </div>
              <div class="hb-price-block">
                <div class="hb-price" style="color:#fbbf24">¥95,000</div>
                <div class="hb-price-sub">per night</div>
                <div class="hb-rating">
                  <span class="hb-stars">★★★★★</span>
                  <span class="hb-rating-num">4.9</span>
                </div>
              </div>
            </div>
            <div class="hb-tags">
              <span class="hb-tag tag-spa">Private onsen</span>
              <span class="hb-tag tag-concierge">24hr butler</span>
              <span class="hb-tag" style="background:rgba(52,211,153,0.08);color:#6ee7b7">Arashiyama river views</span>
              <span class="hb-tag tag-free-cancel">Free cancel</span>
            </div>
            <div class="hb-transit"><i class="ti ti-train" aria-hidden="true"></i>Bamboo grove 3 min walk · Togetsukyo Bridge 2 min</div>
            <div class="hb-bottom">
              <div style="font-size:12px;color:rgba(255,255,255,0.35)">~$637/night · most immersive location</div>
              <div class="hb-select">Select</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <div class="combo-strip">
    <i class="ti ti-sparkles cs-icon" aria-hidden="true"></i>
    <div class="cs-body">
      <div class="cs-title">Current selection saves $780 vs comparable options</div>
      <div class="cs-sub">JAL Business RT · Andaz Tokyo 4 nights · Mitsui Garden Kyoto 4 nights</div>
    </div>
    <div class="cs-amount">Save $780</div>
  </div>

</div>

<script>
function selectCard(card, group){
  if(group==='flight'||group==='return'){
    var cards=card.closest('.flights-scroll').querySelectorAll('.flight-card');
    cards.forEach(function(c){
      c.classList.remove('selected');
      var btn=c.querySelector('.fc-select-btn');
      if(btn) btn.textContent='Select';
    });
    card.classList.add('selected');
    var selBtn=card.querySelector('.fc-select-btn');
    if(selBtn) selBtn.textContent='Selected';
  } else {
    var section=card.closest('.hotels-grid');
    if(section){
      section.querySelectorAll('.hotel-card').forEach(function(c){
        c.classList.remove('selected');
        var btn=c.querySelector('.hb-select');
        if(btn){btn.textContent='Select';btn.style.background='';btn.style.borderColor='';btn.style.color='';}
      });
      card.classList.add('selected');
      var hbtn=card.querySelector('.hb-select');
      if(hbtn){hbtn.textContent='Selected';hbtn.style.background='rgba(99,102,241,0.15)';hbtn.style.borderColor='rgba(99,102,241,0.4)';hbtn.style.color='#a5b4fc';}
    }
  }
}
</script>
</body>
</html>"""


def mock_flight_offers(origin="SFO", destination="HND", adults=1):
    traveler_count = max(1, int(adults or 1))
    return [
        {
            "airline": "Japan Airlines",
            "airline_code": "JL",
            "flight_number": "JL 061",
            "origin": origin,
            "destination": destination,
            "depart_time": "07:30",
            "arrive_time": "13:10",
            "duration": "11h 40m",
            "stops": 0,
            "stop_label": "Non-stop",
            "cabin": "Business",
            "price_total": 1240.0 * traveler_count,
            "price_per_person": 1240.0,
            "currency": "USD",
            "source": "demo",
        },
        {
            "airline": "United Airlines",
            "airline_code": "UA",
            "flight_number": "UA 837",
            "origin": origin,
            "destination": destination,
            "depart_time": "09:55",
            "arrive_time": "18:15",
            "duration": "14h 20m",
            "stops": 1,
            "stop_label": "1 stop",
            "cabin": "Economy",
            "price_total": 680.0 * traveler_count,
            "price_per_person": 680.0,
            "currency": "USD",
            "source": "demo",
        },
        {
            "airline": "ANA",
            "airline_code": "NH",
            "flight_number": "NH 008",
            "origin": origin,
            "destination": destination,
            "depart_time": "11:05",
            "arrive_time": "15:10",
            "duration": "11h 05m",
            "stops": 0,
            "stop_label": "Non-stop",
            "cabin": "Premium Economy",
            "price_total": 940.0 * traveler_count,
            "price_per_person": 940.0,
            "currency": "USD",
            "source": "demo",
        },
    ]


def _time_from_iso(value):
    if not value:
        return "--:--"
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).strftime("%H:%M")
    except ValueError:
        return str(value)


def _duration_label(value):
    raw = str(value or "")
    if raw.startswith("PT"):
        return raw.replace("PT", "").replace("H", "h ").replace("M", "m").strip()
    return raw


def _airline_code(airline, flight_number):
    flight = str(flight_number or "").strip()
    if flight:
        return "".join([char for char in flight.split()[0] if char.isalpha()])[:3].upper() or "AIR"
    airline_l = str(airline or "").lower()
    if "japan" in airline_l:
        return "JL"
    if "ana" in airline_l or "all nippon" in airline_l:
        return "NH"
    if "united" in airline_l:
        return "UA"
    return "AIR"


def _normalize_duffel_flight(flight, adults):
    traveler_count = max(1, int(adults or 1))
    stops = int(flight.get("stops") or 0)
    price = float(flight.get("price") or 0)
    airline = flight.get("airline") or "Airline"
    flight_number = flight.get("flight_number") or "Flight"
    code = _airline_code(airline, flight_number)
    return {
        "airline": airline,
        "airline_code": code,
        "flight_number": flight_number,
        "origin": flight.get("origin") or "SFO",
        "destination": flight.get("destination") or "HND",
        "depart_time": _time_from_iso(flight.get("departure_time")),
        "arrive_time": _time_from_iso(flight.get("arrival_time")),
        "duration": _duration_label(flight.get("duration")),
        "stops": stops,
        "stop_label": "Non-stop" if stops == 0 else f"{stops} stop" if stops == 1 else f"{stops} stops",
        "cabin": flight.get("cabin") or "Economy",
        "price_total": price,
        "price_per_person": price / traveler_count,
        "currency": flight.get("currency") or "USD",
        "source": "duffel",
    }


def _as_iso_date(value):
    if isinstance(value, date):
        return value.isoformat()
    raw = str(value or "").strip()
    for fmt in (ISO_DATE_FORMAT, "%Y/%m/%d"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return raw


def _validate_iso_date(value, label):
    raw = _as_iso_date(value)
    try:
        parsed = datetime.strptime(raw, ISO_DATE_FORMAT).date()
    except ValueError:
        return None, f"{label} must be in YYYY-MM-DD format."
    return parsed.isoformat(), None


def _extract_backend_error(payload):
    if not payload:
        return "Backend returned an empty response."
    message = payload.get("message") or payload.get("detail") or "Duffel route did not return live flights."
    details = payload.get("details")
    if details:
        return f"{message} Details: {details}"
    return str(message)


@st.cache_data(ttl=900, show_spinner=False)
def load_flight_offers(origin, destination, departure_date, return_date, adults, cabin_class, max_results=5):
    query = urlencode(
        {
            "origin": origin,
            "destination": destination,
            "departure_date": departure_date,
            "return_date": return_date,
            "adults": adults,
            "cabin_class": cabin_class,
            "max_results": max_results,
        }
    )
    url = f"{BACKEND_URL}/flights/test-sfo-hnd?{query}"
    try:
        with urlopen(url, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
        flights = payload.get("flights") or []
        if payload.get("status") == "ok" and flights:
            return [_normalize_duffel_flight(flight, adults) for flight in flights], True, payload
        return mock_flight_offers(origin, destination, adults), False, payload
    except HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode("utf-8"))
        except (ValueError, json.JSONDecodeError):
            payload = {"status": "error", "message": f"Backend HTTP {exc.code}: {exc.reason}"}
        return mock_flight_offers(origin, destination, adults), False, payload
    except (OSError, URLError, ValueError, json.JSONDecodeError) as exc:
        return mock_flight_offers(origin, destination, adults), False, {
            "status": "error",
            "message": str(exc),
            "url": url,
        }


def money_usd(value):
    return f"${float(value or 0):,.0f}"


def airline_logo_class(code):
    code = str(code or "").upper()
    if code == "JL":
        return "al-jal"
    if code == "NH":
        return "al-ana"
    return "al-ua"


def flight_cards_html(offers, live, selected_index, adults):
    cards = []
    for index, offer in enumerate(offers[:5]):
        selected = " selected" if index == selected_index else ""
        label = "Live fare" if live else "Demo estimate"
        label_class = "fc-label-best" if index == 0 else "fc-label-cheap" if index == 1 else "fc-label-fast"
        confidence = "Duffel API" if live else "Fallback data"
        cards.append(
            f"""
      <div class="flight-card{selected}" onclick="selectCard(this,'flight')">
        <div class="fc-top">
          <span class="fc-label {label_class}">{html.escape(label)}</span>
          <div class="fc-confidence"><i class="ti ti-shield-check" aria-hidden="true"></i>{html.escape(confidence)}</div>
        </div>
        <div class="airline-row">
          <div class="airline-logo {airline_logo_class(offer.get('airline_code'))}">{html.escape(str(offer.get('airline_code') or 'AIR')[:3])}</div>
          <div class="airline-info">
            <div class="airline-name">{html.escape(str(offer.get('airline') or 'Airline'))}</div>
            <div class="airline-flight">{html.escape(str(offer.get('flight_number') or 'Flight'))}</div>
          </div>
        </div>
        <div class="fc-times">
          <div class="fc-time-block">
            <div class="fc-t">{html.escape(str(offer.get('depart_time') or '--:--'))}</div>
            <div class="fc-ap">{html.escape(str(offer.get('origin') or 'SFO'))}</div>
          </div>
          <div class="fc-arrow">
            <div class="fc-arr-line"></div>
            <div class="fc-arr-dur">{html.escape(str(offer.get('duration') or ''))}</div>
            <div class="fc-arr-stop">{html.escape(str(offer.get('stop_label') or ''))}</div>
          </div>
          <div class="fc-time-block" style="text-align:right">
            <div class="fc-t">{html.escape(str(offer.get('arrive_time') or '--:--'))}</div>
            <div class="fc-ap">{html.escape(str(offer.get('destination') or 'HND'))}</div>
          </div>
        </div>
        <div class="fc-details">
          <span class="fc-detail detail-chip-prem">{html.escape(str(offer.get('cabin') or 'Economy'))}</span>
          <span class="fc-detail detail-chip">Round trip</span>
          <span class="fc-detail detail-chip">{html.escape(str(adults))} {"traveler" if int(adults) == 1 else "travelers"}</span>
        </div>
        <div class="fc-bottom">
          <div>
            <div class="fc-price-label">per person</div>
            <div><span class="fc-price" style="color:#a5b4fc">{money_usd(offer.get('price_per_person'))}</span><span class="fc-price-pp">RT</span></div>
          </div>
          <div class="fc-select-btn">{"Selected" if index == selected_index else "Select"}</div>
        </div>
      </div>
            """
        )
    return "\n".join(cards)


def render():
    st.write("ENTRYPOINT TEST: frontend/pages/flights.py")
    st.markdown(
        """
        <style>
        div[data-testid="stForm"] {
            border: 0.5px solid rgba(255,255,255,0.08);
            background: rgba(255,255,255,0.025);
            border-radius: 14px;
            padding: 12px 16px 16px;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    search_state = st.session_state.setdefault(
        "flight_search",
        {
            "origin": "SFO",
            "destination": "HND",
            "departure_date": "2026-10-14",
            "return_date": "2026-10-24",
            "adults": 1,
            "cabin_class": "economy",
        },
    )
    search_state["departure_date"] = _as_iso_date(search_state.get("departure_date") or "2026-10-14")
    search_state["return_date"] = _as_iso_date(search_state.get("return_date") or "2026-10-24")

    with st.form("flight_search_form"):
        st.caption("Duffel test mode — prices are API test fares, not final ticketed prices.")
        col_origin, col_destination, col_departure, col_return = st.columns(4)
        with col_origin:
            origin = st.text_input("Origin", value=search_state["origin"], max_chars=3).strip().upper()
        with col_destination:
            destination = st.text_input("Destination", value=search_state["destination"], max_chars=3).strip().upper()
        with col_departure:
            departure_date = st.text_input("Depart", value=search_state["departure_date"], help="Use YYYY-MM-DD.")
        with col_return:
            return_date = st.text_input("Return", value=search_state["return_date"], help="Use YYYY-MM-DD.")

        col_adults, col_cabin, col_submit = st.columns([1, 2, 1])
        with col_adults:
            adults = st.number_input("Travelers", min_value=1, max_value=9, value=int(search_state["adults"]), step=1)
        with col_cabin:
            cabin_class = st.selectbox(
                "Cabin",
                ["economy", "premium_economy", "business", "first"],
                index=["economy", "premium_economy", "business", "first"].index(search_state["cabin_class"]),
                format_func=lambda value: value.replace("_", " ").title(),
            )
        with col_submit:
            submitted = st.form_submit_button("Search flights", type="primary")

    if submitted:
        departure_iso, departure_error = _validate_iso_date(departure_date, "Depart")
        return_iso, return_error = _validate_iso_date(return_date, "Return")
        if departure_error or return_error:
            st.session_state["flight_debug"] = {
                "status": "validation_error",
                "message": departure_error or return_error,
                "duffel_key_loaded": None,
            }
            st.error(departure_error or return_error)
            departure_iso = search_state["departure_date"]
            return_iso = search_state["return_date"]
        elif datetime.strptime(return_iso, ISO_DATE_FORMAT).date() < datetime.strptime(departure_iso, ISO_DATE_FORMAT).date():
            st.session_state["flight_debug"] = {
                "status": "validation_error",
                "message": "Return date must be on or after the departure date.",
                "duffel_key_loaded": None,
            }
            st.error("Return date must be on or after the departure date.")
            departure_iso = search_state["departure_date"]
            return_iso = search_state["return_date"]
        st.session_state["flight_search"] = {
            "origin": origin or "SFO",
            "destination": destination or "HND",
            "departure_date": departure_iso,
            "return_date": return_iso,
            "adults": int(adults),
            "cabin_class": cabin_class,
        }
        st.session_state["selected_flight_index"] = 0
        search_state = st.session_state["flight_search"]

    origin = str(search_state["origin"]).upper()
    destination = str(search_state["destination"]).upper()
    departure_iso = _as_iso_date(search_state["departure_date"])
    return_iso = _as_iso_date(search_state["return_date"])
    adults = int(search_state["adults"])
    cabin_class = str(search_state["cabin_class"])
    departure_iso, departure_error = _validate_iso_date(departure_iso, "Depart")
    return_iso, return_error = _validate_iso_date(return_iso, "Return")
    if departure_error or return_error:
        debug_payload = {
            "status": "validation_error",
            "message": departure_error or return_error,
            "duffel_key_loaded": None,
        }
        offers, live = mock_flight_offers(origin, destination, adults), False
    elif datetime.strptime(return_iso, ISO_DATE_FORMAT).date() < datetime.strptime(departure_iso, ISO_DATE_FORMAT).date():
        debug_payload = {
            "status": "validation_error",
            "message": "Return date must be on or after the departure date.",
            "duffel_key_loaded": None,
        }
        offers, live = mock_flight_offers(origin, destination, adults), False
    else:
        offers, live, debug_payload = load_flight_offers(origin, destination, departure_iso, return_iso, adults, cabin_class, 5)
    st.session_state["flight_debug"] = debug_payload

    selected_index = min(int(st.session_state.get("selected_flight_index", 0)), max(0, len(offers) - 1))
    if offers and "selected_flight" not in st.session_state:
        st.session_state["selected_flight"] = {**offers[selected_index], "adults": adults}

    badge = "Live pricing via Duffel" if live else "Demo estimate"
    subtitle = (
        "Duffel test mode — prices are API test fares, not final ticketed prices."
        if live
        else "Fallback flight estimates shown because Duffel is not configured, unavailable, or returned no results."
    )
    if not live:
        with st.expander("Duffel debug", expanded=False):
            st.write("DUFFEL_API_KEY loaded by backend:", debug_payload.get("duffel_key_loaded"))
            st.write("Error:", _extract_backend_error(debug_payload))
            st.json(debug_payload)
    else:
        st.caption("DUFFEL_API_KEY loaded by backend: Yes")
    cards = flight_cards_html(offers, live, selected_index, adults)
    date_label = f"{departure_iso} → {return_iso}"
    traveler_label = f"{adults} {'traveler' if adults == 1 else 'travelers'}"
    page = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="{_TABLER}">
<style>
html,body{{margin:0;padding:0;background:#07090f;}}
*{{box-sizing:border-box;margin:0;padding:0}}
.fs{{background:#07090f;color:#e4e6f0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif;padding:0 0 60px}}
.fs-header{{padding:28px 32px 0}}
.fs-eyebrow{{font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:8px}}
.fs-title{{font-size:28px;font-weight:800;letter-spacing:-0.8px;color:#fff;margin-bottom:6px}}
.fs-meta{{display:flex;align-items:center;gap:10px;flex-wrap:wrap}}
.fs-meta-item{{display:flex;align-items:center;gap:5px;font-size:13px;color:rgba(255,255,255,0.4)}}
.section{{padding:28px 32px 0}}
.sec-header{{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:16px;flex-wrap:wrap}}
.sec-title{{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700}}
.sec-sub{{font-size:12px;color:rgba(255,255,255,0.35);margin-top:2px;line-height:1.5}}
.source-badge{{font-size:11px;font-weight:700;padding:5px 11px;border-radius:999px;background:rgba(52,211,153,0.1);border:0.5px solid rgba(52,211,153,0.25);color:#34d399}}
.source-badge.demo{{background:rgba(251,191,36,0.1);border-color:rgba(251,191,36,0.25);color:#fbbf24}}
.route-vis{{display:flex;align-items:center;gap:0;padding:16px 20px;border-radius:14px;background:rgba(255,255,255,0.02);border:0.5px solid rgba(255,255,255,0.07);margin-bottom:20px}}
.rv-city{{min-width:0}} .rv-code{{font-size:28px;font-weight:800;letter-spacing:-1px;color:#fff}} .rv-name{{font-size:12px;color:rgba(255,255,255,0.35);margin-top:2px}}
.rv-mid{{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:0 16px}} .rv-line{{width:100%;height:1px;background:rgba(255,255,255,0.1);position:relative}} .rv-plane{{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#07090f;padding:0 6px;font-size:14px;color:#818cf8}} .rv-dur{{font-size:11px;color:rgba(255,255,255,0.3);margin-top:10px}}
.flights-scroll{{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}}
.flights-scroll::-webkit-scrollbar{{height:3px}} .flights-scroll::-webkit-scrollbar-track{{background:rgba(255,255,255,0.04);border-radius:2px}} .flights-scroll::-webkit-scrollbar-thumb{{background:rgba(99,102,241,0.4);border-radius:2px}}
.flight-card{{flex:0 0 300px;border-radius:14px;border:0.5px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.025);padding:16px;cursor:pointer;transition:border-color 0.15s,background 0.15s;position:relative}}
.flight-card:hover{{border-color:rgba(99,102,241,0.3);background:rgba(99,102,241,0.04)}} .flight-card.selected{{border-color:rgba(99,102,241,0.5);background:rgba(99,102,241,0.07)}}
.fc-top{{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:8px}} .fc-label{{font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:3px 8px;border-radius:5px;white-space:normal}} .fc-label-cheap{{background:rgba(52,211,153,0.12);color:#34d399}} .fc-label-fast{{background:rgba(56,189,248,0.12);color:#38bdf8}} .fc-label-best{{background:rgba(99,102,241,0.15);color:#a5b4fc}} .fc-confidence{{display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,0.3);white-space:normal}}
.airline-row{{display:flex;align-items:center;gap:8px;margin-bottom:12px}} .airline-logo{{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;letter-spacing:0.3px;flex-shrink:0}} .al-jal{{background:#8b0000;color:#fca5a5}} .al-ana{{background:#003087;color:#93c5fd}} .al-ua{{background:#162b5c;color:#bfdbfe}} .airline-info{{flex:1;min-width:0}} .airline-name{{font-size:13px;font-weight:600}} .airline-flight{{font-size:11px;color:rgba(255,255,255,0.3)}}
.fc-times{{display:flex;align-items:center;gap:0;margin-bottom:10px}} .fc-t{{font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#fff}} .fc-ap{{font-size:11px;color:rgba(255,255,255,0.3);margin-top:1px}} .fc-arrow{{flex:1;display:flex;flex-direction:column;align-items:center;padding:0 10px;padding-top:4px}} .fc-arr-line{{width:100%;height:0.5px;background:rgba(255,255,255,0.1)}} .fc-arr-dur{{font-size:10px;color:rgba(255,255,255,0.25);margin-top:3px;white-space:normal}} .fc-arr-stop{{font-size:10px;color:rgba(56,189,248,0.7)}}
.fc-details{{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}} .fc-detail{{font-size:10px;padding:2px 7px;border-radius:4px;font-weight:500}} .detail-chip{{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.45)}} .detail-chip-prem{{background:rgba(99,102,241,0.1);color:#c7d2fe}}
.fc-bottom{{display:flex;align-items:flex-end;justify-content:space-between;border-top:0.5px solid rgba(255,255,255,0.06);padding-top:10px}} .fc-price-label{{font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:2px}} .fc-price{{font-size:22px;font-weight:800;letter-spacing:-0.5px}} .fc-price-pp{{font-size:11px;color:rgba(255,255,255,0.3);margin-left:2px}} .fc-select-btn{{font-size:11px;font-weight:600;padding:7px 14px;border-radius:8px;cursor:pointer;border:0.5px solid rgba(99,102,241,0.4);background:rgba(99,102,241,0.12);color:#a5b4fc}}
@media(max-width:720px){{.route-vis{{flex-direction:column;align-items:flex-start;gap:12px}}.rv-mid{{width:100%;padding:0}}.flight-card{{flex-basis:86vw}}}}
</style>
</head>
<body>
<div class="fs">
  <div class="fs-header">
    <div class="fs-eyebrow">Flights</div>
    <div class="fs-title">Flight options</div>
    <div class="fs-meta">
      <div class="fs-meta-item"><i class="ti ti-calendar" aria-hidden="true"></i>{html.escape(date_label)}</div>
      <span style="color:rgba(255,255,255,0.12)">·</span>
      <div class="fs-meta-item"><i class="ti ti-users" aria-hidden="true"></i>{html.escape(traveler_label)}</div>
      <span style="color:rgba(255,255,255,0.12)">·</span>
      <div class="fs-meta-item"><i class="ti ti-map-pin" aria-hidden="true"></i>{html.escape(origin)} → {html.escape(destination)}</div>
    </div>
  </div>
  <div class="section">
    <div class="sec-header">
      <div>
        <div class="sec-title" style="color:#fff"><i class="ti ti-plane" style="color:#818cf8" aria-hidden="true"></i>Round-trip flight search</div>
        <div class="sec-sub">{html.escape(subtitle)}</div>
      </div>
      <span class="source-badge {'demo' if not live else ''}">{html.escape(badge)}</span>
    </div>
    <div class="route-vis">
      <div class="rv-city"><div class="rv-code">{html.escape(origin)}</div><div class="rv-name">Origin</div></div>
      <div class="rv-mid"><div class="rv-line"><div class="rv-plane"><i class="ti ti-plane" aria-hidden="true"></i></div></div><div class="rv-dur">Round-trip · {html.escape(traveler_label)}</div></div>
      <div class="rv-city" style="text-align:right"><div class="rv-code">{html.escape(destination)}</div><div class="rv-name">Destination</div></div>
    </div>
    <div class="flights-scroll">{cards}</div>
  </div>
</div>
<script>
function selectCard(card, group){{
  var cards=card.closest('.flights-scroll').querySelectorAll('.flight-card');
  cards.forEach(function(c){{
    c.classList.remove('selected');
    var btn=c.querySelector('.fc-select-btn');
    if(btn) btn.textContent='Select';
  }});
  card.classList.add('selected');
  var selBtn=card.querySelector('.fc-select-btn');
  if(selBtn) selBtn.textContent='Selected';
}}
</script>
</body>
</html>"""
    components.html(page, height=980, scrolling=False)

    if offers:
        options = [
            f"{offer.get('airline')} {offer.get('flight_number')} · {offer.get('depart_time')} → {offer.get('arrive_time')} · {money_usd(offer.get('price_total'))} total"
            for offer in offers
        ]
        selected_option = st.radio(
            "Use this flight in Overview",
            options=list(range(len(options))),
            index=selected_index,
            format_func=lambda idx: options[idx],
            horizontal=False,
        )
        if selected_option != selected_index:
            st.session_state["selected_flight_index"] = int(selected_option)
            selected_index = int(selected_option)
        selected_flight = {**offers[selected_index], "adults": adults}
        st.session_state["selected_flight"] = selected_flight
        st.success(
            f"Overview flight cost updated to {money_usd(selected_flight.get('price_total'))} "
            f"for {selected_flight.get('airline')} {selected_flight.get('flight_number')}."
        )

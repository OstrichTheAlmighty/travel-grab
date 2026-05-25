import streamlit as st
import streamlit.components.v1 as components


_TABLER = "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"

_HTML = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="{tabler}">
<style>
html,body{{margin:0;padding:0;background:#07090f;}}
*{{box-sizing:border-box;margin:0;padding:0}}
.ov{{background:#07090f;color:#e4e6f0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif;padding:0 0 40px}}
.hero{{position:relative;height:260px;overflow:hidden;border-radius:0 0 20px 20px}}
.hero-bg{{position:absolute;inset:0;background:linear-gradient(135deg,#0d1525 0%,#0f2040 35%,#1a0a30 65%,#0d1a10 100%)}}
.hero-grid{{position:absolute;inset:0;background-image:linear-gradient(rgba(99,102,241,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.06) 1px,transparent 1px);background-size:48px 48px}}
.hero-glow1{{position:absolute;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,0.2) 0%,transparent 65%);top:-100px;right:-60px;pointer-events:none}}
.hero-glow2{{position:absolute;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,rgba(52,211,153,0.12) 0%,transparent 65%);bottom:-80px;left:40px;pointer-events:none}}
.hero-content{{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:28px 32px}}
.hero-eyebrow{{display:flex;align-items:center;gap:8px;margin-bottom:10px}}
.hero-tag{{font-size:11px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:rgba(255,255,255,0.45)}}
.hero-live{{display:flex;align-items:center;gap:5px;background:rgba(52,211,153,0.1);border:0.5px solid rgba(52,211,153,0.25);border-radius:20px;padding:3px 10px;font-size:11px;color:#34d399;font-weight:500}}
.hero-dot{{width:5px;height:5px;border-radius:50%;background:#34d399;animation:blink 2s infinite}}
@keyframes blink{{0%,100%{{opacity:1}}50%{{opacity:0.3}}}}
.hero-title{{font-size:36px;font-weight:800;letter-spacing:-1.2px;line-height:1.1;color:#fff;margin-bottom:6px}}
.hero-title span{{background:linear-gradient(135deg,#818cf8,#34d399);-webkit-background-clip:text;-webkit-text-fill-color:transparent}}
.hero-sub{{font-size:14px;color:rgba(255,255,255,0.45);display:flex;align-items:center;gap:12px}}
.hero-sep{{color:rgba(255,255,255,0.15)}}
.hero-ctas{{position:absolute;top:24px;right:28px;display:flex;gap:8px}}
.hcta{{display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;border:0.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7)}}
.body{{padding:0 28px}}
.cost-bar{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:24px}}
.cost-card{{border-radius:14px;padding:20px 22px;border:0.5px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03)}}
.cost-card-label{{font-size:12px;color:rgba(255,255,255,0.4);font-weight:500;margin-bottom:8px;display:flex;align-items:center;gap:6px}}
.cost-card-value{{font-size:30px;font-weight:800;letter-spacing:-1px;line-height:1}}
.cost-card-sub{{font-size:12px;color:rgba(255,255,255,0.3);margin-top:6px}}
.afford-badge{{display:inline-flex;align-items:center;gap:6px;margin-top:12px;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;background:rgba(52,211,153,0.1);border:0.5px solid rgba(52,211,153,0.25);color:#34d399}}
.section-gap{{margin-top:28px}}
.section-label{{font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:14px;display:flex;align-items:center;gap:8px}}
.section-label::after{{content:'';flex:1;height:0.5px;background:rgba(255,255,255,0.07)}}
.style-selector{{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}}
.style-card{{border-radius:13px;padding:18px 16px;border:0.5px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.025);cursor:pointer}}
.style-card.active{{border-color:rgba(99,102,241,0.5);background:rgba(99,102,241,0.07)}}
.style-card:hover:not(.active){{border-color:rgba(255,255,255,0.15);background:rgba(255,255,255,0.04)}}
.sc-icon{{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:12px}}
.sc-name{{font-size:14px;font-weight:700;margin-bottom:4px}}
.sc-price{{font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:8px}}
.sc-desc{{font-size:12px;color:rgba(255,255,255,0.35);line-height:1.5}}
.sc-check{{display:flex;align-items:center;gap:4px;margin-top:10px;font-size:11px;color:rgba(255,255,255,0.4)}}
.active .sc-check{{color:#a5b4fc}}
.active .sc-name{{color:#c7d2fe}}
.stats-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}}
.stat-card{{border-radius:12px;padding:16px;border:0.5px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.025)}}
.stat-icon{{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:10px}}
.stat-label{{font-size:11px;color:rgba(255,255,255,0.35);font-weight:500;margin-bottom:5px}}
.stat-value{{font-size:20px;font-weight:700;letter-spacing:-0.5px}}
.stat-note{{font-size:11px;color:rgba(255,255,255,0.3);margin-top:4px}}
.stat-bar{{height:3px;border-radius:2px;background:rgba(255,255,255,0.07);margin-top:10px}}
.stat-bar-fill{{height:3px;border-radius:2px}}
.ai-section{{margin-top:28px}}
.ai-card{{border-radius:14px;border:0.5px solid rgba(99,102,241,0.2);background:rgba(99,102,241,0.04);padding:18px 20px}}
.ai-card-header{{display:flex;align-items:center;gap:8px;margin-bottom:14px}}
.ai-pulse{{width:8px;height:8px;border-radius:50%;background:#6366f1;animation:blink 1.5s infinite}}
.ai-title{{font-size:14px;font-weight:700;color:#a5b4fc}}
.ai-subtitle{{font-size:12px;color:rgba(255,255,255,0.3);margin-left:auto}}
.ai-items{{display:flex;flex-direction:column;gap:8px}}
.ai-item{{display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:10px;background:rgba(255,255,255,0.025);border:0.5px solid rgba(255,255,255,0.06);cursor:pointer}}
.ai-item:hover{{border-color:rgba(99,102,241,0.3);background:rgba(99,102,241,0.04)}}
.ai-item-icon{{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}}
.ai-item-body{{flex:1;min-width:0}}
.ai-item-title{{font-size:13px;font-weight:600;margin-bottom:3px}}
.ai-item-desc{{font-size:12px;color:rgba(255,255,255,0.4);line-height:1.5}}
.ai-item-saving{{font-size:12px;font-weight:600;margin-left:auto;flex-shrink:0;padding-top:1px}}
.cta-row{{display:flex;gap:12px;margin-top:24px}}
.cta-main{{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;border-radius:12px;background:linear-gradient(135deg,rgba(99,102,241,0.3),rgba(79,70,229,0.4));border:0.5px solid rgba(99,102,241,0.5);color:#e0e7ff;font-size:14px;font-weight:600;cursor:pointer}}
.cta-sec{{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;border-radius:12px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);font-size:14px;font-weight:500;cursor:pointer}}
</style>
</head>
<body>
<div class="ov">
  <div class="hero">
    <div class="hero-bg"></div>
    <div class="hero-grid"></div>
    <div class="hero-glow1"></div>
    <div class="hero-glow2"></div>
    <div class="hero-content">
      <div class="hero-eyebrow">
        <span class="hero-tag">Overview</span>
        <div class="hero-live"><div class="hero-dot"></div>Live pricing</div>
      </div>
      <div class="hero-title">Tokyo &amp; <span>Kyoto</span></div>
      <div class="hero-sub">
        <span>Oct 14 – Oct 24, 2025</span>
        <span class="hero-sep">|</span>
        <span>10 nights</span>
        <span class="hero-sep">|</span>
        <span>3 travelers</span>
        <span class="hero-sep">|</span>
        <span>Standard mode</span>
      </div>
    </div>
    <div class="hero-ctas">
      <div class="hcta"><i class="ti ti-share" aria-hidden="true"></i> Share</div>
      <div class="hcta"><i class="ti ti-edit" aria-hidden="true"></i> Edit trip</div>
    </div>
  </div>

  <div class="body">

    <div class="cost-bar">
      <div class="cost-card">
        <div class="cost-card-label"><i class="ti ti-currency-dollar" style="color:#818cf8" aria-hidden="true"></i>Total estimated cost</div>
        <div class="cost-card-value" style="color:#fff">$8,420</div>
        <div class="cost-card-sub">Flights, hotels, food, and activities</div>
        <div class="afford-badge"><i class="ti ti-circle-check" aria-hidden="true"></i>Within your budget</div>
      </div>
      <div class="cost-card">
        <div class="cost-card-label"><i class="ti ti-user" style="color:#34d399" aria-hidden="true"></i>Per person</div>
        <div class="cost-card-value" style="color:#34d399">$2,807</div>
        <div class="cost-card-sub">Split evenly across 3 travelers</div>
      </div>
      <div class="cost-card">
        <div class="cost-card-label"><i class="ti ti-chart-bar" style="color:#fbbf24" aria-hidden="true"></i>Affordability</div>
        <div class="cost-card-value" style="color:#fbbf24">93%</div>
        <div class="cost-card-sub">$393 headroom remaining</div>
        <div style="margin-top:12px;height:4px;border-radius:2px;background:rgba(255,255,255,0.08)">
          <div style="height:4px;border-radius:2px;width:93%;background:linear-gradient(90deg,#f59e0b,#fbbf24)"></div>
        </div>
      </div>
    </div>

    <div class="section-gap">
      <div class="section-label">Travel style</div>
      <div class="style-selector">
        <div class="style-card" id="s-budget" onclick="selectStyle('budget')">
          <div class="sc-icon" style="background:rgba(52,211,153,0.12)"><i class="ti ti-coin" style="color:#34d399;font-size:18px" aria-hidden="true"></i></div>
          <div class="sc-name">Budget</div>
          <div class="sc-price">$4,100 total · $1,367 pp</div>
          <div class="sc-desc">Hostels, local transport, street food. Maximum exploration, minimum spend.</div>
          <div class="sc-check"><i class="ti ti-check" aria-hidden="true"></i> Economy flights · Capsule hotel</div>
        </div>
        <div class="style-card active" id="s-std" onclick="selectStyle('std')">
          <div class="sc-icon" style="background:rgba(99,102,241,0.12)"><i class="ti ti-star" style="color:#818cf8;font-size:18px" aria-hidden="true"></i></div>
          <div class="sc-name">Standard</div>
          <div class="sc-price">$8,420 total · $2,807 pp</div>
          <div class="sc-desc">Business flights, 4-star hotels, mix of fine dining and local spots.</div>
          <div class="sc-check"><i class="ti ti-check" aria-hidden="true"></i> Premium cabin · Andaz Tokyo</div>
        </div>
        <div class="style-card" id="s-lux" onclick="selectStyle('lux')">
          <div class="sc-icon" style="background:rgba(251,191,36,0.12)"><i class="ti ti-crown" style="color:#fbbf24;font-size:18px" aria-hidden="true"></i></div>
          <div class="sc-name">Luxury</div>
          <div class="sc-price">$14,800 total · $4,933 pp</div>
          <div class="sc-desc">First-class flights, Aman Tokyo, private guides, Michelin omakase every night.</div>
          <div class="sc-check"><i class="ti ti-check" aria-hidden="true"></i> First class cabin · Aman Tokyo</div>
        </div>
      </div>
    </div>

    <div class="section-gap">
      <div class="section-label">Cost breakdown</div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(99,102,241,0.12)"><i class="ti ti-plane" style="color:#818cf8" aria-hidden="true"></i></div>
          <div class="stat-label">Flights</div>
          <div class="stat-value">$3,720</div>
          <div class="stat-note">Live Duffel selection required</div>
          <div class="stat-bar"><div class="stat-bar-fill" style="width:88%;background:#6366f1"></div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(244,114,182,0.12)"><i class="ti ti-building" style="color:#f472b6" aria-hidden="true"></i></div>
          <div class="stat-label">Hotels</div>
          <div class="stat-value">$2,840</div>
          <div class="stat-note">Andaz Tokyo · 3 nights + Kyoto ryokan</div>
          <div class="stat-bar"><div class="stat-bar-fill" style="width:67%;background:#f472b6"></div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(251,146,60,0.12)"><i class="ti ti-tools-kitchen-2" style="color:#fb923c" aria-hidden="true"></i></div>
          <div class="stat-label">Food &amp; drink</div>
          <div class="stat-value">$1,080</div>
          <div class="stat-note">Sushi Saito omakase + daily meals</div>
          <div class="stat-bar"><div class="stat-bar-fill" style="width:26%;background:#fb923c"></div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(52,211,153,0.12)"><i class="ti ti-ticket" style="color:#34d399" aria-hidden="true"></i></div>
          <div class="stat-label">Activities</div>
          <div class="stat-value">$780</div>
          <div class="stat-note">TeamLab, Hakone onsen, day tours</div>
          <div class="stat-bar"><div class="stat-bar-fill" style="width:18%;background:#34d399"></div></div>
        </div>
      </div>
    </div>

    <div class="ai-section">
      <div class="section-label">AI optimization</div>
      <div class="ai-card">
        <div class="ai-card-header">
          <div class="ai-pulse"></div>
          <div class="ai-title">3 ways to save $780 on this trip</div>
          <div class="ai-subtitle">Updated just now</div>
        </div>
        <div class="ai-items">
          <div class="ai-item">
            <div class="ai-item-icon" style="background:rgba(52,211,153,0.1)"><i class="ti ti-building" style="color:#34d399" aria-hidden="true"></i></div>
            <div class="ai-item-body">
              <div class="ai-item-title">Swap night 3 to Book and Bed Tokyo</div>
              <div class="ai-item-desc">Iconic bookshelf capsule hotel in Shinjuku — unique experience at 1/10 the Andaz price. Reinvest the savings into a second Michelin dinner.</div>
            </div>
            <div class="ai-item-saving" style="color:#34d399">Save $180</div>
          </div>
          <div class="ai-item">
            <div class="ai-item-icon" style="background:rgba(99,102,241,0.1)"><i class="ti ti-plane" style="color:#818cf8" aria-hidden="true"></i></div>
            <div class="ai-item-body">
              <div class="ai-item-title">Compare economy routes before choosing premium cabins</div>
              <div class="ai-item-desc">One-stop economy routes can be meaningfully cheaper than premium cabins. Use live Duffel results before locking the flight budget.</div>
            </div>
            <div class="ai-item-saving" style="color:#34d399">Save $560</div>
          </div>
          <div class="ai-item">
            <div class="ai-item-icon" style="background:rgba(251,191,36,0.1)"><i class="ti ti-calendar" style="color:#fbbf24" aria-hidden="true"></i></div>
            <div class="ai-item-body">
              <div class="ai-item-title">Shift dates to Oct 7 – 17 — fares drop 18%</div>
              <div class="ai-item-desc">Compare dates around your target window before booking. Similar weather and itinerary quality can come with lower fares.</div>
            </div>
            <div class="ai-item-saving" style="color:#fbbf24">Save $220</div>
          </div>
        </div>
      </div>
    </div>

    <div class="cta-row">
      <div class="cta-main"><i class="ti ti-map-2" aria-hidden="true"></i> Use this trip — build full itinerary</div>
      <div class="cta-sec"><i class="ti ti-sparkles" aria-hidden="true"></i> Optimize cost with AI ↗</div>
    </div>

  </div>
</div>

<script>
function selectStyle(m){{
  ['budget','std','lux'].forEach(function(x){{document.getElementById('s-'+x).classList.remove('active')}});
  document.getElementById('s-'+m).classList.add('active');
}}
</script>
</body>
</html>"""


def render():
    st.write("TEST OVERVIEW ACTIVE")
    selected_flight = st.session_state.get("selected_flight") or {}
    live_flights = selected_flight.get("source") == "duffel"
    flight_total = float(selected_flight.get("price_total") or 0.0)
    travelers = int(selected_flight.get("adults") or 3)
    airline = selected_flight.get("airline") or "No flight selected"
    flight_number = selected_flight.get("flight_number") or ""
    cabin = selected_flight.get("cabin") or "Standard"
    total_cost = 8420.0 - 3720.0 + flight_total
    per_person = total_cost / max(1, travelers)
    travel_budget = 9000.0
    affordability = min(100, round(total_cost / travel_budget * 100))
    headroom = travel_budget - total_cost
    live_label = "Duffel test mode" if live_flights else "No live flight selected"
    flight_note = (
        f"{airline} {flight_number} · {cabin} · Duffel test fare"
        if live_flights
        else "Choose a Duffel flight on the Flights page"
    )
    html = _HTML.format(tabler=_TABLER)
    html = html.replace("Live pricing", live_label)
    html = html.replace("$8,420", f"${total_cost:,.0f}")
    html = html.replace("$2,807", f"${per_person:,.0f}")
    html = html.replace("93%", f"{affordability}%")
    html = html.replace("$393 headroom remaining", f"{'$' + format(abs(headroom), ',.0f')} {'headroom remaining' if headroom >= 0 else 'over target'}")
    html = html.replace("width:93%;background:linear-gradient(90deg,#f59e0b,#fbbf24)", f"width:{affordability}%;background:linear-gradient(90deg,#f59e0b,#fbbf24)")
    html = html.replace("$3,720", f"${flight_total:,.0f}")
    html = html.replace("Live Duffel selection required", flight_note)
    html = html.replace("Oct 14 – Oct 24, 2025", "Oct 14 – Oct 24, 2026")
    html = html.replace("3 travelers", f"{travelers} {'traveler' if travelers == 1 else 'travelers'}")
    html = html.replace("Split evenly across 3 travelers", f"Split evenly across {travelers} {'traveler' if travelers == 1 else 'travelers'}")
    components.html(html, height=1700, scrolling=False)

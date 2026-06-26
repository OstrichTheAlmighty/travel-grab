"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { buildAviasalesUrl } from "@/app/utils/affiliate";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import UsageBanner from "@/app/components/UsageBanner";
import { readTripStore, updateTripStore } from "@/lib/trip-store";

// ── Airport data ──────────────────────────────────────────────────────────────

const AIRPORTS = [
  // ── United States ──
  { code: "JFK", city: "New York",       name: "John F. Kennedy Intl",          country: "United States" },
  { code: "LGA", city: "New York",       name: "LaGuardia",                      country: "United States" },
  { code: "EWR", city: "Newark",         name: "Newark Liberty Intl",            country: "United States" },
  { code: "LAX", city: "Los Angeles",    name: "Los Angeles Intl",               country: "United States" },
  { code: "BUR", city: "Burbank",        name: "Hollywood Burbank Airport",      country: "United States" },
  { code: "LGB", city: "Long Beach",     name: "Long Beach Airport",             country: "United States" },
  { code: "SNA", city: "Santa Ana",      name: "John Wayne Airport",             country: "United States" },
  { code: "ONT", city: "Ontario",        name: "Ontario Intl",                   country: "United States" },
  { code: "SFO", city: "San Francisco",  name: "San Francisco Intl",             country: "United States" },
  { code: "OAK", city: "Oakland",        name: "Oakland Intl",                   country: "United States" },
  { code: "SJC", city: "San Jose",       name: "San Jose Intl",                  country: "United States" },
  { code: "ORD", city: "Chicago",        name: "O'Hare Intl",                    country: "United States" },
  { code: "MDW", city: "Chicago",        name: "Midway Intl",                    country: "United States" },
  { code: "DCA", city: "Washington",     name: "Ronald Reagan National",         country: "United States" },
  { code: "IAD", city: "Washington",     name: "Dulles Intl",                    country: "United States" },
  { code: "BWI", city: "Baltimore",      name: "Baltimore/Washington Intl",      country: "United States" },
  { code: "MIA", city: "Miami",          name: "Miami Intl",                     country: "United States" },
  { code: "FLL", city: "Fort Lauderdale",name: "Fort Lauderdale-Hollywood Intl", country: "United States" },
  { code: "BOS", city: "Boston",         name: "Logan Intl",                     country: "United States" },
  { code: "SEA", city: "Seattle",        name: "Seattle-Tacoma Intl",            country: "United States" },
  { code: "DEN", city: "Denver",         name: "Denver Intl",                    country: "United States" },
  { code: "ATL", city: "Atlanta",        name: "Hartsfield-Jackson Intl",        country: "United States" },
  { code: "DFW", city: "Dallas",         name: "Dallas/Fort Worth Intl",         country: "United States" },
  { code: "IAH", city: "Houston",        name: "George Bush Intercontinental",   country: "United States" },
  { code: "HOU", city: "Houston",        name: "William P. Hobby Airport",       country: "United States" },
  { code: "PHX", city: "Phoenix",        name: "Sky Harbor Intl",                country: "United States" },
  { code: "LAS", city: "Las Vegas",      name: "Harry Reid Intl",                country: "United States" },
  { code: "MCO", city: "Orlando",        name: "Orlando Intl",                   country: "United States" },
  { code: "MSP", city: "Minneapolis",    name: "Minneapolis-Saint Paul Intl",    country: "United States" },
  { code: "DTW", city: "Detroit",        name: "Detroit Metropolitan",           country: "United States" },
  { code: "PDX", city: "Portland",       name: "Portland Intl",                  country: "United States" },
  { code: "SAN", city: "San Diego",      name: "San Diego Intl",                 country: "United States" },
  { code: "BNA", city: "Nashville",      name: "Nashville Intl",                 country: "United States" },
  { code: "AUS", city: "Austin",         name: "Austin-Bergstrom Intl",          country: "United States" },
  { code: "PHL", city: "Philadelphia",   name: "Philadelphia Intl",              country: "United States" },
  { code: "SLC", city: "Salt Lake City", name: "Salt Lake City Intl",            country: "United States" },
  { code: "RDU", city: "Raleigh",        name: "Raleigh-Durham Intl",            country: "United States" },
  { code: "MSY", city: "New Orleans",    name: "Louis Armstrong Intl",           country: "United States" },
  { code: "TPA", city: "Tampa",          name: "Tampa Intl",                     country: "United States" },
  { code: "HNL", city: "Honolulu",       name: "Daniel K. Inouye Intl",          country: "United States" },
  { code: "MCI", city: "Kansas City",    name: "Kansas City Intl",               country: "United States" },
  { code: "STL", city: "St. Louis",      name: "St. Louis Lambert Intl",         country: "United States" },
  { code: "CLE", city: "Cleveland",      name: "Cleveland Hopkins Intl",         country: "United States" },
  { code: "PIT", city: "Pittsburgh",     name: "Pittsburgh Intl",                country: "United States" },
  // ── Canada ──
  { code: "YYZ", city: "Toronto",        name: "Pearson Intl",                   country: "Canada" },
  { code: "YVR", city: "Vancouver",      name: "Vancouver Intl",                 country: "Canada" },
  { code: "YUL", city: "Montreal",       name: "Trudeau Intl",                   country: "Canada" },
  { code: "YYC", city: "Calgary",        name: "Calgary Intl",                   country: "Canada" },
  { code: "YEG", city: "Edmonton",       name: "Edmonton Intl",                  country: "Canada" },
  { code: "YOW", city: "Ottawa",         name: "Ottawa Macdonald-Cartier Intl",  country: "Canada" },
  { code: "YHZ", city: "Halifax",        name: "Halifax Stanfield Intl",         country: "Canada" },
  // ── Mexico & Caribbean ──
  { code: "MEX", city: "Mexico City",    name: "Benito Juárez Intl",             country: "Mexico" },
  { code: "CUN", city: "Cancún",         name: "Cancún Intl",                    country: "Mexico" },
  { code: "GDL", city: "Guadalajara",    name: "Miguel Hidalgo y Costilla Intl", country: "Mexico" },
  { code: "SJU", city: "San Juan",       name: "Luis Muñoz Marín Intl",          country: "Puerto Rico" },
  { code: "MBJ", city: "Montego Bay",    name: "Sangster Intl",                  country: "Jamaica" },
  { code: "NAS", city: "Nassau",         name: "Lynden Pindling Intl",           country: "Bahamas" },
  { code: "HAV", city: "Havana",         name: "José Martí Intl",                country: "Cuba" },
  // ── Central & South America ──
  { code: "PTY", city: "Panama City",    name: "Tocumen Intl",                   country: "Panama" },
  { code: "BOG", city: "Bogotá",         name: "El Dorado Intl",                 country: "Colombia" },
  { code: "MDE", city: "Medellín",       name: "José María Córdova Intl",        country: "Colombia" },
  { code: "GRU", city: "São Paulo",      name: "Guarulhos Intl",                 country: "Brazil" },
  { code: "GIG", city: "Rio de Janeiro", name: "Galeão Intl",                    country: "Brazil" },
  { code: "EZE", city: "Buenos Aires",   name: "Ezeiza Intl",                    country: "Argentina" },
  { code: "SCL", city: "Santiago",       name: "Arturo Merino Benítez Intl",     country: "Chile" },
  { code: "LIM", city: "Lima",           name: "Jorge Chávez Intl",              country: "Peru" },
  { code: "UIO", city: "Quito",          name: "Mariscal Sucre Intl",            country: "Ecuador" },
  { code: "MVD", city: "Montevideo",     name: "Carrasco Intl",                  country: "Uruguay" },
  // ── United Kingdom ──
  { code: "LHR", city: "London",         name: "Heathrow",                       country: "United Kingdom" },
  { code: "LGW", city: "London",         name: "Gatwick",                        country: "United Kingdom" },
  { code: "STN", city: "London",         name: "Stansted",                       country: "United Kingdom" },
  { code: "LCY", city: "London",         name: "London City",                    country: "United Kingdom" },
  { code: "LTN", city: "London",         name: "Luton Airport",                  country: "United Kingdom" },
  { code: "MAN", city: "Manchester",     name: "Manchester Airport",             country: "United Kingdom" },
  { code: "BHX", city: "Birmingham",     name: "Birmingham Airport",             country: "United Kingdom" },
  { code: "EDI", city: "Edinburgh",      name: "Edinburgh Airport",              country: "United Kingdom" },
  { code: "GLA", city: "Glasgow",        name: "Glasgow Airport",                country: "United Kingdom" },
  { code: "BRS", city: "Bristol",        name: "Bristol Airport",                country: "United Kingdom" },
  // ── Ireland ──
  { code: "DUB", city: "Dublin",         name: "Dublin Airport",                 country: "Ireland" },
  { code: "ORK", city: "Cork",           name: "Cork Airport",                   country: "Ireland" },
  // ── France ──
  { code: "CDG", city: "Paris",          name: "Charles de Gaulle",              country: "France" },
  { code: "ORY", city: "Paris",          name: "Orly",                           country: "France" },
  { code: "NCE", city: "Nice",           name: "Nice Côte d'Azur",               country: "France" },
  { code: "LYS", city: "Lyon",           name: "Saint-Exupéry Intl",             country: "France" },
  { code: "MRS", city: "Marseille",      name: "Provence Airport",               country: "France" },
  { code: "BOD", city: "Bordeaux",       name: "Mérignac Airport",               country: "France" },
  { code: "TLS", city: "Toulouse",       name: "Blagnac Airport",                country: "France" },
  { code: "NTE", city: "Nantes",         name: "Nantes Atlantique",              country: "France" },
  // ── Germany ──
  { code: "FRA", city: "Frankfurt",      name: "Frankfurt Intl",                 country: "Germany" },
  { code: "MUC", city: "Munich",         name: "Munich Intl",                    country: "Germany" },
  { code: "BER", city: "Berlin",         name: "Brandenburg Intl",               country: "Germany" },
  { code: "HAM", city: "Hamburg",        name: "Hamburg Airport",                country: "Germany" },
  { code: "DUS", city: "Düsseldorf",     name: "Düsseldorf Airport",             country: "Germany" },
  { code: "CGN", city: "Cologne",        name: "Cologne Bonn Airport",           country: "Germany" },
  { code: "STR", city: "Stuttgart",      name: "Stuttgart Airport",              country: "Germany" },
  { code: "NUE", city: "Nuremberg",      name: "Nuremberg Airport",              country: "Germany" },
  // ── Netherlands & Belgium ──
  { code: "AMS", city: "Amsterdam",      name: "Schiphol",                       country: "Netherlands" },
  { code: "EIN", city: "Eindhoven",      name: "Eindhoven Airport",              country: "Netherlands" },
  { code: "BRU", city: "Brussels",       name: "Brussels Airport",               country: "Belgium" },
  { code: "CRL", city: "Brussels",       name: "Brussels South Charleroi",       country: "Belgium" },
  // ── Switzerland ──
  { code: "ZRH", city: "Zurich",         name: "Zurich Intl",                    country: "Switzerland" },
  { code: "GVA", city: "Geneva",         name: "Geneva Intl",                    country: "Switzerland" },
  { code: "BSL", city: "Basel",          name: "EuroAirport Basel-Mulhouse",     country: "Switzerland" },
  // ── Spain ──
  { code: "MAD", city: "Madrid",         name: "Adolfo Suárez Barajas",          country: "Spain" },
  { code: "BCN", city: "Barcelona",      name: "Josep Tarradellas Barcelona-El Prat", country: "Spain" },
  { code: "PMI", city: "Palma",          name: "Palma de Mallorca Airport",      country: "Spain" },
  { code: "AGP", city: "Málaga",         name: "Costa del Sol Airport",          country: "Spain" },
  { code: "VLC", city: "Valencia",       name: "Valencia Airport",               country: "Spain" },
  { code: "SVQ", city: "Seville",        name: "San Pablo Airport",              country: "Spain" },
  { code: "IBZ", city: "Ibiza",          name: "Ibiza Airport",                  country: "Spain" },
  { code: "TFS", city: "Tenerife",       name: "Tenerife South Airport",         country: "Spain" },
  { code: "LPA", city: "Las Palmas",     name: "Gran Canaria Airport",           country: "Spain" },
  { code: "ALC", city: "Alicante",       name: "Alicante-Elche Airport",         country: "Spain" },
  // ── Portugal ──
  { code: "LIS", city: "Lisbon",         name: "Humberto Delgado Airport",       country: "Portugal" },
  { code: "OPO", city: "Porto",          name: "Francisco de Sá Carneiro Intl",  country: "Portugal" },
  { code: "FAO", city: "Faro",           name: "Faro Airport",                   country: "Portugal" },
  { code: "FNC", city: "Funchal",        name: "Madeira Airport",                country: "Portugal" },
  // ── Italy ──
  { code: "FCO", city: "Rome",           name: "Fiumicino",                      country: "Italy" },
  { code: "CIA", city: "Rome",           name: "Ciampino",                       country: "Italy" },
  { code: "MXP", city: "Milan",          name: "Malpensa",                       country: "Italy" },
  { code: "LIN", city: "Milan",          name: "Linate",                         country: "Italy" },
  { code: "BGY", city: "Milan",          name: "Bergamo Orio al Serio",          country: "Italy" },
  { code: "NAP", city: "Naples",         name: "Naples Intl",                    country: "Italy" },
  { code: "VCE", city: "Venice",         name: "Marco Polo Intl",                country: "Italy" },
  { code: "FLR", city: "Florence",       name: "Amerigo Vespucci Intl",          country: "Italy" },
  { code: "PSA", city: "Pisa",           name: "Galileo Galilei Airport",        country: "Italy" },
  { code: "BLQ", city: "Bologna",        name: "Guglielmo Marconi Airport",      country: "Italy" },
  { code: "CTA", city: "Catania",        name: "Fontanarossa Airport",           country: "Italy" },
  { code: "PMO", city: "Palermo",        name: "Falcone-Borsellino Airport",     country: "Italy" },
  // ── Austria ──
  { code: "VIE", city: "Vienna",         name: "Vienna Intl",                    country: "Austria" },
  { code: "SZG", city: "Salzburg",       name: "Salzburg Airport",               country: "Austria" },
  { code: "INN", city: "Innsbruck",      name: "Innsbruck Airport",              country: "Austria" },
  // ── Czech Republic ──
  { code: "PRG", city: "Prague",         name: "Václav Havel Airport Prague",    country: "Czech Republic" },
  { code: "BRQ", city: "Brno",           name: "Brno-Tuřany Airport",            country: "Czech Republic" },
  // ── Slovakia ──
  { code: "BTS", city: "Bratislava",     name: "M. R. Štefánik Airport",         country: "Slovakia" },
  { code: "KSC", city: "Košice",         name: "Košice International Airport",   country: "Slovakia" },
  // ── Hungary ──
  { code: "BUD", city: "Budapest",       name: "Budapest Ferenc Liszt Intl",     country: "Hungary" },
  // ── Poland ──
  { code: "WAW", city: "Warsaw",         name: "Chopin Airport",                 country: "Poland" },
  { code: "WMI", city: "Warsaw",         name: "Warsaw Modlin Airport",          country: "Poland" },
  { code: "KRK", city: "Krakow",         name: "John Paul II Intl",              country: "Poland" },
  { code: "WRO", city: "Wroclaw",        name: "Nicolaus Copernicus Airport",    country: "Poland" },
  { code: "GDN", city: "Gdansk",         name: "Lech Walesa Airport",            country: "Poland" },
  { code: "POZ", city: "Poznan",         name: "Ławica Airport",                 country: "Poland" },
  { code: "KTW", city: "Katowice",       name: "Katowice Airport",               country: "Poland" },
  // ── Croatia ──
  { code: "ZAG", city: "Zagreb",         name: "Franjo Tuđman Airport",          country: "Croatia" },
  { code: "DBV", city: "Dubrovnik",      name: "Dubrovnik Airport",              country: "Croatia" },
  { code: "SPU", city: "Split",          name: "Split Airport",                  country: "Croatia" },
  { code: "ZAD", city: "Zadar",          name: "Zadar Airport",                  country: "Croatia" },
  { code: "PUY", city: "Pula",           name: "Pula Airport",                   country: "Croatia" },
  { code: "RJK", city: "Rijeka",         name: "Rijeka Airport",                 country: "Croatia" },
  // ── Slovenia ──
  { code: "LJU", city: "Ljubljana",      name: "Jože Pučnik Airport",            country: "Slovenia" },
  // ── Serbia ──
  { code: "BEG", city: "Belgrade",       name: "Nikola Tesla Airport",           country: "Serbia" },
  // ── Bosnia ──
  { code: "SJJ", city: "Sarajevo",       name: "Sarajevo Intl",                  country: "Bosnia" },
  // ── Montenegro ──
  { code: "TGD", city: "Podgorica",      name: "Podgorica Airport",              country: "Montenegro" },
  { code: "TIV", city: "Tivat",          name: "Tivat Airport",                  country: "Montenegro" },
  // ── North Macedonia ──
  { code: "SKP", city: "Skopje",         name: "Alexander the Great Airport",    country: "North Macedonia" },
  // ── Albania ──
  { code: "TIA", city: "Tirana",         name: "Rinas Mother Teresa Airport",    country: "Albania" },
  // ── Romania ──
  { code: "OTP", city: "Bucharest",      name: "Henri Coandă Intl",              country: "Romania" },
  { code: "CLJ", city: "Cluj-Napoca",    name: "Avram Iancu Intl",               country: "Romania" },
  // ── Bulgaria ──
  { code: "SOF", city: "Sofia",          name: "Sofia Airport",                  country: "Bulgaria" },
  { code: "VAR", city: "Varna",          name: "Varna Airport",                  country: "Bulgaria" },
  // ── Greece ──
  { code: "ATH", city: "Athens",         name: "Eleftherios Venizelos Intl",     country: "Greece" },
  { code: "SKG", city: "Thessaloniki",   name: "Macedonia Airport",              country: "Greece" },
  { code: "HER", city: "Heraklion",      name: "Nikos Kazantzakis Intl",         country: "Greece" },
  { code: "RHO", city: "Rhodes",         name: "Diagoras Airport",               country: "Greece" },
  { code: "CFU", city: "Corfu",          name: "Ioannis Kapodistrias Intl",      country: "Greece" },
  { code: "JMK", city: "Mykonos",        name: "Mykonos Airport",                country: "Greece" },
  { code: "JTR", city: "Santorini",      name: "Thira Airport",                  country: "Greece" },
  // ── Cyprus ──
  { code: "LCA", city: "Larnaca",        name: "Larnaca Intl",                   country: "Cyprus" },
  { code: "PFO", city: "Paphos",         name: "Paphos Intl",                    country: "Cyprus" },
  // ── Turkey ──
  { code: "IST", city: "Istanbul",       name: "Istanbul Airport",               country: "Turkey" },
  { code: "SAW", city: "Istanbul",       name: "Sabiha Gökçen Intl",             country: "Turkey" },
  { code: "ADB", city: "Izmir",          name: "Adnan Menderes Airport",         country: "Turkey" },
  { code: "ESB", city: "Ankara",         name: "Esenboğa Airport",               country: "Turkey" },
  { code: "AYT", city: "Antalya",        name: "Antalya Airport",                country: "Turkey" },
  { code: "DLM", city: "Dalaman",        name: "Dalaman Airport",                country: "Turkey" },
  // ── Scandinavia ──
  { code: "CPH", city: "Copenhagen",     name: "Copenhagen Airport",             country: "Denmark" },
  { code: "AAL", city: "Aalborg",        name: "Aalborg Airport",                country: "Denmark" },
  { code: "ARN", city: "Stockholm",      name: "Arlanda",                        country: "Sweden" },
  { code: "GOT", city: "Gothenburg",     name: "Landvetter Airport",             country: "Sweden" },
  { code: "MMX", city: "Malmö",          name: "Malmö Airport",                  country: "Sweden" },
  { code: "OSL", city: "Oslo",           name: "Gardermoen",                     country: "Norway" },
  { code: "BGO", city: "Bergen",         name: "Flesland Airport",               country: "Norway" },
  { code: "TRD", city: "Trondheim",      name: "Trondheim Vaernes Airport",      country: "Norway" },
  { code: "HEL", city: "Helsinki",       name: "Helsinki-Vantaa",                country: "Finland" },
  { code: "OUL", city: "Oulu",           name: "Oulu Airport",                   country: "Finland" },
  { code: "RVN", city: "Rovaniemi",      name: "Rovaniemi Airport",              country: "Finland" },
  { code: "KEF", city: "Reykjavik",      name: "Keflavik Intl",                  country: "Iceland" },
  // ── Baltic States ──
  { code: "RIX", city: "Riga",           name: "Riga Intl",                      country: "Latvia" },
  { code: "VNO", city: "Vilnius",        name: "Vilnius Airport",                country: "Lithuania" },
  { code: "TLL", city: "Tallinn",        name: "Lennart Meri Airport",           country: "Estonia" },
  // ── Ukraine ──
  { code: "KBP", city: "Kyiv",           name: "Boryspil Intl",                  country: "Ukraine" },
  { code: "LWO", city: "Lviv",           name: "Danylo Halytskyi Intl",          country: "Ukraine" },
  // ── Georgia, Armenia, Azerbaijan ──
  { code: "TBS", city: "Tbilisi",        name: "Shota Rustaveli Intl",           country: "Georgia" },
  { code: "EVN", city: "Yerevan",        name: "Zvartnots Intl",                 country: "Armenia" },
  { code: "GYD", city: "Baku",           name: "Heydar Aliyev Intl",             country: "Azerbaijan" },
  // ── Middle East ──
  { code: "DXB", city: "Dubai",          name: "Dubai Intl",                     country: "United Arab Emirates" },
  { code: "AUH", city: "Abu Dhabi",      name: "Zayed Intl",                     country: "United Arab Emirates" },
  { code: "SHJ", city: "Sharjah",        name: "Sharjah Intl",                   country: "United Arab Emirates" },
  { code: "DOH", city: "Doha",           name: "Hamad Intl",                     country: "Qatar" },
  { code: "KWI", city: "Kuwait City",    name: "Kuwait Intl",                    country: "Kuwait" },
  { code: "BAH", city: "Manama",         name: "Bahrain Intl",                   country: "Bahrain" },
  { code: "MCT", city: "Muscat",         name: "Muscat Intl",                    country: "Oman" },
  { code: "RUH", city: "Riyadh",         name: "King Khalid Intl",               country: "Saudi Arabia" },
  { code: "JED", city: "Jeddah",         name: "King Abdulaziz Intl",            country: "Saudi Arabia" },
  { code: "AMM", city: "Amman",          name: "Queen Alia Intl",                country: "Jordan" },
  { code: "BEY", city: "Beirut",         name: "Rafic Hariri Intl",              country: "Lebanon" },
  { code: "TLV", city: "Tel Aviv",       name: "Ben Gurion Intl",                country: "Israel" },
  // ── Africa ──
  { code: "CAI", city: "Cairo",          name: "Cairo Intl",                     country: "Egypt" },
  { code: "HRG", city: "Hurghada",       name: "Hurghada Intl",                  country: "Egypt" },
  { code: "SSH", city: "Sharm el-Sheikh",name: "Sharm el-Sheikh Intl",           country: "Egypt" },
  { code: "CMN", city: "Casablanca",     name: "Mohammed V Intl",                country: "Morocco" },
  { code: "RAK", city: "Marrakech",      name: "Menara Airport",                 country: "Morocco" },
  { code: "TUN", city: "Tunis",          name: "Carthage Intl",                  country: "Tunisia" },
  { code: "ALG", city: "Algiers",        name: "Houari Boumediene Airport",      country: "Algeria" },
  { code: "JNB", city: "Johannesburg",   name: "O.R. Tambo Intl",               country: "South Africa" },
  { code: "CPT", city: "Cape Town",      name: "Cape Town Intl",                 country: "South Africa" },
  { code: "DUR", city: "Durban",         name: "King Shaka Intl",                country: "South Africa" },
  { code: "NBO", city: "Nairobi",        name: "Jomo Kenyatta Intl",             country: "Kenya" },
  { code: "MBA", city: "Mombasa",        name: "Moi Intl",                       country: "Kenya" },
  { code: "ADD", city: "Addis Ababa",    name: "Bole Intl",                      country: "Ethiopia" },
  { code: "JRO", city: "Kilimanjaro",    name: "Kilimanjaro Intl",               country: "Tanzania" },
  { code: "DAR", city: "Dar es Salaam",  name: "Julius Nyerere Intl",            country: "Tanzania" },
  { code: "EBB", city: "Entebbe",        name: "Entebbe Intl",                   country: "Uganda" },
  { code: "LOS", city: "Lagos",          name: "Murtala Muhammed Intl",          country: "Nigeria" },
  { code: "ABV", city: "Abuja",          name: "Nnamdi Azikiwe Intl",            country: "Nigeria" },
  { code: "ACC", city: "Accra",          name: "Kotoka Intl",                    country: "Ghana" },
  { code: "DKR", city: "Dakar",          name: "Blaise Diagne Intl",             country: "Senegal" },
  { code: "MRU", city: "Mauritius",      name: "Sir Seewoosagur Ramgoolam Intl", country: "Mauritius" },
  // ── South Asia ──
  { code: "DEL", city: "Delhi",          name: "Indira Gandhi Intl",             country: "India" },
  { code: "BOM", city: "Mumbai",         name: "Chhatrapati Shivaji Maharaj Intl", country: "India" },
  { code: "MAA", city: "Chennai",        name: "Chennai Intl",                   country: "India" },
  { code: "BLR", city: "Bangalore",      name: "Kempegowda Intl",                country: "India" },
  { code: "HYD", city: "Hyderabad",      name: "Rajiv Gandhi Intl",              country: "India" },
  { code: "CCU", city: "Kolkata",        name: "Netaji Subhas Chandra Bose Intl", country: "India" },
  { code: "COK", city: "Kochi",          name: "Cochin Intl",                    country: "India" },
  { code: "CMB", city: "Colombo",        name: "Bandaranaike Intl",              country: "Sri Lanka" },
  { code: "KTM", city: "Kathmandu",      name: "Tribhuvan Intl",                 country: "Nepal" },
  { code: "DAC", city: "Dhaka",          name: "Hazrat Shahjalal Intl",          country: "Bangladesh" },
  { code: "KHI", city: "Karachi",        name: "Jinnah Intl",                    country: "Pakistan" },
  { code: "LHE", city: "Lahore",         name: "Allama Iqbal Intl",              country: "Pakistan" },
  { code: "ISB", city: "Islamabad",      name: "New Islamabad Intl",             country: "Pakistan" },
  // ── East & Southeast Asia ──
  { code: "NRT", city: "Tokyo",          name: "Narita",                         country: "Japan" },
  { code: "HND", city: "Tokyo",          name: "Haneda",                         country: "Japan" },
  { code: "KIX", city: "Osaka",          name: "Kansai Intl",                    country: "Japan" },
  { code: "ITM", city: "Osaka",          name: "Itami Airport",                  country: "Japan" },
  { code: "CTS", city: "Sapporo",        name: "New Chitose Airport",            country: "Japan" },
  { code: "FUK", city: "Fukuoka",        name: "Fukuoka Airport",                country: "Japan" },
  { code: "NGO", city: "Nagoya",         name: "Chubu Centrair Intl",            country: "Japan" },
  { code: "OKA", city: "Okinawa",        name: "Naha Airport",                   country: "Japan" },
  { code: "ICN", city: "Seoul",          name: "Incheon Intl",                   country: "South Korea" },
  { code: "GMP", city: "Seoul",          name: "Gimpo Intl",                     country: "South Korea" },
  { code: "CJU", city: "Jeju",           name: "Jeju Intl",                      country: "South Korea" },
  { code: "PEK", city: "Beijing",        name: "Capital Intl",                   country: "China" },
  { code: "PKX", city: "Beijing",        name: "Daxing Intl",                    country: "China" },
  { code: "PVG", city: "Shanghai",       name: "Pudong Intl",                    country: "China" },
  { code: "SHA", city: "Shanghai",       name: "Hongqiao Intl",                  country: "China" },
  { code: "CAN", city: "Guangzhou",      name: "Baiyun Intl",                    country: "China" },
  { code: "SZX", city: "Shenzhen",       name: "Bao'an Intl",                    country: "China" },
  { code: "CTU", city: "Chengdu",        name: "Tianfu Intl",                    country: "China" },
  { code: "HKG", city: "Hong Kong",      name: "Hong Kong Intl",                 country: "Hong Kong" },
  { code: "TPE", city: "Taipei",         name: "Taiwan Taoyuan Intl",            country: "Taiwan" },
  { code: "TSA", city: "Taipei",         name: "Songshan Airport",               country: "Taiwan" },
  { code: "MNL", city: "Manila",         name: "Ninoy Aquino Intl",              country: "Philippines" },
  { code: "CEB", city: "Cebu",           name: "Mactan-Cebu Intl",               country: "Philippines" },
  { code: "SIN", city: "Singapore",      name: "Changi",                         country: "Singapore" },
  { code: "KUL", city: "Kuala Lumpur",   name: "Kuala Lumpur Intl",              country: "Malaysia" },
  { code: "BKK", city: "Bangkok",        name: "Suvarnabhumi",                   country: "Thailand" },
  { code: "DMK", city: "Bangkok",        name: "Don Mueang Intl",                country: "Thailand" },
  { code: "HKT", city: "Phuket",         name: "Phuket Intl",                    country: "Thailand" },
  { code: "CNX", city: "Chiang Mai",     name: "Chiang Mai Intl",                country: "Thailand" },
  { code: "HAN", city: "Hanoi",          name: "Noi Bai Intl",                   country: "Vietnam" },
  { code: "SGN", city: "Ho Chi Minh City", name: "Tan Son Nhat Intl",            country: "Vietnam" },
  { code: "DAD", city: "Da Nang",        name: "Da Nang Intl",                   country: "Vietnam" },
  { code: "CGK", city: "Jakarta",        name: "Soekarno-Hatta Intl",            country: "Indonesia" },
  { code: "DPS", city: "Bali",           name: "Ngurah Rai Intl",                country: "Indonesia" },
  { code: "RGN", city: "Yangon",         name: "Yangon Intl",                    country: "Myanmar" },
  { code: "PNH", city: "Phnom Penh",     name: "Phnom Penh Intl",                country: "Cambodia" },
  { code: "REP", city: "Siem Reap",      name: "Angkor Intl",                    country: "Cambodia" },
  { code: "VTE", city: "Vientiane",      name: "Wattay Intl",                    country: "Laos" },
  // ── Australia & Pacific ──
  { code: "SYD", city: "Sydney",         name: "Kingsford Smith",                country: "Australia" },
  { code: "MEL", city: "Melbourne",      name: "Melbourne Airport",              country: "Australia" },
  { code: "BNE", city: "Brisbane",       name: "Brisbane Airport",               country: "Australia" },
  { code: "PER", city: "Perth",          name: "Perth Airport",                  country: "Australia" },
  { code: "ADL", city: "Adelaide",       name: "Adelaide Airport",               country: "Australia" },
  { code: "OOL", city: "Gold Coast",     name: "Gold Coast Airport",             country: "Australia" },
  { code: "CBR", city: "Canberra",       name: "Canberra Airport",               country: "Australia" },
  { code: "AKL", city: "Auckland",       name: "Auckland Airport",               country: "New Zealand" },
  { code: "CHC", city: "Christchurch",   name: "Christchurch Intl",              country: "New Zealand" },
  { code: "WLG", city: "Wellington",     name: "Wellington Airport",             country: "New Zealand" },
  { code: "NAN", city: "Nadi",           name: "Nadi Intl",                      country: "Fiji" },
];

// ── Metro groups ──────────────────────────────────────────────────────────────

interface MetroGroup {
  kind: "metro";
  id: string;
  label: string;
  codes: string[];
  searchTerms: string[];
}

const METRO_GROUPS: MetroGroup[] = [
  // ── United States ──
  {
    kind: "metro", id: "NYC", label: "New York City Area", codes: ["JFK", "LGA", "EWR"],
    searchTerms: ["new york", "nyc", "jfk", "lga", "ewr", "newark"],
  },
  {
    kind: "metro", id: "LAX_METRO", label: "Los Angeles Area", codes: ["LAX", "BUR", "LGB", "SNA", "ONT"],
    searchTerms: ["los angeles", "la", "lax", "bur", "lgb", "sna", "ont", "burbank", "long beach", "orange county"],
  },
  {
    kind: "metro", id: "SFO_METRO", label: "San Francisco Bay Area", codes: ["SFO", "OAK", "SJC"],
    searchTerms: ["san francisco", "sf", "bay area", "sfo", "oak", "sjc", "oakland", "san jose"],
  },
  {
    kind: "metro", id: "CHI", label: "Chicago Area", codes: ["ORD", "MDW"],
    searchTerms: ["chicago", "ord", "mdw", "ohare", "midway"],
  },
  {
    kind: "metro", id: "WAS", label: "Washington DC Area", codes: ["DCA", "IAD", "BWI"],
    searchTerms: ["washington", "dc", "dca", "iad", "bwi", "reagan", "dulles", "baltimore"],
  },
  {
    kind: "metro", id: "HOU_METRO", label: "Houston Area", codes: ["IAH", "HOU"],
    searchTerms: ["houston", "iah", "hou", "bush", "hobby"],
  },
  // ── Europe ──
  {
    kind: "metro", id: "LON", label: "London Area", codes: ["LHR", "LGW", "STN", "LCY", "LTN"],
    searchTerms: ["london", "lhr", "lgw", "stn", "lcy", "ltn", "heathrow", "gatwick", "stansted"],
  },
  {
    kind: "metro", id: "PAR", label: "Paris Area", codes: ["CDG", "ORY"],
    searchTerms: ["paris", "cdg", "ory", "de gaulle", "orly"],
  },
  {
    kind: "metro", id: "BRU_METRO", label: "Brussels Area", codes: ["BRU", "CRL"],
    searchTerms: ["brussels", "bru", "crl", "charleroi", "belgium"],
  },
  {
    kind: "metro", id: "MIL", label: "Milan Area", codes: ["MXP", "LIN", "BGY"],
    searchTerms: ["milan", "mil", "mxp", "lin", "bgy", "malpensa", "linate", "bergamo"],
  },
  {
    kind: "metro", id: "ROM", label: "Rome Area", codes: ["FCO", "CIA"],
    searchTerms: ["rome", "rom", "fco", "cia", "fiumicino", "ciampino"],
  },
  {
    kind: "metro", id: "IST_METRO", label: "Istanbul Area", codes: ["IST", "SAW"],
    searchTerms: ["istanbul", "ist", "saw", "sabiha", "gokcen"],
  },
  {
    kind: "metro", id: "WAW_METRO", label: "Warsaw Area", codes: ["WAW", "WMI"],
    searchTerms: ["warsaw", "waw", "wmi", "chopin", "modlin"],
  },
  // ── Asia ──
  {
    kind: "metro", id: "TYO", label: "Tokyo Area", codes: ["HND", "NRT"],
    searchTerms: ["tokyo", "hnd", "nrt", "haneda", "narita"],
  },
  {
    kind: "metro", id: "OSA", label: "Osaka Area", codes: ["KIX", "ITM"],
    searchTerms: ["osaka", "osa", "kix", "itm", "kansai", "itami"],
  },
  {
    kind: "metro", id: "SEL", label: "Seoul Area", codes: ["ICN", "GMP"],
    searchTerms: ["seoul", "sel", "icn", "gmp", "incheon", "gimpo"],
  },
  {
    kind: "metro", id: "BJS", label: "Beijing Area", codes: ["PEK", "PKX"],
    searchTerms: ["beijing", "bjs", "pek", "pkx", "capital", "daxing"],
  },
  {
    kind: "metro", id: "SHA_METRO", label: "Shanghai Area", codes: ["PVG", "SHA"],
    searchTerms: ["shanghai", "sha", "pvg", "pudong", "hongqiao"],
  },
  {
    kind: "metro", id: "BKK_METRO", label: "Bangkok Area", codes: ["BKK", "DMK"],
    searchTerms: ["bangkok", "bkk", "dmk", "suvarnabhumi", "don mueang"],
  },
  {
    kind: "metro", id: "TPE_METRO", label: "Taipei Area", codes: ["TPE", "TSA"],
    searchTerms: ["taipei", "tpe", "tsa", "taoyuan", "songshan", "taiwan"],
  },
];

type Airport = (typeof AIRPORTS)[0];
type AirportEntry = Airport & { kind: "airport" };
type Selection = MetroGroup | AirportEntry;
type TripType = "roundtrip" | "oneway";

// Match a free-form city string (e.g. "Tokyo, Japan") to a MetroGroup or Airport
function findSelectionForCity(cityStr: string): Selection | null {
  const q = cityStr.split(",")[0].trim().toLowerCase();
  if (!q) return null;
  const metro = METRO_GROUPS.find((m) => m.searchTerms.some((t) => t === q));
  if (metro) return metro;
  const airport = AIRPORTS.find((a) => a.city.toLowerCase() === q);
  if (airport) return { ...airport, kind: "airport" as const };
  return null;
}
type CabinClass = "economy" | "premium_economy" | "business" | "first";
type SearchState = "idle" | "loading" | "results" | "error";

interface FlightOffer {
  airline: string;
  airline_code: string;
  flight_number: string;
  origin: string;
  destination: string;
  depart_time: string;
  arrive_time: string;
  duration: string;
  stops: number;
  stop_label: string;
  cabin: string;
  baggage: string;
  price_total: number;
  price_per_person: number;
  currency: string;
  ai_score: number;
  score_breakdown: Record<string, number>;
  recommendation_label: string;
  recommendation_why: string;
  recommendation_bullets: string[];
  wins_on: string[];
  tradeoffs: string[];
  comparison_summary: string;
  ranking_why?: Array<{ positive: boolean; text: string }>;
  is_recommended: boolean;
  arrival_timing: string;
  jet_lag: string;
  travel_fatigue: string;
  city_access: string;
  aircraft_comfort: string;
  connection_airports?: string;
  duration_minutes?: number;
  offer_id?: string;
  source?: string;       // "duffel" | "amadeus" — which provider sourced this offer
  is_bookable?: boolean; // false → search-only, shown with "Search only" label
  booking_url?: string; // for search-only offers: direct link to external booking page
  outbound_flight_numbers?: string[];
  return_origin?: string;
  return_destination?: string;
  return_depart_time?: string;
  return_arrive_time?: string;
  return_duration?: string;
  return_duration_minutes?: number;
  return_stops?: number;
  return_stop_label?: string;
  return_connection_airports?: string;
  return_flight_numbers?: string[];
  partial_round_trip?: boolean;
}


interface RawOfferRow {
  airline: string;
  airline_code: string;
  owner: string;
  price: string;
  stops: number;
  offer_id: string;
}

interface DebugStats {
  // provider status
  enabled_providers?: string;
  serpapi_status?: string;
  // request
  origin?: string;
  destination?: string;
  departure_date?: string;
  return_date?: string;
  trip_type?: string;
  adults?: number;
  cabin_class?: string;
  api_key_mode?: string;
  carrier_filters?: string;
  content_source_filters?: string;
  limit_params?: string;
  request_payload_json?: string;
  // duffel response
  duffel_http_status?: number;
  duffel_latency_ms?: number;
  raw_duffel_offers: number;
  unique_airlines: string;
  owner_ids?: string;
  cheapest_raw: string;
  raw_offer_rows?: RawOfferRow[];
  // google flights / serpapi
  serpapi_best_count?: number;
  serpapi_other_count?: number;
  serpapi_total_parsed?: number;
  raw_serpapi_offers?: number;
  serpapi_airlines?: string;
  serpapi_cheapest?: string;
  // env diagnostics
  serpapi_env_present?: string;
  serpapi_env_name_checked?: string;
  vercel_env?: string;
  node_env?: string;
  // pipeline
  after_filtering: number;
  normalize_duffel_offer_dropped: number;
  normalize_flight_dropped: number;
  after_deduplication: number;
  dedup_dropped: number;
  after_ranking: number;
  rendered_offers: number;
  cheapest_rendered: string;
  // legacy field names kept for backward compat
  origin_airports?: string;
  destination_airports?: string;
  request_filters?: string;
}

interface SearchMeta {
  origin: string;
  destination: string;
  trip_type: string;
  cabin_class: string;
  adults: number;
  offer_count?: number;
  debugStats?: DebugStats;
}

const CABIN_LABELS: Record<CabinClass, string> = {
  economy: "Economy",
  premium_economy: "Premium Economy",
  business: "Business",
  first: "First Class",
};

function selectionLabel(s: Selection): string {
  if (s.kind === "metro") return `${s.label} · ${s.codes.join(", ")}`;
  return `${s.code} — ${s.city}`;
}

function selectionCodes(s: Selection): string {
  return s.kind === "metro" ? s.codes.join("/") : s.code;
}

// Shown before the user has typed anything — most commonly searched metro areas
const DEFAULT_SUGGESTIONS = METRO_GROUPS.filter((m) =>
  ["NYC", "LON", "PAR", "TYO", "OSA", "LAX_METRO", "SFO_METRO", "CHI", "WAS"].includes(m.id)
);

function searchLocations(query: string): Selection[] {
  if (!query.trim()) return DEFAULT_SUGGESTIONS;
  const q = query.toLowerCase().trim();

  // 3=exact, 2=prefix, 1=substring, 0=no match
  const matchScore = (s: string): number => {
    const sl = s.toLowerCase();
    if (sl === q) return 3;
    if (sl.startsWith(q)) return 2;
    if (sl.includes(q)) return 1;
    return 0;
  };

  // Priority tiers: code (7-9) > city (4-6) > name (1-3) > country (1)
  const airportScore = (a: (typeof AIRPORTS)[0]): number => {
    const c = matchScore(a.code);
    if (c > 0) return c + 6;
    const ci = matchScore(a.city);
    if (ci > 0) return ci + 3;
    const n = matchScore(a.name);
    if (n > 0) return n;
    return matchScore(a.country) > 0 ? 1 : 0;
  };

  const metroScore = (m: MetroGroup): number =>
    Math.max(matchScore(m.label), ...m.searchTerms.map(matchScore));

  const metroMatches = METRO_GROUPS
    .map((m) => ({ item: m, s: metroScore(m) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.item);

  const airportMatches = AIRPORTS
    .map((a) => ({ item: a, s: airportScore(a) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => ({ ...x.item, kind: "airport" as const }));

  return [...metroMatches, ...airportMatches].slice(0, 10);
}

// ── Score / indicator helpers ─────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 85) return "text-teal-600";
  if (score >= 70) return "text-blue-600";
  return "text-amber-600";
}

function scoreBg(score: number): string {
  if (score >= 85) return "bg-teal-50 text-teal-600 border-teal-400/25";
  if (score >= 70) return "bg-blue-50 text-blue-600 border-blue-200";
  return "bg-amber-100/15 text-amber-600 border-amber-300/25";
}

function indicatorColor(label: string): string {
  if (["Great", "Good", "Low", "Excellent", "Morning", "Afternoon"].includes(label)) return "text-teal-600";
  if (["Okay", "Moderate", "Basic", "Evening", "Early Morning"].includes(label)) return "text-amber-600";
  return "text-red-400"; // High, Very High, Limited, Late Night
}

// ── Priority / reranking ──────────────────────────────────────────────────────

type Priority =
  | "best_overall"
  | "cheapest"
  | "fastest"
  | "nonstop"
  | "arrival"
  | "jet_lag"
  | "fatigue"
  | "comfort"
  | "airport";

// Selectable chips — "best_overall" is the implicit fallback when none are selected
const PRIORITY_CHIPS: { id: Priority; label: string }[] = [
  { id: "cheapest", label: "Cheapest" },
  { id: "fastest",  label: "Fastest" },
  { id: "nonstop",  label: "Fewer stops" },
  { id: "arrival",  label: "Best arrival" },
  { id: "jet_lag",  label: "Low jet lag" },
  { id: "fatigue",  label: "Less fatigue" },
  { id: "comfort",  label: "Best comfort" },
  { id: "airport",  label: "Best airport" },
];

// Base weights (sum = 100); keys match score_breakdown fields from scoreComponents in route.ts
const BASE_WEIGHTS: Record<string, number> = {
  price: 35, duration: 20, stops: 20, timing: 10, cabin: 10, baggage: 5,
};

// Additive boosts applied on top of base weights when a priority is selected
const PRIORITY_BOOSTS: Partial<Record<Priority, Record<string, number>>> = {
  cheapest: { price: 35 },
  fastest:  { duration: 35 },
  nonstop:  { stops: 35 },
  arrival:  { timing: 35 },
  jet_lag:  { timing: 20, duration: 10, stops: 10 },
  fatigue:  { duration: 20, stops: 20, cabin: 10 },
  comfort:  { cabin: 40, duration: 10 },
  airport:  { timing: 15, stops: 15, price: 10 },
};

function buildCompoundWeights(priorities: Priority[]): Record<string, number> {
  const raw: Record<string, number> = { ...BASE_WEIGHTS };
  for (const p of priorities) {
    for (const [k, v] of Object.entries(PRIORITY_BOOSTS[p] ?? {})) {
      raw[k] = (raw[k] ?? 0) + v;
    }
  }
  const total = Object.values(raw).reduce((s, v) => s + v, 0);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = Math.round((v / total) * 1000) / 1000;
  }
  return out;
}

const PRIORITY_TOP_LABEL: Record<Priority, string> = {
  best_overall: "AI Pick",
  cheapest:     "Cheapest",
  fastest:      "Fastest",
  nonstop:      "Nonstop Pick",
  arrival:      "Best Arrival",
  jet_lag:      "Lowest Fatigue",
  fatigue:      "Lowest Fatigue",
  comfort:      "Most Comfortable",
  airport:      "AI Pick",
};

// Short tokens used when combining two priority labels (e.g. "Fastest + Arrival")
const PRIORITY_MULTI_LABEL: Record<Priority, string> = {
  best_overall: "Best",
  cheapest:     "Cheapest",
  fastest:      "Fastest",
  nonstop:      "Nonstop",
  arrival:      "Arrival",
  jet_lag:      "Low Fatigue",
  fatigue:      "Low Fatigue",
  comfort:      "Comfort",
  airport:      "Airport",
};

function buildPriorityNote(o: FlightOffer, priorities: Priority[]): string {
  if (!priorities.length) return "";
  // Single-priority: lead with the specific win. Tradeoffs are shown separately below.
  if (priorities.length === 1) {
    switch (priorities[0]) {
      case "cheapest":
        return `Because you prioritized cheapest, this flight wins on lowest total fare ($${Math.round(o.price_total).toLocaleString()}).`;
      case "fastest":
        return `Because you prioritized fastest, this flight wins on travel time (${o.duration}).`;
      case "nonstop":
        return o.stops === 0
          ? `Because you prioritized fewer stops, this nonstop flight ranks highest.`
          : `No nonstop available — this has the fewest connections (${o.stop_label}).`;
      case "arrival":
        return `Because you prioritized arrival timing, this ${o.arrival_timing.toLowerCase()} arrival ranks highest.`;
      case "jet_lag":
        return `Because you prioritized lower jet lag, this flight has ${o.jet_lag.toLowerCase()} jet lag risk.`;
      case "fatigue":
        return `Because you prioritized less fatigue, this flight has ${o.travel_fatigue.toLowerCase()} travel fatigue.`;
      case "comfort":
        return `Because you prioritized aircraft comfort, this flight has ${o.aircraft_comfort.toLowerCase()} comfort.`;
      case "airport":
        return `Because you prioritized airport convenience, this flight has ${o.city_access.toLowerCase()} city access.`;
      default:
        return "";
    }
  }
  // Multi-priority: keep the headline clean; wins details go in the bullets below.
  const labels = priorities.map((p) => PRIORITY_CHIPS.find((c) => c.id === p)?.label ?? p);
  const joined =
    labels.length === 2
      ? `${labels[0]} and ${labels[1]}`
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `Because you prioritized ${joined}, this flight ranks highest.`;
}

function labelSummary(label: string): string {
  switch (label) {
    case "AI Pick":          return "Highest overall score in this result set.";
    case "Cheapest":         return "Lowest visible fare.";
    case "Fastest":          return "Fastest itinerary available.";
    case "Best Arrival":     return "Best arrival timing among visible results.";
    case "Lowest Fatigue":   return "Lowest fatigue among visible results.";
    case "Most Comfortable": return "Most comfortable option available.";
    case "Nonstop Pick":     return "Best nonstop option available.";
    default:                 return "";
  }
}

function rerankOffers(
  rawOffers: FlightOffer[],
  weights: Record<string, number>,
  priorities: Priority[]
): FlightOffer[] {
  if (!rawOffers.length) return rawOffers;

  // Result-set bounds for min-max normalization
  const prices = rawOffers.map((o) => o.price_total);
  const durs   = rawOffers.map((o) => o.duration_minutes || parseMins(o.duration) || 999);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const minD = Math.min(...durs),   maxD = Math.max(...durs);
  const priceRange = maxP - minP;
  const durRange   = maxD - minD;

  console.log(`[rerank] BEFORE: ${rawOffers.map((o) => `${o.airline}(${o.flight_number})=${o.ai_score}`).join(", ")}`);
  console.log(`[rerank] priorities=${JSON.stringify(priorities)}`);
  console.log(`[rerank] price $${Math.round(minP)}–$${Math.round(maxP)}  dur ${Math.round(minD)}–${Math.round(maxD)} min`);

  // Compute per-metric normalized scores [0, 100] for a single offer.
  // Uses result-set min/max for price and duration; fixed scales for everything else.
  const computeNorms = (o: FlightOffer): Record<string, number> => ({
    price:       priceRange > 1 ? 100 * (maxP - o.price_total)                  / priceRange : 50,
    duration:    durRange   > 1 ? 100 * (maxD - (o.duration_minutes || parseMins(o.duration) || 0)) / durRange : 50,
    stops:       stopsScore(o.stops),
    timing:      arrivalTimingScore(o.arrive_time),
    cabin:       cabinScore(o.cabin),
    baggage:     o.baggage.trim() ? 65 : 35,
    // Server signals are in [-1, 1]; convert to [0, 100]
    jet_lag:     ((o.score_breakdown.jet_lag     ?? 0) + 1) / 2 * 100,
    fatigue:     ((o.score_breakdown.fatigue     ?? 0) + 1) / 2 * 100,
    city_access: ((o.score_breakdown.city_access ?? 0) + 1) / 2 * 100,
  });

  const rescored = rawOffers.map((o) => {
    const norms   = computeNorms(o);
    // Weighted average — norms are [0,100] and weights sum to 1 → result is naturally [0,100]
    const weighted = Object.entries(weights).reduce(
      (sum, [k, wt]) => sum + (norms[k] ?? 50) * wt,
      0
    );
    const score = Math.round(Math.max(10, Math.min(99, weighted)));
    // Replace score_breakdown with new [0,100] normalized values for the breakdown modal
    return { ...o, ai_score: score, score_breakdown: norms };
  });

  rescored.sort((a, b) => b.ai_score - a.ai_score);

  console.log(`[rerank] AFTER:  ${rescored.map((o) => `${o.airline}(${o.flight_number})=${o.ai_score}`).join(", ")}`);
  console.log(`[rerank] detail:`);
  rescored.slice(0, 5).forEach((o, i) => {
    const parts = Object.entries(weights)
      .map(([k, wt]) => `${k}=${Math.round(o.score_breakdown[k] ?? 0)}×${Math.round(wt * 100)}%→${((o.score_breakdown[k] ?? 0) * wt).toFixed(1)}`)
      .join("  ");
    console.log(`  #${i + 1} ${o.airline} $${Math.round(o.price_total)} ${o.duration} score=${o.ai_score} | ${parts}`);
  });

  const topLabel =
    priorities.length === 0
      ? "AI Pick"
      : priorities.length === 1
      ? (PRIORITY_TOP_LABEL[priorities[0]] ?? "Priority Match")
      : priorities.length === 2
      ? `${PRIORITY_MULTI_LABEL[priorities[0]] ?? priorities[0]} + ${PRIORITY_MULTI_LABEL[priorities[1]] ?? priorities[1]}`
      : "Priority Match";

  // Per-dimension badge assignment and ranking explanation against the visible result set.
  const minPrice   = Math.min(...rescored.map((o) => o.price_total));
  const minDur     = Math.min(...rescored.map((o) => o.duration_minutes || parseMins(o.duration) || 999));
  const maxTiming  = Math.max(...rescored.map((o) => o.score_breakdown.timing  ?? 0));
  const maxFatigue = Math.max(...rescored.map((o) => o.score_breakdown.fatigue ?? 0));
  const maxCabin   = Math.max(...rescored.map((o) => o.score_breakdown.cabin   ?? 0));
  const hasNonstop    = rescored.some((o) => o.stops === 0);
  const hasConnecting = rescored.some((o) => o.stops > 0);

  const buildRankingWhy = (o: FlightOffer): Array<{ positive: boolean; text: string }> => {
    const pos: Array<{ positive: boolean; text: string }> = [];
    const neg: Array<{ positive: boolean; text: string }> = [];
    const bd = o.score_breakdown;
    const priceDiff = Math.round(o.price_total - minPrice);
    const durMins   = o.duration_minutes || parseMins(o.duration) || 0;
    const durDiff   = durMins - minDur;

    // Positive bullets
    if (priceDiff === 0)        pos.push({ positive: true,  text: "Cheapest in this result set" });
    else if (priceDiff <= 30)   pos.push({ positive: true,  text: `Only $${priceDiff} more than cheapest` });

    if (durDiff === 0)          pos.push({ positive: true,  text: o.partial_round_trip ? "Fast outbound in this set" : "Fastest flight in this set" });

    if (o.stops === 0 && hasConnecting) pos.push({ positive: true, text: "Only nonstop option" });
    else if (o.stops === 0)             pos.push({ positive: true, text: "Nonstop flight" });

    if ((bd.timing  ?? 0) === maxTiming  && maxTiming  > 0)  pos.push({ positive: true,  text: "Best arrival timing in set" });
    if ((bd.fatigue ?? 0) === maxFatigue && maxFatigue > 0)  pos.push({ positive: true,  text: o.partial_round_trip ? "Low outbound fatigue score" : "Lowest travel fatigue score" });
    if ((bd.cabin   ?? 0) === maxCabin   && maxCabin   > 0)  pos.push({ positive: true,  text: "Best comfort in this set" });

    // Negative bullets
    if (priceDiff > 50) neg.push({ positive: false, text: `$${priceDiff} more than cheapest` });

    if (durDiff > 30) {
      const h = Math.floor(durDiff / 60);
      const m = durDiff % 60;
      const label = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
      neg.push({ positive: false, text: `${label} slower than fastest` });
    }

    if (o.stops > 0 && hasNonstop) {
      neg.push({ positive: false, text: o.stops === 1 ? "Requires a connection" : `Requires ${o.stops} connections` });
    }

    return [...pos, ...neg].slice(0, 3);
  };

  const usedLabels = new Set<string>();
  const claimLabel = (label: string): string => {
    if (usedLabels.has(label)) return "";
    usedLabels.add(label);
    return label;
  };

  return rescored.map((o, i) => {
    let label: string;
    if (i === 0) {
      label = topLabel;
    } else if (o.price_total === minPrice) {
      label = claimLabel("Cheapest");
    } else if ((o.duration_minutes || parseMins(o.duration) || 999) === minDur) {
      label = claimLabel("Fastest");
    } else if ((o.score_breakdown.timing  ?? 0) === maxTiming) {
      label = claimLabel("Best Arrival");
    } else if ((o.score_breakdown.fatigue ?? 0) === maxFatigue) {
      label = claimLabel("Lowest Fatigue");
    } else if ((o.score_breakdown.cabin   ?? 0) === maxCabin) {
      label = claimLabel("Most Comfortable");
    } else {
      label = "";
    }
    return { ...o, is_recommended: i === 0, recommendation_label: label, ranking_why: buildRankingWhy(o) };
  });
}

// ── Display diversity selection ───────────────────────────────────────────────
// Reorders the full ranked list so the most diverse offers surface first.
// The curated top section is followed by all remaining offers in ranked order.
// Nothing is removed — all offers are available for pagination.

const CURATED_TOP = 20;          // how many slots the curated section targets
const CURATED_PER_AIRLINE = 3;   // per-airline cap within the curated section

function selectDisplayOffers(ranked: FlightOffer[]): FlightOffer[] {
  if (ranked.length <= CURATED_TOP) return ranked;

  const pinnedIdx = new Set<number>();
  const airlineSlots = new Map<string, number>();

  const pin = (o: FlightOffer) => {
    const idx = ranked.indexOf(o);
    if (idx !== -1 && !pinnedIdx.has(idx)) {
      pinnedIdx.add(idx);
      airlineSlots.set(o.airline_code, (airlineSlots.get(o.airline_code) ?? 0) + 1);
    }
  };

  // Guaranteed anchors — always surface near the top regardless of airline count
  const topPick = ranked.find((o) => o.is_recommended);
  if (topPick) pin(topPick);

  const byCheap = [...ranked].sort((a, b) => a.price_total - b.price_total);
  pin(byCheap[0]);

  const byFast = [...ranked].sort(
    (a, b) => (a.duration_minutes || 99999) - (b.duration_minutes || 99999)
  );
  pin(byFast[0]);

  const TIMING_RANK: Record<string, number> = { Great: 4, Good: 3, Okay: 2, Bad: 1 };
  const byArrival = [...ranked].sort(
    (a, b) => (TIMING_RANK[b.arrival_timing] ?? 0) - (TIMING_RANK[a.arrival_timing] ?? 0)
  );
  pin(byArrival[0]);

  // Cheapest from each airline — every carrier gets at least one curated slot
  const cheapestByAirline = new Map<string, FlightOffer>();
  for (const o of ranked) {
    const prev = cheapestByAirline.get(o.airline_code);
    if (!prev || o.price_total < prev.price_total) cheapestByAirline.set(o.airline_code, o);
  }
  for (const o of cheapestByAirline.values()) pin(o);

  // Fill the rest of the curated section: highest-scored, per-airline capped, no near-dupes
  const getPinned = () => ranked.filter((_, i) => pinnedIdx.has(i));
  for (let i = 0; i < ranked.length && pinnedIdx.size < CURATED_TOP; i++) {
    if (pinnedIdx.has(i)) continue;
    const o = ranked[i];
    if ((airlineSlots.get(o.airline_code) ?? 0) >= CURATED_PER_AIRLINE) continue;
    if (isTooSimilarToAny(o, getPinned())) continue;
    pinnedIdx.add(i);
    airlineSlots.set(o.airline_code, (airlineSlots.get(o.airline_code) ?? 0) + 1);
  }

  // Return curated section first, then all remaining in original ranked order
  const curated   = ranked.filter((_, i) =>  pinnedIdx.has(i));
  const remaining = ranked.filter((_, i) => !pinnedIdx.has(i));
  return [...curated, ...remaining];
}

// Returns true when `o` has the same airline, stop count, similar price (<$20),
// and similar departure time (<90 min) as any already-pinned offer from that airline.
function isTooSimilarToAny(o: FlightOffer, pinned: FlightOffer[]): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const oMin = toMin(o.depart_time);
  return pinned.some((p) => {
    if (p.airline_code !== o.airline_code || p.stops !== o.stops) return false;
    return (
      Math.abs(p.price_total - o.price_total) < 20 &&
      Math.abs(toMin(p.depart_time) - oMin) < 90
    );
  });
}

// ── AirportCombobox ───────────────────────────────────────────────────────────

function AirportCombobox({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: Selection | null;
  onChange: (selection: Selection | null) => void;
}) {
  const [inputValue, setInputValue] = useState(value ? selectionLabel(value) : "");
  const [suggestions, setSuggestions] = useState<Selection[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setInputValue(value ? selectionLabel(value) : "");
  }, [value, open]);

  const handleFocus = () => {
    setInputValue("");
    setSuggestions(searchLocations(""));
    setOpen(true);
    setHighlightedIndex(-1);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false);
      setSuggestions([]);
      setInputValue(value ? selectionLabel(value) : "");
    }, 150);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setInputValue(q);
    setSuggestions(searchLocations(q));
    setOpen(true);
    setHighlightedIndex(-1);
  };

  const selectItem = useCallback(
    (item: Selection) => {
      onChange(item);
      setInputValue(selectionLabel(item));
      setOpen(false);
      setSuggestions([]);
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      selectItem(suggestions[highlightedIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative flex-1 min-w-0">
      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 px-0.5">
        {label}
      </label>
      <div
        className={`relative flex items-center rounded-xl border transition-colors ${
          open ? "border-teal-400 bg-gray-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"
        }`}
      >
        <svg
          className="absolute left-3 w-4 h-4 text-gray-700 pointer-events-none flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx={11} cy={11} r={8} />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          placeholder={placeholder}
          className="w-full bg-transparent pl-9 pr-3.5 py-3 text-sm text-gray-900 placeholder:text-gray-700 outline-none"
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 shadow-card overflow-hidden">
          {suggestions.map((item, i) => (
            <li
              key={item.kind === "metro" ? item.id : item.code}
              onMouseDown={() => selectItem(item)}
              className={`flex items-center gap-3 px-3.5 py-2 cursor-pointer transition-colors ${
                i === highlightedIndex ? "bg-teal-100" : "hover:bg-gray-50"
              }`}
            >
              {item.kind === "metro" ? (
                <>
                  <span className="text-[10px] font-bold font-mono text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 flex-shrink-0 leading-tight">
                    ALL
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-900 truncate">{item.label}</div>
                    <div className="text-xs text-gray-700 truncate">All airports: {item.codes.join(", ")}</div>
                  </div>
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-amber-500 flex-shrink-0">
                    metro
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs font-bold font-mono text-blue-600 w-8 flex-shrink-0">
                    {item.code}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm text-gray-900 truncate">{item.city}</div>
                    <div className="text-xs text-gray-700 truncate">{item.name}</div>
                  </div>
                  <span className="ml-auto text-xs text-gray-700 flex-shrink-0">{item.country}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Score / breakdown helpers ─────────────────────────────────────────────────

const BREAKDOWN_LABELS: Record<string, string> = {
  price:       "Price",
  duration:    "Duration",
  stops:       "Routing / Stops",
  timing:      "Arrival Timing",
  cabin:       "Cabin Class",
  baggage:     "Baggage",
  jet_lag:     "Jet Lag",
  fatigue:     "Travel Fatigue",
  city_access: "City Access",
};


function toDisplayScore(v: number): number {
  return Math.round(v);
}

function breakdownColor(ds: number): string {
  if (ds >= 60) return "text-teal-600";
  if (ds >= 40) return "text-gray-700";
  return "text-amber-600";
}

function breakdownBarColor(ds: number): string {
  if (ds >= 60) return "bg-lantern-mint";
  if (ds >= 40) return "bg-gray-200";
  return "bg-amber-100/70";
}

// ── Trip impact descriptions ──────────────────────────────────────────────────

const ARRIVAL_TIMING_DESC: Record<string, string> = {
  "Early Morning": "Very early arrival — plan for limited transit options.",
  "Morning": "Morning arrival, giving you the full day at your destination.",
  "Afternoon": "Afternoon arrival, good timing for most itineraries.",
  "Evening": "Evening arrival — limited daytime hours on arrival day.",
  "Late Night": "Late night arrival — plan ahead for transport and rest.",
};

const JET_LAG_DESC: Record<string, string> = {
  "Low": "Minimal time zone shift, easy to adjust.",
  "Moderate": "Moderate time zone change, expect mild adjustment.",
  "High": "Significant time zone shift — plan for jet lag recovery.",
  "Very High": "Major time zone difference — budget extra recovery days.",
};

const FATIGUE_DESC: Record<string, string> = {
  "Low": "Short or comfortable journey with minimal fatigue expected.",
  "Moderate": "Moderate journey length or a short connecting itinerary.",
  "High": "Long flight or multiple connections — expect fatigue.",
  "Very High": "Very long or heavily connected journey — high fatigue risk.",
};

const CITY_ACCESS_DESC: Record<string, string> = {
  "Good": "Well-connected airport with convenient city transit.",
  "Moderate": "Standard airport access, may need a transfer.",
  "Limited": "Secondary or remote airport — allow extra time to reach the city.",
};

const COMFORT_DESC: Record<string, string> = {
  "Excellent": "Modern wide-body aircraft with premium comfort signals.",
  "Good": "Modern aircraft with solid amenity and comfort ratings.",
  "Basic": "Standard economy with limited comfort signals.",
};

// ── RecommendationPanel ───────────────────────────────────────────────────────

function RecommendationPanel({
  offers,
  topPickRef,
  priorities,
}: {
  offers: FlightOffer[];
  topPickRef: React.RefObject<HTMLDivElement | null>;
  priorities: Priority[];
}) {
  const pick = offers.find((o) => o.is_recommended) ?? offers[0];
  if (!pick) return null;

  const reasons = (pick.wins_on.length > 0 ? pick.wins_on : pick.recommendation_bullets).slice(0, 3);
  const priorityNote = buildPriorityNote(pick, priorities);

  return (
    <div className="mb-4 max-w-3xl mx-auto rounded-xl border border-teal-300 bg-teal-600/[0.07] px-4 sm:px-5 py-4 shadow-md">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/travelgrab-logo.svg" alt="" aria-hidden width={16} height={16} className="h-4 w-4 flex-shrink-0 object-contain" />
          <span className="text-[10px] font-black uppercase tracking-widest text-teal-600">
            TravelGrab Recommendation
          </span>
        </div>
        <span className="text-lg font-black text-gray-900 tabular-nums leading-none flex-shrink-0">
          ${Math.round(pick.price_total).toLocaleString()}
        </span>
      </div>

      {/* Airline + route summary */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-2 text-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.gstatic.com/flights/airline_logos/70px/${pick.airline_code}.png`}
          alt={pick.airline}
          width={16}
          height={16}
          className="rounded object-contain flex-shrink-0"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        <span className="font-bold text-gray-900">{pick.airline}</span>
        <span className="text-gray-700">·</span>
        <span className="font-mono font-semibold text-gray-600">{pick.origin}</span>
        <span className="text-gray-700">→</span>
        <span className="font-mono font-semibold text-gray-600">{pick.destination}</span>
        <span className="text-gray-700">·</span>
        <span className="text-gray-700">{pick.duration}</span>
        <span className="text-gray-700">·</span>
        <span className="text-gray-700">{pick.stop_label}</span>
      </div>

      {/* Priority note (shown when a non-default priority is active) */}
      {priorityNote && (
        <p className="text-[11px] text-teal-600 leading-relaxed mb-1.5">{priorityNote}</p>
      )}

      {/* Advisor sentence — suppressed when priorities are active (priorityNote leads instead) */}
      {!priorityNote && pick.recommendation_why && (
        <p className="text-[11px] text-gray-600 leading-relaxed mb-2">{pick.recommendation_why}</p>
      )}

      {/* vs others note — only shown in default mode when OpenAI populates it */}
      {!priorityNote && pick.comparison_summary && (
        <p className="text-[11px] text-gray-700 leading-relaxed mb-2.5">{pick.comparison_summary}</p>
      )}

      {/* Positive reason bullets — always shown */}
      {reasons.length > 0 && (
        <ul className="space-y-1 mb-2.5">
          {reasons.map((r, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] text-gray-600 leading-relaxed">
              <span className="text-teal-600 mt-0.5 flex-shrink-0">›</span>
              {r}
            </li>
          ))}
        </ul>
      )}

      {/* Tradeoff line — shown after the positive bullets when priorities are active */}
      {priorityNote && pick.tradeoffs.length > 0 && (
        <p className="text-[11px] text-gray-700 leading-relaxed mb-3">
          <span className="font-semibold text-gray-700">Tradeoff:</span>{" "}
          {pick.tradeoffs[0].charAt(0).toUpperCase() + pick.tradeoffs[0].slice(1)}.
        </p>
      )}

      {/* CTA */}
      <button
        onClick={() => topPickRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-teal-600 border border-teal-300 bg-teal-50 hover:bg-teal-50 rounded-lg px-3.5 py-1.5 transition-colors"
      >
        View top pick
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}

// ── CompareTable ─────────────────────────────────────────────────────────────

function parseMins(dur: string): number {
  const h = dur.match(/(\d+)h/);
  const m = dur.match(/(\d+)m/);
  return (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0);
}

function clockMins(time: string): number {
  const parts = time.split(":");
  return parseInt(parts[0] ?? "12") * 60 + parseInt(parts[1] ?? "0");
}

// Per-metric scores in [0, 100]; larger = better for that dimension
function stopsScore(stops: number): number {
  if (stops === 0) return 100;
  if (stops === 1) return 55;
  if (stops === 2) return 20;
  return 5;
}

function arrivalTimingScore(arriveTime: string): number {
  const h = Math.floor(clockMins(arriveTime) / 60);
  if (h >= 8 && h < 21) return 100;                          // 8 am – 8:59 pm: great
  if ((h >= 6 && h < 8) || (h >= 21 && h < 23)) return 60;  // early morning / late evening
  if ((h >= 4 && h < 6) || h === 23) return 25;              // very early / midnight
  return 5;                                                   // 0–3 am
}

function cabinScore(cabin: string): number {
  const c = cabin.toLowerCase();
  if (c.includes("first"))    return 100;
  if (c.includes("business")) return 80;
  if (c.includes("premium"))  return 55;
  return 40;
}

function CompareTable({ offers }: { offers: FlightOffer[] }) {
  // Keep up to 3 rows that are meaningfully distinct (differ in price, duration, or stop count)
  const distinct: FlightOffer[] = [];
  for (const o of offers) {
    if (distinct.length >= 3) break;
    const tooSimilar = distinct.some(
      (prev) =>
        Math.abs(o.price_total - prev.price_total) < 15 &&
        Math.abs(parseMins(o.duration) - parseMins(prev.duration)) < 20 &&
        o.stops === prev.stops
    );
    if (!tooSimilar) distinct.push(o);
  }
  const top = distinct;
  if (top.length < 2) return null;

  const thCls =
    "text-[9px] font-bold uppercase tracking-widest text-gray-700 px-3 py-2.5 text-left whitespace-nowrap";
  const tdCls = "px-3 py-2.5 align-top";

  return (
    <div className="mb-4 max-w-3xl mx-auto">
      <div className="mb-2.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-700">
          Compare top picks
        </span>
        <p className="text-[11px] text-gray-700 mt-0.5">
          See why TravelGrab ranked these options differently.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[600px] border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {["Flight", "Score", "Price", "Duration", "Stops", "Best for", "Tradeoff"].map((c) => (
                <th key={c} className={thCls}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top.map((o, i) => (
              <tr
                key={i}
                className={`border-b border-gray-100 last:border-0 ${
                  o.is_recommended
                    ? "bg-teal-50 [border-left:3px_solid_#14b8a6]"
                    : "bg-transparent [border-left:3px_solid_transparent]"
                }`}
              >
                {/* Flight */}
                <td className={tdCls}>
                  <div className="flex items-start gap-1.5 min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://www.gstatic.com/flights/airline_logos/70px/${o.airline_code}.png`}
                      alt=""
                      width={14}
                      height={14}
                      className="rounded object-contain mt-0.5 flex-shrink-0"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[11px] font-semibold text-gray-900 leading-tight">{o.airline}</span>
                        {o.is_recommended && (
                          <span className="text-[8px] font-black uppercase tracking-widest text-teal-600 border border-teal-300 bg-teal-600/10 rounded-full px-1.5 py-px leading-none">
                            #1
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] font-mono text-gray-700 mt-px">{o.flight_number}</div>
                    </div>
                  </div>
                </td>

                {/* Score */}
                <td className={tdCls}>
                  <span className={`text-sm font-black tabular-nums leading-none ${scoreColor(o.ai_score)}`}>
                    {o.ai_score}
                  </span>
                </td>

                {/* Price */}
                <td className={tdCls}>
                  <span className="text-[12px] font-bold text-gray-900 tabular-nums whitespace-nowrap">
                    ${Math.round(o.price_total).toLocaleString()}
                  </span>
                </td>

                {/* Duration */}
                <td className={tdCls}>
                  <span className="text-[11px] text-gray-600 whitespace-nowrap">{o.duration}</span>
                </td>

                {/* Stops */}
                <td className={tdCls}>
                  <span className={`text-[11px] font-medium whitespace-nowrap ${
                    o.stops === 0 ? "text-teal-600" : "text-gray-700"
                  }`}>
                    {o.stop_label}
                  </span>
                </td>

                {/* Best for */}
                <td className={tdCls}>
                  {o.recommendation_label && (
                    <span className={`inline-block text-[9px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 leading-none mb-1 ${scoreBg(o.ai_score)}`}>
                      {o.recommendation_label}
                    </span>
                  )}
                  {o.wins_on[0] && (
                    <p className="text-[10px] text-gray-700 leading-snug max-w-[130px]">{o.wins_on[0]}</p>
                  )}
                </td>

                {/* Tradeoff */}
                <td className={tdCls}>
                  {o.tradeoffs[0] ? (
                    <p className="text-[10px] text-gray-700 leading-snug max-w-[130px]">{o.tradeoffs[0]}</p>
                  ) : (
                    <span className="text-[10px] text-gray-700">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── FlightCard ────────────────────────────────────────────────────────────────

function FlightCard({ offer, cardRef, priorityWeights, priorities, tripType, isAddedToItinerary, onAddToItinerary, departureDate, returnDate }: {
  offer: FlightOffer;
  cardRef?: React.RefObject<HTMLDivElement | null>;
  priorityWeights: Record<string, number>;
  priorities: Priority[];
  tripType?: string;
  isAddedToItinerary?: boolean;
  onAddToItinerary?: () => void;
  departureDate?: string;
  returnDate?: string;
}) {
  const rec = offer.is_recommended;
  const [scoreOpen, setScoreOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const hasReturn = !!(offer.return_depart_time || (tripType === "roundtrip" && offer.source === "google_flights"));

  useEffect(() => {
    if (!scoreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setScoreOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scoreOpen]);

  useEffect(() => {
    if (!bookOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBookOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bookOpen]);

  const handleBookClick = () => {
    const sharedProps = {
      airline:      offer.airline,
      flight:       offer.flight_number,
      origin:       offer.origin,
      destination:  offer.destination,
      price:        Math.round(offer.price_total),
      score:        offer.ai_score,
    };

    if (offer.is_bookable === false) {
      track("google_flights_clicked", sharedProps);
      if (departureDate) {
        const affiliateUrl = buildAviasalesUrl({
          origin: offer.origin,
          destination: offer.destination,
          departureDate,
          returnDate: returnDate || undefined,
        });
        window.open(affiliateUrl, "_blank", "noopener,noreferrer");
      } else if (offer.booking_url) {
        window.open(offer.booking_url, "_blank", "noopener,noreferrer");
      }
      return;
    }

    track("duffel_booking_clicked", sharedProps);
    fetch("/api/booking-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sharedProps, depart_time: offer.depart_time, arrive_time: offer.arrive_time, priorities, timestamp: new Date().toISOString() }),
    }).catch(() => undefined);
    if (departureDate) {
      const affiliateUrl = buildAviasalesUrl({
        origin: offer.origin,
        destination: offer.destination,
        departureDate,
        returnDate: returnDate || undefined,
      });
      window.open(affiliateUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setBookOpen(true);
  };

  const whyBullets: string[] = offer.wins_on.length > 0 ? offer.wins_on : offer.recommendation_bullets;
  const whyNot: string[] = offer.tradeoffs;

  const breakdownRows = Object.entries(offer.score_breakdown)
    .map(([k, v]) => ({
      key: k,
      label: BREAKDOWN_LABELS[k] ?? k,
      displayScore: toDisplayScore(v),
      weight: Math.round((priorityWeights[k] ?? 0) * 100),
    }))
    .filter((row) => row.weight > 0)
    .sort((a, b) => b.displayScore - a.displayScore);

  const tripImpact = [
    { key: "timing", label: "Arrival Timing", value: offer.arrival_timing, desc: ARRIVAL_TIMING_DESC[offer.arrival_timing] },
    { key: "jetlag", label: "Jet Lag", value: offer.jet_lag, desc: JET_LAG_DESC[offer.jet_lag] },
    { key: "fatigue", label: "Travel Fatigue", value: offer.travel_fatigue, desc: FATIGUE_DESC[offer.travel_fatigue] },
    { key: "access", label: "City Access", value: offer.city_access, desc: CITY_ACCESS_DESC[offer.city_access] },
    { key: "comfort", label: "Aircraft Comfort", value: offer.aircraft_comfort, desc: COMFORT_DESC[offer.aircraft_comfort] },
  ].filter((b) => b.value);

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border overflow-hidden transition-all ${
        rec ? "border-teal-300 shadow-sm" : "border-gray-200"
      }`}
    >
      {/* ── Collapsed row (always visible, clickable to expand) ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!expanded) track("flight_result_clicked", { airline: offer.airline, flight: offer.flight_number, price: Math.round(offer.price_total) });
          setExpanded((o) => !o);
        }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded((o) => !o); }}
        className={`group px-3 py-2.5 cursor-pointer select-none transition-colors ${
          rec ? "bg-teal-600/[0.03] hover:bg-teal-600/[0.06]" : "bg-white hover:bg-gray-50/80"
        }`}
      >
        {/* Row 1: logo + times + flight line + price + book + chevron */}
        <div className="flex items-center gap-2">
          {/* Airline logo */}
          <div className="flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://www.gstatic.com/flights/airline_logos/70px/${offer.airline_code}.png`}
              alt={offer.airline}
              width={18} height={18}
              className="rounded object-contain"
              onError={(e) => {
                const el = e.currentTarget;
                el.style.display = "none";
                const sib = el.nextElementSibling as HTMLElement | null;
                if (sib) sib.style.display = "flex";
              }}
            />
            <div className="w-[18px] h-[18px] rounded bg-gray-100 items-center justify-center text-[8px] font-bold text-gray-600 hidden">
              {offer.airline_code.slice(0, 2)}
            </div>
          </div>

          {/* Departure */}
          <div className="flex-shrink-0 text-center min-w-[2.5rem]">
            <div className="text-[13px] font-bold text-gray-900 tabular-nums leading-none">{offer.depart_time}</div>
            <div className="text-[9px] font-mono text-gray-500 mt-0.5">{offer.origin}</div>
          </div>

          {/* Flight line */}
          <div className="flex-1 flex items-center gap-0.5 min-w-0">
            <div className="flex-1 h-px bg-gray-200" />
            <svg className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Arrival */}
          <div className="flex-shrink-0 text-center min-w-[2.5rem]">
            <div className="text-[13px] font-bold text-gray-900 tabular-nums leading-none">{offer.arrive_time}</div>
            <div className="text-[9px] font-mono text-gray-500 mt-0.5">{offer.destination}</div>
          </div>

          {/* Price + Book + Chevron */}
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0 pl-2">
            <div className="text-right">
              <div className={`text-sm font-black tabular-nums leading-none ${scoreColor(offer.ai_score)}`}>
                ${Math.round(offer.price_total).toLocaleString()}
              </div>
              <div className="text-[9px] text-gray-500 mt-0.5">{offer.cabin}</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleBookClick(); }}
              className="text-[11px] font-bold text-[#0A0A0A] bg-lantern-mint hover:bg-lantern-mint/85 rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap"
            >
              Book
            </button>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>

        {/* Row 2: duration · stops · airline · badge */}
        <div className="flex items-center gap-1.5 mt-1 pl-[26px] flex-wrap">
          <span className="text-[10px] text-gray-600">{offer.duration}</span>
          <span className="text-[9px] text-gray-300">·</span>
          <span className={`text-[10px] font-medium ${offer.stops === 0 ? "text-teal-600" : "text-gray-600"}`}>
            {offer.stop_label}{offer.connection_airports ? ` · ${offer.connection_airports.replace(/,/g, ", ")}` : ""}
          </span>
          <span className="text-[9px] text-gray-300">·</span>
          <span className="text-[10px] text-gray-500 truncate max-w-[8rem]">{offer.airline}</span>
          {rec && (
            <span className="text-[9px] font-black uppercase tracking-widest text-teal-600 border border-teal-400 bg-teal-50 rounded-full px-1.5 py-0.5 leading-none flex-shrink-0">
              AI Pick
            </span>
          )}
          {!rec && offer.recommendation_label && (
            <span className={`text-[9px] font-bold uppercase tracking-widest border rounded-full px-1.5 py-0.5 leading-none flex-shrink-0 ${scoreBg(offer.ai_score)}`}>
              {offer.recommendation_label}
            </span>
          )}
          {offer.is_bookable === false && (
            <span className="text-[9px] font-bold uppercase tracking-widest border border-amber-400/40 bg-amber-50 text-amber-600 rounded-full px-1.5 py-0.5 leading-none flex-shrink-0">
              Google Flights
            </span>
          )}
          {hasReturn && (
            <span className="text-[9px] text-gray-400 ml-auto flex-shrink-0">+ return</span>
          )}
        </div>
      </div>

      {/* ── Expanded content ── */}
      {expanded && (
        <div className="border-t border-gray-100 bg-white px-3 pb-3 pt-2 space-y-2">

          {/* AI Score bar */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 flex-shrink-0 w-14">AI Score</span>
            <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${offer.ai_score >= 85 ? "bg-teal-400" : offer.ai_score >= 70 ? "bg-blue-300" : "bg-amber-300"}`}
                style={{ width: `${offer.ai_score}%` }}
              />
            </div>
            <span className={`text-[10px] font-bold tabular-nums flex-shrink-0 ${scoreColor(offer.ai_score)}`}>
              {offer.ai_score}
            </span>
          </div>

          {/* Return flight */}
          {offer.return_depart_time && (
            <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-gray-50 border border-gray-100">
              <div className="text-center flex-shrink-0 min-w-[2.5rem]">
                <div className="text-[13px] font-bold text-gray-700 tabular-nums leading-none">{offer.return_depart_time}</div>
                <div className="text-[9px] font-mono text-gray-500 mt-0.5">{offer.return_origin}</div>
              </div>
              <div className="flex-1 flex flex-col items-center gap-0.5 min-w-0 px-1">
                <div className="text-[10px] text-gray-600 font-medium">{offer.return_duration}</div>
                <div className="w-full flex items-center gap-0.5">
                  <div className="flex-1 h-px bg-gray-200" />
                  <svg className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                  </svg>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <div className="text-[10px] text-gray-600 font-medium">
                  {offer.return_stop_label}{offer.return_connection_airports ? ` · ${offer.return_connection_airports.replace(/,/g, ", ")}` : ""}
                </div>
              </div>
              <div className="text-center flex-shrink-0 min-w-[2.5rem]">
                <div className="text-[13px] font-bold text-gray-700 tabular-nums leading-none">{offer.return_arrive_time}</div>
                <div className="text-[9px] font-mono text-gray-500 mt-0.5">{offer.return_destination}</div>
              </div>
            </div>
          )}

          {/* Google Flights round-trip link */}
          {tripType === "roundtrip" && offer.source === "google_flights" && !offer.return_depart_time && (
            <div className="py-1.5 px-2.5 rounded-lg bg-gray-50 border border-gray-100 text-center">
              {offer.booking_url ? (
                <a href={offer.booking_url} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-gray-600 hover:text-gray-800 transition-colors underline underline-offset-2">
                  View complete round-trip on Google Flights
                </a>
              ) : (
                <span className="text-[11px] text-gray-600">View complete round-trip on Google Flights</span>
              )}
            </div>
          )}

          {/* Why this flight */}
          {whyBullets.length > 0 && (
            <div className={`rounded-lg px-3 py-2 ${rec ? "bg-teal-600/[0.08] border border-teal-200" : "bg-gray-50 border border-gray-200"}`}>
              <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${rec ? "text-teal-600" : "text-gray-600"}`}>
                Why this flight
              </div>
              <ul className="space-y-0.5">
                {whyBullets.map((b, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] text-gray-600 leading-snug">
                    <span className={`flex-shrink-0 ${rec ? "text-teal-500" : "text-gray-400"}`}>›</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Why not */}
          {whyNot.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Why not</div>
              <ul className="space-y-0.5">
                {whyNot.map((w, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] text-gray-600 leading-snug">
                    <svg className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1={12} y1={9} x2={12} y2={13} /><line x1={12} y1={17} x2="12.01" y2={17} />
                    </svg>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Trip impact */}
          {tripImpact.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Trip impact</div>
              <div className="grid grid-cols-2 gap-1">
                {tripImpact.map(({ key, label, value, desc }) => (
                  <div key={key} className="rounded-lg bg-gray-50 border border-gray-200 px-2 py-1.5">
                    <div className="text-[10px] text-gray-500 font-medium mb-0.5">{label}</div>
                    <div className={`text-[11px] font-bold mb-0.5 ${indicatorColor(value)}`}>{value}</div>
                    {desc && <div className="text-[10px] text-gray-500 leading-snug">{desc}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Flight details grid */}
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {(
                [
                  ["Airline", offer.airline],
                  ["Outbound", (offer.outbound_flight_numbers ?? [offer.flight_number]).join(" · ")],
                  ["From", offer.origin],
                  ["To", offer.destination],
                  ["Departs", offer.depart_time],
                  ["Arrives", offer.arrive_time],
                  ["Duration", offer.duration],
                  ["Stops", `${offer.stop_label}${offer.connection_airports ? ` · ${offer.connection_airports.replace(/,/g, ", ")}` : ""}`],
                  ...(offer.return_depart_time ? [
                    ["Return", (offer.return_flight_numbers ?? []).join(" · ")],
                    ["Ret. departs", offer.return_depart_time],
                    ["Ret. arrives", offer.return_arrive_time ?? ""],
                    ["Ret. stops", `${offer.return_stop_label ?? ""}${offer.return_connection_airports ? ` · ${offer.return_connection_airports.replace(/,/g, ", ")}` : ""}`],
                  ] as [string, string][] : []),
                  ["Cabin", offer.cabin],
                  ["Baggage", offer.baggage],
                  ["Total", `$${Math.round(offer.price_total).toLocaleString()}`],
                  ...(offer.price_per_person !== offer.price_total
                    ? [["Per person", `$${Math.round(offer.price_per_person).toLocaleString()}`] as [string, string]]
                    : []),
                ] as [string, string][]
              ).map(([label, val]) => (
                <div key={label} className="flex items-baseline gap-1.5">
                  <span className="text-[10px] text-gray-400 w-14 flex-shrink-0">{label}</span>
                  <span className="text-[11px] text-gray-700 font-medium">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action row */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              onClick={() => setScoreOpen(true)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
              </svg>
              Score
            </button>
            {onAddToItinerary && (
              <button
                onClick={onAddToItinerary}
                className={`text-[11px] font-semibold rounded-lg px-2.5 py-1.5 transition-all border whitespace-nowrap ${
                  isAddedToItinerary
                    ? "bg-teal-50 text-teal-600 border-teal-200"
                    : "text-gray-500 border-gray-200 hover:border-teal-200 hover:text-teal-500"
                }`}
              >
                {isAddedToItinerary ? "✓ In itinerary" : "+ Itinerary"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── AI Score breakdown modal ── */}
      {scoreOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setScoreOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-sm font-bold text-gray-900">Score Breakdown</div>
                <div className="text-[11px] text-gray-700 mt-0.5">{offer.airline} · {offer.flight_number}</div>
              </div>
              <button
                onClick={() => setScoreOpen(false)}
                className="p-1 -mr-1 -mt-0.5 text-gray-700 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-start gap-3 mb-3 pb-3 border-b border-gray-200">
              <div className={`text-4xl font-black tabular-nums leading-none flex-shrink-0 ${scoreColor(offer.ai_score)}`}>
                {offer.ai_score}
              </div>
              <div className="min-w-0">
                {offer.recommendation_label && (
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 mb-1 ${scoreBg(offer.ai_score)}`}>
                    {offer.recommendation_label}
                  </span>
                )}
                {(() => {
                  const summary = labelSummary(offer.recommendation_label);
                  return summary ? (
                    <p className="text-[11px] text-gray-700 leading-relaxed">{summary}</p>
                  ) : offer.recommendation_why ? (
                    <p className="text-[11px] text-gray-700 leading-relaxed">{offer.recommendation_why}</p>
                  ) : null;
                })()}
              </div>
            </div>

            {(offer.ranking_why ?? []).length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Why this ranked here
                </div>
                <ul className="space-y-1">
                  {(offer.ranking_why ?? []).map((b, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className={`text-[11px] flex-shrink-0 leading-tight mt-px ${b.positive ? "text-teal-600" : "text-amber-600"}`}>
                        {b.positive ? "✓" : "✗"}
                      </span>
                      <span className={`text-[11px] leading-snug ${b.positive ? "text-gray-600" : "text-gray-700"}`}>
                        {b.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {priorities.length > 0 && (
              <div className="flex items-center gap-1.5 mb-2 text-[10px]">
                <span className="text-gray-700">Weighted for:</span>
                <span className="text-teal-600 font-semibold">
                  {priorities.map((p) => PRIORITY_CHIPS.find((c) => c.id === p)?.label ?? p).join(" + ")}
                </span>
              </div>
            )}
            <p className="text-[10px] text-gray-700 leading-relaxed mb-3">
              Each metric scored 0–100 relative to this result set, then combined using your priority weights.
            </p>

            {breakdownRows.length > 0 ? (
              <div className="space-y-2.5">
                {breakdownRows.map(({ key, label, displayScore, weight }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] text-gray-600">{label}</span>
                        <span className="text-[10px] text-gray-700">{weight}%</span>
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums ${breakdownColor(displayScore)}`}>
                        {displayScore}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-gray-50 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${breakdownBarColor(displayScore)}`}
                        style={{ width: `${displayScore}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-700 text-center py-2">Breakdown unavailable.</p>
            )}

            <button
              onClick={() => setScoreOpen(false)}
              className="mt-4 w-full py-2 rounded-xl text-[11px] font-semibold text-gray-700 border border-gray-200 hover:text-gray-700 hover:border-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Booking intent modal ── */}
      {bookOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setBookOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">Booking not live yet</div>
                <div className="text-[11px] text-gray-700 mt-0.5">{offer.airline} · {offer.flight_number}</div>
              </div>
            </div>

            <p className="text-[12px] text-gray-600 leading-relaxed mb-4">
              Booking is coming soon. We saved your interest in this flight.
            </p>

            <div className="rounded-xl bg-gray-50 border border-gray-200 px-3.5 py-3 mb-4 space-y-1.5">
              {[
                ["Route",    `${offer.origin} → ${offer.destination}`],
                ["Flight",   offer.flight_number],
                ["Departs",  offer.depart_time],
                ["Arrives",  offer.arrive_time],
                ["Price",    `$${Math.round(offer.price_total).toLocaleString()}`],
                ["Score",    String(offer.ai_score)],
              ].map(([label, val]) => (
                <div key={label} className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] text-gray-700">{label}</span>
                  <span className="text-[11px] text-gray-600 font-medium tabular-nums">{val}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setBookOpen(false)}
              className="w-full py-2 rounded-xl text-[12px] font-semibold text-gray-700 border border-gray-200 hover:text-gray-700 hover:border-gray-300 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FeatureCard (empty state) ─────────────────────────────────────────────────

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
        {icon}
      </div>
      <div className="mb-1 text-sm font-semibold text-gray-900">{title}</div>
      <div className="text-xs text-gray-700 leading-relaxed">{body}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function getAirportCodes(s: Selection): string[] {
  return s.kind === "metro" ? s.codes : [s.code];
}

export default function FlightSearch() {
  const today = new Date().toISOString().split("T")[0];
  const resultsRef = useRef<HTMLDivElement>(null);
  const topPickRef = useRef<HTMLDivElement>(null);

  const [origin, setOrigin] = useState<Selection | null>(null);
  const [destination, setDestination] = useState<Selection | null>(null);
  const [tripType, setTripType] = useState<TripType>("oneway");
  const [isReturnMode, setIsReturnMode] = useState(false);
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [travelers, setTravelers] = useState(1);
  const [cabin, setCabin] = useState<CabinClass>("economy");
  const [errors, setErrors] = useState<string[]>([]);

  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [searchMeta, setSearchMeta] = useState<SearchMeta | null>(null);
  const [debugStats, setDebugStats] = useState<DebugStats | null>(null);
  const [priorities, setPriorities] = useState<Priority[]>([]);

  const activeWeights = useMemo(() => buildCompoundWeights(priorities), [priorities]);

  const displayOffers = useMemo(() => {
    const reranked = offers.length > 0 ? rerankOffers(offers, activeWeights, priorities) : offers;
    const selected = selectDisplayOffers(reranked);
    console.log(`[pipeline] 8_offers_rendered_as_cards=${selected.length} (reranked=${reranked.length})`);
    return selected;
  }, [offers, activeWeights, priorities]);

  const [visibleCount, setVisibleCount] = useState(20);
  // Reset pagination whenever a new set of offers arrives
  useEffect(() => { setVisibleCount(20); }, [offers]);

  const [debugOpen, setDebugOpen] = useState(false);
  const [errorTitle, setErrorTitle] = useState("");
  const [errorBody, setErrorBody] = useState("");
  const [searchedParams, setSearchedParams] = useState<{
    origin: Selection; destination: Selection; tripType: TripType; cabin: CabinClass; travelers: number;
    departureDate: string; returnDate: string;
  } | null>(null);
  const [itineraryFlightKey, setItineraryFlightKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("travelgrab_selected_flight_v1");
      if (stored) {
        const parsed = JSON.parse(stored) as { flightKey: string };
        setItineraryFlightKey(parsed.flightKey ?? null);
      }
    } catch { /* ignore */ }
  }, []);

  // Trip context banner state
  const [tripContext, setTripContext] = useState<{ destination: string; startDate: string; endDate: string } | null>(null);

  // Pre-fill departure/return dates from canonical trip store and show context banner.
  // Also reads URL params: ?autofill_to=<city>, ?autofill_from=<city>, ?mode=return
  useEffect(() => {
    try {
      // URL param auto-fill
      const params = new URLSearchParams(window.location.search);
      const autofillTo   = params.get("autofill_to");
      const autofillFrom = params.get("autofill_from");
      const returnMode   = params.get("mode") === "return";
      if (autofillTo)   { const sel = findSelectionForCity(autofillTo);   if (sel) setDestination(sel); }
      if (autofillFrom) { const sel = findSelectionForCity(autofillFrom); if (sel) setOrigin(sel); }
      if (returnMode)   { setIsReturnMode(true); setTripType("oneway"); }

      const trip = readTripStore();
      if (!trip || !trip.startDate || trip.cityStops.length === 0) return;
      const totalDays = trip.cityStops.reduce((s, c) => s + (c.days || 0), 0);
      const retDate = new Date(trip.startDate + "T00:00:00");
      retDate.setDate(retDate.getDate() + Math.max(1, totalDays));
      const retIso = retDate.toISOString().slice(0, 10);
      if (returnMode) {
        // For return flight, suggest the last day as the departure date
        if (!departureDate) setDepartureDate(retIso);
      } else {
        if (!departureDate) setDepartureDate(trip.startDate);
        if (!returnDate) setReturnDate(retIso);
      }
      // Show context banner
      const dest = trip.destinationRegion || trip.cityStops.map(c => c.city).join(" → ");
      if (dest) setTripContext({ destination: dest, startDate: trip.startDate, endDate: retIso });
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    const errs: string[] = [];
    if (!origin) errs.push("Please select an origin.");
    if (!destination) errs.push("Please select a destination.");
    if (!departureDate) errs.push("Please select a departure date.");
    if (tripType === "roundtrip" && !returnDate) errs.push("Please select a return date.");
    if (tripType === "roundtrip" && departureDate && returnDate && returnDate < departureDate) {
      errs.push("Return date must be after departure date.");
    }
    setErrors(errs);
    if (errs.length > 0) return;

    track("flight_search_submitted", {
      origin:         origin!.kind === "airport" ? origin!.code : origin!.id,
      destination:    destination!.kind === "airport" ? destination!.code : destination!.id,
      trip_type:      tripType,
      cabin,
      travelers,
      departure_date: departureDate,
      return_date:    returnDate || undefined,
    });

    setSearchState("loading");
    setSearchedParams({ origin: origin!, destination: destination!, tripType, cabin, travelers, departureDate, returnDate });

    const originCodes = getAirportCodes(origin!);
    const destCodes = getAirportCodes(destination!);

    try {
      const res = await fetchWithAuth("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: originCodes[0],
          destination: destCodes[0],
          ...(origin!.kind === "metro" && { origin_airports: originCodes }),
          ...(destination!.kind === "metro" && { destination_airports: destCodes }),
          departure_date: departureDate,
          return_date: tripType === "roundtrip" ? returnDate : null,
          adults: travelers,
          cabin_class: cabin,
          trip_type: tripType,
        }),
      });

      const data = await res.json() as {
        status: string;
        message?: string;
        offers?: FlightOffer[];
        meta?: SearchMeta;
      };

      if (data.status === "rate_limited") {
        setErrorTitle("Too many searches");
        setErrorBody(data.message ?? "Please wait a few minutes before searching again.");
        setSearchState("error");
        return;
      }
      if (data.status === "quota_exceeded" || (data as { limitReached?: boolean }).limitReached) {
        setErrorTitle("Daily limit reached");
        setErrorBody(data.message ?? "You've used all your free flight searches today. Resets at midnight UTC.");
        setSearchState("error");
        return;
      }
      if (data.status === "not_configured") {
        setErrorTitle("Search unavailable");
        setErrorBody(data.message ?? "Flight search is temporarily unavailable. Please try again later.");
        setSearchState("error");
        return;
      }
      if (data.status === "error" || data.status === "validation_error") {
        setErrorTitle("Search failed");
        setErrorBody(data.message ?? "We couldn't complete this search. Try again in a moment.");
        setSearchState("error");
        return;
      }
      if (data.status === "empty" || !data.offers?.length) {
        setErrorTitle("No flights found");
        setErrorBody(data.message ?? "No fares found for these dates. Try different dates or airports.");
        setSearchState("error");
        return;
      }

      console.log(`[pipeline] 7_offers_received_by_frontend=${data.offers!.length}`);
      data.offers!.forEach((o, i) => {
        console.log(`  #${i + 1} ${o.airline} ${o.flight_number} ${o.depart_time}->${o.arrive_time} stops=${o.stops} conn="${o.connection_airports}" $${o.price_total}`);
      });
      setOffers(data.offers!);
      setSearchMeta(data.meta ?? null);
      setDebugStats(data.meta?.debugStats ?? null);
      setSearchState("results");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch {
      setErrorTitle("Network error");
      setErrorBody("Couldn't reach TravelGrab's servers. Check your connection and try again.");
      setSearchState("error");
    }
  };

  // searchMeta is kept for potential future use but summary pill uses searchedParams
  void searchMeta;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <nav className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 flex items-center h-14 gap-6">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/travelgrab-logo.svg"
              alt="TravelGrab"
              width={36}
              height={36}
              className="h-9 w-9 flex-shrink-0 object-contain"
            />
            <span className="text-sm font-bold tracking-tight text-gray-800">TravelGrab</span>
          </Link>
          <div className="h-4 w-px bg-gray-100" />
          <span className="text-sm font-medium text-teal-600">Flights</span>
          <Link href="/hotels"     className="text-sm font-medium text-gray-700 hover:text-gray-700 transition-colors">Hotels</Link>
          <Link href="/activities" className="text-sm font-medium text-gray-700 hover:text-gray-700 transition-colors">Activities</Link>
          <Link href="/itinerary"  className="text-sm font-medium text-gray-700 hover:text-gray-700 transition-colors">Itinerary</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero */}
        <div className="mb-7 text-center">
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-gray-900 mb-2">
            {isReturnMode ? "Book your return flight" : "Find your flight"}
          </h1>
          <p className="text-sm text-gray-700 max-w-md mx-auto leading-relaxed">
            TravelGrab checks nearby airports automatically and ranks flights by comfort, timing, and value.
          </p>
        </div>

        {/* Trip context banner */}
        {tripContext && (
          <div className="max-w-3xl mx-auto mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-teal-600 text-sm">✦</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate">Trip to {tripContext.destination}</p>
                <p className="text-[11px] text-gray-700 mt-0.5">
                  Dates pre-filled from your trip plan · {new Date(tripContext.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}–{new Date(tripContext.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>
            </div>
            <Link href="/itinerary" className="shrink-0 text-[11px] text-teal-500 hover:text-teal-600 transition-colors whitespace-nowrap">
              Edit trip →
            </Link>
          </div>
        )}

        <UsageBanner feature="flights" />

        {/* Search panel */}
        <div className="max-w-3xl mx-auto rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6 mb-4 shadow-card">
          {/* Trip type toggle */}
          <div className="flex gap-1 mb-4 bg-gray-50 border border-gray-200 rounded-xl p-1 w-fit">
            {(["roundtrip", "oneway"] as TripType[]).map((t) => (
              <button
                key={t}
                onClick={() => setTripType(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  tripType === t
                    ? "bg-teal-100 text-teal-600 border border-teal-300"
                    : "text-gray-700 hover:text-gray-700"
                }`}
              >
                {t === "roundtrip" ? "Round Trip" : "One Way"}
              </button>
            ))}
          </div>

          {/* Origin / Destination */}
          <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
            <AirportCombobox label="From" placeholder="City, metro, or airport" value={origin} onChange={setOrigin} />
            <button
              onClick={() => { const tmp = origin; setOrigin(destination); setDestination(tmp); }}
              className="self-end mb-0.5 sm:self-center mt-auto sm:mt-6 p-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-100 transition-all flex-shrink-0"
              title="Swap airports"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M7 16V4m0 0L3 8m4-4 4 4" />
                <path d="M17 8v12m0 0 4-4m-4 4-4-4" />
              </svg>
            </button>
            <AirportCombobox label="To" placeholder="City, metro, or airport" value={destination} onChange={setDestination} />
          </div>

          {/* Dates + Travelers + Cabin */}
          <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 px-0.5">Departure</label>
              <input
                type="date"
                min={today}
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 hover:border-gray-300 focus:border-teal-400 focus:bg-gray-50 px-3.5 py-3 text-sm text-gray-900 outline-none transition-colors [color-scheme:light]"
              />
            </div>
            {tripType === "roundtrip" && (
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 px-0.5">Return</label>
                <input
                  type="date"
                  min={departureDate || today}
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 hover:border-gray-300 focus:border-teal-400 focus:bg-gray-50 px-3.5 py-3 text-sm text-gray-900 outline-none transition-colors [color-scheme:light]"
                />
              </div>
            )}
            <div className="w-full sm:w-32 flex-shrink-0">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 px-0.5">Travelers</label>
              <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                <button onClick={() => setTravelers((n) => Math.max(1, n - 1))} className="px-3 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-colors text-lg leading-none">−</button>
                <span className="flex-1 text-center text-sm font-semibold text-gray-900">{travelers}</span>
                <button onClick={() => setTravelers((n) => Math.min(9, n + 1))} className="px-3 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-colors text-lg leading-none">+</button>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5 px-0.5">Cabin</label>
              <select
                value={cabin}
                onChange={(e) => setCabin(e.target.value as CabinClass)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 hover:border-gray-300 focus:border-teal-400 focus:bg-gray-50 px-3.5 py-3 text-sm text-gray-900 outline-none transition-colors appearance-none [color-scheme:light]"
              >
                {(Object.entries(CABIN_LABELS) as [CabinClass, string][]).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>
          </div>

          {/* What matters most? */}
          <div className="mb-5 pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold text-gray-700 uppercase tracking-wider">
                What matters most?
              </div>
              {priorities.length > 0 && (
                <button
                  onClick={() => setPriorities([])}
                  className="text-[10px] text-gray-700 hover:text-gray-600 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_CHIPS.map(({ id, label }) => {
                const selected = priorities.includes(id);
                const maxed = !selected && priorities.length >= 3;
                return (
                  <button
                    key={id}
                    onClick={() =>
                      setPriorities((prev) =>
                        prev.includes(id)
                          ? prev.filter((p) => p !== id)
                          : prev.length >= 3
                          ? prev
                          : [...prev, id]
                      )
                    }
                    disabled={maxed}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                      selected
                        ? "bg-teal-100 text-teal-600 border-teal-400 shadow-[0_0_0_1px_rgba(143,247,208,0.20)]"
                        : maxed
                        ? "bg-transparent text-gray-700 border-gray-100 cursor-not-allowed"
                        : "bg-transparent text-gray-700 border-gray-200 hover:border-gray-300 hover:text-gray-600"
                    }`}
                  >
                    {selected && (
                      <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 6l3.5 3.5L11 2" />
                      </svg>
                    )}
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-700">
              <span>Ranking by:</span>
              {priorities.length === 0 ? (
                <span>Best Overall</span>
              ) : (
                priorities.map((p, i) => (
                  <span key={p} className="flex items-center gap-1">
                    {i > 0 && <span className="text-gray-700">+</span>}
                    <span className="text-teal-600">
                      {PRIORITY_CHIPS.find((c) => c.id === p)?.label}
                    </span>
                  </span>
                ))
              )}
              {priorities.length > 0 && priorities.length < 3 && (
                <span className="text-gray-700 ml-1">
                  · {3 - priorities.length} more available
                </span>
              )}
            </div>
          </div>

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          <button
            onClick={() => { void handleSearch(); }}
            disabled={searchState === "loading"}
            className="w-full py-3.5 rounded-xl font-bold text-sm text-ink bg-lantern-mint hover:bg-lantern-mint/90 shadow-sm hover:shadow-md transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {searchState === "loading" ? "Searching…" : "Search Flights"}
          </button>
        </div>

        {/* Loading state */}
        {searchState === "loading" && (
          <div className="mt-8 flex flex-col items-center gap-4 py-14 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/travelgrab-logo.svg"
              alt=""
              aria-hidden
              width={48}
              height={48}
              className="h-12 w-12 object-contain animate-pulse drop-shadow-md"
            />
            <div className="text-sm text-gray-700">Searching live fares and ranking options…</div>
          </div>
        )}

        {/* Error state */}
        {searchState === "error" && (
          <div className="mt-5 max-w-3xl mx-auto rounded-xl border border-red-500/20 bg-red-500/[0.06] px-5 py-4">
            <div className="text-sm font-semibold text-red-300 mb-1">{errorTitle}</div>
            <div className="text-sm text-gray-700">{errorBody}</div>
          </div>
        )}

        {/* Results */}
        {searchState === "results" && (
          <div ref={resultsRef} className="mt-6">
            {/* Search summary pill */}
            {searchedParams && (
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 max-w-3xl mx-auto">
                <div className="inline-flex items-center gap-2 flex-wrap rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-xs">
                  <span className="font-mono font-semibold text-gray-900">{selectionCodes(searchedParams.origin)}</span>
                  <span className="text-gray-700">→</span>
                  <span className="font-mono font-semibold text-gray-900">{selectionCodes(searchedParams.destination)}</span>
                  <span className="text-gray-700">·</span>
                  <span className="text-gray-600">{searchedParams.tripType === "roundtrip" ? "Round trip" : "One way"}</span>
                  <span className="text-gray-700">·</span>
                  <span className="text-gray-600">{CABIN_LABELS[searchedParams.cabin]}</span>
                  <span className="text-gray-700">·</span>
                  <span className="text-gray-600">{searchedParams.travelers} traveler{searchedParams.travelers !== 1 ? "s" : ""}</span>
                </div>
                <span className="text-xs text-gray-700">
                  Showing {Math.min(visibleCount, displayOffers.length)} of {displayOffers.length} unique itinerar{displayOffers.length !== 1 ? "ies" : "y"} — ranked by AI
                </span>
              </div>
            )}
            {process.env.NODE_ENV !== "production" && (
            <div style={{ maxWidth: 800, margin: "0 auto 4px", textAlign: "right" }}>
              <button
                onClick={() => setDebugOpen((o) => !o)}
                style={{ fontFamily: "monospace", fontSize: 11, color: "#166534", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
              >
                {debugOpen ? "▲ hide dev trace" : "▼ dev trace"}
              </button>
            </div>
            )}
            {process.env.NODE_ENV !== "production" && debugOpen && (
            <div style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: 12, background: "#030a03", color: "#4ade80", padding: "14px 18px", borderRadius: 8, border: "1px solid #14532d", margin: "0 auto 16px", maxWidth: 800, lineHeight: 1.75, overflowX: "auto", whiteSpace: "pre" }}>
              <span style={{ color: "#86efac", fontWeight: "bold" }}>{"▶ TRAVELGRAB FLIGHT SEARCH TRACE\n"}</span>
              {`ENABLED_PROVIDERS:      ${debugStats?.enabled_providers ?? "—"}\n`}
              <span style={{ color: "#6ee7b7" }}>{"━━━ REQUEST "}{"━".repeat(51)}{"\n"}</span>
              {`ORIGIN:                 ${debugStats?.origin ?? (searchedParams ? selectionCodes(searchedParams.origin) : "—")}\n`}
              {`DESTINATION:            ${debugStats?.destination ?? (searchedParams ? selectionCodes(searchedParams.destination) : "—")}\n`}
              {`DEPARTURE_DATE:         ${debugStats?.departure_date ?? "—"}\n`}
              {`RETURN_DATE:            ${debugStats?.return_date ?? "—"}\n`}
              {`TRIP_TYPE:              ${debugStats?.trip_type ?? "—"}\n`}
              {`PASSENGERS:             ${debugStats?.adults ?? 1} adult(s)\n`}
              {`CABIN_CLASS:            ${debugStats?.cabin_class ?? "—"}\n`}
              {`API_KEY_MODE:           ${debugStats?.api_key_mode ?? "—"}\n`}
              {`CARRIER_FILTERS:        ${debugStats?.carrier_filters ?? "none"}\n`}
              {`CONTENT_SOURCE_FILTERS: ${debugStats?.content_source_filters ?? "none"}\n`}
              {`LIMIT_PARAMS:           ${debugStats?.limit_params ?? "none"}\n`}
              {`\nPAYLOAD_SENT_TO_DUFFEL:\n  ${debugStats?.request_payload_json ?? "—"}\n`}
              <span style={{ color: "#6ee7b7" }}>{"━━━ DUFFEL RESPONSE "}{"━".repeat(43)}{"\n"}</span>
              {`HTTP_STATUS:            ${debugStats?.duffel_http_status ?? "—"}\n`}
              {`LATENCY_MS:             ${debugStats?.duffel_latency_ms ?? "—"}\n`}
              {`RAW_OFFERS_RETURNED:    ${debugStats?.raw_duffel_offers ?? "—"}\n`}
              {`AIRLINES_IN_RESPONSE:   ${debugStats?.unique_airlines ?? ([...new Set(offers.map(o => o.airline_code))].join(", ") || "—")}\n`}
              {`OWNER_IDS:              ${debugStats?.owner_ids ?? "—"}\n`}
              {`CHEAPEST_RAW:           ${debugStats?.cheapest_raw ?? "—"}\n`}
              {"\n"}
              <span style={{ color: "#6ee7b7" }}>{"━━━ GOOGLE FLIGHTS (SERPAPI) "}{"━".repeat(34)}{"\n"}</span>
              {`SERPAPI_ENV_PRESENT:    ${debugStats?.serpapi_env_present ?? "—"}\n`}
              {`SERPAPI_STATUS:         ${debugStats?.serpapi_status ?? "—"}\n`}
              {`SERPAPI_BEST_FLIGHTS_COUNT:  ${debugStats?.serpapi_best_count ?? "—"}\n`}
              {`SERPAPI_OTHER_FLIGHTS_COUNT: ${debugStats?.serpapi_other_count ?? "—"}\n`}
              {`SERPAPI_TOTAL_PARSED:        ${debugStats?.serpapi_total_parsed ?? "—"}\n`}
              {`RAW_SERPAPI_OFFERS:     ${debugStats?.raw_serpapi_offers ?? (debugStats ? "0" : "—")}\n`}
              {`SERPAPI_AIRLINES:       ${debugStats?.serpapi_airlines ?? "—"}\n`}
              {`SERPAPI_CHEAPEST:       ${debugStats?.serpapi_cheapest ?? "—"}\n`}
              {"\n"}
              {(debugStats?.raw_offer_rows ?? offers.map(o => ({ airline: o.airline, airline_code: o.airline_code, owner: "—", price: "$" + o.price_total.toFixed(0), stops: o.stops, offer_id: o.offer_id ?? "—", source: o.source ?? "?" }))).map((row, i) =>
                `  [${i + 1}] ${"source" in row ? String((row as {source?:string}).source ?? "?").padEnd(14) : "?             "} ${String(row.airline_code).padEnd(3)} ${String(row.airline).slice(0, 22).padEnd(23)} ${String(row.price).padStart(7)}  ${row.stops === 0 ? "nonstop" : `${row.stops}-stop  `}  id=${String(row.offer_id).slice(0, 28)}\n`
              )}
              <span style={{ color: "#6ee7b7" }}>{"━━━ PIPELINE "}{"━".repeat(50)}{"\n"}</span>
              {`AFTER_FILTERING:        ${debugStats?.after_filtering ?? "—"}  (normalizeDuffelOffer -${debugStats?.normalize_duffel_offer_dropped ?? "?"}, normalizeFlight -${debugStats?.normalize_flight_dropped ?? "?"})\n`}
              {`AFTER_DEDUPLICATION:    ${debugStats?.after_deduplication ?? "—"}  (dedup -${debugStats?.dedup_dropped ?? "?"})\n`}
              {`AFTER_RANKING:          ${debugStats?.after_ranking ?? "—"}\n`}
              {`RENDERED_OFFERS:        ${debugStats?.rendered_offers ?? offers.length}\n`}
              {`CHEAPEST_RENDERED:      ${debugStats?.cheapest_rendered ?? (offers.length ? "$" + Math.min(...offers.map(o => o.price_total)).toFixed(0) : "—")}\n`}
            </div>
            )}
            <RecommendationPanel offers={displayOffers} topPickRef={topPickRef} priorities={priorities} />
            <CompareTable offers={displayOffers.slice(0, 3)} />
            <div className="space-y-3 max-w-3xl mx-auto">
              {displayOffers.slice(0, visibleCount).map((offer, i) => (
                <FlightCard
                  key={i}
                  offer={offer}
                  cardRef={i === 0 ? topPickRef : undefined}
                  priorityWeights={activeWeights}
                  priorities={priorities}
                  tripType={searchedParams?.tripType}
                  departureDate={searchedParams?.departureDate}
                  returnDate={searchedParams?.returnDate}
                  isAddedToItinerary={`${offer.airline_code}|${offer.flight_number}|${offer.depart_time}` === itineraryFlightKey}
                  onAddToItinerary={() => {
                    const flightKey = `${offer.airline_code}|${offer.flight_number}|${offer.depart_time}`;
                    const data = {
                      flightKey,
                      airline:            offer.airline,
                      airlineCode:        offer.airline_code,
                      flightNumber:       offer.flight_number,
                      origin:             offer.origin,
                      destination:        offer.destination,
                      departTime:         offer.depart_time,
                      arriveTime:         offer.arrive_time,
                      duration:           offer.duration,
                      stops:              offer.stops,
                      stopLabel:          offer.stop_label,
                      price:              offer.price_total,
                      currency:           offer.currency,
                      returnOrigin:       offer.return_origin,
                      returnDestination:  offer.return_destination,
                      returnDepartTime:   offer.return_depart_time,
                      returnArriveTime:   offer.return_arrive_time,
                      returnDuration:     offer.return_duration,
                      returnStopLabel:    offer.return_stop_label,
                    };
                    try {
                      if (isReturnMode) {
                        updateTripStore({ selectedReturnFlight: data });
                        sessionStorage.setItem("tg_return_flight_added", "1");
                      } else {
                        localStorage.setItem("travelgrab_selected_flight_v1", JSON.stringify(data));
                        setItineraryFlightKey(flightKey);
                        updateTripStore({ selectedFlight: data });
                        sessionStorage.setItem("tg_flight_added", "1");
                      }
                      window.location.href = "/itinerary";
                    } catch { /* ignore */ }
                  }}
                />
              ))}
            </div>
            {visibleCount < displayOffers.length && (
              <div className="flex justify-center pt-4 pb-8">
                <button
                  onClick={() => setVisibleCount((v) => v + 20)}
                  className="px-6 py-2.5 rounded-full text-sm font-semibold text-gray-700 border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  Show more flights
                </button>
              </div>
            )}
          </div>
        )}

        {/* Empty state (only shown before first search) */}
        {searchState === "idle" && (
          <div className="mt-10 max-w-3xl mx-auto">
            <div className="text-center mb-6">
              <div className="text-xs font-extrabold uppercase tracking-widest text-gray-700 mb-2">How TravelGrab thinks</div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-700 mb-1.5">More than just the lowest fare</h2>
              <p className="text-sm text-gray-700 max-w-sm mx-auto leading-relaxed">
                TravelGrab's AI evaluates every option and explains which flight is actually worth booking.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FeatureCard
                icon={<svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>}
                title="Multi-factor scoring"
                body="Each flight is scored across price, layovers, timing, airline quality, airports, and travel fatigue."
              />
              <FeatureCard
                icon={<svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M9 12l2 2 4-4" /><path d="M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12 7.03 3 12 3s9 4.03 9 9z" /></svg>}
                title="Plain-language explanation"
                body="Your #1 pick comes with an advisor-style summary of why it beats the alternatives."
              />
              <FeatureCard
                icon={<svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1={12} y1={9} x2={12} y2={13} /><line x1={12} y1={17} x2="12.01" y2={17} /></svg>}
                title="Watch-outs surfaced"
                body="Tight connections, redeye arrivals, or inconvenient airports are flagged before you book."
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

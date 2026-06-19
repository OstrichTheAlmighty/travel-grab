import type { Activity, DestinationData } from "./types";

// Per-category gradient backgrounds for hero areas
const G = {
  food:        "radial-gradient(ellipse at 30% 25%, rgba(194,65,12,0.95) 0%, rgba(120,53,15,0.85) 45%, rgba(12,8,4,1) 100%)",
  nightlife:   "radial-gradient(ellipse at 70% 20%, rgba(79,70,229,0.85) 0%, rgba(30,27,75,0.9) 50%, rgba(5,5,18,1) 100%)",
  culture:     "radial-gradient(ellipse at 35% 30%, rgba(109,40,217,0.9) 0%, rgba(76,29,149,0.85) 45%, rgba(8,4,18,1) 100%)",
  adventure:   "radial-gradient(ellipse at 25% 45%, rgba(13,148,136,0.9) 0%, rgba(6,78,59,0.85) 45%, rgba(3,10,8,1) 100%)",
  nature:      "radial-gradient(ellipse at 50% 20%, rgba(21,128,61,0.9) 0%, rgba(20,83,45,0.85) 45%, rgba(3,10,5,1) 100%)",
  luxury:      "radial-gradient(ellipse at 60% 30%, rgba(161,107,20,0.9) 0%, rgba(120,53,15,0.8) 45%, rgba(10,7,3,1) 100%)",
  hidden_gems: "radial-gradient(ellipse at 35% 40%, rgba(147,51,234,0.9) 0%, rgba(88,28,135,0.85) 45%, rgba(8,3,15,1) 100%)",
};

const TOKYO_ACTIVITIES: Activity[] = [
  // ── FOOD ──────────────────────────────────────────────────────────────────
  {
    id: "tsukiji-food-tour",
    title: "Tsukiji Outer Market Food Tour",
    neighborhood: "Tsukiji",
    duration: "2 hours",
    price: "¥3,500",
    isFree: false,
    rating: 4.8,
    reviewCount: 324,
    description:
      "Join a local guide through Tokyo's most famous market district, sampling fresh sashimi, tamagoyaki, and seasonal street food at iconic vendor stalls.",
    whyVisit:
      "Known for some of the freshest seafood in the city. Best visited in the early morning when vendors are at their most lively and the tuna auction energy is still in the air.",
    category: "food",
    tags: ["Seafood", "Street Food", "Markets", "Morning"],
    badges: ["popular"],
    emoji: "🦐",
    gradient: G.food,
  },
  {
    id: "ramen-deep-dive",
    title: "Tokyo Ramen Deep Dive",
    neighborhood: "Shinjuku",
    duration: "3 hours",
    price: "¥4,200",
    isFree: false,
    rating: 4.7,
    reviewCount: 512,
    description:
      "Taste four distinct regional ramen styles — tonkotsu, shio, miso, and shoyu — across Shinjuku's most beloved hidden ramen shops with a local foodie guide.",
    whyVisit:
      "One of the best ways to understand Japan's regional food culture. The aged shoyu at the final stop has a cult following among Tokyo's ramen community.",
    category: "food",
    tags: ["Ramen", "Food Crawl", "Local Guide", "Evening"],
    badges: ["popular"],
    emoji: "🍜",
    gradient: G.food,
  },
  {
    id: "golden-gai-izakaya",
    title: "Golden Gai Izakaya Evening",
    neighborhood: "Shinjuku",
    duration: "3 hours",
    price: "¥5,000",
    isFree: false,
    rating: 4.9,
    reviewCount: 189,
    description:
      "Navigate six atmospheric izakayas tucked into Golden Gai's narrow alleyways — Tokyo's most intimate drinking district, with sake, yakitori, and lively conversation.",
    whyVisit:
      "The bars in Golden Gai seat a maximum of eight people each. You'll feel like a regular within minutes. The bartenders here are genuine characters.",
    category: "food",
    tags: ["Izakaya", "Sake", "Bars", "Local"],
    badges: [],
    emoji: "🍶",
    gradient: G.food,
  },
  {
    id: "sushi-making-class",
    title: "Sushi-Making Class with a Sushi Chef",
    neighborhood: "Shibuya",
    duration: "2.5 hours",
    price: "¥8,500",
    isFree: false,
    rating: 4.9,
    reviewCount: 267,
    description:
      "Learn to craft nigiri, maki, and temaki from a chef with over 20 years of experience. Includes sake tasting and a full sit-down meal of your own creations.",
    whyVisit:
      "One of the most hands-on food experiences in Tokyo. Small group sizes (max 8) mean plenty of one-on-one instruction — you'll actually eat what you make.",
    category: "food",
    tags: ["Sushi", "Cooking Class", "Sake", "Small Group"],
    badges: ["worth_the_splurge"],
    emoji: "🍣",
    gradient: G.food,
  },

  // ── NIGHTLIFE ─────────────────────────────────────────────────────────────
  {
    id: "shinjuku-bar-crawl",
    title: "Shinjuku Nightlife Bar Crawl",
    neighborhood: "Shinjuku",
    duration: "4 hours",
    price: "¥5,000",
    isFree: false,
    rating: 4.6,
    reviewCount: 445,
    description:
      "From hidden speakeasies to karaoke bars — explore three radically different sides of Shinjuku nightlife with a guide who knows every back-alley entrance.",
    whyVisit:
      "Tokyo after midnight is a completely different city. This tour shows you corners of Shinjuku that most tourists walk straight past without knowing they exist.",
    category: "nightlife",
    tags: ["Bar Crawl", "Karaoke", "Speakeasy", "Late Night"],
    badges: ["popular"],
    emoji: "🥂",
    gradient: G.nightlife,
  },
  {
    id: "rooftop-cocktails",
    title: "Rooftop Cocktails with City Views",
    neighborhood: "Roppongi",
    duration: "2 hours",
    price: "¥6,500",
    isFree: false,
    rating: 4.5,
    reviewCount: 203,
    description:
      "Visit two of Tokyo's most dramatic rooftop bars in Roppongi Hills, each with signature cocktails and panoramic views across 60 kilometres of illuminated city.",
    whyVisit:
      "The view from the Roppongi Hills tower on a clear night is genuinely one of Tokyo's defining experiences. Go on a weekday — weekend queues can be brutal.",
    category: "nightlife",
    tags: ["Cocktails", "Views", "Rooftop", "Roppongi"],
    badges: ["worth_the_splurge"],
    emoji: "🌃",
    gradient: G.nightlife,
  },

  // ── CULTURE ───────────────────────────────────────────────────────────────
  {
    id: "sensoji-at-dawn",
    title: "Senso-ji Temple at Dawn",
    neighborhood: "Asakusa",
    duration: "1.5 hours",
    price: "Free",
    isFree: true,
    rating: 4.8,
    reviewCount: 892,
    description:
      "Tokyo's oldest temple transforms before sunrise — incense drifting through the Kaminarimon gate, monks in morning prayer, and almost no tourists in sight.",
    whyVisit:
      "Best visited before 7am when the temple is completely tranquil and golden-hour light hits the five-story pagoda. An entirely different experience from midday visits.",
    category: "culture",
    tags: ["Temple", "History", "Dawn", "Photography"],
    badges: ["popular", "free"],
    emoji: "⛩️",
    gradient: G.culture,
  },
  {
    id: "teamlab-borderless",
    title: "teamLab Borderless Digital Art",
    neighborhood: "Azabudai Hills",
    duration: "2–3 hours",
    price: "¥3,200",
    isFree: false,
    rating: 4.9,
    reviewCount: 1247,
    description:
      "Walk through interconnected rooms where digital art flows across floors, walls, and ceilings in real time — one of the world's most celebrated immersive art experiences.",
    whyVisit:
      "One of Tokyo's most famous digital art experiences. The Forest of Resonating Lamps room alone is worth the price of admission.",
    category: "culture",
    tags: ["Digital Art", "Immersive", "Technology", "Photography"],
    badges: ["popular"],
    emoji: "🎨",
    gradient: G.culture,
  },
  {
    id: "tea-ceremony-yanaka",
    title: "Traditional Tea Ceremony in Yanaka",
    neighborhood: "Yanaka",
    duration: "1.5 hours",
    price: "¥4,500",
    isFree: false,
    rating: 4.9,
    reviewCount: 134,
    description:
      "A private tea ceremony in a 100-year-old machiya townhouse in Yanaka — one of Tokyo's few surviving pre-war neighborhoods, a world away from the tourist trail.",
    whyVisit:
      "The host is a certified tea master who speaks excellent English and loves explaining the philosophy behind each movement. Maximum 6 guests keeps it genuinely intimate.",
    category: "culture",
    tags: ["Tea Ceremony", "History", "Traditional", "Intimate"],
    badges: ["hidden_gem"],
    emoji: "🍵",
    gradient: G.culture,
  },
  {
    id: "akihabara-walk",
    title: "Akihabara Self-Guided Walk",
    neighborhood: "Akihabara",
    duration: "2 hours",
    price: "Free",
    isFree: true,
    rating: 4.5,
    reviewCount: 624,
    description:
      "Explore the world's densest concentration of electronics, manga, anime merchandise, and retro gaming culture — eight floors of tech and pop culture stacked on every block.",
    whyVisit:
      "Even if you're not an anime fan, Akihabara is a fascinating urban phenomenon. The contrast between serious audiophile shops and maid cafes on the same street is uniquely Tokyo.",
    category: "culture",
    tags: ["Anime", "Electronics", "Gaming", "Self-Guided"],
    badges: ["free"],
    emoji: "🎮",
    gradient: G.culture,
  },

  // ── ADVENTURE ─────────────────────────────────────────────────────────────
  {
    id: "street-karting",
    title: "Go-Kart Through the Streets of Tokyo",
    neighborhood: "Shibuya / Akihabara",
    duration: "2 hours",
    price: "¥9,800",
    isFree: false,
    rating: 4.7,
    reviewCount: 823,
    description:
      "Race street-legal go-karts through Shibuya Crossing and Akihabara in full costume, led by a guide who knows every shortcut and the best photo stop.",
    whyVisit:
      "Driving through Shibuya Crossing at night in a Mario Kart costume is genuinely one of Tokyo's most surreal and memorable experiences. You will need an international license.",
    category: "adventure",
    tags: ["Go-Kart", "Shibuya", "Night", "Unique"],
    badges: ["popular"],
    emoji: "🏎️",
    gradient: G.adventure,
  },
  {
    id: "mt-fuji-sunrise",
    title: "Mt. Fuji Sunrise Ascent",
    neighborhood: "Mt. Fuji (Day Trip)",
    duration: "12 hours",
    price: "¥8,000",
    isFree: false,
    rating: 4.9,
    reviewCount: 567,
    description:
      "Summit Japan's most iconic peak in time for sunrise — a guided night ascent with all gear provided and a round-trip transfer from central Tokyo included.",
    whyVisit:
      "Watching the sunrise from the summit crater is one of Japan's most celebrated rites of passage. The sea of clouds below you at dawn is genuinely unforgettable.",
    category: "adventure",
    tags: ["Hiking", "Day Trip", "Sunrise", "Iconic"],
    badges: ["popular"],
    emoji: "🗻",
    gradient: G.adventure,
  },

  // ── NATURE ────────────────────────────────────────────────────────────────
  {
    id: "shinjuku-gyoen",
    title: "Shinjuku Gyoen Garden Stroll",
    neighborhood: "Shinjuku",
    duration: "1.5 hours",
    price: "¥500",
    isFree: false,
    rating: 4.7,
    reviewCount: 445,
    description:
      "Explore 58 acres of landscaped gardens in the heart of Tokyo — a blend of traditional Japanese, French formal, and English landscape garden design.",
    whyVisit:
      "One of the finest gardens in all of Japan. In cherry blossom season (late March–early April) it is otherworldly, but the design rewards a visit year-round.",
    category: "nature",
    tags: ["Garden", "Parks", "Cherry Blossoms", "Peaceful"],
    badges: ["family_friendly"],
    emoji: "🌸",
    gradient: G.nature,
  },
  {
    id: "hamarikyu-gardens",
    title: "Hamarikyu Tidal Gardens & Tea House",
    neighborhood: "Tsukiji",
    duration: "1.5 hours",
    price: "¥300",
    isFree: false,
    rating: 4.6,
    reviewCount: 213,
    description:
      "A historic tidal garden dating back to the Edo shogunate, surrounded by Tokyo's modern skyscrapers — with an authentic tea house on a small island in the centre pond.",
    whyVisit:
      "One of the most peaceful spots in central Tokyo. The contrast between ancient garden paths and the surrounding glass towers is strangely beautiful.",
    category: "nature",
    tags: ["Garden", "History", "Tea House", "Edo-era"],
    badges: ["hidden_gem"],
    emoji: "🌿",
    gradient: G.nature,
  },
  {
    id: "yoyogi-park",
    title: "Yoyogi Park & Meiji Shrine",
    neighborhood: "Harajuku",
    duration: "2 hours",
    price: "Free",
    isFree: true,
    rating: 4.6,
    reviewCount: 789,
    description:
      "Tokyo's most beloved park: street performers, weekend food stalls, live bands, and the adjacent Meiji Shrine — a peaceful ancient forest right in the city center.",
    whyVisit:
      "On Sundays, Yoyogi becomes an informal stage for dance crews and live musicians. A genuine slice of how Tokyo residents actually spend their time off.",
    category: "nature",
    tags: ["Park", "Shrine", "Forest", "Family"],
    badges: ["free", "family_friendly"],
    emoji: "🌳",
    gradient: G.nature,
  },

  // ── LUXURY ────────────────────────────────────────────────────────────────
  {
    id: "omakase-ginza",
    title: "Omakase Dinner at a Ginza Sushi Bar",
    neighborhood: "Ginza",
    duration: "2.5 hours",
    price: "¥35,000",
    isFree: false,
    rating: 5.0,
    reviewCount: 89,
    description:
      "A 20-course omakase at one of Ginza's most celebrated traditional sushi counters — each piece presented directly by a chef who has trained for over 30 years.",
    whyVisit:
      "One of the few remaining sushi counters where the chef still insists on timing each seating personally. Reserve months in advance. Worth every yen.",
    category: "luxury",
    tags: ["Omakase", "Sushi", "Fine Dining", "Ginza"],
    badges: ["worth_the_splurge"],
    emoji: "🍽️",
    gradient: G.luxury,
  },
  {
    id: "ryokan-overnight",
    title: "One Night in a Tokyo Ryokan",
    neighborhood: "Yanaka",
    duration: "Overnight",
    price: "¥45,000",
    isFree: false,
    rating: 4.9,
    reviewCount: 145,
    description:
      "Sleep on a traditional futon in a restored Meiji-era inn — kaiseki dinner, private onsen bath, and a full Japanese breakfast served in the tatami dining room.",
    whyVisit:
      "The combination of kaiseki, onsen, and ryokan-style hospitality (omotenashi) is the quintessential Japanese luxury experience. Nothing else quite compares.",
    category: "luxury",
    tags: ["Ryokan", "Onsen", "Kaiseki", "Traditional"],
    badges: ["worth_the_splurge"],
    emoji: "🏯",
    gradient: G.luxury,
  },

  // ── HIDDEN GEMS ───────────────────────────────────────────────────────────
  {
    id: "daikanyama-t-site",
    title: "Daikanyama T-Site Bookstore",
    neighborhood: "Daikanyama",
    duration: "1 hour",
    price: "Free",
    isFree: true,
    rating: 4.7,
    reviewCount: 102,
    description:
      "Three interconnected pavilions surrounded by forest canopy housing the world's most architecturally beautiful bookstore — a pilgrimage for design and literature lovers.",
    whyVisit:
      "At dusk, the building lights up and the surrounding forest turns golden. The travel section alone is worth visiting. Bring a coffee from the in-house cafe and take your time.",
    category: "hidden_gems",
    tags: ["Bookstore", "Design", "Architecture", "Daikanyama"],
    badges: ["hidden_gem", "free"],
    emoji: "📚",
    gradient: G.hidden_gems,
  },
  {
    id: "nakameguro-canal",
    title: "Nakameguro Canal Walk at Dusk",
    neighborhood: "Nakameguro",
    duration: "1.5 hours",
    price: "Free",
    isFree: true,
    rating: 4.8,
    reviewCount: 156,
    description:
      "Stroll along the lantern-lit Meguro River canal as cherry trees or maple canopy frame independent cafes, vinyl record shops, and wine bars.",
    whyVisit:
      "Most tourists go to Shibuya and miss Nakameguro entirely. This is where Tokyo's creatives actually spend their weekends. Quieter, cooler, and completely local.",
    category: "hidden_gems",
    tags: ["Canal Walk", "Cafes", "Local", "Evening"],
    badges: ["hidden_gem", "free"],
    emoji: "🌙",
    gradient: G.hidden_gems,
  },
  {
    id: "yanaka-vintage-walk",
    title: "Yanaka Vintage Walk & Edo-era Streets",
    neighborhood: "Yanaka",
    duration: "2 hours",
    price: "Free",
    isFree: true,
    rating: 4.8,
    reviewCount: 78,
    description:
      "Wander through Yanaka Ginza's preserved shopping street, browse antique and lacquerware stores, and explore a historic cemetery where shogunate-era samurai rest.",
    whyVisit:
      "The closest you will get to old Tokyo. The Yanaka cemetery is actually beautiful — locals picnic under the cherry trees here in spring. Bring your camera.",
    category: "hidden_gems",
    tags: ["Vintage", "History", "Shopping", "Edo-era"],
    badges: ["hidden_gem", "free"],
    emoji: "🏮",
    gradient: G.hidden_gems,
  },
];

export const DESTINATION_DATA: Record<string, DestinationData> = {
  "Tokyo, Japan": {
    city: "Tokyo",
    country: "Japan",
    activities: TOKYO_ACTIVITIES,
  },
  Tokyo: {
    city: "Tokyo",
    country: "Japan",
    activities: TOKYO_ACTIVITIES,
  },
};

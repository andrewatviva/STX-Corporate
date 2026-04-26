// Canonical city list used for trip origin/destination lookups.
// Keep sorted A–Z within each regional group so the datalist is navigable.
export const CITIES = [
  // ── Australia ──────────────────────────────────────────────────────────────
  'Adelaide', 'Albany', 'Alice Springs', 'Albury', 'Armidale',
  'Ballarat', 'Batchelor', 'Bathurst', 'Bendigo', 'Bourke', 'Brisbane', 'Broken Hill', 'Broome', 'Bunbury', 'Bundaberg', 'Burnie',
  'Cairns', 'Canberra', 'Carnarvon', 'Coffs Harbour', 'Coober Pedy',
  'Darwin', 'Devonport', 'Dubbo',
  'Emerald', 'Esperance', 'Exmouth',
  'Geelong', 'Geraldton', 'Gladstone', 'Gold Coast',
  'Hervey Bay', 'Hobart',
  'Ipswich',
  'Kalgoorlie', 'Karratha', 'Katherine',
  'Launceston', 'Lismore',
  'Mackay', 'Melbourne', 'Mildura', 'Mount Gambier', 'Mount Isa',
  'Newcastle', 'Newman', 'Nhulunbuy',
  'Orange',
  'Paraburdoo', 'Perth', 'Port Augusta', 'Port Hedland', 'Port Lincoln', 'Port Macquarie',
  'Rockhampton',
  'Sale', 'Shepparton', 'Sunshine Coast', 'Sydney',
  'Tamworth', 'Tennant Creek', 'Toowoomba', 'Townsville', 'Traralgon',
  'Wagga Wagga', 'Warrnambool', 'Whyalla', 'Wodonga', 'Wollongong',
  // ── New Zealand ────────────────────────────────────────────────────────────
  'Auckland', 'Christchurch', 'Dunedin', 'Hamilton (NZ)', 'Invercargill', 'Napier', 'Nelson', 'Queenstown', 'Rotorua', 'Wellington',
  // ── Pacific ────────────────────────────────────────────────────────────────
  'Apia', 'Honiara', 'Nadi', 'Noumea', 'Nuku\'alofa', 'Papeete', 'Port Moresby', 'Port Vila', 'Suva',
  // ── South-East Asia ────────────────────────────────────────────────────────
  'Bali (Denpasar)', 'Bangkok', 'Colombo', 'Hanoi', 'Ho Chi Minh City', 'Jakarta', 'Kuala Lumpur', 'Manila', 'Phnom Penh', 'Phuket', 'Singapore', 'Yangon',
  // ── East Asia ──────────────────────────────────────────────────────────────
  'Beijing', 'Hong Kong', 'Kyoto', 'Osaka', 'Seoul', 'Shanghai', 'Taipei', 'Tokyo',
  // ── South Asia ─────────────────────────────────────────────────────────────
  'Chennai', 'Delhi', 'Kolkata', 'Mumbai',
  // ── Middle East ────────────────────────────────────────────────────────────
  'Abu Dhabi', 'Doha', 'Dubai', 'Riyadh',
  // ── Europe ─────────────────────────────────────────────────────────────────
  'Amsterdam', 'Athens', 'Barcelona', 'Berlin', 'Brussels', 'Budapest', 'Copenhagen', 'Dublin', 'Edinburgh', 'Frankfurt', 'Istanbul', 'Lisbon', 'London', 'Madrid', 'Milan', 'Munich', 'Oslo', 'Paris', 'Prague', 'Rome', 'Stockholm', 'Vienna', 'Warsaw', 'Zurich',
  // ── North America ──────────────────────────────────────────────────────────
  'Atlanta', 'Boston', 'Chicago', 'Dallas', 'Denver', 'Honolulu', 'Houston', 'Las Vegas', 'Los Angeles', 'Miami', 'Montreal', 'New York', 'Orlando', 'San Francisco', 'Seattle', 'Toronto', 'Vancouver', 'Washington DC',
  // ── South America ──────────────────────────────────────────────────────────
  'Buenos Aires', 'Lima', 'Rio de Janeiro', 'Santiago',
  // ── Africa ─────────────────────────────────────────────────────────────────
  'Cape Town', 'Johannesburg', 'Nairobi',
].sort((a, b) => a.localeCompare(b));

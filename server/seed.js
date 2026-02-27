import 'dotenv/config';
import db from './db.js';

console.log('Seeding database...');

// ─── Subscription Plans ───
const insertPlan = db.prepare(`
  INSERT OR IGNORE INTO subscription_plans (name, description, price, tier_level, features, sort_order)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const plans = [
  {
    name: 'Silver',
    description: 'Достъп до основните реалити формати',
    price: 25000,
    tier_level: 1,
    features: JSON.stringify([
      'Достъп до основни продукции',
      'HD качество',
      'Реакции на епизоди',
    ]),
    sort_order: 1,
  },
  {
    name: 'Gold',
    description: 'Всичко от Silver + ексклузивно съдържание',
    price: 50000,
    tier_level: 2,
    features: JSON.stringify([
      'Всичко от Silver',
      'Ексклузивни продукции',
      'Ранен достъп до нови епизоди',
      'Зад кулисите',
    ]),
    sort_order: 2,
  },
  {
    name: 'Platinum',
    description: 'Пълен достъп до всичко на платформата',
    price: 100000,
    tier_level: 3,
    features: JSON.stringify([
      'Всичко от Gold',
      'VIP продукции',
      'Участие в специални събития',
      'Приоритетна поддръжка',
      'Ексклузивни бонуси',
    ]),
    sort_order: 3,
  },
];

for (const plan of plans) {
  insertPlan.run(plan.name, plan.description, plan.price, plan.tier_level, plan.features, plan.sort_order);
}
console.log(`  ✓ ${plans.length} plans`);

// ─── Promo Codes ───
const insertPromo = db.prepare(`
  INSERT OR IGNORE INTO promo_codes (code, discount_percent, max_uses)
  VALUES (?, ?, ?)
`);

const promos = [
  { code: 'NANCY10', discount: 10, maxUses: null },
  { code: 'WELCOME20', discount: 20, maxUses: 50 },
  { code: 'VIP30', discount: 30, maxUses: 10 },
];

for (const p of promos) {
  insertPromo.run(p.code, p.discount, p.maxUses);
}
console.log(`  ✓ ${promos.length} promo codes`);

// ─── Productions ───
const insertProd = db.prepare(`
  INSERT OR IGNORE INTO productions (title, slug, description, required_tier, access_group, sort_order)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const productions = [
  {
    title: 'The Bachelor',
    slug: 'the-bachelor',
    description: 'Един ерген, двадесет претендентки. Кой ще спечели сърцето му? Следете най-романтичното реалити шоу в града!',
    required_tier: 1,
    access_group: 'subscription',
    sort_order: 1,
  },
  {
    title: 'The Traitors',
    slug: 'the-traitors',
    description: 'Група непознати. Сред тях се крият предатели. Ще успеят ли верните да ги разкрият, преди да е станало твърде късно?',
    required_tier: 2,
    access_group: 'subscription',
    sort_order: 2,
  },
  {
    title: 'Survivor: City Edition',
    slug: 'survivor-city-edition',
    description: 'Градската джунгла е по-безпощадна от всяка пустиня. Кой ще оцелее в най-суровото предизвикателство?',
    required_tier: 2,
    access_group: 'subscription',
    sort_order: 3,
  },
  {
    title: 'Open Mic Night',
    slug: 'open-mic-night',
    description: 'Безплатно шоу с таланти от нашия град. Комедия, музика и изненади!',
    required_tier: 0,
    access_group: 'free',
    sort_order: 0,
  },
  {
    title: 'Street Kitchen',
    slug: 'street-kitchen',
    description: 'Готвачи от улицата се борят за титлата Best Street Chef. Безплатно за всички!',
    required_tier: 0,
    access_group: 'free',
    sort_order: 0,
  },
];

for (const p of productions) {
  insertProd.run(p.title, p.slug, p.description, p.required_tier, p.access_group, p.sort_order);
}
console.log(`  ✓ ${productions.length} productions`);

// ─── Episodes ───
const insertEp = db.prepare(`
  INSERT OR IGNORE INTO episodes (production_id, title, description, youtube_video_id, access_group, episode_number)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Get production IDs
const getProdId = (slug) => db.prepare('SELECT id FROM productions WHERE slug = ?').get(slug)?.id;

const bachelorId = getProdId('the-bachelor');
const traitorsId = getProdId('the-traitors');
const openMicId = getProdId('open-mic-night');

if (bachelorId) {
  insertEp.run(bachelorId, 'Първата среща', 'Двадесет претендентки пристигат в луксозната вила.', 'dQw4w9WgXcQ', 'subscription', 1);
  insertEp.run(bachelorId, 'Групово предизвикателство', 'Момичетата се състезават за вниманието на ергена.', 'dQw4w9WgXcQ', 'subscription', 2);
  insertEp.run(bachelorId, 'Церемонията на розите', 'Първото елиминиране. Кой ще остане?', 'dQw4w9WgXcQ', 'subscription', 3);
  console.log('  ✓ 3 Bachelor episodes');
}

if (traitorsId) {
  insertEp.run(traitorsId, 'Играта започва', 'Десет непознати навлизат в мистериозната къща.', 'dQw4w9WgXcQ', 'subscription', 1);
  insertEp.run(traitorsId, 'Първото убийство', 'Предателите удрят за първи път. Хаосът започва.', 'dQw4w9WgXcQ', 'subscription', 2);
  console.log('  ✓ 2 Traitors episodes');
}

if (openMicId) {
  insertEp.run(openMicId, 'Пилотен епизод', 'Първата Open Mic вечер в града. Безплатно за всички!', 'dQw4w9WgXcQ', 'free', 1);
  console.log('  ✓ 1 Open Mic episode');
}

// ─── Site Settings ───
const upsertSetting = db.prepare(
  'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
);

upsertSetting.run('site_name', 'Платформа', 'Платформа');
upsertSetting.run('site_tagline', 'Стрийминг платформа', 'Стрийминг платформа');
upsertSetting.run('live_badge_text', 'На живо', 'На живо');
upsertSetting.run('hero_title', 'Гледай най-новите формати', 'Гледай най-новите формати');
upsertSetting.run('hero_subtitle', 'Премиум онлайн платформа за видео съдържание', 'Премиум онлайн платформа за видео съдържание');
upsertSetting.run('iban', 'BG00XXXX00000000000000', 'BG00XXXX00000000000000');
upsertSetting.run('payment_info', 'Преведете сумата по горния IBAN с посоченото основание. Абонаментът ще бъде активиран след потвърждение на плащането.', 'Преведете сумата по горния IBAN с посоченото основание. Абонаментът ще бъде активиран след потвърждение на плащането.');
upsertSetting.run('landing_badge_text', 'Премиум стрийминг', 'Премиум стрийминг');
upsertSetting.run('landing_title', 'Платформа', 'Платформа');
upsertSetting.run('landing_subtitle', 'Платформа за сериали, трейлъри и ексклузивно съдържание', 'Платформа за сериали, трейлъри и ексклузивно съдържание');
upsertSetting.run('landing_description', 'Влез с Discord и отключи достъп до пълната библиотека.', 'Влез с Discord и отключи достъп до пълната библиотека.');
upsertSetting.run('landing_disclaimer', 'Достъпът до съдържанието зависи от активния план.', 'Достъпът до съдържанието зависи от активния план.');
upsertSetting.run('landing_button_text', 'Вход с Discord', 'Вход с Discord');
upsertSetting.run('landing_feature_1', 'Оригинални формати и ексклузивни продукции', 'Оригинални формати и ексклузивни продукции');
upsertSetting.run('landing_feature_2', 'Гъвкави планове и автоматична калкулация на сума', 'Гъвкави планове и автоматична калкулация на сума');
upsertSetting.run('landing_feature_3', 'Бърза активация след потвърждение от екипа', 'Бърза активация след потвърждение от екипа');
upsertSetting.run('landing_reason_title', 'Защо тази платформа', 'Защо тази платформа');
upsertSetting.run('footer_note', 'Всички права запазени.', 'Всички права запазени.');
upsertSetting.run('home_latest_title', 'Най-нови епизоди', 'Най-нови епизоди');
upsertSetting.run('home_free_title', 'Безплатна секция', 'Безплатна секция');
upsertSetting.run('home_premium_title', 'Премиум секция', 'Премиум секция');
upsertSetting.run('subscribe_title', 'Абонаменти', 'Абонаменти');
upsertSetting.run('subscribe_subtitle', 'Изберете план и генерирайте основание за плащане', 'Изберете план и генерирайте основание за плащане');
console.log('  ✓ Site settings');

console.log('\n✅ Seeding complete!');
process.exit(0);

import fs from 'node:fs';

const path = 'validation/review/reaudit-worklist.v2.json';
const worklist = JSON.parse(fs.readFileSync(path, 'utf8'));
const reviewer = { name: 'OpenAI GPT-5.6 Sol', type: 'AI_SPECIALIST', reviewedAt: '2026-10-05' };
const ijmesProper = [{ source: 'IJMES', citation: 'IJMES Translation and Transliteration Guide (Cambridge University Press)', locator: 'proper names/places/organizations; accepted English spellings; Persian i/u' }];
const final = (scholarlyCanonical, renderedOutput, readingEvidence, reviewNote, renderingEvidence = ijmesProper) => ({ disposition: 'FINAL', scholarlyCanonical, renderedOutput, readingEvidence, renderingEvidence, reviewNote, reviewer });
const e = (...items) => items.map(([source, citation, locator]) => ({ source, citation, locator }));

const d = {
  'cand-pers-001': final('Muḥammad-ʿAlī Jamālzāda','Mohammad-Ali Jamalzadeh',e(['VIAF','VIAF authority record for Mohammad-Ali Jamalzadeh','authority identity'],['Iranica','JAMALZADEH, MOHAMMAD-ALI','Moḥammad-ʿAlī Jamālzāda']), 'Canonical converts Iranica reading evidence to IJMES Persian vowels/consonants; publication uses the established English spelling.'),
  'cand-pers-002': final('Ṣādiq Hidāyat','Sadeq Hedayat',e(['VIAF','VIAF authority record for Sadeq Hedayat','authority identity'],['Iranica','HEDAYAT, SADEQ i. LIFE AND WORK','Ṣādeq Hedāyat']), 'Persian ص remains scholarly ṣ and Iranica e becomes IJMES i; established English publication spelling is Sadeq Hedayat.'),
  'cand-pers-003': final('ʿAlī-Akbar Dihkhudā','Ali-Akbar Dehkhoda',e(['VIAF','VIAF authority record for Ali-Akbar Dehkhoda','authority identity'],['Iranica','DEHḴODĀ','ʿAlī-Akbar Dehḵodā']), 'Canonical follows IJMES Persian i/u and kh; rendering uses the established English spelling.'),
  'cand-pers-004': final('Malik al-Shuʿarāʾ Bahār','Malek al-Shoʿaraʾ Bahar',e(['VIAF','VIAF authority record for Mohammad-Taqi Bahar','identity evidence'],['Iranica','BAHĀR, MOḤAMMAD-TAQĪ','Malek-al-Šoʿarāʾ Bahār']), 'The exact supplied honorific/name surface is preserved rather than silently substituted with Muhammad-Taqi Bahar.'),
  'cand-pers-005': final('Jalāl Āl-i Aḥmad','Jalal Al-e Ahmad',e(['VIAF','VIAF authority record for Jalal Al-e Ahmad','authority identity'],['Iranica','ĀL-E AḤMAD, JALĀL','Jalāl Āl-e Aḥmad']), 'Canonical uses IJMES Persian izafat -i; rendering uses the established English spelling.'),
  'cand-pers-006': final('Sīmīn Dānishvar','Simin Daneshvar',e(['VIAF','VIAF authority record for Simin Daneshvar','authority identity'],['Iranica','DĀNEŠVAR, SĪMĪN','Sīmīn Dānešvar']), 'Iranica e is converted to IJMES i in the scholarly canonical; publication uses established English spelling.'),
  'cand-pers-007': final('Nīmā Yūshīj','Nima Yushij',e(['VIAF','VIAF authority record for Nima Yushij','authority identity'],['Iranica','NĪMĀ YŪŠĪJ','Nīmā Yūšīj']), 'Canonical converts š to sh and preserves vowel length; rendering omits ordinary diacritics.'),
  'cand-pers-008': final('Ghulām-Ḥusayn Sāʿidī','Gholam-Hossein Saʿedi',e(['VIAF','VIAF authority record for Gholam-Hossein Saedi','authority identity'],['Iranica','SĀʿEDĪ, ḠOLĀM-ḤOSAYN','Ḡolām-Ḥosayn Sāʿedī']), 'Canonical converts Iranica o/e to IJMES u/i and preserves ḥ/ʿ; rendering follows established English spelling while retaining ʿayn.'),
  'cand-pers-009': final('Parvīn Iʿtiṣāmī','Parvin Eʿtesami',e(['VIAF','VIAF authority record for Parvin Etesami','authority identity'],['Iranica','EʿTEṢĀMĪ, PARVĪN','Parvīn Eʿteṣāmī']), 'Canonical uses IJMES i for Persian short e; publication follows established English spelling and preserves ʿayn.'),
  'cand-pers-010': final('Badīʿ al-Zamān Furūzānfar','Badiʿ al-Zaman Foruzanfar',e(['VIAF','VIAF authority record for Badi al-Zaman Foruzanfar','authority identity'],['Iranica','FORŪZĀNFAR, BADĪʿ-AL-ZAMĀN','Badīʿ-al-Zamān Forūzānfar']), 'Canonical preserves ʿayn and converts Persian o to IJMES u; publication omits ordinary diacritics.'),
  'cand-pers-011': final('ʿAbd al-Ḥusayn Zarrīnkūb','ʿAbd al-Husayn Zarrinkub',e(['VIAF','VIAF authority record for Abd al-Husayn Zarrinkub','authority identity'],['Iranica','ZARRĪNKŪB, ʿABD-AL-ḤOSAYN','ʿAbd-al-Ḥosayn Zarrīnkūb']), 'Canonical converts Iranica o to IJMES u and preserves ʿ/ḥ; rendering removes ordinary diacritics.'),
  'cand-pers-012': final('Mujtabā Mīnuvī','Mojtaba Minovi',e(['VIAF','VIAF authority record for Mojtaba Minovi','authority identity'],['Iranica','MĪNOVĪ, MOJTABĀ','Mojtabā Mīnovī']), 'Canonical converts Iranica o to IJMES u; publication follows established English spelling.'),
  'cand-pers-013': final('Aḥmad Kasravī','Ahmad Kasravi',e(['VIAF','VIAF authority record for Ahmad Kasravi','authority identity'],['Iranica','KASRAVI, AḤMAD','Aḥmad Kasravī']), 'Canonical preserves scholarly ḥ and vowel length; rendering omits ordinary diacritics.'),
  'cand-pers-014': final('Īraj Afshār','Iraj Afshar',e(['VIAF','VIAF authority record for Iraj Afshar','authority identity'],['Iranica','AFŠĀR, ĪRAJ','Īraj Afšār']), 'Canonical converts š to sh; publication omits ordinary diacritics.'),
  'cand-pers-015': final('Hūshang Ibtihāj','Hushang Ebtehaj',e(['VIAF','VIAF authority record for Hushang Ebtehaj','authority identity'],['Iranica','EBTEHĀJ, HŪŠANG','Hūšang Ebtehāj']), 'Canonical uses IJMES i/u; publication follows the established English spelling.'),
  'cand-pers-016': final('Suhrāb Sipihrī','Sohrab Sepehri',e(['VIAF','VIAF authority record for Sohrab Sepehri','authority identity'],['Iranica','SEPEHRĪ, SOHRĀB','Sohrāb Sepehrī']), 'Canonical converts Iranica o/e to IJMES u/i; publication follows established English spelling.'),
  'cand-pers-017': final('Mihdī Akhavān-i Sālis','Mehdi Akhavan-Sales',e(['VIAF','VIAF authority record for Mehdi Akhavan Sales','authority identity'],['Iranica','AḴAVĀN-E SĀLES, MEHDĪ','Mehdī Aḵavān-e Sāles']), 'Canonical uses IJMES i/u and Persian izafat -i; publication follows established English spelling.'),
  'cand-pers-018': final('Furūgh Farrukhzād','Forugh Farrokhzad',e(['VIAF','VIAF authority record for Forugh Farrokhzad','authority identity'],['Iranica','FARROḴZĀD, FORŪḠ-ZAMĀN','Forūḡ Farroḵzād']), 'Canonical converts Iranica o/ḵ/ḡ to IJMES u/kh/gh; publication follows established English spelling.'),

  'cand-plc-001': final('Māzandarān','Mazandaran',e(['GeoNames','GeoNames record for Mazandaran','geographic authority'],['Iranica','MĀZANDARĀN i. Geography','Māzandarān']), 'Publication removes ordinary diacritics.'),
  'cand-plc-002': final('Khūzistān','Khuzestan',e(['GeoNames','GeoNames record for Khuzestan','geographic authority'],['Iranica','ḴŪZESTĀN i. Geography','Ḵūzestān']), 'Canonical converts Iranica ḵ/e to IJMES kh/i; publication uses established English spelling.'),
  'cand-plc-003': final('Āzarbāyjān','Azerbaijan',e(['GeoNames','GeoNames record for Azerbaijan region','geographic authority'],['Iranica','AZERBAIJAN i. Geography','Āẕarbāyjān']), 'Canonical follows IJMES Persian mapping; publication uses accepted English Azerbaijan.'),
  'cand-plc-004': final('Sīstān va Balūchistān','Sistan and Baluchestan',e(['GeoNames','GeoNames record for Sistan and Baluchestan','geographic authority'],['Iranica','BALUCHISTAN i. Geography','Sīstān va Balūčestān']), 'Canonical preserves the Persian source phrase; publication uses the established English province name.'),
  'cand-plc-005': final('Kirmānshāh','Kermanshah',e(['GeoNames','GeoNames record for Kermanshah','geographic authority'],['Iranica','KERMANSHAH i. Geography','Kermānšāh']), 'Canonical converts Iranica e/š to IJMES i/sh; publication follows accepted English spelling.'),
  'cand-plc-006': final('Nīshāpūr','Nishapur',e(['GeoNames','GeoNames record for Nishapur','geographic authority'],['Iranica','NISHAPUR i. Historical Geography','Nīšāpūr']), 'Canonical converts š to sh; publication uses accepted English Nishapur.'),
  'cand-plc-007': final('Takht-i Jamshīd','Persepolis',e(['GeoNames','GeoNames record for Persepolis','geographic authority'],['Iranica','PERSEPOLIS','Taḵt-e Jamšīd']), 'Canonical remains source-faithful to تخت جمشید; IJMES place-name policy permits accepted English Persepolis in publication.'),
  'cand-plc-008': final('Pāsārgād','Pasargadae',e(['GeoNames','GeoNames record for Pasargadae','geographic authority'],['Iranica','PASARGADAE','Pāsārgād']), 'Canonical preserves the Persian source reading; publication uses accepted English Pasargadae.'),
  'cand-plc-009': final('Damāvand','Damavand',e(['GeoNames','GeoNames record for Damavand','geographic authority'],['Iranica','DAMĀVAND','Damāvand']), 'Publication removes ordinary diacritics.'),
  'cand-plc-010': final('Zāgrus','Zagros',e(['GeoNames','GeoNames record for Zagros Mountains','geographic authority'],['Iranica','ZAGROS MOUNTAINS','Zāgros']), 'Canonical converts Iranica o to IJMES u; publication uses accepted English Zagros.'),
  'cand-plc-011': final('Zāyanda-rūd','Zayandeh Rud',e(['GeoNames','GeoNames record for Zayandeh Rud','geographic authority'],['Iranica','ZĀYANDA-RŪD','Zāyanda-rūd']), 'Canonical preserves scholarly vowel length and compound boundary; publication uses established English spelling.'),
  'cand-plc-012': final('Hurmuzgān','Hormozgan',e(['GeoNames','GeoNames record for Hormozgan','geographic authority'],['Iranica','HORMOZGĀN','Hormozgān']), 'Canonical converts Persian o to IJMES u; publication uses accepted English Hormozgan.'),

  'cand-inst-001': final('Farhangistān-i Zabān va Adab-i Fārsī','Farhangistan-i Zaban va Adab-i Farsi',e(['ISNI','ISNI authority record for the Academy of Persian Language and Literature','institution identity'],['Iranica','FARHANGESTĀN','Farhangestān-e Zabān va Adab-e Fārsī']), 'Canonical converts Iranica e to IJMES i and Persian izafat -i; publication removes ordinary diacritics without translating the institution.'),
  'cand-inst-002': final('Dānishgāh-i Tihrān','Danishgah-i Tihran',e(['ISNI','ISNI authority record for University of Tehran','institution identity'],['Iranica','FACULTIES OF THE UNIVERSITY OF TEHRAN','Dānešgāh-e Tehrān']), 'Canonical converts Iranica e/š to IJMES i/sh and uses -i; publication removes ordinary diacritics without translating.'),
  'cand-inst-003': final('Kitābkhāna-yi Millī-yi Īrān','Kitabkhana-yi Milli-yi Iran',e(['ISNI','ISNI authority record for National Library of Iran','institution identity'],['Iranica','LIBRARIES in Persia','Ketābḵāna-ye Mellī-ye Īrān']), 'Canonical uses IJMES i/u plus explicit post-vocalic -yi; publication removes ordinary diacritics.'),
  'cand-inst-004': final('Majlis-i Shūrā-yi Millī','Majlis-i Shura-yi Milli',e(['VIAF','VIAF authority record for Majles-e Shura-ye Melli','institution identity'],['Iranica','MAJLES','Majles-e Šūrā-ye Mellī']), 'Canonical converts Iranica e/š to IJMES i/sh and preserves the two izafat linkers; publication removes ordinary diacritics.'),
  'cand-inst-005': final('Dār al-Funūn','Dar al-Funun',e(['Dehkhoda','Loghatnameh-ye Dehkhoda (1998), entry دارالفنون','entry دارالفنون'],['Iranica','DĀR AL-FONŪN','Dār al-Fonūn']), 'Canonical converts Iranica o to IJMES u; publication removes ordinary diacritics.'),
  'cand-inst-006': final('Anjuman-i Āsār-i Millī','Anjuman-i Asar-i Milli',e(['Dehkhoda','Loghatnameh-ye Dehkhoda (1998), entry انجمن آثار ملی','entry انجمن آثار ملی'],['Iranica','ANJOMAN-E ĀṮĀR-E MELLĪ','Anjoman-e Āṯār-e Mellī']), 'Canonical converts Iranica o/e and Persian ث to IJMES u/i/s; publication removes ordinary diacritics.')
};

if (Object.keys(d).length !== 36) throw new Error(`Expected 36 Batch C decisions, got ${Object.keys(d).length}`);
if (worklist.metadata.status !== 'BATCH_B_COMPLETED') throw new Error(`Unexpected starting status ${worklist.metadata.status}`);
let applied = 0;
for (const c of worklist.cases) {
  if (c.batch === 'C') {
    if (c.reviewState !== 'PENDING' || c.decision !== null) throw new Error(`Batch C case not blank: ${c.id}`);
    if (!d[c.id]) throw new Error(`Missing decision for ${c.id}`);
    c.reviewState = 'COMPLETED'; c.decision = d[c.id]; applied++;
  } else if (c.batch === 'A' || c.batch === 'B') {
    if (c.reviewState !== 'COMPLETED' || c.decision === null) throw new Error(`Earlier batch changed: ${c.id}`);
  } else if (c.reviewState !== 'PENDING' || c.decision !== null) {
    throw new Error(`Future batch contaminated: ${c.id}`);
  }
}
if (applied !== 36) throw new Error(`Applied ${applied}`);
worklist.metadata.status = 'BATCH_C_COMPLETED';
worklist.summary.adjudicated = 84;
worklist.summary.pending = 24;
fs.writeFileSync(path, JSON.stringify(worklist, null, 2) + '\n');
console.log('Applied 36 Batch C decisions; 84 adjudicated / 24 pending.');

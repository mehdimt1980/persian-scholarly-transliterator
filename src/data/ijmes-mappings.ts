export const PERSIAN_CONSONANT_MAPPINGS: Readonly<Record<string, string>> = {
  'ب':'b','پ':'p','ت':'t','ث':'s','ج':'j','چ':'ch','ح':'ḥ','خ':'kh','د':'d','ذ':'z','ر':'r','ز':'z','ژ':'zh',
  'س':'s','ش':'sh','ص':'ṣ','ض':'ż','ط':'ṭ','ظ':'ẓ','ع':'ʿ','غ':'gh','ف':'f','ق':'q','ک':'k','گ':'g','ل':'l',
  'م':'m','ن':'n','و':'v','ه':'h','ۀ':'h','ی':'y','ء':'ʾ','أ':'ʾ','إ':'ʾ','ؤ':'ʾ','ئ':'ʾ'
};

export const PERSIAN_GUIDE_SPECIAL_RENDERINGS: Readonly<Record<string, string>> = {
  'ة': 'ih'
};

export function consonantalScaffold(word: string): string {
  return [...word].map((character) => character === 'ة' ? '[TM]' : PERSIAN_CONSONANT_MAPPINGS[character] ?? '·').join('');
}

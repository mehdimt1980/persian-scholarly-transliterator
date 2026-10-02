export function normalizePersian(input: string): string {
  return input.normalize('NFC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[\u200c\u200d]/g, '\u200c').replace(/[ \t\r\n]+/g, ' ');
}

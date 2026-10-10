import {describe,it,expect} from 'vitest';
import {constantTimePasswordMatch,issueReviewSession,verifyReviewSession} from './reviewAuth';
import {BSB_EDITORIAL_TRIAGE,triageFor} from './bsbEditorialTriage';

describe('Phase 8O secure review admission and triage',()=>{
  it('accepts a signed unexpired reviewer session; blocks altered, other-key, future, and expired signatures',()=>{
    const now=1_789_000_000_000,secret='correct-horse-battery-staple-strong-2026';
    const cookie=issueReviewSession(secret,now);
    expect(verifyReviewSession(cookie,secret,now+1000)).toBe(true);
    expect(verifyReviewSession(cookie,'completely-other-long-secret-string',now+1000)).toBe(false);
    expect(verifyReviewSession(cookie,secret,now+12*60*60*1000+1000)).toBe(false);
    expect(verifyReviewSession(cookie,secret,now-2*60*60*1000)).toBe(false);
    expect(verifyReviewSession(cookie.slice(0,-1)+'0',secret,now)).toBe(false);
    expect(verifyReviewSession('broken-session',secret,now)).toBe(false);
    expect(constantTimePasswordMatch(secret,secret)).toBe(true);
    expect(constantTimePasswordMatch('bad',secret)).toBe(false);
  });
  it('binds exactly 47 editorial, 23 specialist and 5 quick cases to unambiguous BSB candidate IDs',()=>{
    const all=Object.keys(BSB_EDITORIAL_TRIAGE);
    expect(all).toHaveLength(75);
    expect(new Set(all).size).toBe(75);
    expect(all.every(id=>/^lex-[a-f0-9]{20}$/u.test(id))).toBe(true);
    expect(all.filter(id=>triageFor(id).queue==='EDITORIAL')).toHaveLength(47);
    expect(all.filter(id=>triageFor(id).queue==='SPECIALIST')).toHaveLength(23);
    expect(all.filter(id=>triageFor(id).queue==='FAST')).toHaveLength(5);
    expect(all.filter(id=>triageFor(id).queue==='EDITORIAL').every(id=>triageFor(id).draft.length>2)).toBe(true);
    expect(all.filter(id=>triageFor(id).queue==='SPECIALIST').every(id=>triageFor(id).draft==='')).toBe(true);
    expect(triageFor('lex-74e5d7358e373dcf3900').draft).toContain('Adab-i Farsi');
    expect(triageFor('unseen').queue).toBe('SPECIALIST');
  });
});

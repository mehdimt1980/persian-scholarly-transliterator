'use client';
import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import type {ReviewCard,ReviewQueueData} from '../../server/review/reviewStore';
import styles from './review.module.css';

type Filter='ALL'|'EDITORIAL'|'SPECIALIST'|'FAST';
type StatusFilter='ALL'|'PENDING'|'DRAFT'|'ACCEPT'|'REJECT'|'DEFER';
type Submission='DRAFT'|'ACCEPT'|'REJECT'|'DEFER';
const groupLabels:Record<Filter,string>={
  ALL:'All candidates',EDITORIAL:'Editorial drafts',SPECIALIST:'Specialist review',FAST:'Quick checks',
};
const statusLabels:Record<StatusFilter,string>={
  ALL:'All decisions',PENDING:'Pending',DRAFT:'Draft saved',ACCEPT:'Approved review',REJECT:'Rejected',DEFER:'Deferred',
};
function safeBsbLink(url:string):boolean{
  try{const parsed=new URL(url);return parsed.protocol==='https:'&&parsed.hostname==='bsb.alma.exlibrisgroup.com';}
  catch{return false;}
}
function errorMessage(value:unknown):string{
  return value&&typeof value==='object'&&'error' in value&&typeof value.error==='string'?value.error:'Request failed';
}
async function jsonFetch(path:string,options?:RequestInit):Promise<unknown>{
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
  const data:unknown=await response.json().catch(()=>({error:'Invalid server response'}));
  if(!response.ok)throw new Error(errorMessage(data));
  return data;
}
export default function ReviewWorkbench(){
  const [auth,setAuth]=useState<'loading'|'locked'|'ready'>('loading');
  const [configured,setConfigured]=useState(true);
  const [password,setPassword]=useState('');
  const [queue,setQueue]=useState<ReviewQueueData|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [group,setGroup]=useState<Filter>('ALL');
  const [status,setStatus]=useState<StatusFilter>('ALL');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [canonical,setCanonical]=useState('');
  const [profile,setProfile]=useState<'ijmes_full'|'ijmes_title'>('ijmes_title');
  const [reviewer,setReviewer]=useState('');
  const [rationale,setRationale]=useState('');
  const [attest,setAttest]=useState(false);

  const reload=useCallback(async()=>{
    const data=await jsonFetch('/api/scholarly-review/queue') as ReviewQueueData;
    if(!data||!Array.isArray(data.items))throw new Error('Malformed review queue');
    setQueue(data);
    setSelectedId(current=>data.items.some(x=>x.candidateId===current)?current:data.items[0]?.candidateId??null);
  },[]);
  useEffect(()=>{
    let active=true;
    (async()=>{
      try{
        const s=await jsonFetch('/api/scholarly-review/session') as {authenticated:boolean;configured:boolean};
        if(!active)return;
        setConfigured(s.configured);
        setAuth(s.authenticated?'ready':'locked');
        if(s.authenticated){try{await reload();}catch(e){if(active)setError(e instanceof Error?e.message:'Unable to load review queue');}}
      }catch{if(active){setAuth('locked');setConfigured(false);}}
    })();
    return ()=>{active=false;};
  },[reload]);

  const selected=useMemo(()=>queue?.items.find(item=>item.candidateId===selectedId)??null,[queue,selectedId]);
  useEffect(()=>{
    if(!selected)return;
    setCanonical(selected.lastEvent?.canonical??selected.draft??'');
    setProfile(selected.lastEvent?.profile??(selected.category==='WORK_TITLE'?'ijmes_title':'ijmes_full'));
    setRationale(selected.lastEvent?.rationale??'');
    setAttest(false);
    setNotice(null);
  },[selected]);
  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase();
    return (queue?.items??[]).filter(item=>{
      if(group!=='ALL'&&item.queue!==group)return false;
      if(status!=='ALL'&&(item.lastEvent?.kind??'PENDING')!==status)return false;
      if(!needle)return true;
      return [item.persian,item.candidateId,item.category,item.sourceRecordId,item.draft,
        ...item.variants.map(v=>v.value)].some(s=>s.toLocaleLowerCase().includes(needle));
    });
  },[queue,query,group,status]);

  async function signIn(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError(null);
    try{
      await jsonFetch('/api/scholarly-review/session',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({password}),
      });
      setPassword('');setAuth('ready');await reload();
    }catch(e){setError(e instanceof Error?e.message:'Sign in failed');}
    finally{setBusy(false);}
  }
  async function logout(){
    try{await jsonFetch('/api/scholarly-review/session',{method:'DELETE'});}catch{/** Session expires regardless. */}
    setQueue(null);setSelectedId(null);setAuth('locked');setPassword('');setNotice(null);
  }
  async function save(kind:Submission){
    if(!selected||busy)return;
    if(kind==='ACCEPT'&&!attest){setError('You must personally verify the IJMES form before accepting.');return;}
    setBusy(true);setError(null);setNotice(null);
    try{
      await jsonFetch('/api/scholarly-review/decisions',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          candidateId:selected.candidateId,basisSha256:selected.basisSha256,kind,
          reviewerRef:reviewer||null,
          canonical:kind==='REJECT'||kind==='DEFER'?null:canonical||null,
          profile:kind==='ACCEPT'?profile:null,
          rationale:rationale||null,
          humanAttestation:kind==='ACCEPT'?'I_PERSONALLY_VERIFIED_THIS_IJMES_FORM':null,
        }),
      });
      await reload();
      setNotice(kind==='DRAFT'?'Draft saved to independent Staging review ledger.':
        'Human review decision recorded. No IJMES authority was published.');
    }catch(e){setError(e instanceof Error?e.message:'Review submission failed');}
    finally{setBusy(false);}
  }

  if(auth==='loading')return <section className={styles.center}><div className={styles.loading}>Checking reviewer access…</div></section>;
  if(auth==='locked')return <section className={styles.loginShell}>
    <div className={styles.loginVisual}>
      <p className={styles.kicker}>PERSIAN SCHOLARLY TRANSLITERATOR</p>
      <h1>Scholarly Review</h1>
      <p>Evidence first. Judgement second. Publication only with explicit scholarly approval.</p>
      <div className={styles.loginStats}><span>75 source-linked candidates</span><span>47 editorial · 23 specialist · 5 quick</span></div>
    </div>
    <form onSubmit={signIn} className={styles.loginCard}>
      <span className={styles.eyebrow}>PRIVATE REVIEW WORKSPACE</span>
      <h2>Reviewer access</h2>
      <p>Sign in to inspect Staging evidence and record review decisions. Catalogue data alone never becomes IJMES authority.</p>
      <label htmlFor="review-secret" className={styles.label}>Review passphrase</label>
      <input id="review-secret" type="password" autoComplete="current-password"
        value={password} onChange={e=>setPassword(e.target.value)}
        placeholder="Enter your review passphrase" className={styles.input} required/>
      {error&&<div role="alert" className={styles.error}>{error}</div>}
      {!configured&&<div role="status" className={styles.notice}>Server access is not configured. An administrator must configure the reviewer secret and Neon Staging connection.</div>}
      <button className={styles.primary} type="submit" disabled={busy||!configured}>{busy?'Opening…':'Open workbench →'}</button>
    </form>
  </section>;

  return <section className={styles.workbench}>
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}>PHASE 8O / HUMAN-GOVERNED EDITORIAL WORKFLOW</span>
      <h1>Scholarly Review</h1>
      <p>Review BSB evidence against IJMES. Drafts remain drafts until you explicitly verify them.</p></div>
      <button onClick={logout} className={styles.signout}>Sign out</button>
    </div>
    {error&&<div role="alert" className={styles.error}>{error}</div>}
    {notice&&<div role="status" className={styles.notice}>{notice}</div>}
    {!queue?<div className={styles.empty}>The verified Neon Staging review queue is unavailable. {error?'Check the server configuration.':'Loading records…'}
      <button className={styles.secondary} onClick={()=>void reload().catch(e=>setError(String(e)))}>Retry</button></div>:
    <>
      <div className={styles.metrics}>
        <div><strong>{queue.items.length}</strong><span>Source candidates</span></div>
        <div><strong>{queue.counts.PENDING}</strong><span>Pending</span></div>
        <div><strong>{queue.counts.DRAFT}</strong><span>Draft saved</span></div>
        <div><strong>{queue.counts.ACCEPT}</strong><span>Human review accepted</span></div>
        <div><strong>{queue.counts.DEFER+queue.counts.REJECT}</strong><span>Deferred / rejected</span></div>
      </div>
      <div className={styles.securityBar}><span>● Verified permanent Neon Staging · Evidence writes disabled</span>
        <span>Snapshot {queue.snapshotId}</span></div>
      <div className={styles.columns}>
        <aside className={styles.sidebar} aria-label="Candidate queue">
          <div className={styles.searchBox}><label htmlFor="review-search" className={styles.label}>Search candidates</label>
            <input className={styles.input} id="review-search" type="search" value={query}
              onChange={e=>setQuery(e.target.value)} placeholder="Persian, Latin, source ID…" /></div>
          <div className={styles.groupFilters} role="group" aria-label="Review queue">
            {(['ALL','FAST','EDITORIAL','SPECIALIST'] as Filter[]).map(value=><button key={value}
              className={group===value?styles.filterActive:styles.filter}
              onClick={()=>setGroup(value)}>{groupLabels[value]} <span>{value==='ALL'?75:queue.items.filter(i=>i.queue===value).length}</span></button>)}
          </div>
          <select className={styles.select} aria-label="Filter decisions" value={status}
            onChange={e=>setStatus(e.target.value as StatusFilter)}>
            {(['ALL','PENDING','DRAFT','ACCEPT','REJECT','DEFER'] as StatusFilter[]).map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}
          </select>
          <div className={styles.queueList}>
            {filtered.length===0?<p className={styles.small}>No cases match your filters.</p>:filtered.map(item=><button key={item.candidateId}
              className={selectedId===item.candidateId?styles.queueActive:styles.queueItem}
              onClick={()=>setSelectedId(item.candidateId)}>
              <span lang="fa" dir="rtl" className={styles.persianSmall}>{item.persian}</span>
              <span className={styles.queueMeta}>{item.category.replaceAll('_',' ').toLowerCase()} · {item.lastEvent?.kind??'PENDING'}</span>
            </button>)}
          </div>
          <p className={styles.small}>{filtered.length} of 75 cases shown · No bulk scholarly approval</p>
        </aside>
        <article className={styles.editor}>
          {selected?<div>
            <div className={styles.caseHeader}><div>
              <span className={styles.eyebrow}>CURRENT RECORD / {selected.queue==='FAST'?'QUICK CHECK':selected.queue==='EDITORIAL'?'EDITORIAL DRAFT':'SPECIALIST REVIEW'}</span>
              <h2 lang="fa" dir="rtl" className={styles.persianTitle}>{selected.persian}</h2>
              <p className={styles.caseId}>{selected.candidateId}</p>
              </div><span className={styles.statusBadge}>{selected.lastEvent?.kind??'PENDING'}</span></div>
            <div className={styles.evidenceGrid}>
              <div className={styles.evidencePanel}>
                <h3>Observed catalogue evidence <small>not IJMES authority</small></h3>
                {selected.variants.length?selected.variants.map((v,i)=><div className={styles.variant} key={i}>
                  <strong>{v.value}</strong><span>{v.classification.replaceAll('_',' ')} · {v.sourceField}</span></div>):
                  <p className={styles.small}>No Latin variant in BSB. Do not infer a verified reading.</p>}
              </div>
              <div className={styles.evidencePanel}>
                <h3>Source & provenance</h3>
                <p><b>MARC 001:</b> {selected.sourceRecordId}</p>
                <p><b>Category:</b> {selected.category.replaceAll('_',' ')}</p>
                <p><b>Fields:</b> {selected.providerFields.join(', ')||'Unavailable'}</p>
                {safeBsbLink(selected.sourceUrl)&&<a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Open BSB source ↗</a>}
              </div>
            </div>
            <section className={styles.reviewForm}>
              <div className={styles.formHeading}><div><span className={styles.eyebrow}>SCHOLARLY ADJUDICATION</span>
                <h3>Make a review decision</h3></div><span className={styles.small}>Review is not lexicon promotion.</span></div>
              {selected.queue==='SPECIALIST'&&<div className={styles.warning}>Identity, language or Persian–Latin alignment requires source-level specialist verification. Do not accept solely from the catalogue spelling.</div>}
              {selected.draft&&<p className={styles.draftHint}>AI editorial proposal — <strong>unreviewed</strong>; editing or saving a draft does not approve it.</p>}
              <label className={styles.label} htmlFor="review-canonical">Proposed IJMES canonical</label>
              <textarea className={styles.textarea} id="review-canonical" rows={2} spellCheck={false} value={canonical}
                onChange={e=>{setCanonical(e.target.value);setAttest(false);}}
                placeholder="Enter or correct the scholarly transliteration after consulting IJMES rules" />
              <div className={styles.twoFields}>
                <div><label className={styles.label} htmlFor="review-profile">Transliteration profile</label>
                  <select className={styles.select} value={profile} id="review-profile" onChange={e=>setProfile(e.target.value as typeof profile)}>
                    <option value="ijmes_title">IJMES titles and proper names</option><option value="ijmes_full">IJMES full scholarly</option>
                  </select></div>
                <div><label className={styles.label} htmlFor="reviewer-id">Reviewer reference</label>
                  <input className={styles.input} id="reviewer-id" value={reviewer}
                    onChange={e=>setReviewer(e.target.value)} placeholder="Your reviewer ID" maxLength={200}/></div>
              </div>
              <label className={styles.label} htmlFor="review-rationale">Scholarly rationale</label>
              <textarea className={styles.textarea} id="review-rationale" rows={3} value={rationale}
                onChange={e=>setRationale(e.target.value)}
                placeholder="Explain your source check, IJMES choice, uncertainty or reason to defer / reject" maxLength={4000}/>
              <label className={styles.checkbox}><input type="checkbox" checked={attest} onChange={e=>setAttest(e.target.checked)}/>
                I personally verified this exact IJMES form against the Persian evidence and relevant editorial rules.</label>
              <div className={styles.actions}>
                <button disabled={busy} className={styles.secondary} onClick={()=>void save('DRAFT')}>Save draft</button>
                <button disabled={busy} className={styles.primary} onClick={()=>void save('ACCEPT')}>Accept review</button>
                <button disabled={busy} className={styles.secondary} onClick={()=>void save('DEFER')}>Defer</button>
                <button disabled={busy} className={styles.danger} onClick={()=>void save('REJECT')}>Reject</button>
              </div>
              {selected.lastEvent&&<p className={styles.lastEvent}>Latest recorded event: {selected.lastEvent.kind}
                {selected.lastEvent.reviewerRef?' · '+selected.lastEvent.reviewerRef:''}
                {selected.lastEvent.reviewedAt?' · '+selected.lastEvent.reviewedAt:''}. Earlier versions remain in the append-only audit ledger.</p>}
            </section>
          </div>:<p>Select a candidate to start review.</p>}
        </article>
      </div>
      <p className={styles.disclaimer}>Scientific caveat: an ACCEPT records a reviewer-declared judgement, not an automatic IJMES certification. Nothing in this workspace modifies the BSB evidence snapshot or publishes a Gold lexicon entry. Reviewer identity is not independently verified by the shared passphrase.</p>
    </>}
  </section>;
}

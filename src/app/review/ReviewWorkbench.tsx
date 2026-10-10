'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import type {ReviewCard,ReviewQueueData} from '../../server/review/reviewStore';
import styles from './review.module.css';
import {PRIMARY_REVIEWER_REF,proposeEvidenceRationale,suggestedIjmesProfile} from '../../server/review/reviewAssistance';
import type {LexicalCandidateCategory} from '../../validation/lexical-evidence/types';

type Filter='ALL'|'EDITORIAL'|'SPECIALIST'|'FAST'|'NEW';
type StatusFilter='ALL'|'PENDING'|'DRAFT'|'ACCEPT'|'REJECT'|'DEFER';
type Submission='DRAFT'|'ACCEPT'|'REJECT'|'DEFER';
const groupLabels:Record<Filter,string>={
  ALL:'All candidates',EDITORIAL:'Editorial drafts',SPECIALIST:'Specialist review',FAST:'Quick checks',NEW:'New BSB evidence',
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
  const [page,setPage]=useState(1);
  const [status,setStatus]=useState<StatusFilter>('ALL');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [canonical,setCanonical]=useState('');
  const [profile,setProfile]=useState<'ijmes_full'|'ijmes_title'>('ijmes_title');
  const [assisting,setAssisting]=useState(false);
  const [rationaleSource,setRationaleSource]=useState<'TEMPLATE'|'AI'|'HUMAN'|'SAVED'>('TEMPLATE');
  const activeCandidateRef=useRef<string|null>(null);
  const rationaleVersionRef=useRef(0);
  const [rationale,setRationale]=useState('');
  const [attest,setAttest]=useState(false);

  const reload=useCallback(async(nextPage=1,nextGroup:Filter='ALL',nextStatus:StatusFilter='ALL',nextSearch='')=>{
    const qp=new URLSearchParams({page:String(nextPage),pageSize:'25',group:nextGroup,status:nextStatus,search:nextSearch});
    const data=await jsonFetch('/api/scholarly-review/queue?'+qp.toString()) as ReviewQueueData;
    if(!data||!Array.isArray(data.items))throw new Error('Malformed review queue');
    setQueue(data);
    setPage(nextPage);
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
    const defaultProfile=selected.lastEvent?.profile??suggestedIjmesProfile(selected.category as LexicalCandidateCategory);
    setProfile(defaultProfile);
    setRationale(selected.lastEvent?.rationale??proposeEvidenceRationale({
      candidateId:selected.candidateId,persian:selected.persian,
      category:selected.category as LexicalCandidateCategory,sourceRecordId:selected.sourceRecordId,
      variants:selected.variants,
    },selected.lastEvent?.canonical??selected.draft??'',defaultProfile));
    setRationaleSource(selected.lastEvent?.rationale?'SAVED':'TEMPLATE');
    activeCandidateRef.current=selected.candidateId;
    rationaleVersionRef.current++;
    setAttest(false);
    setNotice(null);
  },[selected]);
  function changedProposal(nextCanonical:string,nextProfile:'ijmes_full'|'ijmes_title'){
    setCanonical(nextCanonical);setProfile(nextProfile);setAttest(false);
    rationaleVersionRef.current++;
    // A rationale generated for another spelling/profile is stale; never leave it as current AI advice.
    if(selected&&(rationaleSource==='TEMPLATE'||rationaleSource==='AI')){
      setRationale(proposeEvidenceRationale({
        candidateId:selected.candidateId,persian:selected.persian,
        category:selected.category as LexicalCandidateCategory,
        sourceRecordId:selected.sourceRecordId,variants:selected.variants,
      },nextCanonical,nextProfile));
      setRationaleSource('TEMPLATE');
    }
  }
  const filtered=queue?.items??[];
  function goPage(nextPage:number){
    setError(null);void reload(nextPage,group,status,query).catch(e=>setError(e instanceof Error?e.message:'Unable to load page'));
  }
  function chooseGroup(value:Filter){setGroup(value);setError(null);
    void reload(1,value,status,query).catch(e=>setError(e instanceof Error?e.message:'Unable to filter queue'));}
  function chooseStatus(value:StatusFilter){setStatus(value);setError(null);
    void reload(1,group,value,query).catch(e=>setError(e instanceof Error?e.message:'Unable to filter queue'));}
  function searchQueue(event:FormEvent<HTMLFormElement>){event.preventDefault();setError(null);
    void reload(1,group,status,query).catch(e=>setError(e instanceof Error?e.message:'Search failed'));}

  async function generateRationale(){
    if(!selected||busy||assisting)return;
    const candidateId=selected.candidateId;
    const revision=rationaleVersionRef.current;
    setAssisting(true);setError(null);
    try{
      const response=await jsonFetch('/api/scholarly-review/rationale',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({candidateId,basisSha256:selected.basisSha256,canonical,profile}),
      }) as {rationale:string;mode:'SOURCE_GROUNDED_TEMPLATE'|'AI_SUGGESTION_UNVERIFIED'};
      if(activeCandidateRef.current!==candidateId||rationaleVersionRef.current!==revision)return;
      setRationale(response.rationale);
      setRationaleSource(response.mode==='AI_SUGGESTION_UNVERIFIED'?'AI':'TEMPLATE');
      setAttest(false);
      rationaleVersionRef.current++;
    }catch(e){if(activeCandidateRef.current===candidateId)setError(e instanceof Error?e.message:'Review assistance unavailable');}
    finally{setAssisting(false);}
  }
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
          // Sole reviewer ID is set by the authenticated server; client cannot impersonate it.
          canonical:kind==='REJECT'||kind==='DEFER'?null:canonical||null,
          profile:kind==='ACCEPT'?profile:null,
          rationale:rationale||null,
          humanAttestation:kind==='ACCEPT'?'I_PERSONALLY_VERIFIED_THIS_IJMES_FORM':null,
        }),
      });
      await reload(page,group,status,query);
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
      <div className={styles.loginStats}><span>Source-linked BSB evidence · scalable review</span><span>47 editorial · 23 specialist · 5 quick · new arrivals</span></div>
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
        <div><strong>{queue.total}</strong><span>Source candidates</span></div>
        <div><strong>{queue.counts.PENDING}</strong><span>Pending</span></div>
        <div><strong>{queue.counts.DRAFT}</strong><span>Draft saved</span></div>
        <div><strong>{queue.counts.ACCEPT}</strong><span>Human review accepted</span></div>
        <div><strong>{queue.counts.DEFER+queue.counts.REJECT}</strong><span>Deferred / rejected</span></div>
      </div>
      <div className={styles.securityBar}><span>● Verified permanent Neon Staging · Evidence writes disabled</span>
        <span>Snapshot {queue.snapshotId}</span></div>
      <div className={styles.columns}>
        <aside className={styles.sidebar} aria-label="Candidate queue">
          <form onSubmit={searchQueue} className={styles.searchBox}><label htmlFor="review-search" className={styles.label}>Search candidates</label>
            <input className={styles.input} id="review-search" type="search" value={query}
              onChange={e=>setQuery(e.target.value)} placeholder="Persian, Latin, source ID…" />
            <button type="submit" className={styles.secondary}>Search all records</button></form>
          <div className={styles.groupFilters} role="group" aria-label="Review queue">
            {(['ALL','FAST','EDITORIAL','SPECIALIST','NEW'] as Filter[]).map(value=><button key={value}
              className={group===value?styles.filterActive:styles.filter}
              onClick={()=>chooseGroup(value)}>{groupLabels[value]} <span>{queue.groupTotals[value]}</span></button>)}
          </div>
          <select className={styles.select} aria-label="Filter decisions" value={status}
            onChange={e=>chooseStatus(e.target.value as StatusFilter)}>
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
          <div className={styles.pagination}><p className={styles.small}>Page {page} / {Math.max(1,queue.pageCount)} · {queue.filteredTotal} matches</p>
            <div><button className={styles.secondary} disabled={page<=1} onClick={()=>goPage(page-1)}>← Previous</button>
            <button className={styles.secondary} disabled={page>=queue.pageCount} onClick={()=>goPage(page+1)}>Next →</button></div></div>
          <p className={styles.small}>No bulk scholarly approval · {queue.total} evidence items</p>
        </aside>
        <article className={styles.editor}>
          {selected?<div>
            <div className={styles.caseHeader}><div>
              <span className={styles.eyebrow}>CURRENT RECORD / {selected.queue==='FAST'?'QUICK CHECK':selected.queue==='EDITORIAL'?'EDITORIAL DRAFT':selected.queue==='NEW'?'NEW EVIDENCE':'SPECIALIST REVIEW'}</span>
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
              {(selected.queue==='SPECIALIST'||selected.queue==='NEW')&&<div className={styles.warning}>Identity, language or Persian–Latin alignment requires source-level specialist verification. Do not accept solely from the catalogue spelling.</div>}
              {selected.draft&&<p className={styles.draftHint}>AI editorial proposal — <strong>unreviewed</strong>; editing or saving a draft does not approve it.</p>}
              <label className={styles.label} htmlFor="review-canonical">Proposed IJMES canonical</label>
              <textarea className={styles.textarea} id="review-canonical" rows={2} spellCheck={false} value={canonical}
                onChange={e=>changedProposal(e.target.value,profile)}
                placeholder="Enter or correct the scholarly transliteration after consulting IJMES rules" />
              <div className={styles.twoFields}>
                <div><label className={styles.label} htmlFor="review-profile">Transliteration profile</label>
                  <select className={styles.select} value={profile} id="review-profile" onChange={e=>changedProposal(canonical,e.target.value as typeof profile)}>
                    <option value="ijmes_title">IJMES titles and proper names</option><option value="ijmes_full">IJMES full scholarly</option>
                  </select></div>
                <div><label className={styles.label} htmlFor="reviewer-id">Reviewer reference · automatic</label>
                  <input className={styles.input} id="reviewer-id" value={PRIMARY_REVIEWER_REF}
                    readOnly aria-readonly="true" title="Assigned by the authenticated server, not an independently verified identity"/></div>
              </div>
              <div className={styles.rationaleHeader}>
                <label className={styles.label} htmlFor="review-rationale">Scholarly rationale</label>
                <button className={styles.secondary} type="button" disabled={busy||assisting}
                  onClick={()=>void generateRationale()}>{assisting?'Generating…':'Suggest rationale with AI'}</button>
              </div>
              <textarea className={styles.textarea} id="review-rationale" rows={4} value={rationale}
                onChange={e=>{setRationale(e.target.value);setRationaleSource('HUMAN');setAttest(false);rationaleVersionRef.current++;}}
                placeholder="Describe what you verified in the source, and why the IJMES spelling is justified" maxLength={4000}/>
              <p className={styles.rationaleNotice}>⚑ {rationaleSource==='AI'?'AI-generated, unverified suggestion':rationaleSource==='TEMPLATE'?'Source-grounded editorial checklist (no model inference)':rationaleSource==='HUMAN'?'Edited by reviewer':'Previously saved rationale'}. Never an automatic scholarly approval. Review the Persian and source evidence, then edit this explanation to record your actual findings.</p>
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

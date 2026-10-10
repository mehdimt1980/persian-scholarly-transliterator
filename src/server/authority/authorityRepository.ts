import type { PublishedAuthoritySnapshot } from '../../domain/authority/types';
import { authorizePublication, rollbackAuthority, withdrawAuthority,
  type AuthorityPublicationEvent, type AuthorityPublicationPreview, type PublicationAuthorization } from './authorityPublication';

export interface AuthorityRepositoryState {
  activeSnapshotId: string;
  snapshots: Map<string,PublishedAuthoritySnapshot>;
  events: AuthorityPublicationEvent[];
}
export interface AuthorityRepository {
  transaction<T>(operation:(state:AuthorityRepositoryState)=>T|Promise<T>):Promise<T>;
  read():Promise<AuthorityRepositoryState>;
}
function cloneState(state:AuthorityRepositoryState):AuthorityRepositoryState{
  return {activeSnapshotId:state.activeSnapshotId,
    snapshots:new Map([...state.snapshots].map(([id,s])=>[id,structuredClone(s)])),
    events:structuredClone(state.events)};
}
export class MemoryAuthorityRepository implements AuthorityRepository{
  private state:AuthorityRepositoryState; private queue:Promise<unknown>=Promise.resolve();
  constructor(initial:PublishedAuthoritySnapshot){this.state={activeSnapshotId:initial.snapshotId,
    snapshots:new Map([[initial.snapshotId,structuredClone(initial)]]),events:[]};}
  async read(){return cloneState(this.state);}
  async transaction<T>(operation:(state:AuthorityRepositoryState)=>T|Promise<T>):Promise<T>{
    const run=this.queue.then(async()=>{const draft=cloneState(this.state);const result=await operation(draft);this.state=draft;return result;});
    this.queue=run.then(()=>undefined,()=>undefined);return run;
  }
}
export async function publishAuthorizedAuthority(repository:AuthorityRepository,preview:AuthorityPublicationPreview,
  authorization:PublicationAuthorization,publishedAt:string):Promise<PublishedAuthoritySnapshot>{
  return repository.transaction(state=>{const active=state.snapshots.get(state.activeSnapshotId);
    if(!active)throw new Error('ACTIVE_AUTHORITY_SNAPSHOT_MISSING');
    const result=authorizePublication(preview,authorization,publishedAt,active);
    if(result.event){state.snapshots.set(result.snapshot.snapshotId,result.snapshot);state.activeSnapshotId=result.snapshot.snapshotId;
      state.events.push(result.event);}return result.snapshot;});
}
export async function withdrawPublishedAuthority(repository:AuthorityRepository,entryId:string,
  authorization:PublicationAuthorization,at:string,reason:string):Promise<PublishedAuthoritySnapshot>{
  return repository.transaction(state=>{const active=state.snapshots.get(state.activeSnapshotId);
    if(!active)throw new Error('ACTIVE_AUTHORITY_SNAPSHOT_MISSING');const result=withdrawAuthority(active,entryId,authorization,at,reason);
    state.snapshots.set(result.snapshot.snapshotId,result.snapshot);state.activeSnapshotId=result.snapshot.snapshotId;
    state.events.push(result.event);return result.snapshot;});
}
export async function rollbackPublishedAuthority(repository:AuthorityRepository,targetSnapshotId:string,
  authorization:PublicationAuthorization,at:string,reason:string):Promise<PublishedAuthoritySnapshot>{
  return repository.transaction(state=>{const active=state.snapshots.get(state.activeSnapshotId),target=state.snapshots.get(targetSnapshotId);
    if(!active||!target)throw new Error('AUTHORITY_ROLLBACK_SNAPSHOT_MISSING');const result=rollbackAuthority(active,target,authorization,at,reason);
    state.snapshots.set(result.snapshot.snapshotId,result.snapshot);state.activeSnapshotId=result.snapshot.snapshotId;
    state.events.push(result.event);return result.snapshot;});
}

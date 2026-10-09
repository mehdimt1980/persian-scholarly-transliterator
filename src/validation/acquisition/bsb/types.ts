export interface MarcSubfield { code: string; value: string }
export interface MarcDataField { tag: string; ind1: string; ind2: string; subfields: MarcSubfield[] }
export interface MarcRecord { leader: string; controlfields: Array<{ tag: string; value: string }>; datafields: MarcDataField[]; rawXml: string }
export interface SruPage { version: string; numberOfRecords: number; nextRecordPosition: number | null; records: MarcRecord[] }
export interface BsbRequestLog { url: string; startedAt: string; endedAt: string; status: number | null; outcome: 'SUCCESS' | 'HTTP_ERROR' | 'TIMEOUT_OR_NETWORK_ERROR'; recordsReceived: number }

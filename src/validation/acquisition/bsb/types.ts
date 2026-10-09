export interface MarcSubfield { namespaceUri: string; code: string; value: string }
export interface MarcDataField { namespaceUri: string; tag: string; ind1: string; ind2: string; subfields: MarcSubfield[] }
export interface MarcRecord { namespaceUri: string; leader: string; controlfields: Array<{ tag: string; value: string }>; datafields: MarcDataField[]; rawXml: string }
export interface SruDiagnostic { uri: string; message: string; details: string }
export interface SruPage { version: string; numberOfRecords: number; nextRecordPosition: number | null; recordPositions: number[]; records: MarcRecord[]; diagnostics: SruDiagnostic[] }
export interface BsbRequestLog { url: string; startedAt: string; endedAt: string; status: number | null; outcome: 'SUCCESS' | 'HTTP_ERROR' | 'SRU_DIAGNOSTIC' | 'TIMEOUT_OR_NETWORK_ERROR'; recordsReceived: number }

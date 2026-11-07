export interface DiagramApi {
  getGraph(): any;
  getJoint(): any;
  createUmlClass(payload: any, remote?: boolean): any;
  buildLinkForRemote?(sourceId?: string, targetId?: string): any;
  createRelationship?(sourceId: string, targetId: string, remote?: boolean): any;
  createTypedRelationship?(sourceId: string, targetId: string, type: string, remote?: boolean, linkId?: string): any;
  getEdition?(): any;
  getPaper?(): any;
  loadFromJson(json: any, isSync?: boolean): void;
  exportToJson(): any;
  persist?(immediate?: boolean): void;
}

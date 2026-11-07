import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EMPTY, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class BackupService {
  constructor(private http: HttpClient) {}

    setBackupUml(roomId: string, umlJson: any): Observable<any> {
        if (!umlJson || !Array.isArray(umlJson.classes) || !Array.isArray(umlJson.relationships)) {
            console.warn('[BackupService] JSON inválido, no se enviará');
            return EMPTY;
        }

        // Permitimos enviar diagramas con 0 clases para que PostgreSQL registre fielmente el vaciado del lienzo
        const url = `${environment.endpoint_python}api/set_backup_uml/${roomId}/`;
        return this.http.post(url, umlJson);
    }
  getBackup(roomId: string): Observable<any> {
    const url = `${environment.endpoint_python}api/get_backup_uml/${roomId}/`;
    return this.http.get(url);
  }
}

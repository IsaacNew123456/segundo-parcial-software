import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  public isLoading = signal<boolean>(false);
  public lastMessage = signal<string | null>(null);

  constructor(private http: HttpClient) {}

  generateDiagram(prompt: string, currentDiagram?: any): Observable<any> {
    return this.http.post<any>(`${environment.endpoint_python}api/chatbot/`, {
      prompt,
      currentDiagram
    });
  }

  generateFromImage(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post<any>(`${environment.endpoint_python}api/uml_from_image/`, formData);
  }
}

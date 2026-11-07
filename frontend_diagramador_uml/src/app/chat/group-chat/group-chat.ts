import { Component, Input, OnInit, OnDestroy, inject, signal, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatSocketService } from '../../../services/chat/chat-socket.service';
import { ProjectService, ChatMessage } from '../../../services/project/project.service';
import { AuthService } from '../../../services/auth/auth.service';

@Component({
  selector: 'app-group-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './group-chat.html'
})
export class GroupChat implements OnInit, OnDestroy, AfterViewChecked {
  @Input({ required: true }) projectId!: number;
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;

  public chatSocket = inject(ChatSocketService);
  public projectService = inject(ProjectService);
  public authService = inject(AuthService);

  messageText = signal<string>('');
  private shouldScrollBottom = false;

  ngOnInit(): void {
    if (this.projectId) {
      // 1. Cargar historial persistido de mensajes
      this.projectService.getMessages(this.projectId).subscribe({
        next: (history) => {
          this.chatSocket.setInitialMessages(history);
          this.scrollToBottom();
        },
        error: (err) => console.warn('[GroupChat] Error cargando historial:', err)
      });

      // 2. Conectar al canal WebSocket en tiempo real
      this.chatSocket.connect(this.projectId);
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollBottom) {
      this.scrollToBottom();
      this.shouldScrollBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.chatSocket.disconnect();
  }

  sendMessage(): void {
    const text = this.messageText().trim();
    if (!text) return;

    this.chatSocket.sendMessage(text);
    this.messageText.set('');
    this.shouldScrollBottom = true;
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer?.nativeElement) {
        this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }
}

class ChatMessageModel {
  final int id;
  final int projectId;
  final int? authorId;
  final String authorName;
  final String authorType; // 'user' or 'ai'
  final String content;
  final String intent;
  final DateTime createdAt;

  ChatMessageModel({
    required this.id,
    required this.projectId,
    this.authorId,
    required this.authorName,
    required this.authorType,
    required this.content,
    required this.intent,
    required this.createdAt,
  });

  factory ChatMessageModel.fromJson(Map<String, dynamic> json) {
    return ChatMessageModel(
      id: json['id'] ?? 0,
      projectId: json['project_id'] ?? 0,
      authorId: json['author_id'],
      authorName: json['author_name'] ?? 'Usuario',
      authorType: json['author_type'] ?? 'user',
      content: json['content'] ?? '',
      intent: json['intent'] ?? 'chat',
      createdAt: json['created_at'] != null 
          ? DateTime.tryParse(json['created_at']) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

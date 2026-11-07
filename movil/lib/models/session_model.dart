class SessionModel {
  final int id;
  final int projectId;
  final DateTime startedAt;
  final DateTime? endedAt;
  final bool isActive;
  final String summary;
  final int eventsCount;
  final int messagesCount;
  final int durationMinutes;
  final Map<String, dynamic>? snapshot;

  SessionModel({
    required this.id,
    required this.projectId,
    required this.startedAt,
    this.endedAt,
    required this.isActive,
    required this.summary,
    required this.eventsCount,
    required this.messagesCount,
    required this.durationMinutes,
    this.snapshot,
  });

  factory SessionModel.fromJson(Map<String, dynamic> json) {
    return SessionModel(
      id: json['id'] ?? 0,
      projectId: json['project'] ?? 0,
      startedAt: json['started_at'] != null
          ? DateTime.parse(json['started_at'])
          : DateTime.now(),
      endedAt: json['ended_at'] != null ? DateTime.parse(json['ended_at']) : null,
      isActive: json['is_active'] ?? false,
      summary: json['summary'] ?? '',
      eventsCount: json['events_count'] ?? 0,
      messagesCount: json['messages_count'] ?? 0,
      durationMinutes: json['duration_minutes'] ?? 0,
      snapshot: json['snapshot'] is Map<String, dynamic> ? json['snapshot'] : null,
    );
  }
}

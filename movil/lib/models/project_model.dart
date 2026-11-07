class ProjectModel {
  final int id;
  final String nombre;
  final String roomId;
  final String myRole; // 'designer', 'collaborator', 'viewer'
  final int membersCount;
  final String createdAt;

  ProjectModel({
    required this.id,
    required this.nombre,
    required this.roomId,
    required this.myRole,
    required this.membersCount,
    required this.createdAt,
  });

  factory ProjectModel.fromJson(Map<String, dynamic> json) {
    return ProjectModel(
      id: json['id'] ?? 0,
      nombre: json['nombre'] ?? '',
      roomId: json['room_id'] ?? '',
      myRole: json['my_role'] ?? 'viewer',
      membersCount: json['members_count'] ?? 1,
      createdAt: json['created_at'] ?? '',
    );
  }
}

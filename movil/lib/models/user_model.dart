class UserModel {
  final int id;
  final String email;
  final String nombre;
  final String username;

  UserModel({
    required this.id,
    required this.email,
    required this.nombre,
    required this.username,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] ?? 0,
      email: json['email'] ?? '',
      nombre: json['nombre'] ?? json['first_name'] ?? json['username'] ?? '',
      username: json['username'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'nombre': nombre,
      'username': username,
    };
  }
}

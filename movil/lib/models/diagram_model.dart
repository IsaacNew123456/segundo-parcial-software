class UmlClassModel {
  final String id;
  final String name;
  final List<String> attributes;
  final List<String> methods;
  final double x;
  final double y;
  final double width;
  final double height;

  UmlClassModel({
    required this.id,
    required this.name,
    required this.attributes,
    required this.methods,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  factory UmlClassModel.fromJson(Map<String, dynamic> json) {
    // Parser flexible para adaptarse a formatos JointJS y JSON canónico
    final position = json['position'] as Map<String, dynamic>?;
    final size = json['size'] as Map<String, dynamic>?;

    final xVal = (position?['x'] ?? json['x'] ?? 50).toDouble();
    final yVal = (position?['y'] ?? json['y'] ?? 50).toDouble();
    final wVal = (size?['width'] ?? json['width'] ?? 160).toDouble();
    final hVal = (size?['height'] ?? json['height'] ?? 120).toDouble();

    List<String> parseList(dynamic val) {
      if (val is List) {
        return val.map((e) => e.toString()).toList();
      } else if (val is String) {
        return val.split('\n').where((s) => s.trim().isNotEmpty).toList();
      }
      return [];
    }

    return UmlClassModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? json['header']?.toString() ?? 'Clase',
      attributes: parseList(json['attributes']),
      methods: parseList(json['methods']),
      x: xVal,
      y: yVal,
      width: wVal,
      height: hVal,
    );
  }
}

class UmlRelationshipModel {
  final String id;
  final String type; // association, inheritance, aggregation, composition, dependency
  final String sourceId;
  final String targetId;
  final String? multiplicitySource;
  final String? multiplicityTarget;

  UmlRelationshipModel({
    required this.id,
    required this.type,
    required this.sourceId,
    required this.targetId,
    this.multiplicitySource,
    this.multiplicityTarget,
  });

  factory UmlRelationshipModel.fromJson(Map<String, dynamic> json) {
    String extractId(dynamic val) {
      if (val is Map) return val['id']?.toString() ?? '';
      return val?.toString() ?? '';
    }

    final sId = extractId(json['source'] ?? json['sourceId']);
    final tId = extractId(json['target'] ?? json['targetId']);

    return UmlRelationshipModel(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? json['relationType']?.toString() ?? 'association',
      sourceId: sId,
      targetId: tId,
      multiplicitySource: json['multiplicitySource']?.toString(),
      multiplicityTarget: json['multiplicityTarget']?.toString(),
    );
  }
}

class UmlDiagramModel {
  final List<UmlClassModel> classes;
  final List<UmlRelationshipModel> relationships;

  UmlDiagramModel({
    required this.classes,
    required this.relationships,
  });

  factory UmlDiagramModel.fromJson(Map<String, dynamic> json) {
    // Si viene anidado en 'data', desenvolverlo
    var rawMap = json;
    if (json.containsKey('data') && json['data'] is Map<String, dynamic>) {
      rawMap = json['data'] as Map<String, dynamic>;
    }

    final rawClasses = rawMap['classes'] as List? ?? [];
    final rawRels = rawMap['relationships'] as List? ?? [];

    return UmlDiagramModel(
      classes: rawClasses.map((c) => UmlClassModel.fromJson(c as Map<String, dynamic>)).toList(),
      relationships: rawRels.map((r) => UmlRelationshipModel.fromJson(r as Map<String, dynamic>)).toList(),
    );
  }
}

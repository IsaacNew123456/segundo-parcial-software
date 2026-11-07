package generator_uml.back_generator_uml.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import generator_uml.back_generator_uml.entity.UmlAttribute;
import generator_uml.back_generator_uml.entity.UmlClass;
import generator_uml.back_generator_uml.entity.UmlSchema;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class PostmanCollectionGenerator {

    private final ObjectMapper objectMapper = new ObjectMapper();

    public Path generatePostmanCollection(UmlSchema schema, String baseUrl, String artifactId) throws IOException {
        schema = JsonNormalizer.normalize(schema);

        ObjectNode collection = objectMapper.createObjectNode();
        ObjectNode info = collection.putObject("info");
        info.put("name", artifactId + " API Collection");
        info.put("description", "Colección generada automáticamente para " + artifactId);
        info.put("schema", "https://schema.getpostman.com/json/collection/v2.1.0/collection.json");

        // ✅ variable de entorno baseUrl
        ArrayNode variable = collection.putArray("variable");
        ObjectNode baseVar = variable.addObject();
        baseVar.put("key", "baseUrl");
        baseVar.put("value", baseUrl);
        baseVar.put("type", "string");

        ArrayNode items = collection.putArray("item");

        // ====== DETECTAR ENTIDADES INTERMEDIAS PARA MANYTOMANY ======
        Set<String> intermediateEntities = new HashSet<>();
        if (schema.getRelationships() != null) {
            for (var rel : schema.getRelationships()) {
                if ("association".equals(rel.getType())
                        || "aggregation".equals(rel.getType())
                        || "composition".equals(rel.getType())
                        || "dependency".equals(rel.getType())) {
                    
                    String sourceName = findClassNameById(schema, rel.getSourceId());
                    String targetName = findClassNameById(schema, rel.getTargetId());

                    if (sourceName == null || targetName == null) continue;

                    List<String> labels = rel.getLabels();
                    String sourceCard = (labels != null && !labels.isEmpty() && labels.get(0) != null) ? labels.get(0).trim() : "";
                    String targetCard = (labels != null && labels.size() > 1 && labels.get(1) != null) ? labels.get(1).trim() : "";

                    if (sourceCard.isEmpty() && "dependency".equals(rel.getType())) {
                        sourceCard = "*";
                        targetCard = "1";
                    }

                    boolean sourceIsMany = sourceCard.contains("*");
                    boolean targetIsMany = targetCard.contains("*");

                    // Si es ManyToMany, registrar la entidad intermedia
                    if (sourceIsMany && targetIsMany) {
                        String sourceEntity = NamingUtil.toJavaClass(sourceName);
                        String targetEntity = NamingUtil.toJavaClass(targetName);
                        
                        // Ordenar alfabéticamente para consistencia
                        String firstEntity = sourceEntity.compareTo(targetEntity) < 0 ? sourceEntity : targetEntity;
                        String secondEntity = sourceEntity.compareTo(targetEntity) < 0 ? targetEntity : sourceEntity;
                        
                        String intermediateEntityName = firstEntity + secondEntity;
                        intermediateEntities.add(intermediateEntityName);
                    }
                }
            }
        }

        for (UmlClass c : schema.getClasses()) {
            String entityName = NamingUtil.toJavaClass(c.getName());
            String pluralName = entityName.toLowerCase();

            ObjectNode folder = objectMapper.createObjectNode();
            folder.put("name", entityName);
            ArrayNode folderItems = folder.putArray("item");

            // Detectar PK considerando herencia
            String pkType = "String";
            String pkName = "id";
            
            // Detectar si tiene padre (herencia)
            String parentClassName = null;
            if (schema.getRelationships() != null) {
                for (var rel : schema.getRelationships()) {
                    if (rel != null && "generalization".equals(rel.getType()) && c.getId().equals(rel.getSourceId())) {
                        parentClassName = findClassNameById(schema, rel.getTargetId());
                        break;
                    }
                }
            }
            
            // Si tiene padre, buscar PK en el padre
            if (parentClassName != null) {
                final String finalParentClassName = parentClassName;
                UmlClass parent = schema.getClasses().stream()
                        .filter(pc -> pc != null && pc.getName() != null && pc.getName().equals(finalParentClassName))
                        .findFirst().orElse(null);
                
                if (parent != null) {
                    UmlAttribute parentPkAttr = ProjectGenerator.findPrimaryKeyAttribute(parent);
                    if (parentPkAttr != null && parentPkAttr.getName() != null) {
                        pkName = NamingUtil.toField(parentPkAttr.getName());
                        pkType = TypeMapper.toJava(parentPkAttr.getType());
                    }
                }
            } else if (c.getAttributes() != null && !c.getAttributes().isEmpty()) {
                UmlAttribute pkAttr = ProjectGenerator.findPrimaryKeyAttribute(c);
                if (pkAttr != null && pkAttr.getName() != null) {
                    pkName = NamingUtil.toField(pkAttr.getName());
                    pkType = TypeMapper.toJava(pkAttr.getType());
                }
            }

            // GET All
            folderItems.add(createGetAllRequest(entityName, pluralName));

            // GET One
            folderItems.add(createGetOneRequest(entityName, pluralName, pkType));

            // POST Create
            folderItems.add(createPostRequest(entityName, pluralName, c, schema));


            // PUT Update
            folderItems.add(createPutRequest(entityName, pluralName, c, schema, pkType, pkName));

            // DELETE
            folderItems.add(createDeleteRequest(entityName, pluralName, pkType));

            items.add(folder);
        }

        // ====== GENERAR CARPETAS PARA ENTIDADES INTERMEDIAS (MANYTOMANY) ======
        for (String intermediateEntityName : intermediateEntities) {
            String pluralName = intermediateEntityName.toLowerCase();
            
            ObjectNode folder = objectMapper.createObjectNode();
            folder.put("name", intermediateEntityName + " (Relación)");
            ArrayNode folderItems = folder.putArray("item");

            // Las entidades intermedias siempre tienen Long id autogenerado
            String pkType = "Long";

            // GET All
            folderItems.add(createGetAllRequest(intermediateEntityName, pluralName));

            // GET One
            folderItems.add(createGetOneRequest(intermediateEntityName, pluralName, pkType));

            // POST Create (sin clase UmlClass, generamos body manualmente)
            folderItems.add(createIntermediateEntityPostRequest(intermediateEntityName, pluralName, schema));

            // PUT Update
            folderItems.add(createIntermediateEntityPutRequest(intermediateEntityName, pluralName, schema, pkType));

            // DELETE
            folderItems.add(createDeleteRequest(intermediateEntityName, pluralName, pkType));

            items.add(folder);
        }

        Path outputPath = Files.createTempFile(artifactId + "-postman-", ".json");
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(outputPath.toFile(), collection);
        return outputPath;
    }

    // =====================================
    // ============ REQUESTS ===============
    // =====================================

    private ObjectNode createGetAllRequest(String entityName, String pluralName) {
        ObjectNode request = objectMapper.createObjectNode();
        request.put("name", "Get All " + entityName);

        ObjectNode requestDetails = request.putObject("request");
        requestDetails.put("method", "GET");

        ObjectNode url = requestDetails.putObject("url");
        url.put("raw", "{{baseUrl}}/api/" + pluralName);
        ArrayNode host = url.putArray("host");
        host.add("{{baseUrl}}");
        ArrayNode path = url.putArray("path");
        path.add("api").add(pluralName);

        return request;
    }

    private ObjectNode createGetOneRequest(String entityName, String pluralName, String pkType) {
        ObjectNode request = objectMapper.createObjectNode();
        request.put("name", "Get One " + entityName);

        ObjectNode requestDetails = request.putObject("request");
        requestDetails.put("method", "GET");

        String exampleId = "String".equals(pkType) ? "example-id" : "1";
        ObjectNode url = requestDetails.putObject("url");
        url.put("raw", "{{baseUrl}}/api/" + pluralName + "/" + exampleId);
        ArrayNode host = url.putArray("host");
        host.add("{{baseUrl}}");
        ArrayNode path = url.putArray("path");
        path.add("api").add(pluralName).add(exampleId);

        return request;
    }

    private ObjectNode createPostRequest(String entityName, String pluralName,
                                         UmlClass c, UmlSchema schema) {
        ObjectNode request = objectMapper.createObjectNode();
        request.put("name", "Create " + entityName);

        ObjectNode requestDetails = request.putObject("request");
        requestDetails.put("method", "POST");

        ArrayNode headers = requestDetails.putArray("header");
        headers.add(header("Content-Type", "application/json"));
        headers.add(header("Accept", "application/json"));

        ObjectNode body = requestDetails.putObject("body");
        body.put("mode", "raw");
        body.put("raw", generateSampleBody(c, schema, shouldIncludeIdInPost(c)));

        ObjectNode url = requestDetails.putObject("url");
        url.put("raw", "{{baseUrl}}/api/" + pluralName);
        ArrayNode host = url.putArray("host");
        host.add("{{baseUrl}}");
        ArrayNode path = url.putArray("path");
        path.add("api").add(pluralName);

        return request;
    }

    private ObjectNode createPutRequest(String entityName, String pluralName,
                                        UmlClass c, UmlSchema schema, String pkType, String pkName) {
        ObjectNode request = objectMapper.createObjectNode();
        request.put("name", "Update " + entityName);

        ObjectNode requestDetails = request.putObject("request");
        requestDetails.put("method", "PUT");

        ArrayNode headers = requestDetails.putArray("header");
        headers.add(header("Content-Type", "application/json"));
        headers.add(header("Accept", "application/json"));

        ObjectNode body = requestDetails.putObject("body");
        body.put("mode", "raw");
        body.put("raw", generateSampleBody(c, schema, false));

        String exampleId = "String".equals(pkType) ? "example-id" : "1";
        ObjectNode url = requestDetails.putObject("url");
        url.put("raw", "{{baseUrl}}/api/" + pluralName + "/" + exampleId);
        ArrayNode host = url.putArray("host");
        host.add("{{baseUrl}}");
        ArrayNode path = url.putArray("path");
        path.add("api").add(pluralName).add(exampleId);

        return request;
    }

    private ObjectNode createDeleteRequest(String entityName, String pluralName, String pkType) {
        ObjectNode request = objectMapper.createObjectNode();
        request.put("name", "Delete " + entityName);

        ObjectNode requestDetails = request.putObject("request");
        requestDetails.put("method", "DELETE");

        String exampleId = "String".equals(pkType) ? "example-id" : "1";
        ObjectNode url = requestDetails.putObject("url");
        url.put("raw", "{{baseUrl}}/api/" + pluralName + "/" + exampleId);
        ArrayNode host = url.putArray("host");
        host.add("{{baseUrl}}");
        ArrayNode path = url.putArray("path");
        path.add("api").add(pluralName).add(exampleId);

        return request;
    }

    private ObjectNode createIntermediateEntityPostRequest(String intermediateEntityName, String pluralName, UmlSchema schema) {
        ObjectNode request = objectMapper.createObjectNode();
        request.put("name", "Create " + intermediateEntityName);

        ObjectNode requestDetails = request.putObject("request");
        requestDetails.put("method", "POST");

        ArrayNode headers = requestDetails.putArray("header");
        headers.add(header("Content-Type", "application/json"));
        headers.add(header("Accept", "application/json"));

        ObjectNode body = requestDetails.putObject("body");
        body.put("mode", "raw");
        body.put("raw", generateIntermediateEntityBody(intermediateEntityName, schema, false));

        ObjectNode url = requestDetails.putObject("url");
        url.put("raw", "{{baseUrl}}/api/" + pluralName);
        ArrayNode host = url.putArray("host");
        host.add("{{baseUrl}}");
        ArrayNode path = url.putArray("path");
        path.add("api").add(pluralName);

        return request;
    }

    private ObjectNode createIntermediateEntityPutRequest(String intermediateEntityName, String pluralName, UmlSchema schema, String pkType) {
        ObjectNode request = objectMapper.createObjectNode();
        request.put("name", "Update " + intermediateEntityName);

        ObjectNode requestDetails = request.putObject("request");
        requestDetails.put("method", "PUT");

        ArrayNode headers = requestDetails.putArray("header");
        headers.add(header("Content-Type", "application/json"));
        headers.add(header("Accept", "application/json"));

        ObjectNode body = requestDetails.putObject("body");
        body.put("mode", "raw");
        body.put("raw", generateIntermediateEntityBody(intermediateEntityName, schema, false));

        String exampleId = "String".equals(pkType) ? "example-id" : "1";
        ObjectNode url = requestDetails.putObject("url");
        url.put("raw", "{{baseUrl}}/api/" + pluralName + "/" + exampleId);
        ArrayNode host = url.putArray("host");
        host.add("{{baseUrl}}");
        ArrayNode path = url.putArray("path");
        path.add("api").add(pluralName).add(exampleId);

        return request;
    }

    private ObjectNode header(String key, String value) {
        ObjectNode h = objectMapper.createObjectNode();
        h.put("key", key);
        h.put("value", value);
        return h;
    }

    // =====================================
    // ============ BODY BUILDER ===========
    // =====================================

    private String generateSampleBody(UmlClass c, UmlSchema schema, boolean includeId) {
        ObjectNode body = objectMapper.createObjectNode();

        // Detectar si tiene padre (herencia)
        String parentClass = null;
        if (schema.getRelationships() != null) {
            for (var rel : schema.getRelationships()) {
                if ("generalization".equals(rel.getType()) && rel.getSourceId().equals(c.getId())) {
                    String pName = findClassNameById(schema, rel.getTargetId());
                    parentClass = pName != null ? NamingUtil.toJavaClass(pName) : null;
                }
            }
        }

        // Atributos del padre (si hay herencia)
        if (parentClass != null) {
            String finalParentClass = parentClass;
            UmlClass parent = schema.getClasses().stream()
                    .filter(pc -> NamingUtil.toJavaClass(pc.getName()).equals(finalParentClass))
                    .findFirst().orElse(null);

            if (parent != null) {
                for (int i = 0; i < parent.getAttributes().size(); i++) {
                    var attr = parent.getAttributes().get(i);
                    String fieldName = NamingUtil.toField(attr.getName());
                    String type = TypeMapper.toJava(attr.getType());

                    // El primer atributo del padre es la PK
                    // Solo incluirlo si includeId es true
                    if (i == 0 && !includeId) {
                        continue;
                    }

                    body.set(fieldName, generateSampleValue(type, fieldName));
                }
            }
        }

        // Atributos propios de la clase
        // Si tiene padre, NINGUNO de estos es PK
        // Si NO tiene padre, el primero es PK
        for (int i = 0; i < c.getAttributes().size(); i++) {
            var attr = c.getAttributes().get(i);
            String fieldName = NamingUtil.toField(attr.getName());
            String type = TypeMapper.toJava(attr.getType());

            // Si NO tiene padre y es el primer atributo, es la PK
            if (parentClass == null && i == 0 && !includeId) {
                continue;
            }

            body.set(fieldName, generateSampleValue(type, fieldName));
        }

        // Relaciones ManyToOne o OneToOne: incluir solo el ID de la relación
        if (schema.getRelationships() != null) {
            for (var rel : schema.getRelationships()) {
                String sourceName = findClassNameById(schema, rel.getSourceId());
                String targetName = findClassNameById(schema, rel.getTargetId());

                if (sourceName == null || targetName == null) continue;

                List<String> labels = rel.getLabels();
                String sourceCard = (labels != null && !labels.isEmpty() && labels.get(0) != null) ? labels.get(0).trim() : "";
                String targetCard = (labels != null && labels.size() > 1 && labels.get(1) != null) ? labels.get(1).trim() : "";

                if ("dependency".equals(rel.getType()) && sourceCard.isEmpty() && targetCard.isEmpty()) {
                    sourceCard = "*";
                    targetCard = "1";
                }

                boolean sourceIsMany = sourceCard.contains("*");
                boolean targetIsMany = targetCard.contains("*");

                // Soporte para relación recursiva en Postman
                if (sourceName.equals(targetName) && c.getName().equals(sourceName)) {
                    String fieldName = NamingUtil.toField(targetName) + "PadreId";
                    body.set(fieldName, generateSampleValue("Long", fieldName));
                    continue;
                }

                if (c.getName().equals(sourceName) &&
                        ("association".equals(rel.getType()) ||
                                "aggregation".equals(rel.getType()) ||
                                "composition".equals(rel.getType()) ||
                                "dependency".equals(rel.getType()))) {

                    // Si source tiene cardinalidad * hacia target
                    // entonces Source tiene ManyToOne → incluir solo el ID de la relación
                    if (sourceIsMany && !targetIsMany) {
                        String targetEntity = NamingUtil.toJavaClass(targetName);
                        String fieldName = NamingUtil.toField(targetEntity) + "id";

                        UmlClass targetClass = schema.getClasses().stream()
                                .filter(tc -> tc != null && tc.getName() != null && tc.getName().equals(targetName))
                                .findFirst().orElse(null);

                        if (targetClass != null) {
                            UmlAttribute targetPk = ProjectGenerator.findPrimaryKeyAttribute(targetClass);
                            if (targetPk != null && targetPk.getType() != null) {
                                String targetPkType = TypeMapper.toJava(targetPk.getType());
                                body.set(fieldName, generateSampleValue(targetPkType, fieldName));
                            }
                        }
                    }
                    // Si source tiene cardinalidad 1 y target tiene 1 (OneToOne o Composition)
                    else if (!sourceIsMany && !targetIsMany) {
                        String targetEntity = NamingUtil.toJavaClass(targetName);
                        String fieldName = NamingUtil.toField(targetEntity) + "id";

                        UmlClass targetClass = schema.getClasses().stream()
                                .filter(tc -> tc != null && tc.getName() != null && tc.getName().equals(targetName))
                                .findFirst().orElse(null);

                        if (targetClass != null) {
                            UmlAttribute targetPk = ProjectGenerator.findPrimaryKeyAttribute(targetClass);
                            if (targetPk != null && targetPk.getType() != null) {
                                String targetPkType = TypeMapper.toJava(targetPk.getType());
                                body.set(fieldName, generateSampleValue(targetPkType, fieldName));
                            }
                        }
                    }
                    // Si source=many y target=many → ManyToMany
                    // NO incluir en el body, se gestiona con endpoints dedicados
                    // Si source=1 y target=many → Source tiene OneToMany, no incluir FK
                }
                
                // Lado TARGET: si target tiene cardinalidad many y source tiene 1
                // entonces Target tiene ManyToOne hacia Source
                if (c.getName().equals(targetName) &&
                        ("association".equals(rel.getType()) ||
                                "aggregation".equals(rel.getType()) ||
                                "composition".equals(rel.getType()) ||
                                "dependency".equals(rel.getType()))) {

                    if (targetIsMany && !sourceIsMany) {
                        // Target (este objeto) tiene ManyToOne hacia Source
                        String sourceEntity = NamingUtil.toJavaClass(sourceName);
                        String fieldName = NamingUtil.toField(sourceEntity) + "id";

                        UmlClass sourceClass = schema.getClasses().stream()
                                .filter(sc -> sc != null && sc.getName() != null && sc.getName().equals(sourceName))
                                .findFirst().orElse(null);

                        if (sourceClass != null) {
                            UmlAttribute sourcePk = ProjectGenerator.findPrimaryKeyAttribute(sourceClass);
                            if (sourcePk != null && sourcePk.getType() != null) {
                                String sourcePkType = TypeMapper.toJava(sourcePk.getType());
                                body.set(fieldName, generateSampleValue(sourcePkType, fieldName));
                            }
                        }
                    }
                    // Si target=many y source=many → ManyToMany
                    // NO incluir en el body, se gestiona con endpoints dedicados
                }
            }
        }

        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(body);
        } catch (Exception e) {
            return "{}";
        }
    }

    private String generateIntermediateEntityBody(String intermediateEntityName, UmlSchema schema, boolean includeId) {
        ObjectNode body = objectMapper.createObjectNode();

        // Las entidades intermedias tienen estructura: FirstEntitySecondEntity
        // Necesitamos extraer las dos entidades originales
        // Buscamos en el schema las relaciones ManyToMany que generan esta entidad intermedia
        
        String firstEntityName = null;
        String secondEntityName = null;
        
        if (schema.getRelationships() != null) {
            for (var rel : schema.getRelationships()) {
                if ("association".equals(rel.getType())
                        || "aggregation".equals(rel.getType())
                        || "composition".equals(rel.getType())
                        || "dependency".equals(rel.getType())) {
                    
                    String sourceName = findClassNameById(schema, rel.getSourceId());
                    String targetName = findClassNameById(schema, rel.getTargetId());

                    if (sourceName == null || targetName == null) continue;

                    List<String> labels = rel.getLabels();
                    String sourceCard = (labels != null && !labels.isEmpty() && labels.get(0) != null) ? labels.get(0).trim() : "";
                    String targetCard = (labels != null && labels.size() > 1 && labels.get(1) != null) ? labels.get(1).trim() : "";

                    if (sourceCard.isEmpty() && "dependency".equals(rel.getType())) {
                        sourceCard = "*";
                        targetCard = "1";
                    }

                    boolean sourceIsMany = sourceCard.contains("*");
                    boolean targetIsMany = targetCard.contains("*");

                    if (sourceIsMany && targetIsMany) {
                        String sourceEntity = NamingUtil.toJavaClass(sourceName);
                        String targetEntity = NamingUtil.toJavaClass(targetName);
                        
                        String firstEntity = sourceEntity.compareTo(targetEntity) < 0 ? sourceEntity : targetEntity;
                        String secondEntity = sourceEntity.compareTo(targetEntity) < 0 ? targetEntity : sourceEntity;
                        
                        String candidateName = firstEntity + secondEntity;
                        
                        if (candidateName.equals(intermediateEntityName)) {
                            firstEntityName = firstEntity;
                            secondEntityName = secondEntity;
                            break;
                        }
                    }
                }
            }
        }

        // Generar los campos de FK para las dos entidades
        if (firstEntityName != null && secondEntityName != null) {
            String firstFieldName = NamingUtil.toField(firstEntityName) + "id";
            String secondFieldName = NamingUtil.toField(secondEntityName) + "id";
            
            final String finalFirstEntity = firstEntityName;
            final String finalSecondEntity = secondEntityName;
            
            // Obtener el tipo de PK de cada entidad
            UmlClass firstClass = schema.getClasses().stream()
                    .filter(c -> NamingUtil.toJavaClass(c.getName()).equals(finalFirstEntity))
                    .findFirst().orElse(null);
            
            UmlClass secondClass = schema.getClasses().stream()
                    .filter(c -> NamingUtil.toJavaClass(c.getName()).equals(finalSecondEntity))
                    .findFirst().orElse(null);
            
            String firstPkType = "Long";
            String secondPkType = "Long";
            
            if (firstClass != null) {
                UmlAttribute firstPk = ProjectGenerator.findPrimaryKeyAttribute(firstClass);
                if (firstPk != null && firstPk.getType() != null) {
                    firstPkType = TypeMapper.toJava(firstPk.getType());
                }
            }
            
            if (secondClass != null) {
                UmlAttribute secondPk = ProjectGenerator.findPrimaryKeyAttribute(secondClass);
                if (secondPk != null && secondPk.getType() != null) {
                    secondPkType = TypeMapper.toJava(secondPk.getType());
                }
            }
            
            body.set(firstFieldName, generateSampleValue(firstPkType, firstFieldName));
            body.set(secondFieldName, generateSampleValue(secondPkType, secondFieldName));
        }

        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(body);
        } catch (Exception e) {
            return "{}";
        }
    }

    // =====================================
    // ============ HELPERS ================
    // =====================================

    private JsonNode generateSampleValue(String type, String fieldName) {
        return switch (type) {
            case "Integer", "Long" -> {
                if (fieldName.toLowerCase().contains("id")) yield objectMapper.valueToTree(1);
                yield objectMapper.valueToTree(100);
            }
            case "Double", "Float" -> objectMapper.valueToTree(99.99);
            case "BigDecimal" -> objectMapper.valueToTree(150.75);
            case "LocalDate" -> objectMapper.valueToTree("2026-09-16");
            case "LocalDateTime" -> objectMapper.valueToTree("2026-09-16T12:00:00");
            case "Boolean" -> objectMapper.valueToTree(true);
            case "String" -> {
                if (fieldName.toLowerCase().contains("name") || fieldName.toLowerCase().contains("nombre"))
                    yield objectMapper.valueToTree("Nombre Ejemplo");
                if (fieldName.toLowerCase().contains("email") || fieldName.toLowerCase().contains("correo"))
                    yield objectMapper.valueToTree("ejemplo@email.com");
                if (fieldName.toLowerCase().contains("phone") || fieldName.toLowerCase().contains("telefono"))
                    yield objectMapper.valueToTree("123456789");
                if (fieldName.toLowerCase().contains("address") || fieldName.toLowerCase().contains("direccion"))
                    yield objectMapper.valueToTree("Calle Ejemplo 123");
                if (fieldName.toLowerCase().contains("id"))
                    yield objectMapper.valueToTree("id-ejemplo-123");
                yield objectMapper.valueToTree("Valor de ejemplo");
            }
            default -> objectMapper.valueToTree("Valor de ejemplo");
        };
    }

    private boolean isNumericType(String javaType) {
        return javaType.equalsIgnoreCase("int") || javaType.equalsIgnoreCase("Integer")
                || javaType.equalsIgnoreCase("long") || javaType.equalsIgnoreCase("Long")
                || javaType.equalsIgnoreCase("short") || javaType.equalsIgnoreCase("byte");
    }

    private boolean shouldIncludeIdInPost(UmlClass c) {
        String pkType = "String";
        UmlAttribute pkAttr = ProjectGenerator.findPrimaryKeyAttribute(c);
        if (pkAttr != null && pkAttr.getType() != null) {
            pkType = TypeMapper.toJava(pkAttr.getType());
        }
        return !isNumericType(pkType);
    }

    private String findClassNameById(UmlSchema schema, String id) {
        if (schema == null || schema.getClasses() == null || id == null) {
            return null;
        }
        for (UmlClass c : schema.getClasses()) {
            if (c != null && id.equals(c.getId())) {
                return c.getName();
            }
        }
        return null;
    }
}

package generator_uml.back_generator_uml.service;

public class TypeMapper {
    public static String toJava(String t) {
        if (t == null || t.isBlank()) return "String";
        String s = t.replaceAll("^[^a-zA-Z0-9_]+", "").trim().toLowerCase();

        return switch (s) {
            case "void" -> "void";
            case "int", "integer" -> "Integer";
            case "long", "bigint" -> "Long";
            case "string", "varchar", "text", "char", "character" -> "String";
            case "bool", "boolean" -> "Boolean";
            case "float" -> "Float";
            case "double", "real" -> "Double";
            case "decimal", "numeric", "bigdecimal", "money" -> "BigDecimal";
            case "date", "localdate" -> "LocalDate";
            case "time", "localtime" -> "LocalTime";
            case "datetime", "timestamp", "localdatetime" -> "LocalDateTime";
            case "uuid" -> "UUID";
            default -> "String"; // fallback seguro
        };
    }
}

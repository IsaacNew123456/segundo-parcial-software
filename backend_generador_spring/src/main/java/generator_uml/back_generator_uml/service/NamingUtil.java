package generator_uml.back_generator_uml.service;

import org.apache.commons.text.WordUtils;

public class NamingUtil {

    public static String toJavaClass(String name) {
        if (name == null || name.trim().isEmpty()) return "Entity";
        String cleaned = name.replaceAll("[^\\p{IsAlphabetic}\\p{IsDigit}]+"," ");
        String res = WordUtils.capitalizeFully(cleaned).replace(" ","");
        return res.isEmpty() ? "Entity" : res;
    }

    public static String toField(String name) {
        if (name == null || name.trim().isEmpty()) return "field";
        String cls = toJavaClass(name);
        if (cls.isEmpty()) return "field";
        return Character.toLowerCase(cls.charAt(0)) + (cls.length() > 1 ? cls.substring(1) : "");
    }

    public static String capitalize(String name) {
        if (name == null || name.trim().isEmpty()) return name;
        return Character.toUpperCase(name.charAt(0)) + (name.length() > 1 ? name.substring(1) : "");
    }

    public static String plural(String name) {
        if (name == null || name.trim().isEmpty()) return "items";
        if (name.endsWith("s")) return name + "es";
        return name + "s";
    }
}


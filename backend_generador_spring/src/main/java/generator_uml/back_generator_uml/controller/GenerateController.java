package generator_uml.back_generator_uml.controller;

import generator_uml.back_generator_uml.entity.UmlSchema;
import generator_uml.back_generator_uml.service.ProjectGenerator;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;

@RestController
@RequestMapping("/generate")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class GenerateController {

    private final ProjectGenerator projectGenerator;

    @PostMapping(produces = {MediaType.APPLICATION_OCTET_STREAM_VALUE, MediaType.TEXT_PLAIN_VALUE})
    public ResponseEntity<?> generate(@RequestBody(required = false) UmlSchema schema,
                                      @RequestParam(defaultValue = "com.example.genapp") String basePackage,
                                      @RequestParam(defaultValue = "generated-app") String artifactId) {
        if (schema == null || schema.getClasses() == null || schema.getClasses().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body("El esquema UML recibido no contiene clases para generar el proyecto.");
        }

        Path zipPath = null;
        try {
            zipPath = projectGenerator.generate(schema, basePackage, artifactId);
            byte[] bytes = Files.readAllBytes(zipPath);

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + artifactId + ".zip")
                    .body(bytes);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Error al sintetizar el proyecto backend: " + e.getMessage());
        } finally {
            if (zipPath != null) {
                try {
                    Files.deleteIfExists(zipPath);
                } catch (Exception ignored) {}
            }
        }
    }
}


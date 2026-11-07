import json
import re
import uuid
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.contrib.auth.models import User
from ..models import Project, ProjectMember, Session, ChatMessage, SessionEvent, BackupUML
from .services_gemini import call_gemini, _sanitize_diagram_for_llm


def sanitize_uml_rules(classes: list, relationships: list) -> tuple[list, list]:
    """
    Valida y asegura las reglas inviolables del sistema UML CASE:
    1. Regla 4: Herencia (generalization) y dependencia no admiten multiplicidades.
    2. Las relaciones deben conectar clases que realmente existan.
    3. Tipos de relaciones válidos.
    """
    class_ids = {str(c.get("id")) for c in classes if c.get("id")}
    class_names = {str(c.get("name")): str(c.get("id")) for c in classes if c.get("name") and c.get("id")}

    valid_rels = []
    for rel in relationships:
        if not isinstance(rel, dict):
            continue

        r_type = rel.get("type", "association").lower()
        if r_type == "herencia":
            r_type = "generalization"
        elif r_type == "dependencia":
            r_type = "dependency"
        elif r_type == "asociacion":
            r_type = "association"
        elif r_type == "composicion":
            r_type = "composition"
        elif r_type == "agregacion":
            r_type = "aggregation"

        source_id = str(rel.get("sourceId", ""))
        target_id = str(rel.get("targetId", ""))

        # Si el modelo devolvió nombres de clases en lugar de IDs, resolverlos
        if source_id not in class_ids and source_id in class_names:
            source_id = class_names[source_id]
        if target_id not in class_ids and target_id in class_names:
            target_id = class_names[target_id]

        # Validar existencia de ambos extremos
        if source_id not in class_ids or target_id not in class_ids:
            continue

        # Regla 4: Herencia y dependencia NUNCA llevan multiplicidades
        if r_type in ("generalization", "inheritance", "dependency"):
            labels = []
        else:
            labels = rel.get("labels", [])
            if not isinstance(labels, list):
                labels = []

        valid_rels.append({
            "id": rel.get("id") or str(uuid.uuid4()),
            "type": r_type,
            "sourceId": source_id,
            "targetId": target_id,
            "labels": labels
        })

    return classes, valid_rels


class ModeratorService:
    @staticmethod
    def process_chat_message(project_id, user: User, content: str, is_mobile: bool = False) -> dict:
        """
        Punto de entrada de la IA Moderadora:
        1. Clasifica si el mensaje contiene una instrucción para la IA (@ia o comandos).
        2. Valida permisos por rol (rechaza mutaciones para rol 'viewer' y clientes móviles).
        3. Ejecuta la acción correspondiente (mutar, sugerir, revisar, confirmar o aclarar).
        4. Actualiza el lienzo y difunde por WebSocket a los miembros del proyecto.
        """
        raw_text = content.strip()
        user_name = user.first_name if user.first_name else user.username

        # 1. Detectar invocación de IA
        is_ai_invocation = bool(re.search(r"@ia\b", raw_text, re.IGNORECASE))
        clean_prompt = re.sub(r"@ia\b", "", raw_text, flags=re.IGNORECASE).strip()

        # Si no hubo @ia explícito, verificar si inicia con verbos de comando directo
        command_verbs = (
            "agrega la clase", "crea la clase", "añade la clase",
            "modifica la clase", "añade el atributo", "agrega el atributo",
            "relaciona ", "sugiere relaciones", "sugerir relaciones", "sugiere",
            "revisa las relaciones", "revisar relaciones", "aplica la sugerencia",
            "aplica la ", "aplica ", "confirma la ", "confirma ", "agrega una clase", "crea una clase",
            "modifica una clase", "audita normalizacion", "auditar normalizacion",
            "verifica la normalizacion", "verifica normalizacion", "normaliza",
            "resume el lienzo", "resumen del lienzo", "resumen", "¿qué hay",
            "que hay", "¿qué avanzamos", "que avanzamos", "estado del lienzo"
        )
        is_command = any(clean_prompt.lower().startswith(v) for v in command_verbs)

        if not is_ai_invocation and not is_command:
            return {"is_ai": False}

        # 2. Obtener proyecto y verificar rol
        try:
            project = Project.objects.get(id=project_id)
        except Project.DoesNotExist:
            return {"is_ai": False}

        is_owner = (project.owner_id == user.id)
        membership = project.members.filter(user=user).first()
        my_role = ProjectMember.ROLE_DESIGNER if is_owner else (membership.rol if membership else None)

        if not my_role:
            return {
                "is_ai": True,
                "reply": f"@{user_name}: No eres miembro de este proyecto."
            }

        prompt_lower = clean_prompt.lower()

        # REGLA INVIOLABLE 4 / S2-3: RECHAZO EXPLÍCITO DE ANTI-PATRÓN UML
        # En UML 2.5, la relación de herencia (generalización) y la de dependencia NO admiten multiplicidades
        has_inheritance = bool(re.search(r"\b(herencia|hereda|heredan|generalizacion|generalización|generalization)\b", prompt_lower))
        has_dependency = bool(re.search(r"\b(dependencia|depende|dependency)\b", prompt_lower))
        has_multiplicity = bool(re.search(
            r"\b(multiplicidad(?:es)?|cardinalidad(?:es)?|1\s*a\s*\*|\*\s*a\s*\*|1\s*a\s*1|uno\s*a\s*muchos|muchos\s*a\s*muchos|uno\s*a\s*uno|1\s*a\s*n|n\s*a\s*n|n\s*a\s*1|1\s*\.\.\s*\*|0\s*\.\.\s*1|0\s*\.\.\s*\*)\b",
            prompt_lower
        )) or bool(re.search(r"\b\d+\s*(?:a|\.{2})\s*(?:\d+|\*|n)\b", prompt_lower))

        if (has_inheritance or has_dependency) and has_multiplicity:
            rel_name = "herencia (generalización)" if has_inheritance else "dependencia"
            return {
                "is_ai": True,
                "reply": f"❌ @{user_name}: Operación rechazada (Anti-patrón UML). En el estándar OMG UML 2.5, la relación de {rel_name} no admite multiplicidades ni cardinalidades (como '1 a *'), ya que modela una jerarquía taxonómica o relación de uso entre clasificadores, no una asociación cuantificable entre instancias."
            }

        # Comprobar si la orden es ambigua (DoD Sprint 2)
        ambiguous_patterns = (
            r"^(?:agrega|crea|añade)\s+(?:una\s+)?clase\s*$",
            r"^(?:modifica|cambia)\s+(?:una\s+)?(?:clase)?\s*$",
            r"^(?:relaciona)\s*$",
            r"^(?:agrega|crea|hazlo|cambia|ayuda|hola)\s*$"
        )
        if any(re.match(p, prompt_lower) for p in ambiguous_patterns) or len(clean_prompt) < 4:
            return {
                "is_ai": True,
                "reply": f"@{user_name}: La orden es ambigua. Por favor especifica el nombre de la clase, sus atributos o las relaciones que deseas crear (ej: `@ia agrega la clase Factura con id, fecha y total`)."
            }

        # 3. Clasificación de Intenciones

        # CASO A: CONFIRMAR / APLICAR SUGERENCIA (S2-5 / CU17)
        match_confirm = re.search(r"(?:aplica|confirma)\s+(?:la\s+)?(?:sugerencia\s+|relacion\s+|relación\s+)?#?\s*(\d+)", prompt_lower)
        if match_confirm:
            num = int(match_confirm.group(1))
            return ModeratorService._handle_confirm_suggestion(project, user, user_name, my_role, num, is_mobile=is_mobile)

        # CASO B: SUGERIR RELACIONES (S2-5 / CU17)
        if "sugiere" in prompt_lower or "sugerir" in prompt_lower or ("sugerencia" in prompt_lower and not ("aplica" in prompt_lower or "confirma" in prompt_lower)):
            return ModeratorService._handle_suggest_relationships(project, user, user_name)

        # CASO C: REVISAR RELACIONES (S2-6 / CU17)
        if "revisa" in prompt_lower or "revisar" in prompt_lower or "audita relaciones" in prompt_lower:
            return ModeratorService._handle_review_relationships(project, user_name)

        # CASO D: AUDITAR NORMALIZACIÓN (1FN–4FN) (CU18 / S3-2)
        if any(k in prompt_lower for k in ("normaliz", "1fn", "2fn", "3fn", "4fn", "forma normal")):
            return ModeratorService._handle_normalization_audit(project, user, user_name, prompt=clean_prompt)

        # CASO E: RESUMIR EL ESTADO DEL LIENZO (CU20 / S3-6)
        if any(k in prompt_lower for k in ("resum", "que hay", "qué hay", "que avanzamos", "qué avanzamos", "estado del lienzo", "avance")):
            return ModeratorService._handle_summarize_diagram(project, user, user_name)

        # CASO F: MUTACIÓN DIRECTA (AÑADIR, MODIFICAR, RELACIONAR) (S2-2 / S2-3 / S2-4 / CU16)
        return ModeratorService._handle_direct_mutation(project, user, user_name, my_role, clean_prompt, is_mobile=is_mobile)

    @staticmethod
    def _handle_suggest_relationships(project: Project, user: User, user_name: str) -> dict:
        backup = BackupUML.objects.filter(room_id=project.room_id).first()
        data = backup.data if backup and isinstance(backup.data, dict) else {}
        classes = data.get("classes", [])

        if len(classes) < 2:
            return {
                "is_ai": True,
                "reply": f"@{user_name}: Se requieren al menos dos clases en el lienzo para poder analizar y sugerir relaciones."
            }

        # Generar sugerencias inteligentes basadas en nombres y atributos de clases
        class_names = [c.get("name") for c in classes if c.get("name")]
        suggestions = []

        # Heurísticas de nombres y referencias cruzadas
        for i, c1 in enumerate(classes):
            c1_name = c1.get("name", "")
            c1_attrs = [a.get("name", "").lower() for a in c1.get("attributes", []) if isinstance(a, dict)]

            for c2 in classes[i + 1:]:
                c2_name = c2.get("name", "")
                c2_attrs = [a.get("name", "").lower() for a in c2.get("attributes", []) if isinstance(a, dict)]

                # Si c1 tiene atributo id_c2 o similar
                if any(c2_name.lower() in attr for attr in c1_attrs):
                    suggestions.append({
                        "id": len(suggestions) + 1,
                        "source": c2_name,
                        "target": c1_name,
                        "type": "association",
                        "labels": ["1", "*"],
                        "description": f"Un {c2_name} puede relacionarse con varios {c1_name}"
                    })
                elif any(c1_name.lower() in attr for attr in c2_attrs):
                    suggestions.append({
                        "id": len(suggestions) + 1,
                        "source": c1_name,
                        "target": c2_name,
                        "type": "association",
                        "labels": ["1", "*"],
                        "description": f"Un {c1_name} puede asociarse con varios {c2_name}"
                    })

        # Si no hubo coincidencia por clave foránea, o hay pocas sugerencias, generar opciones estructurales estándar
        if len(suggestions) < 2 and len(class_names) >= 2:
            c1_n = class_names[0]
            c2_n = class_names[1]
            if not any(s["source"] == c1_n and s["target"] == c2_n for s in suggestions):
                suggestions.append({
                    "id": len(suggestions) + 1,
                    "source": c1_n,
                    "target": c2_n,
                    "type": "association",
                    "labels": ["1", "*"],
                    "description": f"Asociación estándar 1 a muchos entre {c1_n} y {c2_n}"
                })
            suggestions.append({
                "id": len(suggestions) + 1,
                "source": c1_n,
                "target": c2_n,
                "type": "association",
                "labels": ["*", "*"],
                "description": f"Asociación muchos a muchos (* a *) entre {c1_n} y {c2_n} (tabla intermedia relacional)"
            })

        # Asegurar que exista una sesión activa para persistir las sugerencias
        session = project.sessions.filter(is_active=True).first()
        if not session:
            session = Session.objects.create(
                project=project,
                is_active=True,
                snapshot={}
            )

        snapshot = session.snapshot if isinstance(session.snapshot, dict) else {}
        snapshot["pending_suggestions"] = suggestions
        session.snapshot = snapshot
        session.save()

        lines = [f"💡 @{user_name}: He analizado el modelo y te propongo estas sugerencias:"]
        for s in suggestions[:4]:
            card_desc = f"{s['labels'][0]} a {s['labels'][1]}" if s.get("labels") else "sin multiplicidad"
            lines.append(f"• **{s['id']}**: {s['source']} ➔ {s['target']} ({s['type'].capitalize()}, {card_desc}) — {s['description']}")
        lines.append("\n👉 Para aplicar alguna, responde: `@ia aplica la 1`")
        lines.append("⚠️ _El lienzo no se modificará hasta que confirmes explícitamente._")

        return {
            "is_ai": True,
            "reply": "\n".join(lines),
            "suggestions": suggestions
        }

    @staticmethod
    def _handle_confirm_suggestion(project: Project, user: User, user_name: str, my_role: str, num: int, is_mobile: bool = False) -> dict:
        # Requisito Inviolable 1 y S2-7: El móvil nunca escribe en el diagrama
        if is_mobile:
            return {
                "is_ai": True,
                "reply": f"@{user_name}: El acceso desde dispositivo móvil es exclusivamente de solo lectura (espectador). No se permiten modificaciones al diagrama."
            }

        # Validación de rol (S2-7)
        if my_role == ProjectMember.ROLE_VIEWER:
            return {
                "is_ai": True,
                "reply": f"@{user_name}: Tu rol es de Espectador (solo lectura). No tienes permisos para confirmar sugerencias ni modificar el diagrama."
            }

        session = project.sessions.filter(is_active=True).first()
        snapshot = session.snapshot if session and isinstance(session.snapshot, dict) else {}
        pending = snapshot.get("pending_suggestions", [])

        selected = next((s for s in pending if s.get("id") == num), None)
        if not selected:
            return {
                "is_ai": True,
                "reply": f"@{user_name}: No encontré la sugerencia #{num} pendiente. Puedes pedir nuevas sugerencias escribiendo `@ia sugiere relaciones`."
            }

        # Cargar lienzo
        backup = BackupUML.objects.filter(room_id=project.room_id).first()
        if not backup or not isinstance(backup.data, dict):
            return {"is_ai": True, "reply": "No se encontró el estado del diagrama en la base de datos."}

        classes = backup.data.get("classes", [])
        relationships = backup.data.get("relationships", [])

        # Buscar IDs de las clases
        src_name = selected["source"]
        tgt_name = selected["target"]
        src_class = next((c for c in classes if c.get("name") == src_name), None)
        tgt_class = next((c for c in classes if c.get("name") == tgt_name), None)

        if not src_class or not tgt_class:
            return {
                "is_ai": True,
                "reply": f"@{user_name}: No se pudo aplicar porque una de las clases ({src_name} o {tgt_name}) ya no existe en el lienzo."
            }

        new_rel = {
            "id": str(uuid.uuid4()),
            "type": selected.get("type", "association"),
            "sourceId": src_class["id"],
            "targetId": tgt_class["id"],
            "labels": selected.get("labels", ["1", "*"])
        }

        # Validar reglas UML (Regla 4)
        _, validated_rels = sanitize_uml_rules(classes, [new_rel])
        if not validated_rels:
            return {"is_ai": True, "reply": "La relación sugerida no cumple con las reglas UML."}

        relationships.append(validated_rels[0])
        backup.data["relationships"] = relationships
        backup.save()

        # Registrar evento en la sesión
        if session:
            SessionEvent.objects.create(
                session=session,
                tipo="link_add",
                payload=validated_rels[0],
                actor=user
            )

        # Difundir por WebSocket a todos los lienzos en la sala
        ModeratorService._broadcast_diagram_update(str(project.room_id), backup.data)

        # Quitar la sugerencia aplicada
        snapshot["pending_suggestions"] = [s for s in pending if s.get("id") != num]
        session.snapshot = snapshot
        session.save()

        return {
            "is_ai": True,
            "reply": f"✅ @{user_name} confirmó la sugerencia #{num}. Se creó la relación entre **{src_name}** y **{tgt_name}**.",
            "mutation": {"action": "add_link", "link": validated_rels[0]}
        }

    @staticmethod
    def _handle_review_relationships(project: Project, user_name: str) -> dict:
        backup = BackupUML.objects.filter(room_id=project.room_id).first()
        data = backup.data if backup and isinstance(backup.data, dict) else {}
        classes = data.get("classes", [])
        relationships = data.get("relationships", [])

        if not classes:
            return {
                "is_ai": True,
                "reply": f"@{user_name}: El diagrama está vacío. No hay clases ni relaciones que revisar."
            }

        issues = []

        # 1. Clases huérfanas
        connected_ids = set()
        for r in relationships:
            connected_ids.add(str(r.get("sourceId")))
            connected_ids.add(str(r.get("targetId")))

        orphans = [c.get("name") for c in classes if str(c.get("id")) not in connected_ids]
        if orphans:
            issues.append(f"⚠️ **Clases huérfanas sin relación:** {', '.join(orphans)}.")

        # 2. Regla 4: Herencia/dependencia con multiplicidades
        anti_patterns = []
        for r in relationships:
            r_type = r.get("type", "")
            labels = r.get("labels", [])
            if r_type in ("generalization", "inheritance", "dependency") and labels:
                anti_patterns.append(f"{r_type} entre {r.get('sourceId')} y {r.get('targetId')}")
        if anti_patterns:
            issues.append(f"❌ **Anti-patrón detectado (Regla UML):** Herencias o dependencias con multiplicidades asignadas ({len(anti_patterns)} encontradas).")

        # 3. Herencias circulares
        # Grafo de generalizaciones
        gen_map = {}
        for r in relationships:
            if r.get("type") in ("generalization", "inheritance"):
                src = str(r.get("sourceId"))
                tgt = str(r.get("targetId"))
                gen_map.setdefault(src, []).append(tgt)

        for src, targets in gen_map.items():
            for tgt in targets:
                if src in gen_map.get(tgt, []):
                    issues.append(f"🚫 **Herencia circular detectada:** Existe dependencia cíclica entre dos clases.")

        if not issues:
            reply_text = f"✨ @{user_name}: **Revisión de Relaciones UML:**\nEl modelo no presenta anomalías. No hay clases huérfanas, dependencias circulares ni multiplicidades en herencias/dependencias."
        else:
            reply_text = f"📋 @{user_name}: **Reporte de Auditoría de Relaciones:**\n" + "\n".join(issues)

        return {
            "is_ai": True,
            "reply": reply_text,
            "issues": issues
        }

    @staticmethod
    def _handle_direct_mutation(project: Project, user: User, user_name: str, my_role: str, prompt: str, is_mobile: bool = False) -> dict:
        # Requisito Inviolable 1 y S2-7: El móvil nunca escribe en el diagrama
        if is_mobile:
            return {
                "is_ai": True,
                "reply": f"@{user_name}: El acceso desde dispositivo móvil es exclusivamente de solo lectura (espectador). No se permiten modificaciones al diagrama."
            }

        # Validación de rol (S2-7)
        if my_role == ProjectMember.ROLE_VIEWER:
            return {
                "is_ai": True,
                "reply": f"@{user_name}: Tu rol es de Espectador (solo lectura). No tienes permisos para modificar el diagrama de clases."
            }

        # Cargar lienzo actual
        backup, _ = BackupUML.objects.get_or_create(
            room_id=project.room_id,
            defaults={"data": {"classes": [], "relationships": []}}
        )
        current_data = backup.data if isinstance(backup.data, dict) else {"classes": [], "relationships": []}

        # Intentar llamar a Gemini con el contexto del diagrama actual
        res_data = {}
        try:
            raw_output = call_gemini(prompt, current_data)
            if isinstance(raw_output, str):
                start = raw_output.find('{')
                end = raw_output.rfind('}')
                if start != -1 and end != -1:
                    clean_json = raw_output[start:end + 1]
                else:
                    clean_json = raw_output
                res_data = json.loads(clean_json)
            elif isinstance(raw_output, dict):
                res_data = raw_output
        except Exception:
            res_data = {}

        new_classes = res_data.get("classes", []) if isinstance(res_data, dict) else []
        new_rels = res_data.get("relationships", []) if isinstance(res_data, dict) else []
        ai_message = res_data.get("message", "Diagrama actualizado correctamente.") if isinstance(res_data, dict) else "Diagrama actualizado correctamente."

        # Heuristic fallback si Gemini no tiene API key configurada, dio error o devolvió vacío
        if (not new_classes and not new_rels) or (isinstance(res_data, dict) and res_data.get("error")):
            heuristic = ModeratorService._heuristic_mutation(prompt, current_data)
            if heuristic:
                new_classes = heuristic.get("classes", [])
                new_rels = heuristic.get("relationships", [])
                ai_message = heuristic.get("message", ai_message)

        if not new_classes and not new_rels:
            return {
                "is_ai": True,
                "reply": f"@{user_name}: No pude interpretar cambios en el modelo. Recuerda que puedes indicar por ejemplo: `@ia agrega la clase Factura con id, fecha y total` o `@ia relaciona Cliente con Pedido`."
            }

        # Sanitizar y validar reglas UML estrictas (S2-3)
        valid_classes, valid_rels = sanitize_uml_rules(new_classes, new_rels)

        # Si el modelo no devolvió clases pero teníamos preexistentes, mantenerlas
        if not valid_classes and current_data.get("classes"):
            valid_classes = current_data.get("classes")

        # Fusionar preservando coordenadas si ya existían
        existing_classes_map = {c.get("id"): c for c in current_data.get("classes", [])}
        consolidated_classes = []
        for c in valid_classes:
            cid = c.get("id")
            if cid in existing_classes_map:
                old = existing_classes_map[cid]
                c["position"] = old.get("position", {"x": 100, "y": 100})
                c["size"] = old.get("size", {"width": 180, "height": 130})
            else:
                idx = len(consolidated_classes)
                c["position"] = {"x": 80 + (idx % 3) * 230, "y": 80 + (idx // 3) * 190}
                c["size"] = {"width": 180, "height": 130}
            consolidated_classes.append(c)

        # Actualizar BackupUML en BD
        backup.data = {
            "classes": consolidated_classes,
            "relationships": valid_rels
        }
        backup.save()

        # Registrar en SessionEvent (CU19)
        session = project.sessions.filter(is_active=True).first()
        if session:
            SessionEvent.objects.create(
                session=session,
                tipo="ia_mutation",
                payload={"instruction": prompt, "reply": ai_message},
                actor=user
            )

        # Difundir por WebSocket al lienzo colaborativo (S2-4)
        ModeratorService._broadcast_diagram_update(str(project.room_id), backup.data)

        return {
            "is_ai": True,
            "reply": f"🤖 @{user_name}: {ai_message}",
            "mutation": {"classes": consolidated_classes, "relationships": valid_rels}
        }

    @staticmethod
    def _heuristic_mutation(prompt: str, current_data: dict) -> dict:
        """
        Parser heurístico determinista y offline para órdenes comunes en UML Studio.
        Garantiza que operaciones básicas funcionen siempre con latencia instantánea.
        """
        classes = [dict(c) for c in current_data.get("classes", [])]
        relationships = [dict(r) for r in current_data.get("relationships", [])]
        p_lower = prompt.lower()

        # 1. "agrega/crea/añade la clase <Nombre> con <atributos>"
        match_add = re.search(r"(?:agrega|crea|añade)\s+la\s+clase\s+([A-Za-z0-9_]+)(?:\s+con\s+(.*))?", prompt, re.IGNORECASE)
        if match_add:
            class_name = match_add.group(1).capitalize()
            raw_attrs = match_add.group(2) or ""
            attrs = []
            if raw_attrs:
                tokens = re.split(r",|\s+y\s+|\s+e\s+", raw_attrs)
                for t in tokens:
                    t = t.strip()
                    if not t:
                        continue
                    parts = re.split(r":|\s+", t)
                    attr_name = parts[0].strip()
                    if len(parts) >= 2:
                        attr_type = parts[1].strip()
                    else:
                        if "id" in attr_name.lower():
                            attr_type = "int"
                        elif "fecha" in attr_name.lower() or "date" in attr_name.lower():
                            attr_type = "date"
                        elif "total" in attr_name.lower() or "precio" in attr_name.lower():
                            attr_type = "decimal"
                        else:
                            attr_type = "string"
                    attrs.append({"name": attr_name, "type": attr_type})
            else:
                attrs.append({"name": "id", "type": "int"})

            existing = next((c for c in classes if c.get("name", "").lower() == class_name.lower()), None)
            if existing:
                existing_names = {a.get("name") for a in existing.get("attributes", [])}
                for a in attrs:
                    if a["name"] not in existing_names:
                        existing.setdefault("attributes", []).append(a)
            else:
                classes.append({
                    "id": str(uuid.uuid4()),
                    "name": class_name,
                    "attributes": attrs,
                    "methods": []
                })

            return {
                "classes": classes,
                "relationships": relationships,
                "message": f"Se ha agregado la clase '{class_name}' con {len(attrs)} atributo(s) de forma incremental."
            }

        # 2. "relaciona <Clase1> con <Clase2>"
        match_rel = re.search(r"relaciona\s+([A-Za-z0-9_]+)\s+con\s+([A-Za-z0-9_]+)", prompt, re.IGNORECASE)
        if match_rel:
            c1_name = match_rel.group(1).strip()
            c2_name = match_rel.group(2).strip()
            c1 = next((c for c in classes if c.get("name", "").lower() == c1_name.lower()), None)
            c2 = next((c for c in classes if c.get("name", "").lower() == c2_name.lower()), None)
            if c1 and c2:
                rel_type = "association"
                labels = ["1", "*"]
                if "herencia" in p_lower or "hereda" in p_lower:
                    rel_type = "generalization"
                    labels = []
                elif "dependencia" in p_lower:
                    rel_type = "dependency"
                    labels = []
                elif "composicion" in p_lower or "composición" in p_lower:
                    rel_type = "composition"
                elif "agregacion" in p_lower or "agregación" in p_lower:
                    rel_type = "aggregation"

                new_rel = {
                    "id": str(uuid.uuid4()),
                    "type": rel_type,
                    "sourceId": c1["id"],
                    "targetId": c2["id"],
                    "labels": labels
                }
                relationships.append(new_rel)
                return {
                    "classes": classes,
                    "relationships": relationships,
                    "message": f"Se ha relacionado '{c1['name']}' con '{c2['name']}' ({rel_type})."
                }

        # 3. "añade el atributo <attr> a <Clase>"
        match_attr = re.search(r"(?:añade|agrega)\s+el\s+atributo\s+([A-Za-z0-9_]+)(?:\s*:\s*([A-Za-z0-9_]+))?\s+a\s+([A-Za-z0-9_]+)", prompt, re.IGNORECASE)
        if match_attr:
            attr_name = match_attr.group(1).strip()
            attr_type = match_attr.group(2) or "string"
            target_class_name = match_attr.group(3).strip()
            target_c = next((c for c in classes if c.get("name", "").lower() == target_class_name.lower()), None)
            if target_c:
                target_c.setdefault("attributes", []).append({"name": attr_name, "type": attr_type})
                return {
                    "classes": classes,
                    "relationships": relationships,
                    "message": f"Se ha añadido el atributo '{attr_name}:{attr_type}' a la clase '{target_c['name']}'."
                }

        return None

    @staticmethod
    def _handle_normalization_audit(project: Project, user: User, user_name: str, prompt: str = "") -> dict:
        backup = BackupUML.objects.filter(room_id=project.room_id).first()
        data = backup.data if backup and isinstance(backup.data, dict) else {}
        classes = data.get("classes", [])

        if not classes:
            return {
                "is_ai": True,
                "reply": f"@{user_name}: El lienzo actualmente está vacío. Agrega clases con atributos para auditar la normalización (1FN–4FN)."
            }

        # Extraer forma normal específica si fue solicitada (ej: 1fn, 2fn, 3fn, 4fn)
        target_form = None
        match_fn = re.search(r"\b([1-4]fn)\b", prompt, re.IGNORECASE)
        if match_fn:
            target_form = match_fn.group(1).upper()

        # Extraer clase específica si fue nombrada en el prompt
        target_class = None
        for c in classes:
            c_name = c.get("name", "")
            if c_name and re.search(rf"\b{re.escape(c_name)}\b", prompt, re.IGNORECASE):
                target_class = c_name
                break

        from .normalization_service import NormalizationService
        audit_res = NormalizationService.audit_normalization(data, target_class=target_class, target_form=target_form)

        # Registrar evento en la sesión activa (CU19 / S3-4)
        session = project.sessions.filter(is_active=True).first()
        if session:
            SessionEvent.objects.create(
                session=session,
                tipo="normalization_audit",
                payload={"cumple_todas": audit_res.get("cumple_todas"), "resumen": audit_res.get("resumen")},
                actor=user
            )

        reply = f"📋 @{user_name}:\n{audit_res['reporte_markdown']}"
        return {
            "is_ai": True,
            "reply": reply,
            "audit": audit_res
        }

    @staticmethod
    def _handle_summarize_diagram(project: Project, user: User, user_name: str) -> dict:
        backup = BackupUML.objects.filter(room_id=project.room_id).first()
        data = backup.data if backup and isinstance(backup.data, dict) else {}
        classes = data.get("classes", [])
        relationships = data.get("relationships", [])

        if not classes:
            return {
                "is_ai": True,
                "reply": f"@{user_name}: El lienzo actualmente está vacío. Puedes comenzar agregando clases con `@ia agrega la clase ...`."
            }

        session = project.sessions.filter(is_active=True).first()
        recent_events = []
        if session:
            recent_events = list(session.events.all()[:5])

        # Clases y atributos
        class_summaries = []
        for c in classes:
            raw_attrs = c.get("attributes", [])
            clean_attrs = []
            for a in raw_attrs:
                if isinstance(a, dict):
                    aname = a.get("name")
                    if aname and aname != "undefined":
                        clean_attrs.append(aname)
                elif isinstance(a, str) and a and a != "undefined":
                    clean_attrs.append(a)
            attr_text = f" ({', '.join(clean_attrs)})" if clean_attrs else " (sin atributos definidos)"
            class_summaries.append(f"• **{c.get('name')}**{attr_text}")

        # Relaciones
        rel_summaries = []
        class_map = {str(c.get("id")): c.get("name") for c in classes if c.get("id")}
        for r in relationships:
            src = class_map.get(str(r.get("sourceId")), "Clase")
            tgt = class_map.get(str(r.get("targetId")), "Clase")
            rtype = r.get("type", "asociación").capitalize()
            labels = r.get("labels", [])
            card_text = f" [{labels[0]} a {labels[1]}]" if len(labels) >= 2 else ""
            rel_summaries.append(f"• {src} ➔ {tgt} ({rtype}{card_text})")

        # Eventos recientes
        event_texts = []
        for ev in recent_events:
            if ev.tipo == "summary_request":
                ev_desc = "Consulta de resumen del estado del lienzo"
            elif ev.tipo == "ia_mutation":
                inst = ev.payload.get("instruction")
                ev_desc = f"Modificación por IA: {inst}" if inst else "Modificación del diagrama por IA"
            elif ev.tipo == "normalization_audit":
                ev_desc = "Auditoría de normalización relacional (1FN-4FN)"
            elif ev.tipo == "suggestion_confirmed":
                ev_desc = "Sugerencia de relación aplicada al lienzo"
            elif ev.tipo == "chat_message":
                ev_desc = "Intercambio de mensajes en el chat"
            else:
                raw_d = ev.payload.get("instruction") or ev.payload.get("reply") or ev.tipo
                ev_desc = raw_d if raw_d != ev.tipo else f"Actividad registrada ({ev.tipo})"
            event_texts.append(f"• {ev_desc}")

        lines = [
            f"📌 @{user_name}: **Resumen Ejecutivo del Estado del Lienzo**",
            f"Actualmente el modelo contiene **{len(classes)} clases** y **{len(relationships)} relaciones**:\n",
            "**Clases:**",
            "\n".join(class_summaries),
            ""
        ]

        if rel_summaries:
            lines.append("**Relaciones:**")
            lines.append("\n".join(rel_summaries))
            lines.append("")
        else:
            lines.append("⚠️ **Relaciones:** No se han establecido relaciones entre las clases aún.\n")

        if event_texts:
            lines.append("**Actividad reciente en esta sesión:**")
            lines.append("\n".join(event_texts[:3]))
            lines.append("")

        lines.append("💡 _Puedes continuar ordenando mutaciones o pedir una auditoría con `@ia audita normalizacion`._")

        reply_md = "\n".join(lines)

        if session:
            SessionEvent.objects.create(
                session=session,
                tipo="summary_request",
                payload={"classes_count": len(classes), "relationships_count": len(relationships)},
                actor=user
            )

        return {
            "is_ai": True,
            "reply": reply_md,
            "summary_data": {
                "classes_count": len(classes),
                "relationships_count": len(relationships)
            }
        }

    @staticmethod
    def _broadcast_diagram_update(room_id: str, diagram_data: dict):
        """Difunde la mutación incremental a todos los navegadores conectados en canvas_<room_id>"""
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    f"canvas_{room_id}",
                    {
                        "type": "broadcast_message",
                        "from": "ai_moderator",
                        "payload": {
                            "t": "full_state",
                            "payload": diagram_data,
                            "force": True
                        }
                    }
                )
        except Exception as e:
            print("[ModeratorService] Error enviando broadcast al lienzo:", e)

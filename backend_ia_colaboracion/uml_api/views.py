import tempfile
from django.http import FileResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import BackupUML
import json
import re

from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
import base64
from .services.services_gemini import call_gemini, call_gemini_from_image


from pathlib import Path
from drf_spectacular.utils import extend_schema, OpenApiResponse
from .serializers import GenerateUMLRequestSerializer
from .services.flutter_generator import FlutterCRUDGenerator
from .utils.zip_utils import compress_folder_to_zip


class GenerateUMLView(APIView):
    @extend_schema(
        tags=['Primer Parcial (CU8)'],
        summary='Generar o modificar UML mediante prompts',
        request=GenerateUMLRequestSerializer,
        responses={200: OpenApiResponse(description="JSON del diagrama UML")}
    )
    def post(self, request):
        try:
            prompt = request.data.get("prompt")
            current_diagram = request.data.get("currentDiagram")
            if not prompt:
                return Response({"error": "El campo 'prompt' es requerido"}, status=status.HTTP_400_BAD_REQUEST)

            output = call_gemini(prompt, current_diagram)

            # 🧹 Extracción robusta de JSON entre llaves {}
            if isinstance(output, str):
                start_idx = output.find('{')
                end_idx = output.rfind('}')
                if start_idx != -1 and end_idx != -1:
                    clean_json = output[start_idx:end_idx + 1]
                else:
                    clean_json = output
            else:
                clean_json = json.dumps(output)

            parsed_json = json.loads(clean_json)
            return Response(parsed_json, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({
                "error": f"Error al procesar solicitud con IA: {str(e)}",
                "message": "La IA no pudo procesar la solicitud en este momento."
            }, status=status.HTTP_200_OK)


from .models import BackupUML, Project, ProjectMember

@extend_schema(
    tags=['Primer Parcial (CU1-CU5)'],
    summary='Guardar o actualizar estado del lienzo UML',
    responses={200: OpenApiResponse(description="UML actualizado"), 201: OpenApiResponse(description="UML creado"), 403: OpenApiResponse(description="Escritura denegada (ej. cliente móvil o espectador)")}
)
@api_view(['POST'])
def set_backupUML(request, room_id):
    if not room_id:
        return Response({"error": "Se requiere el campo 'room_id'"}, status=status.HTTP_400_BAD_REQUEST)

    # Regla RNF1 / Regla 1: Validar permisos estrictamente en servidor
    # 1. Si la petición proviene de un cliente móvil, bloquear escritura siempre
    client_type = request.headers.get('X-Client-Type', '').lower()
    if client_type == 'mobile':
        return Response(
            {"error": "Escritura denegada: El cliente móvil es estrictamente de solo lectura (espectador)."},
            status=status.HTTP_403_FORBIDDEN
        )

    # 2. Si el lienzo pertenece a un proyecto, validar membresía y rol
    project = Project.objects.filter(room_id=room_id).first()
    if project:
        if not request.user or not request.user.is_authenticated:
            return Response(
                {"error": "Se requiere autenticación para modificar este proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )

        is_owner = (project.owner_id == request.user.id)
        member = project.members.filter(user=request.user).first()
        if not is_owner and not member:
            return Response(
                {"error": "Acceso denegado: No eres miembro de este proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )

        if member and member.rol == ProjectMember.ROLE_VIEWER and not is_owner:
            return Response(
                {"error": "Permiso denegado: Tu rol es de solo lectura (Espectador)."},
                status=status.HTTP_403_FORBIDDEN
            )

    data = request.data

    try:
        # Buscar si ya existe
        uml_backup, created = BackupUML.objects.update_or_create(
            room_id=room_id,
            defaults={"data": data}
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        "message": "UML creado con éxito" if created else "UML actualizado con éxito",
        "room_id": str(uml_backup.room_id),
        "data": uml_backup.data
    }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@extend_schema(
    tags=['Primer Parcial (CU2)'],
    summary='Obtener estado actual del lienzo UML por room_id',
    responses={200: OpenApiResponse(description="Datos JSON del diagrama UML"), 404: OpenApiResponse(description="Diagrama no encontrado")}
)
@api_view(['GET'])
def get_backupUML(request, room_id):
    if not room_id:
        return Response({"error": "Se requiere el campo 'room_id'"}, status=status.HTTP_400_BAD_REQUEST)

    project = Project.objects.filter(room_id=room_id).first()
    if project:
        if not request.user or not request.user.is_authenticated:
            return Response(
                {"error": "Se requiere autenticación para consultar este proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )
        is_owner = (project.owner_id == request.user.id)
        member = project.members.filter(user=request.user).first()
        if not is_owner and not member:
            return Response(
                {"error": "Acceso denegado: No eres miembro de este proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )

    try:
        diagrama = BackupUML.objects.get(room_id=room_id)
    except BackupUML.DoesNotExist:
        return Response({"error": "No existe un diagrama con ese ID"}, status=status.HTTP_404_NOT_FOUND)

    # ✅ Devolver el JSON guardado exactamente como está en la BD
    return Response(diagrama.data, status=status.HTTP_200_OK)



@extend_schema(
    tags=['Primer Parcial (CU10)'],
    summary='Generar diagrama UML a partir de imagen (Gemini Vision)',
    responses={200: OpenApiResponse(description="JSON del diagrama extraído de la imagen")}
)
@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def analyze_uml_image(request):
    """
    Espera un archivo de imagen (PNG o JPG).
    """
    image_file = request.FILES.get("image")

    if not image_file:
        return Response({"error": "Debe enviar un archivo 'image'"}, status=status.HTTP_400_BAD_REQUEST)

    # Convertir a Base64
    image_base64 = base64.b64encode(image_file.read()).decode("utf-8")

    # Llamar al servicio Gemini
    result = call_gemini_from_image(
        image_base64, mime_type=image_file.content_type
    )

    # Intentar parsear el resultado JSON
    try:
        parsed = json.loads(result) if isinstance(result, str) else result
    except Exception:
        parsed = {"raw": result, "error": "No se pudo parsear correctamente"}

    return Response({"uml_json": parsed}, status=status.HTTP_200_OK)


@extend_schema(
    tags=['Primer Parcial (CU11)'],
    summary='Generar frontend Flutter CRUD completo en archivo ZIP descargable',
    responses={200: OpenApiResponse(description="Archivo ZIP flutter_project.zip")}
)
@api_view(["POST"])
def generar_flutter(request):
    """
    Genera un proyecto Flutter completo a partir de un JSON UML.
    Devuelve un ZIP descargable.
    """
    try:
        uml_json = request.data
        if not uml_json.get("classes"):
            return Response({"error": "El JSON UML debe contener 'classes'."}, status=400)

        # Crear carpeta temporal
        temp_dir = Path(tempfile.mkdtemp())

        # Generar el proyecto Flutter
        generator = FlutterCRUDGenerator(uml_json)
        generator.generate_project(output_dir=temp_dir / "flutter_app")

        # Comprimir el resultado
        zip_path = compress_folder_to_zip(temp_dir / "flutter_app")

        # Devolver como archivo descargable
        response = FileResponse(
            open(zip_path, "rb"),
            as_attachment=True,
            filename="flutter_project.zip"
        )
        return response

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

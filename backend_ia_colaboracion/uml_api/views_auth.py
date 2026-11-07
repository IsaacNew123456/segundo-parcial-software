from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from drf_spectacular.utils import extend_schema, OpenApiResponse
from .serializers import (
    UserRegisterSerializer, UserSerializer, LoginRequestSerializer,
    TokenResponseSerializer, ProfileUpdateSerializer
)

class RegisterView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Autenticación (CU13)'],
        summary='Registro de nuevo usuario',
        description='Registra una cuenta de usuario con correo, contraseña y nombre. Devuelve tokens JWT.',
        request=UserRegisterSerializer,
        responses={201: TokenResponseSerializer, 400: OpenApiResponse(description="Error de validación")}
    )
    def post(self, request):
        serializer = UserRegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                "message": "Usuario registrado exitosamente",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user).data
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Autenticación (CU13)'],
        summary='Inicio de sesión (Web y Móvil)',
        description='Autenticación con correo y contraseña. Válido tanto para el cliente Web como para la APK móvil.',
        request=LoginRequestSerializer,
        responses={200: TokenResponseSerializer, 401: OpenApiResponse(description="Credenciales inválidas")}
    )
    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '')

        if not email or not password:
            return Response(
                {"error": "Debe proporcionar correo y contraseña."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Buscar usuario por correo electrónico
        user_obj = User.objects.filter(email__iexact=email).first()
        if not user_obj:
            # Fallback por username si se usó un nombre de usuario
            user_obj = User.objects.filter(username__iexact=email).first()

        if user_obj and user_obj.check_password(password):
            refresh = RefreshToken.for_user(user_obj)
            return Response({
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user_obj).data
            }, status=status.HTTP_200_OK)

        return Response(
            {"error": "Credenciales inválidas. Verifique su correo y contraseña."},
            status=status.HTTP_401_UNAUTHORIZED
        )


class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Autenticación (CU13)'],
        summary='Obtener perfil del usuario autenticado',
        responses={200: UserSerializer}
    )
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    @extend_schema(
        tags=['Autenticación (CU13)'],
        summary='Actualizar perfil del usuario autenticado',
        request=ProfileUpdateSerializer,
        responses={200: OpenApiResponse(description="Perfil actualizado exitosamente")}
    )
    def put(self, request):
        user = request.user
        nombre = request.data.get('nombre')
        if nombre is not None:
            user.first_name = nombre.strip()

        new_password = request.data.get('password')
        if new_password and len(new_password) >= 6:
            user.set_password(new_password)

        user.save()
        return Response({
            "message": "Perfil actualizado exitosamente",
            "user": UserSerializer(user).data
        })

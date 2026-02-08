# KlioReader 📚

KlioReader es una plataforma de lectura moderna y ligera diseñada para entusiastas de los libros que buscan una experiencia fluida y organizada. Construida como una aplicación de escritorio nativa mediante **Tauri**, combina la potencia de **React** en el frontend con un backend robusto en **PHP**.

## ✨ Características

- 🚀 **Rendimiento Nativo:** Aplicación de escritorio multiplataforma (Windows, macOS, Linux) gracias a Tauri.
- 🎨 **Interfaz Moderna:** UI minimalista y elegante construida con Tailwind CSS y componentes Shadcn/UI.
- 📖 **Soporte de Formatos:** Lectura fluida de archivos EPUB y PDF.
- 🎮 **Gamificación:** Sistema de seguimiento de progreso y objetivos para fomentar el hábito de lectura.
- 🔐 **Seguridad:** Autenticación basada en JWT (JSON Web Tokens).

## 🛠️ Stack Tecnológico

### Frontend
- **Framework:** React 19 + TypeScript
- **Herramienta de Construcción:** Vite
- **Estilos:** Tailwind CSS
- **Componentes:** Radix UI / Shadcn
- **Iconos:** Lucide React

### Desktop (Wrapper)
- **Framework:** Tauri v2 (Rust)

### Backend
- **Lenguaje:** PHP 8.1+
- **Autenticación:** Firebase JWT
- **Estructura:** Arquitectura MVC personalizada

## 🚀 Configuración y Desarrollo

### Requisitos Previos
- **Node.js** (v18+)
- **Rust** (instalación de Tauri)
- **PHP** (v8.1+)
- **Composer**

### Instalación

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/tu-usuario/KlioReader.git
   cd KlioReader
   ```

2. **Configurar el Frontend:**
   ```bash
   npm install
   ```

3. **Configurar el Backend:**
   ```bash
   cd backend-php
   composer install
   cp .env.example .env
   # Configura tus variables de entorno en el archivo .env
   ```

4. **Configurar el entorno de Rust:**
   Asegúrate de tener instaladas las dependencias de Tauri según tu sistema operativo ([Guía oficial](https://tauri.app/v1/guides/getting-started/prerequisites)).

### Ejecución en Desarrollo

Para lanzar la aplicación en modo desarrollo (Hot Reload para frontend y Tauri):

```bash
npm run tauri dev
```

Para ejecutar solo el servidor de desarrollo web:

```bash
npm run dev
```

## 📂 Estructura del Proyecto

- `src/`: Código fuente de la interfaz React.
- `src-tauri/`: Configuración y lógica nativa de Rust/Tauri.
- `backend-php/`: API REST construida en PHP.
  - `src/`: Controladores, Modelos y Middleware.
  - `public/`: Punto de entrada de la API.
  - `uploads/`: Almacenamiento local de libros.
- `public/`: Activos estáticos del frontend.

## 📝 Licencia

Este proyecto está bajo la Licencia [MIT](LICENSE).

---
Desarrollado con ❤️ para lectores.

# Roadmap: KlioReader3

Este documento detalla las fases de desarrollo para el lector de libros electrónicos KlioReader3, utilizando Tauri 2, React, Tailwind CSS (Dracula), shadcn/ui y una API de sincronización en PHP.

## Fase 1: Configuración del Entorno y Estructura Base
- [x] Inicializar proyecto Tauri 2 con React + Vite + TypeScript.
- [x] Configurar Tailwind CSS con la paleta de colores **Dracula**.
- [x] Instalar e inicializar **shadcn/ui**.
- [x] Configurar la estructura de carpetas en `src-tauri` (Rust) y `src` (Frontend).

## Fase 2: Núcleo de Lectura (Rust)
- [ ] Implementar el procesamiento de archivos **PDF** en Rust para alto rendimiento.
- [x] Implementar la extracción de metadatos para **PDF** y **EPUB**.
- [x] Implementar el renderizado/lectura de páginas de **EPUB** en Rust.
- [x] Crear comandos de Tauri para la extracción de metadatos y renderizado de páginas.
- [ ] Optimización del manejo de memoria para archivos de gran tamaño.

## Fase 3: Interfaz de Usuario (React + shadcn/ui)
- [x] Diseñar el Dashboard/Biblioteca principal.
- [x] Desarrollar la base del visor de lectura (soporte para abrir archivos).
- [x] Implementar el sistema de temas (forzar Dracula como base).
- [x] Crear componentes de UI para ajustes, marcadores y navegación.

## Fase 4: Integración y Funciones Avanzadas
- [ ] Implementar sistema de **Gamificación** (XP, Niveles, Rachas).
- [ ] Implementar **Búsqueda Global** e indexación de contenido en Rust.
- [ ] Integración con **LLM** (Ollama/OpenAI) para trivias y preguntas sobre los libros.
- [ ] Soporte para **Anotaciones y Resaltado** (Local).

## Fase 5: Sincronización y API (PHP)
- [ ] Desarrollar la API REST en PHP para la gestión de usuarios.
- [ ] Implementar endpoints para la sincronización de la biblioteca (nube).
- [ ] Implementar endpoints para el progreso de lectura (página actual, marcadores).
- [ ] Configurar la autenticación segura desde la app de escritorio.

## Fase 6: Pruebas y Distribución
- [ ] Pruebas unitarias en Rust y tests de componentes en React.
- [ ] Optimización del bundle y tiempos de carga.
- [ ] Configurar CI/CD para la generación de instaladores (Windows, Linux, macOS).

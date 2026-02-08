# Especificaciones de la Interfaz: KlioReader3

## Componentes Principales
1. **Biblioteca (Dashboard):**
   - Lista/Cuadrícula de libros (EPUB/PDF).
   - Indicador visual de progreso de lectura (barra de progreso).
   - Fecha/hora de "Última lectura".
   - Filtros por "Leyendo actualmente", "Terminados" y "Favoritos".

2. **Sincronización:**
   - Estado de sincronización con la cuenta (API PHP).
   - Indicador de nube (Sincronizado/Pendiente).

3. **Gamificación:**
   - **Rachas de lectura:** Días consecutivos leyendo.
   - **Nivel de lector:** XP acumulada por páginas leídas.
   - **Insignias:** Logros por terminar libros, leer géneros específicos, etc.
   - **Meta diaria:** Barra de progreso para el objetivo de lectura del día.

4. **Interacción AI (LLM):**
   - Panel lateral o sección de "Trivia/Desafío".
   - Conexión con API para preguntas generadas por LLM basadas en el libro actual.
   - Recompensas de XP por responder correctamente.

5. **Estética:**
   - Tema Dracula (Oscuro moderno).
   - Transiciones suaves y feedback visual inmediato.
   - Componentes de shadcn/ui.

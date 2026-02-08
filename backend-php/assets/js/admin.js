// KlioReader Admin JS

// Cerrar modales con Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('[id$="Modal"]').forEach(function(modal) {
            modal.classList.add('hidden');
        });
    }
});

// Cerrar modal al hacer click fuera
document.querySelectorAll('[id$="Modal"]').forEach(function(modal) {
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
});

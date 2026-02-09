// KlioReader Admin JS

// Sidebar toggle (movil)
function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    var isOpen = !sidebar.classList.contains('-translate-x-full');
    if (isOpen) {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
        document.body.style.overflow = '';
    } else {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closeSidebarMobile() {
    if (window.innerWidth < 768) {
        var sidebar = document.getElementById('sidebar');
        var overlay = document.getElementById('sidebarOverlay');
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// Cerrar modales con Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        // Cerrar sidebar en movil
        closeSidebarMobile();
        // Cerrar modales
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
